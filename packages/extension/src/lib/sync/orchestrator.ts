import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { executeLocalSync } from './local-sync-executor'
import { getFolderHandle, checkFolderPermission } from './indexeddb'
import { RetryManager } from './retry-manager'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { getCachedAuthState, invalidateSyncStatusCache } from '../cloud-sync/auth-service'
import { computeBackupDataHash } from './hash'
import { mergeImageAssets, mergePendingImageDeletes } from './image-metadata-merge'
import {
  FullBackupData,
  IdAliasMap,
  MergeResult,
  UnifiedSyncStatus,
  SyncResult,
  SyncGuardStatus
} from './types'

/**
 * Local sync result from executeLocalSync.
 */
interface LocalSyncResult {
  success: boolean
  syncedAt?: number
  error?: string
}

interface SyncTriggerResult {
  cloudSynced: boolean
  localSynced: boolean
  cloudError?: string
  localError?: string
  syncedAt?: number
  skipped?: boolean
}

type DownloadReason = 'manual' | 'initial' | 'auto'

type DownloadAndMergeResult = MergeResult & {
  skipped?: boolean
  conflicts?: Array<{ type: 'prompt' | 'category'; cloud: unknown; local: unknown }>
}

interface TriggerSyncGuardOptions {
  enforceMinInterval?: boolean
  pendingVersionAtStart?: number
  supersededPendingSnapshotHash?: string | null
}

const STORAGE_KEY = 'prompt_script_data'
const SYNC_IN_FLIGHT_STALE_MS = 5 * 60 * 1000

/**
 * SyncOrchestrator coordinates cloud and local sync strategies.
 *
 * Features:
 * - Parallel sync when cloud available (Promise.all)
 * - Fallback to local-only when cloud unavailable
 * - Local sync via sync-manager (offscreen document for Service Worker)
 * - Tracks pending state (pendingCloudSync, pendingUpload)
 * - Merge logic: cloud wins same ID, local-only preserved
 * - Automatic retry with exponential backoff via RetryManager
 */
export class SyncOrchestrator {
  private static lockAcquisitionChain: Promise<void> = Promise.resolve()
  private static syncStatusWriteChain: Promise<void> = Promise.resolve()

  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy
  private cloudRetryManager: RetryManager | null = null
  private localRetryManager: RetryManager | null = null
  // Store last sync results for access after RetryManager.execute()
  private lastCloudSyncResult: SyncResult | null = null
  private lastLocalSyncResult: LocalSyncResult | null = null
  private readonly guardOwnerId = crypto.randomUUID()
  private activeSyncPromise: Promise<SyncTriggerResult> | null = null
  private pendingSnapshot: FullBackupData | null = null
  private pendingSnapshotHash: string | null = null
  private pendingSnapshotVersion = 0
  private pendingSnapshotTimer: ReturnType<typeof setTimeout> | null = null
  private readonly MIN_SYNC_INTERVAL_MS = 2000
  private readonly DOWNLOAD_COOLDOWN_MS = 15000

  constructor(cloudStrategy: CloudSyncStrategy, localStrategy: LocalSyncStrategy) {
    this.cloudStrategy = cloudStrategy
    this.localStrategy = localStrategy
  }

  /**
   * Create retry callback for cloud sync.
   * Stores result in lastCloudSyncResult for later access.
   */
  private createCloudRetryCallback(data: FullBackupData): () => Promise<{ success: boolean; error?: string }> {
    return async () => {
      const result = await this.cloudStrategy.sync(data)
      // Store full result for access after RetryManager.execute()
      this.lastCloudSyncResult = result
      return {
        success: result.success,
        error: result.error
      }
    }
  }

  /**
   * Create retry callback for local sync.
   * Stores result in lastLocalSyncResult for later access.
   */
  private createLocalRetryCallback(data: FullBackupData): () => Promise<{ success: boolean; error?: string }> {
    return async () => {
      const result = await executeLocalSync(data)
      // Store full result for access after RetryManager.execute()
      this.lastLocalSyncResult = result
      return {
        success: result.success,
        error: result.error
      }
    }
  }

  /**
   * Notify UI about retry progress.
   */
  private notifyRetryProgress(target: 'cloud' | 'local', state: { retryCount: number; retryScheduledAt?: number }): void {
    this.safeSendMessage({
      type: MessageType.BACKUP_RETRY,
      payload: {
        target,
        retryCount: state.retryCount,
        retryScheduledAt: state.retryScheduledAt
      }
    })
  }

  /**
   * Notify UI about backup completion.
   */
  private notifyBackupComplete(target: 'cloud' | 'local', success: boolean): void {
    this.safeSendMessage({
      type: MessageType.BACKUP_COMPLETE,
      payload: {
        target,
        success
      }
    })
  }

  private safeSendMessage(message: unknown): void {
    chrome.runtime?.sendMessage?.(message).catch(() => { /* UI may not be listening */ })
  }

  /**
   * Trigger sync on data change.
   * Uses sync-manager for local sync (offscreen document for Service Worker context).
   * Cloud sync is done directly via CloudSyncStrategy (fetch works in Service Worker).
   *
   * @returns Sync result with status information (avoiding extra getStatus calls)
   */
  triggerSync(data: FullBackupData): Promise<SyncTriggerResult> {
    if (this.activeSyncPromise) {
      return this.queuePendingSnapshot(data)
    }

    const supersededPendingSnapshotHash = this.clearPendingSnapshot()
    return this.startActiveSync(data, {
      enforceMinInterval: true,
      pendingVersionAtStart: this.pendingSnapshotVersion,
      supersededPendingSnapshotHash
    })
  }

  private startActiveSync(data: FullBackupData, options: TriggerSyncGuardOptions): Promise<SyncTriggerResult> {
    const activePromise = this.triggerSyncWithGuards(data, options).finally(() => {
      if (this.activeSyncPromise === activePromise) {
        this.activeSyncPromise = null
      }
    })
    this.activeSyncPromise = activePromise
    return activePromise
  }

