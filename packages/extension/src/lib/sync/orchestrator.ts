import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { executeLocalSync } from './local-sync-executor'
import { getFolderHandle, checkFolderPermission } from './indexeddb'
import { RetryManager } from './retry-manager'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { invalidateSyncStatusCache } from '../cloud-sync/auth-service'
import {
  FullBackupData,
  MergeResult,
  UnifiedSyncStatus,
  SyncResult
} from './types'

/**
 * Local sync result from executeLocalSync.
 */
interface LocalSyncResult {
  success: boolean
  syncedAt?: number
  error?: string
}

const STORAGE_KEY = 'prompt_script_data'

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
  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy
  private cloudRetryManager: RetryManager | null = null
  private localRetryManager: RetryManager | null = null
  // Store last sync results for access after RetryManager.execute()
  private lastCloudSyncResult: SyncResult | null = null
  private lastLocalSyncResult: LocalSyncResult | null = null

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
    chrome.runtime.sendMessage({
      type: MessageType.BACKUP_RETRY,
      payload: {
        target,
        retryCount: state.retryCount,
        retryScheduledAt: state.retryScheduledAt
      }
    }).catch(() => { /* UI may not be listening */ })
  }

  /**
   * Notify UI about backup completion.
   */
  private notifyBackupComplete(target: 'cloud' | 'local', success: boolean): void {
    chrome.runtime.sendMessage({
      type: MessageType.BACKUP_COMPLETE,
      payload: {
        target,
        success
      }
    }).catch(() => { /* UI may not be listening */ })
  }

  /**
   * Trigger sync on data change.
   * Uses sync-manager for local sync (offscreen document for Service Worker context).
   * Cloud sync is done directly via CloudSyncStrategy (fetch works in Service Worker).
   *
   * @returns Sync result with status information (avoiding extra getStatus calls)
   */
  async triggerSync(data: FullBackupData): Promise<{
    cloudSynced: boolean
    localSynced: boolean
    cloudError?: string
    localError?: string
    syncedAt?: number
    skipped?: boolean // Cloud sync skipped due to identical data
  }> {
    // Notify UI that sync is starting
    chrome.runtime.sendMessage({
      type: MessageType.BACKUP_PROGRESS,
      payload: { cloud: true, local: true }
    }).catch(() => { /* UI may not be listening */ })

    // Update sync status to indicate syncing
    await this.updateSyncStatus({
      cloudSyncing: true,
      localSyncing: true
    })

    const cloudAvailable = await this.cloudStrategy.isAvailable()
    const localAvailable = await this.localStrategy.isAvailable()

    if (!localAvailable) {
      console.log('[Oh My Prompt] Local sync not available, skipping sync')
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
        const cloudResult = this.lastCloudSyncResult!

        if (retryResult.success && cloudResult.success) {
          await this.updateSyncStatus({
            lastCloudSyncTime: cloudResult.syncedAt,
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
          return { cloudSynced: true, localSynced: false, syncedAt: cloudResult.syncedAt }
        }
        await this.updateSyncStatus({
          cloudSyncing: false,
          localSyncing: false,
          cloudError: cloudResult.error
        })
        return { cloudSynced: false, localSynced: false, cloudError: cloudResult.error }
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
      const localResult = this.lastLocalSyncResult!

      if (retryResult.success && localResult.success) {
        await this.updateSyncStatus({
          lastLocalSyncTime: localResult.syncedAt || Date.now(),
          hasUnsyncedChanges: true,
          pendingCloudSync: true,
          cloudSyncing: false,
          localSyncing: false,
          localRetryCount: 0,
          localError: undefined
        })
        return { cloudSynced: false, localSynced: true, syncedAt: localResult.syncedAt }
      } else {
        console.warn('[Oh My Prompt] Local sync failed:', localResult.error)
        await this.updateSyncStatus({
          cloudSyncing: false,
          localSyncing: false,
          localError: localResult.error
        })
        return { cloudSynced: false, localSynced: false, localError: localResult.error }
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
    const cloudResult = this.lastCloudSyncResult!
    const localResult = this.lastLocalSyncResult!

    // Determine success using retry results (accounts for retry mechanism)
    const cloudSuccess = cloudRetryResult.success && cloudResult.success
    const localSuccess = localRetryResult.success && localResult.success

    // Handle skipped sync (data unchanged)
    if (cloudResult.skipped) {
      console.log('[Oh My Prompt] Cloud sync skipped: data unchanged')
    }

    if (cloudSuccess && localSuccess) {
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult.syncedAt,
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
        syncedAt: cloudResult.syncedAt,
        skipped: cloudResult.skipped
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
        cloudError: cloudResult.error
      })
      return {
        cloudSynced: false,
        localSynced: true,
        cloudError: cloudResult.error
      }
    } else if (cloudSuccess) {
      // Cloud success, local failed
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult.syncedAt,
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
        localError: localResult.error
      })
      // Invalidate auth-service cache after successful cloud sync
      invalidateSyncStatusCache()
      return {
        cloudSynced: true,
        localSynced: false,
        localError: localResult.error,
        syncedAt: cloudResult.syncedAt
      }
    }

    // Both failed
    await this.updateSyncStatus({
      cloudSyncing: false,
      localSyncing: false,
      cloudError: cloudResult.error,
      localError: localResult.error
    })
    return {
      cloudSynced: false,
      localSynced: false,
      cloudError: cloudResult.error,
      localError: localResult.error
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
    const promptMerge = this.mergeBidirectional(
      cloudData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const categoryMerge = this.mergeBidirectional(
      cloudData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      localData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    const tempMerge = this.mergeBidirectional(
      cloudData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    // Use separate arrays from mergeBidirectional to avoid double-counting
    // - cloudOnly: items only in cloud (need to add to local)
    // - localOnly: items only in local (need to upload to cloud)
    // - cloudNewer: items where cloud is newer (need to update local)
    // - localNewer: items where local is newer (need to update cloud)
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
    const promptMerge = this.mergeBidirectional(
      cloudData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const categoryMerge = this.mergeBidirectional(
      cloudData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      localData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    const tempMerge = this.mergeBidirectional(
      cloudData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

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

  /**
   * Get unified sync status.
   *
   * IMPORTANT: When called from Service Worker context (handling GET_UNIFIED_SYNC_STATUS message),
   * we MUST NOT use sendToOffscreen() because it causes a deadlock:
   * - Service Worker is processing a message (inside switch statement)
   * - sendToOffscreen sends another message (OFFSCREEN_CHECK_PERMISSION)
   * - New message gets queued waiting for current message to complete
   * - But current message is waiting for sendToOffscreen response
   * - DEADLOCK!
   *
   * Solution: Call getFolderHandle/checkFolderPermission directly in Service Worker context.
   * These functions work in Service Worker because IndexedDB is available.
   */
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
        console.log('[Oh My Prompt] getStatus: localStatus.enabled=true, calling getFolderHandle directly')
        const handle = await getFolderHandle()
        console.log('[Oh My Prompt] getStatus: getFolderHandle result=', handle ? handle.name : 'null')
        if (handle) {
          folderName = handle.name
          permissionStatus = await checkFolderPermission(handle, 'readwrite')
          console.log('[Oh My Prompt] getStatus: folderName=', folderName, 'permissionStatus=', permissionStatus)
        }
      } catch (err) {
        console.warn('[Oh My Prompt] Failed to get permission status:', err)
      }
    } else {
      console.log('[Oh My Prompt] getStatus: localStatus.enabled=false')
    }

    return {
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
    const result = await chrome.storage.local.get('syncStatus')
    const existing = result.syncStatus || {}

    await chrome.storage.local.set({
      syncStatus: {
        ...existing,
        ...updates
      }
    })
  }

  private async getSyncStatus(): Promise<Partial<UnifiedSyncStatus & { initialized?: boolean }>> {
    const result = await chrome.storage.local.get('syncStatus')
    return result.syncStatus || {}
  }

  /**
   * Bidirectional merge - keeps latest version based on updatedAt.
   * This is TRUE multi-device sync (not cloud-wins-all).
   *
   * Returns separate arrays for different merge scenarios:
   * - cloudOnly: items that exist only in cloud (need to add to local)
   * - localOnly: items that exist only in local (need to upload to cloud)
   * - localNewer: items where local version is newer than cloud (need to update cloud)
   * - cloudNewer: items where cloud version is newer than local (need to update local)
   * - conflicts: items with same timestamp
   */
  private mergeBidirectional<T extends { id: string; updatedAt?: number }>(
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

    // Process all items
    for (const [id, cloudItem] of cloudMap) {
      const localItem = localMap.get(id)

      if (!localItem) {
        // Cloud only - not in local at all
        cloudOnly.push(cloudItem)
        merged.set(id, cloudItem)
      } else {
        // Both exist - compare updatedAt
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

    // Add local-only items (not in cloud at all)
    for (const [id, localItem] of localMap) {
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