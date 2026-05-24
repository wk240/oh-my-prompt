import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { executeLocalSync } from './local-sync-executor'
import { getFolderHandle, checkFolderPermission } from './indexeddb'
import { RetryManager } from './retry-manager'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { invalidateSyncStatusCache } from '../cloud-sync/auth-service'
import { computeBackupDataHash } from './hash'
import {
  FullBackupData,
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

  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy
  private cloudRetryManager: RetryManager | null = null
  private localRetryManager: RetryManager | null = null
  // Store last sync results for access after RetryManager.execute()
  private lastCloudSyncResult: SyncResult | null = null
  private lastLocalSyncResult: LocalSyncResult | null = null
  private readonly guardOwnerId = crypto.randomUUID()
  private activeSyncPromise: Promise<SyncTriggerResult> | null = null
  private syncStatusWriteChain: Promise<void> = Promise.resolve()
  private pendingSnapshot: FullBackupData | null = null
  private pendingSnapshotVersion = 0

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

    const activePromise = this.triggerSyncWithGuards(data).finally(() => {
      if (this.activeSyncPromise === activePromise) {
        this.activeSyncPromise = null
      }
    })
    this.activeSyncPromise = activePromise
    return activePromise
  }

  private async triggerSyncWithGuards(data: FullBackupData): Promise<SyncTriggerResult> {
    const snapshotHash = await computeBackupDataHash(data)
    const status = await this.getSyncStatus()
    let guard = status.guard || await this.getGuardStatus()

    if (guard.syncInFlight) {
      if (!this.canTakeOverGuardLock(guard)) {
        await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
        return { cloudSynced: false, localSynced: false, skipped: true }
      }
      guard = { ...guard, syncInFlight: false }
    } else if (guard.pendingSnapshotHash && !guard.syncInFlight && !this.pendingSnapshot) {
      await this.updateGuardStatus({ pendingSnapshotHash: undefined })
      guard = { ...guard, pendingSnapshotHash: undefined }
    }

    if (await this.shouldSkipSnapshot(snapshotHash, status, guard)) {
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
      return result
    } finally {
      await this.releaseGuardLock()
      await this.drainPendingSnapshot(snapshotHash)
    }
  }

  private async queuePendingSnapshot(data: FullBackupData): Promise<SyncTriggerResult> {
    const version = ++this.pendingSnapshotVersion
    this.pendingSnapshot = data

    const snapshotHash = await computeBackupDataHash(data)
    if (version === this.pendingSnapshotVersion && this.pendingSnapshot === data) {
      await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
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
          hasUnsyncedChanges: true,
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
        hasUnsyncedChanges: true,
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
   * Now includes mergedByName for categories (same name, different IDs).
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
      mergedByName: number  // Categories merged by name (same name, different IDs)
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
    mergedByNameItems: Array<{ type: 'category' | 'prompt' | 'temporaryPrompt'; cloud: { id: string; name: string; updatedAt?: number }; local: { id: string; name: string; updatedAt?: number }; kept: 'cloud' | 'local' }>
  }> {
    const cloudData = await this.cloudStrategy.restore()
    const localData = await this.getLocalData()

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
          conflicts: 0,
          mergedByName: 0
        },
        cloudOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] },
        localOnlyItems: {
          prompts: localData.prompts.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })),
          categories: localData.categories.map(c => ({ id: c.id, name: c.name, updatedAt: c.updatedAt })),
          temporaryPrompts: localData.temporaryPrompts.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
        },
        conflicts: [],
        mergedByNameItems: []
      }
    }

    // Perform merge preview (without applying changes)
    // First merge categories to detect name-based duplicates
    const categoryMerge = this.mergeBidirectional(
      cloudData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      localData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    // Build category ID mapping for prompts
    const categoryIdMap = new Map<string, string>()
    categoryMerge.mergedByName.forEach(merge => {
      if (merge.kept.id === merge.cloud.id) {
        categoryIdMap.set(merge.local.id, merge.cloud.id)
      }
      if (merge.kept.id === merge.local.id) {
        categoryIdMap.set(merge.cloud.id, merge.local.id)
      }
    })

    // Update prompts' categoryId before merge preview
    const updatedCloudPrompts = cloudData.prompts.map(p => {
      const newCategoryId = categoryIdMap.get(p.categoryId)
      return newCategoryId ? { ...p, categoryId: newCategoryId } : p
    })
    const updatedLocalPrompts = localData.prompts.map(p => {
      const newCategoryId = categoryIdMap.get(p.categoryId)
      return newCategoryId ? { ...p, categoryId: newCategoryId } : p
    })

    const promptMerge = this.mergeBidirectional(
      updatedCloudPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      updatedLocalPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
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
        conflicts: promptMerge.conflicts.length + categoryMerge.conflicts.length + tempMerge.conflicts.length,
        mergedByName: categoryMerge.mergedByName.length + promptMerge.mergedByName.length + tempMerge.mergedByName.length
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
      ],
      mergedByNameItems: [
        ...categoryMerge.mergedByName.map(m => ({
          type: 'category' as const,
          cloud: { id: m.cloud.id, name: m.cloud.name!, updatedAt: m.cloud.updatedAt },
          local: { id: m.local.id, name: m.local.name!, updatedAt: m.local.updatedAt },
          kept: (m.kept.id === m.cloud.id ? 'cloud' : 'local') as 'cloud' | 'local'
        })),
        ...promptMerge.mergedByName.map(m => ({
          type: 'prompt' as const,
          cloud: { id: m.cloud.id, name: m.cloud.name!, updatedAt: m.cloud.updatedAt },
          local: { id: m.local.id, name: m.local.name!, updatedAt: m.local.updatedAt },
          kept: (m.kept.id === m.cloud.id ? 'cloud' : 'local') as 'cloud' | 'local'
        })),
        ...tempMerge.mergedByName.map(m => ({
          type: 'temporaryPrompt' as const,
          cloud: { id: m.cloud.id, name: m.cloud.name!, updatedAt: m.cloud.updatedAt },
          local: { id: m.local.id, name: m.local.name!, updatedAt: m.local.updatedAt },
          kept: (m.kept.id === m.cloud.id ? 'cloud' : 'local') as 'cloud' | 'local'
        }))
      ]
    }
  }

  
  /**
   * Download from cloud and merge with local.
   * Now uses bidirectional merge (keeps latest version based on updatedAt).
   * For categories: also merges by name to prevent duplicates.
   * For prompts: updates categoryId if their category was merged by name.
   */
  async downloadAndMerge(): Promise<MergeResult & { conflicts?: Array<{ type: 'prompt' | 'category'; cloud: unknown; local: unknown }> }> {
    const cloudData = await this.cloudStrategy.restore()
    const localData = await this.getLocalData()

    if (!cloudData) {
      // No cloud data, use local
      return {
        data: localData,
        localOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] }
      }
    }

    // Bidirectional merge - keeps latest version based on updatedAt
    const categoryMerge = this.mergeBidirectional(
      cloudData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      localData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    // Build category ID mapping for prompts (when categories merged by name)
    // If local category was merged with cloud category by name, update prompt's categoryId
    const categoryIdMap = new Map<string, string>()
    categoryMerge.mergedByName.forEach(merge => {
      // If kept cloud version, map local category ID to cloud category ID
      if (merge.kept.id === merge.cloud.id) {
        categoryIdMap.set(merge.local.id, merge.cloud.id)
      }
      // If kept local version, map cloud category ID to local category ID
      if (merge.kept.id === merge.local.id) {
        categoryIdMap.set(merge.cloud.id, merge.local.id)
      }
    })

    // Update prompts' categoryId if needed
    const updatedCloudPrompts = cloudData.prompts.map(p => {
      const newCategoryId = categoryIdMap.get(p.categoryId)
      if (newCategoryId) {
        console.log(`[Oh My Prompt] Updating prompt "${p.name}" categoryId: ${p.categoryId} -> ${newCategoryId}`)
        return { ...p, categoryId: newCategoryId }
      }
      return p
    })

    const updatedLocalPrompts = localData.prompts.map(p => {
      const newCategoryId = categoryIdMap.get(p.categoryId)
      if (newCategoryId) {
        console.log(`[Oh My Prompt] Updating prompt "${p.name}" categoryId: ${p.categoryId} -> ${newCategoryId}`)
        return { ...p, categoryId: newCategoryId }
      }
      return p
    })

    const promptMerge = this.mergeBidirectional(
      updatedCloudPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      updatedLocalPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const tempMerge = this.mergeBidirectional(
      cloudData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    // Log merged items for debugging
    if (categoryMerge.mergedByName.length > 0) {
      console.log('[Oh My Prompt] Categories merged by name:', categoryMerge.mergedByName.map(m => ({
        name: m.kept.name,
        cloudId: m.cloud.id,
        localId: m.local.id,
        kept: (m.kept.id === m.cloud.id ? 'cloud' : 'local') as 'cloud' | 'local'
      })))
    }

    if (promptMerge.mergedByName.length > 0) {
      console.log('[Oh My Prompt] Prompts merged by name:', promptMerge.mergedByName.map(m => ({
        name: m.kept.name,
        cloudId: m.cloud.id,
        localId: m.local.id,
        kept: (m.kept.id === m.cloud.id ? 'cloud' : 'local') as 'cloud' | 'local'
      })))
    }

    if (tempMerge.mergedByName.length > 0) {
      console.log('[Oh My Prompt] Temporary prompts merged by name:', tempMerge.mergedByName.map(m => ({
        name: m.kept.name,
        cloudId: m.cloud.id,
        localId: m.local.id,
        kept: (m.kept.id === m.cloud.id ? 'cloud' : 'local') as 'cloud' | 'local'
      })))
    }

    const result: MergeResult = {
      data: {
        prompts: promptMerge.merged as typeof cloudData.prompts,
        categories: categoryMerge.merged as typeof cloudData.categories,
        temporaryPrompts: tempMerge.merged as typeof cloudData.temporaryPrompts,
        timestamp: Date.now()
      },
      // Items to upload to cloud: both truly local-only AND locally-newer versions
      localOnlyItems: {
        prompts: [...promptMerge.localOnly, ...promptMerge.localNewer] as typeof cloudData.prompts,
        categories: [...categoryMerge.localOnly, ...categoryMerge.localNewer] as typeof cloudData.categories,
        temporaryPrompts: [...tempMerge.localOnly, ...tempMerge.localNewer] as typeof cloudData.temporaryPrompts
      }
    }

    // Apply merged data to storage
    await this.applyData(result.data)

    // Mark pending upload if there are items to upload to cloud (local-only OR locally-newer)
    const itemsToUploadCount =
      promptMerge.localOnly.length + promptMerge.localNewer.length +
      categoryMerge.localOnly.length + categoryMerge.localNewer.length +
      tempMerge.localOnly.length + tempMerge.localNewer.length

    if (itemsToUploadCount > 0) {
      await this.updateSyncStatus({
        pendingUpload: true,
        localOnlyItems: {
          promptIds: [...promptMerge.localOnly, ...promptMerge.localNewer].map(p => p.id),
          categoryIds: [...categoryMerge.localOnly, ...categoryMerge.localNewer].map(c => c.id),
          temporaryPromptIds: [...tempMerge.localOnly, ...tempMerge.localNewer].map(p => p.id)
        }
      })
    }

    return {
      ...result,
      conflicts: [
        ...promptMerge.conflicts.map(c => ({ type: 'prompt' as const, cloud: c.cloud, local: c.local })),
        ...categoryMerge.conflicts.map(c => ({ type: 'category' as const, cloud: c.cloud, local: c.local }))
      ]
    }
  }

  /**
   * Upload local-only items to cloud.
   */
  async uploadLocalOnlyItems(): Promise<void> {
    const status = await this.getSyncStatus()

    if (!status.pendingUpload) return

    const localData = await this.getLocalData()

    const localOnlyPrompts = localData.prompts.filter(p =>
      status.localOnlyItems?.promptIds?.includes(p.id)
    )
    const localOnlyCategories = localData.categories.filter(c =>
      status.localOnlyItems?.categoryIds?.includes(c.id)
    )
    const localOnlyTemporaryPrompts = localData.temporaryPrompts.filter(p =>
      status.localOnlyItems?.temporaryPromptIds?.includes(p.id)
    )

    const result = await this.cloudStrategy.uploadPartial({
      prompts: localOnlyPrompts,
      categories: localOnlyCategories,
      temporaryPrompts: localOnlyTemporaryPrompts,
      timestamp: Date.now()
    })

    if (result.success) {
      await this.updateSyncStatus({
        pendingUpload: false,
        localOnlyItems: {
          promptIds: [],
          categoryIds: [],
          temporaryPromptIds: []
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
      return
    }

    if (localData && storageData.prompts.length === 0) {
      // Local backup exists, storage empty -> restore from local
      await this.applyData(localData)
      await this.updateSyncStatus({
        initialized: true,
        pendingCloudSync: cloudAvailable
      })
      return
    }

    if (cloudData && localData && storageData.prompts.length > 0) {
      // All three have data -> merge
      await this.downloadAndMerge()
    }

    await this.updateSyncStatus({ initialized: true })
  }

  async getStatus(): Promise<UnifiedSyncStatus> {
    // Single API call: getStatus() already checks availability
    const cloudStatus = await this.cloudStrategy.getStatus()
    const localStatus = await this.localStrategy.getStatus()

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
      cloudLoggedIn: cloudStatus.enabled, // Reuse getStatus result (no extra API call)
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
    return {
      prompts: data.userData?.prompts || [],
      categories: data.userData?.categories || [],
      temporaryPrompts: data.temporaryPrompts || [],
      timestamp: Date.now()
    }
  }

  private async applyData(data: FullBackupData): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const existing = result[STORAGE_KEY] || {}

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...existing,
        userData: {
          prompts: data.prompts,
          categories: data.categories
        },
        temporaryPrompts: data.temporaryPrompts
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

  private canTakeOverGuardLock(guard: SyncGuardStatus): boolean {
    if (!guard.lockOwnerId) return true
    if (guard.lockOwnerId === this.guardOwnerId) return true
    if (!guard.lastUploadStartedAt) return true
    return Date.now() - guard.lastUploadStartedAt > SYNC_IN_FLIGHT_STALE_MS
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
        pendingSnapshotHash: undefined
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
    if (!status.lastLocalSyncTime) {
      const localAvailable = await this.localStrategy.isAvailable()
      if (localAvailable) return false
    }
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

  private async enqueueSyncStatusUpdate(
    updater: (
      existing: Partial<UnifiedSyncStatus & { initialized?: boolean }>
    ) => Partial<UnifiedSyncStatus & { initialized?: boolean }>
  ): Promise<void> {
    const write = this.syncStatusWriteChain.then(async () => {
      const result = await chrome.storage.local.get('syncStatus')
      const existing = result.syncStatus || {}
      const nextStatus = updater(existing)

      await chrome.storage.local.set({
        syncStatus: nextStatus
      })

    })
    this.syncStatusWriteChain = write.catch(() => undefined)
    await write
  }

  private async drainPendingSnapshot(completedHash: string): Promise<void> {
    if (!this.pendingSnapshot) return

    const pendingSnapshot = this.pendingSnapshot
    const pendingVersion = this.pendingSnapshotVersion
    const pendingHash = await computeBackupDataHash(pendingSnapshot)

    if (pendingVersion === this.pendingSnapshotVersion) {
      this.pendingSnapshot = null
    }

    if (pendingHash === completedHash) {
      if (pendingVersion === this.pendingSnapshotVersion) {
        await this.updateGuardStatus({ pendingSnapshotHash: undefined })
      }
      return
    }

    if (pendingVersion === this.pendingSnapshotVersion) {
      await this.updateGuardStatus({ pendingSnapshotHash: undefined })
    }
    await this.triggerSyncWithGuards(pendingSnapshot)
  }

  /**
   * Bidirectional merge - keeps latest version based on updatedAt.
   * This is TRUE multi-device sync (not cloud-wins-all).
   *
   * For categories: also merges by name to prevent duplicates when same category
   * was created on different devices with different IDs.
   *
   * Returns separate arrays for different merge scenarios:
   * - cloudOnly: items that exist only in cloud (need to add to local)
   * - localOnly: items that exist only in local (need to upload to cloud)
   * - localNewer: items where local version is newer than cloud (need to update cloud)
   * - cloudNewer: items where cloud version is newer than local (need to update local)
   * - conflicts: items with same timestamp
   * - mergedByName: items that were merged by name (same name, different IDs)
   */
  private mergeBidirectional<T extends { id: string; updatedAt?: number; name?: string }>(
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
    mergedByName: Array<{ cloud: T; local: T; kept: T }>
  } {
    const merged = new Map<string, T>()
    const cloudOnly: T[] = []
    const localOnly: T[] = []
    const localNewer: T[] = []
    const cloudNewer: T[] = []
    const conflicts: Array<{ cloud: T; local: T }> = []
    const mergedByName: Array<{ cloud: T; local: T; kept: T }> = []

    const cloudMap = new Map(cloud.map(item => [item.id, item]))
    const localMap = new Map(local.map(item => [item.id, item]))

    // Build name maps for categories (items with 'name' field)
    // This helps detect duplicates where same category was created on different devices
    const cloudNameMap = new Map<string, T>()
    const localNameMap = new Map<string, T>()
    cloud.forEach(item => {
      if (item.name) {
        cloudNameMap.set(item.name, item)
      }
    })
    local.forEach(item => {
      if (item.name) {
        localNameMap.set(item.name, item)
      }
    })

    // Process all items by ID first
    for (const [id, cloudItem] of cloudMap) {
      const localItem = localMap.get(id)

      if (!localItem) {
        // No item with same ID in local
        // Check if there's an item with same NAME in local (for categories)
        if (cloudItem.name && localNameMap.has(cloudItem.name)) {
          const localByName = localNameMap.get(cloudItem.name)!
          // Same name but different IDs -> merge by name
          const cloudUpdated = cloudItem.updatedAt || 0
          const localUpdated = localByName.updatedAt || 0

          if (cloudUpdated > localUpdated) {
            // Keep cloud version, discard local duplicate
            merged.set(cloudItem.id, cloudItem)
            mergedByName.push({ cloud: cloudItem, local: localByName, kept: cloudItem })
          } else if (localUpdated > cloudUpdated) {
            // Keep local version, discard cloud duplicate
            merged.set(localByName.id, localByName)
            mergedByName.push({ cloud: cloudItem, local: localByName, kept: localByName })
          } else {
            // Same timestamp - prefer cloud version
            merged.set(cloudItem.id, cloudItem)
            mergedByName.push({ cloud: cloudItem, local: localByName, kept: cloudItem })
          }
        } else {
          // Truly cloud-only (no matching ID or name)
          cloudOnly.push(cloudItem)
          merged.set(id, cloudItem)
        }
      } else {
        // Both exist with same ID - compare updatedAt
        const cloudUpdated = cloudItem.updatedAt || 0
        const localUpdated = localItem.updatedAt || 0

        if (cloudUpdated > localUpdated) {
          // Cloud version is newer
          merged.set(id, cloudItem)
          cloudNewer.push(localItem) // Track that cloud version will overwrite local
        } else if (localUpdated > cloudUpdated) {
          // Local version is newer
          merged.set(id, localItem)
          localNewer.push(localItem) // Track for upload to cloud
        } else {
          // Same timestamp - conflict
          conflicts.push({ cloud: cloudItem, local: localItem })
          // Default: use conflict resolver or keep cloud
          const resolved = onConflict?.(cloudItem, localItem) ?? cloudItem
          merged.set(id, resolved)
        }
      }
    }

    // Add local-only items (not in cloud by ID or name)
    for (const [id, localItem] of localMap) {
      // Skip if already processed (merged by name with a cloud item)
      if (merged.has(id)) continue

      // Check if there's an item with same NAME in cloud
      if (localItem.name && cloudNameMap.has(localItem.name)) {
        // Already handled in the cloud loop above (merged by name)
        continue
      }

      // Truly local-only (no matching ID or name in cloud)
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
      conflicts,
      mergedByName
    }
  }
}