  private async triggerSyncWithGuards(
    data: FullBackupData,
    options: TriggerSyncGuardOptions = { enforceMinInterval: true }
  ): Promise<SyncTriggerResult> {
    const snapshotHash = await computeBackupDataHash(data)
    const status = await this.getSyncStatus()
    let guard = status.guard || await this.getGuardStatus()

    if (guard.syncInFlight) {
      if (!this.canTakeOverGuardLock(guard)) {
        await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
        return { cloudSynced: false, localSynced: false, skipped: true }
      }
      guard = { ...guard, syncInFlight: false, lastUploadStartedAt: undefined }
    }

    if (options.enforceMinInterval !== false && this.isInsideMinSyncInterval(guard)) {
      const delayMs = this.getRemainingMinSyncIntervalMs(guard)
      if (
        options.pendingVersionAtStart !== undefined &&
        this.pendingSnapshotVersion !== options.pendingVersionAtStart &&
        this.pendingSnapshot
      ) {
        this.schedulePendingSnapshotDrain(delayMs, this.pendingSnapshotVersion)
        return { cloudSynced: false, localSynced: false, skipped: true }
      }
      return this.queuePendingSnapshot(data, { scheduleDelayMs: delayMs })
    }

    if (await this.shouldSkipSnapshot(snapshotHash, status, guard)) {
      await this.clearPendingSnapshotHashIfCurrent(snapshotHash)
      return { cloudSynced: false, localSynced: false, skipped: true }
    }

    const acquiredLock = await this.acquireGuardLock(snapshotHash)
    if (!acquiredLock) {
      return { cloudSynced: false, localSynced: false, skipped: true }
    }

    try {
      const result = await this.runSyncNow(data)
      if (result.cloudSynced) {
        await this.updateGuardStatus({
          lastUploadedHash: snapshotHash,
          lastCloudUploadAt: Date.now()
        })
      }
      if (result.localSynced) {
        await this.updateGuardStatus({ lastLocalSyncedHash: snapshotHash })
      }
      if (result.cloudSynced || result.localSynced) {
        await this.clearPendingSnapshotHashIfCurrent(snapshotHash)
        if (options.supersededPendingSnapshotHash && options.supersededPendingSnapshotHash !== snapshotHash) {
          await this.clearPendingSnapshotHashIfCurrent(options.supersededPendingSnapshotHash)
        }
      }
      return result
    } finally {
      await this.releaseGuardLock()
      await this.drainPendingSnapshot(snapshotHash)
    }
  }

  private async queuePendingSnapshot(
    data: FullBackupData,
    options: { scheduleDelayMs?: number } = {}
  ): Promise<SyncTriggerResult> {
    const version = ++this.pendingSnapshotVersion
    this.pendingSnapshot = data
    this.pendingSnapshotHash = null

    const snapshotHash = await computeBackupDataHash(data)
    if (version === this.pendingSnapshotVersion && this.pendingSnapshot === data) {
      this.pendingSnapshotHash = snapshotHash
      await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
      if (options.scheduleDelayMs !== undefined) {
        this.schedulePendingSnapshotDrain(options.scheduleDelayMs, version)
      }
    }

    return { cloudSynced: false, localSynced: false, skipped: true }
  }

  private async runSyncNow(data: FullBackupData): Promise<SyncTriggerResult> {
    // Notify UI that sync is starting
    this.safeSendMessage({
      type: MessageType.BACKUP_PROGRESS,
      payload: { cloud: true, local: true }
    })

    // Update sync status to indicate syncing
    await this.updateSyncStatus({
      cloudSyncing: true,
      localSyncing: true
    })

    const cloudAvailable = await this.cloudStrategy.isAvailable()
    const localAvailable = await this.localStrategy.isAvailable()

    if (!localAvailable) {
      // Still try cloud sync if available
      if (cloudAvailable) {
        // Reset stored result
        this.lastCloudSyncResult = null
        // Instantiate retry manager for cloud sync
        this.cloudRetryManager = new RetryManager(
          this.createCloudRetryCallback(data),
          (state) => this.notifyRetryProgress('cloud', state),
          (success) => this.notifyBackupComplete('cloud', success)
        )
        const retryResult = await this.cloudRetryManager.execute()
        const cloudResult = this.lastCloudSyncResult as SyncResult | null

        if (retryResult.success && cloudResult?.success) {
          await this.updateSyncStatus({
            lastCloudSyncTime: cloudResult?.syncedAt,
            hasUnsyncedChanges: false,
            pendingCloudSync: false,
            pendingUpload: false,
            localOnlyItems: {
              promptIds: [],
              categoryIds: [],
              temporaryPromptIds: []
            },
            cloudSyncing: false,
            localSyncing: false,
            cloudRetryCount: 0,
            cloudError: undefined
          })
          // Invalidate auth-service cache after successful cloud sync
          invalidateSyncStatusCache()
          return { cloudSynced: true, localSynced: false, syncedAt: cloudResult?.syncedAt }
        }
        await this.updateSyncStatus({
          cloudSyncing: false,
          localSyncing: false,
          cloudError: cloudResult?.error
        })
        return { cloudSynced: false, localSynced: false, cloudError: cloudResult?.error }
      }
      await this.updateSyncStatus({
        hasUnsyncedChanges: true,
        pendingCloudSync: true,
        cloudSyncing: false,
        localSyncing: false
      })
      return { cloudSynced: false, localSynced: false }
    }

    if (!cloudAvailable) {
      // Cloud unavailable: local backup only via offscreen document
      // Reset stored result
      this.lastLocalSyncResult = null
      // Instantiate retry manager for local sync
      this.localRetryManager = new RetryManager(
        this.createLocalRetryCallback(data),
        (state) => this.notifyRetryProgress('local', state),
        (success) => this.notifyBackupComplete('local', success)
      )
      const retryResult = await this.localRetryManager.execute()
      const localResult = this.lastLocalSyncResult as LocalSyncResult | null

      if (retryResult.success && localResult?.success) {
        await this.updateSyncStatus({
          lastLocalSyncTime: localResult?.syncedAt || Date.now(),
          hasUnsyncedChanges: false,
          pendingCloudSync: true,
          cloudSyncing: false,
          localSyncing: false,
          localRetryCount: 0,
          localError: undefined
        })
        return { cloudSynced: false, localSynced: true, syncedAt: localResult?.syncedAt }
      } else {
        console.warn('[Oh My Prompt] Local sync failed:', localResult?.error)
        await this.updateSyncStatus({
          cloudSyncing: false,
          localSyncing: false,
          localError: localResult?.error
        })
        return { cloudSynced: false, localSynced: false, localError: localResult?.error }
      }
    }

    // Cloud available: parallel sync with retry managers
    // Reset stored results
    this.lastCloudSyncResult = null
    this.lastLocalSyncResult = null

    // Instantiate retry managers for both syncs
    this.cloudRetryManager = new RetryManager(
      this.createCloudRetryCallback(data),
      (state) => this.notifyRetryProgress('cloud', state),
      (success) => this.notifyBackupComplete('cloud', success)
    )
    this.localRetryManager = new RetryManager(
      this.createLocalRetryCallback(data),
      (state) => this.notifyRetryProgress('local', state),
      (success) => this.notifyBackupComplete('local', success)
    )

    // Execute both syncs in parallel with retry support
    const [cloudRetryResult, localRetryResult] = await Promise.all([
      this.cloudRetryManager.execute(),
      this.localRetryManager.execute()
    ])

    // Access stored results (set by callbacks during execute)
    const cloudResult = this.lastCloudSyncResult as SyncResult | null
    const localResult = this.lastLocalSyncResult as LocalSyncResult | null

    // Determine success using retry results (accounts for retry mechanism)
    const cloudSuccess = cloudRetryResult.success && cloudResult?.success
    const localSuccess = localRetryResult.success && localResult?.success

    // Handle skipped sync (data unchanged)
    if (cloudResult?.skipped) {
      // Cloud sync skipped: data unchanged
    }

    if (cloudSuccess && localSuccess) {
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult?.syncedAt,
        lastLocalSyncTime: Date.now(),
        hasUnsyncedChanges: false,
        pendingCloudSync: false,
        pendingUpload: false,
        localOnlyItems: {
          promptIds: [],
          categoryIds: [],
          temporaryPromptIds: []
        },
        cloudSyncing: false,
        localSyncing: false,
        cloudRetryCount: cloudRetryResult.retryCount,
        localRetryCount: localRetryResult.retryCount,
        cloudError: undefined,
        localError: undefined
      })
      // Invalidate auth-service cache after successful cloud sync
      invalidateSyncStatusCache()
      return {
        cloudSynced: true,
        localSynced: true,
        syncedAt: cloudResult?.syncedAt,
        skipped: cloudResult?.skipped
      }
    } else if (localSuccess) {
      // Local success, cloud failed
      await this.updateSyncStatus({
        lastLocalSyncTime: Date.now(),
        hasUnsyncedChanges: false,
        pendingCloudSync: true,
        localSyncing: false,
        localRetryCount: localRetryResult.retryCount,
        localError: undefined,
        cloudError: cloudResult?.error
      })
      return {
        cloudSynced: false,
        localSynced: true,
        cloudError: cloudResult?.error
      }
    } else if (cloudSuccess) {
      // Cloud success, local failed
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult?.syncedAt,
        hasUnsyncedChanges: true,
        pendingUpload: false,
        localOnlyItems: {
          promptIds: [],
          categoryIds: [],
          temporaryPromptIds: []
        },
        cloudSyncing: false,
        cloudRetryCount: cloudRetryResult.retryCount,
        cloudError: undefined,
        localError: localResult?.error
      })
      // Invalidate auth-service cache after successful cloud sync
      invalidateSyncStatusCache()
      return {
        cloudSynced: true,
        localSynced: false,
        localError: localResult?.error,
        syncedAt: cloudResult?.syncedAt
      }
    }

    // Both failed
    await this.updateSyncStatus({
      cloudSyncing: false,
      localSyncing: false,
      cloudError: cloudResult?.error,
      localError: localResult?.error
    })
    return {
      cloudSynced: false,
      localSynced: false,
      cloudError: cloudResult?.error,
      localError: localResult?.error
    }
  }

  /**
   * Preview merge diff without actually merging.
   * Returns counts and change details for UI display.
   */
  async previewMerge(): Promise<{
    cloudCount: { prompts: number; categories: number; temporaryPrompts: number }
    localCount: { prompts: number; categories: number; temporaryPrompts: number }
    mergedCount: { prompts: number; categories: number; temporaryPrompts: number }
    changes: {
      addToLocal: number    // New items from cloud to add locally (cloud-only)
      addToCloud: number    // New local items to upload (local-only)
      updateToLocal: number // Cloud items newer than local
      updateToCloud: number // Local items newer than cloud
      conflicts: number     // Items with same updatedAt timestamp
    }
    cloudOnlyItems: {
      prompts: Array<{ id: string; name: string; updatedAt?: number }>
      categories: Array<{ id: string; name: string; updatedAt?: number }>
      temporaryPrompts: Array<{ id: string; name: string; updatedAt?: number }>
    }
    localOnlyItems: {
      prompts: Array<{ id: string; name: string; updatedAt?: number }>
      categories: Array<{ id: string; name: string; updatedAt?: number }>
      temporaryPrompts: Array<{ id: string; name: string; updatedAt?: number }>
    }
    conflicts: Array<{ type: 'prompt' | 'category' | 'temporaryPrompt'; cloud: { id: string; name: string; updatedAt?: number }; local: { id: string; name: string; updatedAt?: number } }>
  }> {
    const aliasMap = await this.getIdAliasMap()
    const cloudRaw = await this.cloudStrategy.restore()
    const localData = this.applyAliasMap(await this.getLocalData(), aliasMap)
    const cloudData = cloudRaw ? this.applyAliasMap(cloudRaw, aliasMap) : null

    if (!cloudData) {
      // No cloud data - everything is local-only
      return {
        cloudCount: { prompts: 0, categories: 0, temporaryPrompts: 0 },
        localCount: {
          prompts: localData.prompts.length,
          categories: localData.categories.length,
          temporaryPrompts: localData.temporaryPrompts.length
        },
        mergedCount: {
          prompts: localData.prompts.length,
          categories: localData.categories.length,
          temporaryPrompts: localData.temporaryPrompts.length
        },
        changes: {
          addToLocal: 0,
          addToCloud: localData.prompts.length + localData.categories.length + localData.temporaryPrompts.length,
          updateToLocal: 0,
          updateToCloud: 0,
          conflicts: 0
        },
        cloudOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] },
        localOnlyItems: {
          prompts: localData.prompts.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })),
          categories: localData.categories.map(c => ({ id: c.id, name: c.name, updatedAt: c.updatedAt })),
          temporaryPrompts: localData.temporaryPrompts.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
        },
        conflicts: []
      }
    }

    // Perform merge preview (without applying changes)
    const categoryMerge = this.mergeBidirectional(
      cloudData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      localData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    const promptMerge = this.mergeBidirectional(
      cloudData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const tempMerge = this.mergeBidirectional(
      cloudData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    // Use separate arrays from mergeBidirectional to avoid double-counting
    return {
      cloudCount: {
        prompts: cloudData.prompts.length,
        categories: cloudData.categories.length,
        temporaryPrompts: cloudData.temporaryPrompts.length
      },
      localCount: {
        prompts: localData.prompts.length,
        categories: localData.categories.length,
        temporaryPrompts: localData.temporaryPrompts.length
      },
      mergedCount: {
        prompts: promptMerge.merged.length,
        categories: categoryMerge.merged.length,
        temporaryPrompts: tempMerge.merged.length
      },
      changes: {
        addToLocal: promptMerge.cloudOnly.length + categoryMerge.cloudOnly.length + tempMerge.cloudOnly.length,
        addToCloud: promptMerge.localOnly.length + categoryMerge.localOnly.length + tempMerge.localOnly.length,
        updateToLocal: promptMerge.cloudNewer.length + categoryMerge.cloudNewer.length + tempMerge.cloudNewer.length,
        updateToCloud: promptMerge.localNewer.length + categoryMerge.localNewer.length + tempMerge.localNewer.length,
        conflicts: promptMerge.conflicts.length + categoryMerge.conflicts.length + tempMerge.conflicts.length
      },
      cloudOnlyItems: {
        prompts: promptMerge.cloudOnly.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })),
        categories: categoryMerge.cloudOnly.map(c => ({ id: c.id, name: c.name, updatedAt: c.updatedAt })),
        temporaryPrompts: tempMerge.cloudOnly.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      },
      localOnlyItems: {
        prompts: promptMerge.localOnly.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })),
        categories: categoryMerge.localOnly.map(c => ({ id: c.id, name: c.name, updatedAt: c.updatedAt })),
        temporaryPrompts: tempMerge.localOnly.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      },
      conflicts: [
        ...promptMerge.conflicts.map(c => ({
          type: 'prompt' as const,
          cloud: { id: c.cloud.id, name: c.cloud.name, updatedAt: c.cloud.updatedAt },
          local: { id: c.local.id, name: c.local.name, updatedAt: c.local.updatedAt }
        })),
        ...categoryMerge.conflicts.map(c => ({
          type: 'category' as const,
          cloud: { id: c.cloud.id, name: c.cloud.name, updatedAt: c.cloud.updatedAt },
          local: { id: c.local.id, name: c.local.name, updatedAt: c.local.updatedAt }
        })),
        ...tempMerge.conflicts.map(c => ({
          type: 'temporaryPrompt' as const,
          cloud: { id: c.cloud.id, name: c.cloud.name, updatedAt: c.cloud.updatedAt },
          local: { id: c.local.id, name: c.local.name, updatedAt: c.local.updatedAt }
        }))
      ]
    }
  }

  
  /**
   * Download from cloud and merge with local.
   * Now uses bidirectional merge (keeps latest version based on updatedAt).
   */
  async downloadAndMerge(options: { reason: DownloadReason } = { reason: 'manual' }): Promise<DownloadAndMergeResult> {
    const aliasMap = await this.getIdAliasMap()
    const localData = this.applyAliasMap(await this.getLocalData(), aliasMap)
    const guard = await this.getGuardStatus()

    if (options.reason === 'auto' && guard.lastCloudUploadAt && Date.now() - guard.lastCloudUploadAt < this.DOWNLOAD_COOLDOWN_MS) {
      return {
        skipped: true,
        data: localData,
        localOnlyItems: {
          prompts: [],
          categories: [],
          temporaryPrompts: [],
          imageAssetIds: [],
          pendingImageDeleteKeys: []
        }
      }
    }

    const cloudRaw = await this.cloudStrategy.restore()
    const cloudData = cloudRaw ? this.applyAliasMap(cloudRaw, aliasMap) : null

    if (!cloudData) {
      // No cloud data, use local
      return {
        data: localData,
        localOnlyItems: {
          prompts: [],
          categories: [],
          temporaryPrompts: [],
          imageAssetIds: [],
          pendingImageDeleteKeys: []
        }
      }
    }

    const result = this.mergeFullBackupData(cloudData, localData)

    // Apply merged data to storage
    await this.applyData(result.data)

    // Mark pending upload if there are items to upload to cloud (local-only OR locally-newer)
    const itemsToUploadCount =
      result.localOnlyItems.prompts.length +
      result.localOnlyItems.categories.length +
      result.localOnlyItems.temporaryPrompts.length +
      result.localOnlyItems.imageAssetIds.length +
      result.localOnlyItems.pendingImageDeleteKeys.length

    if (itemsToUploadCount > 0) {
      await this.updateSyncStatus({
        pendingUpload: true,
        localOnlyItems: {
          promptIds: result.localOnlyItems.prompts.map(p => p.id),
          categoryIds: result.localOnlyItems.categories.map(c => c.id),
          temporaryPromptIds: result.localOnlyItems.temporaryPrompts.map(p => p.id),
          imageAssetIds: result.localOnlyItems.imageAssetIds,
          pendingImageDeleteKeys: result.localOnlyItems.pendingImageDeleteKeys
        }
      })
    }

    return {
      ...result,
      conflicts: result.conflicts
    }
  }

  /**
   * Upload local-only items to cloud.
   */
  async uploadLocalOnlyItems(): Promise<void> {
    const status = await this.getSyncStatus()

    if (!status.pendingUpload) return

    const localData = await this.getLocalData()
    const result = await this.cloudStrategy.sync({
      ...localData,
      timestamp: Date.now()
    })

    if (result.success) {
      await this.updateSyncStatus({
        lastCloudSyncTime: result.syncedAt,
        pendingCloudSync: false,
        pendingUpload: false,
        localOnlyItems: {
          promptIds: [],
          categoryIds: [],
          temporaryPromptIds: [],
          imageAssetIds: [],
          pendingImageDeleteKeys: []
        }
      })
    }
  }

  /**
   * Initial sync on plugin startup.
   */
  async initialSync(): Promise<void> {
    const cloudAvailable = await this.cloudStrategy.isAvailable()
    const cloudData = cloudAvailable ? await this.cloudStrategy.restore() : null
    const localData = await this.localStrategy.restore()
    const storageData = await this.getLocalData()

    // Decision matrix
    if (cloudData && storageData.prompts.length === 0) {
      // Cloud has data, local storage empty -> restore from cloud
      await this.applyData(cloudData)
      await this.updateSyncStatus({ initialized: true })
      await this.reconcilePendingSnapshotFromStorage()
      return
    }

    if (localData && storageData.prompts.length === 0) {
      // Local backup exists, storage empty -> restore from local
      await this.applyData(localData)
      await this.updateSyncStatus({
        initialized: true,
        pendingCloudSync: cloudAvailable
      })
      await this.reconcilePendingSnapshotFromStorage()
      return
    }

    if (cloudData && localData && storageData.prompts.length > 0) {
      // All three have data -> merge
      await this.downloadAndMerge({ reason: 'initial' })
    }

    await this.updateSyncStatus({ initialized: true })
    await this.reconcilePendingSnapshotFromStorage()
  }

  async getStatus(): Promise<UnifiedSyncStatus> {
    // Single API call: getStatus() already checks availability
    const cloudStatus = await this.cloudStrategy.getStatus()
    const localStatus = await this.localStrategy.getStatus()
    const authState = await getCachedAuthState()

    const settings = await this.getSyncStatus()

    // Get folder name and permission status directly (avoid message deadlock)
    let folderName: string | undefined = undefined
    let permissionStatus: 'granted' | 'prompt' | 'denied' | undefined = undefined

    if (localStatus.enabled) {
      try {
        const handle = await getFolderHandle()
        if (handle) {
          folderName = handle.name
          permissionStatus = await checkFolderPermission(handle, 'readwrite')
        }
      } catch (err) {
        console.warn('[Oh My Prompt] Failed to get permission status:', err)
      }
    }

    const fullStatus: UnifiedSyncStatus = {
      cloudEnabled: cloudStatus.enabled,
      cloudLoggedIn: authState.status === 'logged_in',
      // Use local storage value for lastCloudSyncTime (written immediately after sync)
      // API value (cloudStatus.lastSyncTime) may be stale or cached
      lastCloudSyncTime: settings.lastCloudSyncTime || cloudStatus.lastSyncTime,
      cloudError: cloudStatus.error || settings.cloudError,
      localEnabled: localStatus.enabled,
      lastLocalSyncTime: settings.lastLocalSyncTime || localStatus.lastSyncTime,
      localError: localStatus.error || settings.localError,
      folderName,
      permissionStatus,
      hasUnsyncedChanges: settings.hasUnsyncedChanges || false,
      pendingCloudSync: settings.pendingCloudSync || false,
      pendingUpload: settings.pendingUpload || false,
      localOnlyItems: settings.localOnlyItems || {
        promptIds: [],
        categoryIds: [],
        temporaryPromptIds: []
      }
    }

    // Cache full status for instant load on next open
    await this.updateSyncStatus(fullStatus)

    return fullStatus
  }

  // Private helpers

  private async getLocalData(): Promise<FullBackupData> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = result[STORAGE_KEY] || { userData: { prompts: [], categories: [] }, temporaryPrompts: [] }
    const hasImageAssets = Object.prototype.hasOwnProperty.call(data, 'imageAssets')
    const hasPendingImageDeletes = Object.prototype.hasOwnProperty.call(data, 'pendingImageDeletes')
    return {
      prompts: data.userData?.prompts || [],
      categories: data.userData?.categories || [],
      temporaryPrompts: data.temporaryPrompts || [],
      imageAssets: this.normalizeImageAssets(data.imageAssets),
      pendingImageDeletes: this.normalizePendingImageDeletes(data.pendingImageDeletes),
      imageMetadataFields: {
        imageAssets: hasImageAssets,
        pendingImageDeletes: hasPendingImageDeletes
      },
      timestamp: Date.now()
    }
  }

  private async reconcilePendingSnapshotFromStorage(): Promise<void> {
    const guard = await this.getGuardStatus()
    if (!guard.pendingSnapshotHash) return

    const localData = await this.getLocalData()
    const localHash = await computeBackupDataHash(localData)
    if (localHash !== guard.pendingSnapshotHash) return

    await this.triggerSync(localData)
  }

  private async applyData(data: FullBackupData): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const existing = result[STORAGE_KEY] || {}
    const hasImageAssets = this.hasImageMetadataField(data, 'imageAssets')
    const hasPendingImageDeletes = this.hasImageMetadataField(data, 'pendingImageDeletes')

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...existing,
        userData: {
          prompts: data.prompts,
          categories: data.categories
        },
        temporaryPrompts: data.temporaryPrompts,
        imageAssets: hasImageAssets
          ? this.normalizeImageAssets(data.imageAssets)
          : this.normalizeImageAssets(existing.imageAssets),
        pendingImageDeletes: hasPendingImageDeletes
          ? this.normalizePendingImageDeletes(data.pendingImageDeletes)
          : this.normalizePendingImageDeletes(existing.pendingImageDeletes)
      }
    })
  }

  private async updateSyncStatus(updates: Partial<UnifiedSyncStatus & { initialized?: boolean }>): Promise<void> {
    const hasGuardUpdate = Object.prototype.hasOwnProperty.call(updates, 'guard')
    await this.enqueueSyncStatusUpdate(existing => {
      const { guard: guardUpdates, ...statusUpdates } = updates
      const nextStatus: Partial<UnifiedSyncStatus & { initialized?: boolean }> = {
        ...existing,
        ...statusUpdates
      }

      if (hasGuardUpdate) {
        nextStatus.guard = {
          ...(existing.guard || {}),
          ...(guardUpdates || {})
        }
      } else if (existing.guard) {
        nextStatus.guard = existing.guard
      }

      return nextStatus
    }, { preserveLatestGuard: !hasGuardUpdate })

    if (Object.prototype.hasOwnProperty.call(updates, 'hasUnsyncedChanges')) {
      await this.updateLegacyUnsyncedSetting(Boolean(updates.hasUnsyncedChanges))
    }
  }

  private async updateLegacyUnsyncedSetting(hasUnsyncedChanges: boolean): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const existing = result[STORAGE_KEY]
    if (!existing?.settings) return

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...existing,
        settings: {
          ...existing.settings,
          hasUnsyncedChanges
        }
      }
    })
  }

  private async getSyncStatus(): Promise<Partial<UnifiedSyncStatus & { initialized?: boolean }>> {
    const result = await chrome.storage.local.get('syncStatus')
    return result.syncStatus || {}
  }

  private async getGuardStatus(): Promise<SyncGuardStatus> {
    const status = await this.getSyncStatus()
    return status.guard || {}
  }

  private async getIdAliasMap(): Promise<IdAliasMap> {
    const status = await this.getSyncStatus()
    return status.idAliasMap || {}
  }

  private resolveAliasId(id: string, map: Record<string, string> = {}): string {
    if (id === 'temporary') return id

    const path: string[] = []
    const seen = new Map<string, number>()
    let current = id

    while (map[current]) {
      const seenAt = seen.get(current)
      if (seenAt !== undefined) {
        return path.slice(seenAt).sort()[0]
      }
      seen.set(current, path.length)
      path.push(current)
      current = map[current]
    }

    return current
  }

  private applyAliasMap(data: FullBackupData, aliasMap: IdAliasMap): FullBackupData {
    const categories = data.categories.map(c => ({
      ...c,
      id: this.resolveAliasId(c.id, aliasMap.categories)
    }))
    const prompts = data.prompts.map(p => ({
      ...p,
      id: this.resolveAliasId(p.id, aliasMap.prompts),
      categoryId: this.resolveAliasId(p.categoryId, aliasMap.categories)
    }))
    const temporaryPrompts = data.temporaryPrompts.map(p => ({
      ...p,
      id: this.resolveAliasId(p.id, aliasMap.temporaryPrompts),
      categoryId: 'temporary'
    }))

    return {
      ...data,
      categories: this.dedupeById(categories),
      prompts: this.dedupeById(prompts),
      temporaryPrompts: this.dedupeById(temporaryPrompts)
    }
  }

  private dedupeById<T extends { id: string; updatedAt?: number }>(items: T[]): T[] {
    const deduped = new Map<string, T>()
    for (const item of items) {
      const existing = deduped.get(item.id)
      if (!existing || this.shouldReplaceDedupedItem(existing, item)) {
        deduped.set(item.id, item)
      }
    }
    return Array.from(deduped.values())
  }

  private shouldReplaceDedupedItem<T extends { updatedAt?: number }>(existing: T, candidate: T): boolean {
    const existingUpdated = existing.updatedAt || 0
    const candidateUpdated = candidate.updatedAt || 0

    if (candidateUpdated !== existingUpdated) {
      return candidateUpdated > existingUpdated
    }

    // Equal timestamps can occur after alias remapping. Pick the lexically
    // smallest stable object representation so results do not depend on array order.
    return this.stableStringify(candidate) < this.stableStringify(existing)
  }

  private preserveMissingImageMetadata<T extends { updatedAt?: number; imageId?: string; localImage?: string; remoteImageUrl?: string }>(
    preferred: T,
    fallback?: T
  ): T {
    if (!fallback) return preferred

    if ((preferred.updatedAt || 0) > (fallback.updatedAt || 0)) {
      return preferred
    }

    return {
      ...preferred,
      imageId: preferred.imageId || fallback.imageId,
      localImage: preferred.localImage || fallback.localImage,
      remoteImageUrl: preferred.remoteImageUrl || fallback.remoteImageUrl
    }
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  private normalizeImageAssets(value: unknown): FullBackupData['imageAssets'] {
    return this.isPlainRecord(value) ? value as FullBackupData['imageAssets'] : {}
  }

  private normalizePendingImageDeletes(value: unknown): FullBackupData['pendingImageDeletes'] {
    return Array.isArray(value) ? value as FullBackupData['pendingImageDeletes'] : []
  }

  private hasImageMetadataField(data: FullBackupData, field: 'imageAssets' | 'pendingImageDeletes'): boolean {
    return data.imageMetadataFields?.[field] ?? Object.prototype.hasOwnProperty.call(data, field)
  }

  private imageAssetNeedsCloudUpload(id: string, cloud: FullBackupData, local: FullBackupData): boolean {
    const localAsset = this.normalizeImageAssets(local.imageAssets)?.[id]
    if (!localAsset) return false

    const cloudAsset = this.normalizeImageAssets(cloud.imageAssets)?.[id]
    if (!cloudAsset) return true

    return (localAsset.updatedAt || 0) > (cloudAsset.updatedAt || 0)
  }

  private pendingImageDeleteNeedsCloudUpload(
    localItem: NonNullable<FullBackupData['pendingImageDeletes']>[number],
    cloudItems: NonNullable<FullBackupData['pendingImageDeletes']>
  ): boolean {
    const cloudItem = cloudItems.find(other =>
      other.imageId === localItem.imageId && other.cloudPath === localItem.cloudPath
    )
    if (!cloudItem) return true

    return (localItem.updatedAt || 0) > (cloudItem.updatedAt || 0)
  }

  private mergeFullBackupData(
    cloud: FullBackupData,
    local: FullBackupData
  ): MergeResult & { conflicts: Array<{ type: 'prompt' | 'category'; cloud: unknown; local: unknown }> } {
    const cloudImageAssets = this.normalizeImageAssets(cloud.imageAssets)
    const localImageAssets = this.normalizeImageAssets(local.imageAssets)
    const cloudPendingImageDeletes = this.normalizePendingImageDeletes(cloud.pendingImageDeletes)
    const localPendingImageDeletes = this.normalizePendingImageDeletes(local.pendingImageDeletes)
    const categoryMerge = this.mergeBidirectional(
      cloud.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      local.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    const promptMerge = this.mergeBidirectional(
      cloud.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      local.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const tempMerge = this.mergeBidirectional(
      cloud.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      local.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    return {
      data: {
        prompts: promptMerge.merged as typeof cloud.prompts,
        categories: categoryMerge.merged as typeof cloud.categories,
        temporaryPrompts: tempMerge.merged as typeof cloud.temporaryPrompts,
        imageAssets: mergeImageAssets(cloudImageAssets, localImageAssets),
        pendingImageDeletes: mergePendingImageDeletes(cloudPendingImageDeletes, localPendingImageDeletes),
        timestamp: Date.now()
      },
      localOnlyItems: {
        prompts: [...promptMerge.localOnly, ...promptMerge.localNewer] as typeof cloud.prompts,
        categories: [...categoryMerge.localOnly, ...categoryMerge.localNewer] as typeof cloud.categories,
        temporaryPrompts: [...tempMerge.localOnly, ...tempMerge.localNewer] as typeof cloud.temporaryPrompts,
        imageAssetIds: Object.keys(localImageAssets || {}).filter(id => this.imageAssetNeedsCloudUpload(id, {
          ...cloud,
          imageAssets: cloudImageAssets
        }, {
          ...local,
          imageAssets: localImageAssets
        })),
        pendingImageDeleteKeys: (localPendingImageDeletes || [])
          .filter(item => this.pendingImageDeleteNeedsCloudUpload(item, cloudPendingImageDeletes || []))
          .map(item => `${item.imageId}\n${item.cloudPath}`)
      },
      conflicts: [
        ...promptMerge.conflicts.map(c => ({ type: 'prompt' as const, cloud: c.cloud, local: c.local })),
        ...categoryMerge.conflicts.map(c => ({ type: 'category' as const, cloud: c.cloud, local: c.local }))
      ]
    }
  }

  private stableStringify(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`
    }

    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => {
      return `${JSON.stringify(key)}:${this.stableStringify(record[key])}`
    }).join(',')}}`
  }

  private canTakeOverGuardLock(guard: SyncGuardStatus): boolean {
    if (!guard.lockOwnerId) return true
    if (guard.lockOwnerId === this.guardOwnerId) return true
    if (!guard.lastUploadStartedAt) return true
    return Date.now() - guard.lastUploadStartedAt > SYNC_IN_FLIGHT_STALE_MS
  }

  private isInsideMinSyncInterval(guard: SyncGuardStatus): boolean {
    if (!guard.lastUploadStartedAt) return false
    return Date.now() - guard.lastUploadStartedAt < this.MIN_SYNC_INTERVAL_MS
  }

  private getRemainingMinSyncIntervalMs(guard: SyncGuardStatus): number {
    if (!guard.lastUploadStartedAt) return this.MIN_SYNC_INTERVAL_MS
    return Math.max(0, this.MIN_SYNC_INTERVAL_MS - (Date.now() - guard.lastUploadStartedAt))
  }

  private schedulePendingSnapshotDrain(delayMs: number, version: number): void {
    if (this.pendingSnapshotTimer) {
      clearTimeout(this.pendingSnapshotTimer)
    }

    this.pendingSnapshotTimer = setTimeout(() => {
      this.pendingSnapshotTimer = null
      if (this.pendingSnapshotVersion !== version || !this.pendingSnapshot) return
      if (this.activeSyncPromise) return

      const pendingSnapshot = this.pendingSnapshot
      this.pendingSnapshot = null
      this.pendingSnapshotHash = null
      this.pendingSnapshotVersion++

      this.startActiveSync(pendingSnapshot, { enforceMinInterval: false })
        .catch(err => console.warn('[Oh My Prompt] Delayed pending sync failed:', err))
    }, delayMs)
  }

  private clearPendingSnapshot(): string | null {
    if (!this.pendingSnapshot && !this.pendingSnapshotTimer) {
      return null
    }

    const hash = this.pendingSnapshotHash
    this.pendingSnapshot = null
    this.pendingSnapshotHash = null
    this.pendingSnapshotVersion++

    if (this.pendingSnapshotTimer) {
      clearTimeout(this.pendingSnapshotTimer)
      this.pendingSnapshotTimer = null
    }

    return hash
  }

  private async acquireGuardLock(snapshotHash: string): Promise<boolean> {
    let acquired = false

    const acquisition = SyncOrchestrator.lockAcquisitionChain.then(async () => {
      const currentGuard = await this.getGuardStatus()
      if (currentGuard.syncInFlight && !this.canTakeOverGuardLock(currentGuard)) {
        await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
        acquired = false
        return
      }

      await this.updateGuardStatus({
        syncInFlight: true,
        lockOwnerId: this.guardOwnerId,
        lastUploadStartedAt: Date.now(),
        pendingSnapshotHash: currentGuard.pendingSnapshotHash === snapshotHash
          ? undefined
          : currentGuard.pendingSnapshotHash
      })

      const guard = await this.getGuardStatus()
      acquired = Boolean(guard.syncInFlight && guard.lockOwnerId === this.guardOwnerId)

      if (!acquired) {
        await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
      }
    })

    SyncOrchestrator.lockAcquisitionChain = acquisition.catch(() => undefined)
    await acquisition

    return acquired
  }

  private async releaseGuardLock(): Promise<void> {
    await this.enqueueSyncStatusUpdate(existing => {
      const existingGuard = existing.guard || {}
      if (existingGuard.lockOwnerId && existingGuard.lockOwnerId !== this.guardOwnerId) {
        return existing
      }

      const guard = {
        ...existingGuard,
        syncInFlight: false,
        lockOwnerId: undefined
      }
      return {
        ...existing,
        guard
      }
    })
  }

  private async shouldSkipSnapshot(
    snapshotHash: string,
    status: Partial<UnifiedSyncStatus & { initialized?: boolean }>,
    guard: SyncGuardStatus
  ): Promise<boolean> {
    if (guard.lastUploadedHash !== snapshotHash) return false
    if (this.hasPendingRetryNeeds(status)) return false
    const localAvailable = await this.localStrategy.isAvailable()
    if (localAvailable && guard.lastLocalSyncedHash !== snapshotHash) return false
    return true
  }

  private hasPendingRetryNeeds(status: Partial<UnifiedSyncStatus & { initialized?: boolean }>): boolean {
    return Boolean(
      status.pendingUpload ||
      status.pendingCloudSync ||
      status.hasUnsyncedChanges ||
      status.localError ||
      status.localSyncing ||
      status.localRetryScheduledAt ||
      (status.localRetryCount && status.localRetryCount > 0)
    )
  }

  private async updateGuardStatus(updates: Partial<SyncGuardStatus>): Promise<void> {
    await this.enqueueSyncStatusUpdate(existing => {
      const guard = {
        ...(existing.guard || {}),
        ...updates
      }

      return {
        ...existing,
        guard
      }
    })
  }

  private async clearPendingSnapshotHashIfCurrent(completedHash: string): Promise<void> {
    await this.enqueueSyncStatusUpdate(existing => {
      const guard = existing.guard || {}
      if (guard.pendingSnapshotHash !== completedHash) {
        return existing
      }

      return {
        ...existing,
        guard: {
          ...guard,
          pendingSnapshotHash: undefined
        }
      }
    })
  }

  private async enqueueSyncStatusUpdate(
    updater: (
      existing: Partial<UnifiedSyncStatus & { initialized?: boolean }>
    ) => Partial<UnifiedSyncStatus & { initialized?: boolean }>,
    options: { preserveLatestGuard?: boolean } = {}
  ): Promise<void> {
    const write = SyncOrchestrator.syncStatusWriteChain.then(async () => {
      const result = await chrome.storage.local.get('syncStatus')
      const existing = result.syncStatus || {}
      const nextStatus = updater(existing)

      if (options.preserveLatestGuard) {
        const latest = await chrome.storage.local.get('syncStatus')
        const latestGuard = latest.syncStatus?.guard
        if (latestGuard) {
          nextStatus.guard = latestGuard
        } else {
          delete nextStatus.guard
        }
      }

      await chrome.storage.local.set({
        syncStatus: nextStatus
      })

    })
    SyncOrchestrator.syncStatusWriteChain = write.catch(() => undefined)
    await write
  }

  private async drainPendingSnapshot(completedHash: string): Promise<void> {
    if (!this.pendingSnapshot) return

    const pendingSnapshot = this.pendingSnapshot
    const pendingVersion = this.pendingSnapshotVersion
    const pendingHash = await computeBackupDataHash(pendingSnapshot)
    const isLatestPendingSnapshot = pendingVersion === this.pendingSnapshotVersion

    if (isLatestPendingSnapshot) {
      this.pendingSnapshot = null
      this.pendingSnapshotHash = null
      this.pendingSnapshotVersion++
      if (this.pendingSnapshotTimer) {
        clearTimeout(this.pendingSnapshotTimer)
        this.pendingSnapshotTimer = null
      }
    }

    if (pendingHash === completedHash) {
      if (isLatestPendingSnapshot) {
        await this.clearPendingSnapshotHashIfCurrent(completedHash)
      }
      return
    }

    if (isLatestPendingSnapshot) {
      await this.triggerSyncWithGuards(pendingSnapshot, { enforceMinInterval: false })
    }
  }

  /**
   * Bidirectional merge - keeps latest version based on updatedAt.
   * This is TRUE multi-device sync (not cloud-wins-all).
   * Items merge only by ID; historical IDs must be normalized through idAliasMap first.
   *
   * Returns separate arrays for different merge scenarios:
   * - cloudOnly: items that exist only in cloud (need to add to local)
   * - localOnly: items that exist only in local (need to upload to cloud)
   * - localNewer: items where local version is newer than cloud (need to update cloud)
   * - cloudNewer: items where cloud version is newer than local (need to update local)
   * - conflicts: items with same timestamp
   */
  private mergeBidirectional<T extends { id: string; updatedAt?: number; name?: string; imageId?: string; localImage?: string; remoteImageUrl?: string }>(
    cloud: T[],
    local: T[],
    onConflict?: (cloudItem: T, localItem: T) => T
  ): {
    merged: T[]
    cloudOnly: T[]
    localOnly: T[]
    localNewer: T[]
    cloudNewer: T[]
    conflicts: Array<{ cloud: T; local: T }>
  } {
    const merged = new Map<string, T>()
    const cloudOnly: T[] = []
    const localOnly: T[] = []
    const localNewer: T[] = []
    const cloudNewer: T[] = []
    const conflicts: Array<{ cloud: T; local: T }> = []

    const cloudMap = new Map(cloud.map(item => [item.id, item]))
    const localMap = new Map(local.map(item => [item.id, item]))

    for (const [id, cloudItem] of cloudMap) {
      const localItem = localMap.get(id)

      if (!localItem) {
        cloudOnly.push(cloudItem)
        merged.set(id, cloudItem)
      } else {
        // Both exist with same ID - compare updatedAt
        const cloudUpdated = cloudItem.updatedAt || 0
        const localUpdated = localItem.updatedAt || 0

        if (cloudUpdated > localUpdated) {
          // Cloud version is newer
          merged.set(id, this.preserveMissingImageMetadata(cloudItem, localItem))
          cloudNewer.push(localItem) // Track that cloud version will overwrite local
        } else if (localUpdated > cloudUpdated) {
          // Local version is newer
          merged.set(id, this.preserveMissingImageMetadata(localItem, cloudItem))
          localNewer.push(localItem) // Track for upload to cloud
        } else {
          // Same timestamp - conflict
          conflicts.push({ cloud: cloudItem, local: localItem })
          // Default: use conflict resolver or keep cloud
          const resolved = onConflict?.(cloudItem, localItem) ?? cloudItem
          merged.set(id, this.preserveMissingImageMetadata(resolved, resolved === localItem ? cloudItem : localItem))
        }
      }
    }

    for (const [id, localItem] of localMap) {
      if (merged.has(id)) continue

      if (!cloudMap.has(id)) {
        localOnly.push(localItem)
        merged.set(id, localItem)
      }
    }

    return {
      merged: Array.from(merged.values()),
      cloudOnly,
      localOnly,
      localNewer,
      cloudNewer,
      conflicts
    }
  }
}
