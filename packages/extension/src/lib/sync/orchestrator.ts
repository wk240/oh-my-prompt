import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { executeLocalSync } from './local-sync-executor'
import { getFolderHandle, checkFolderPermission } from './indexeddb'
import { RetryManager } from './retry-manager'
import { MessageType } from '@oh-my-prompt/shared/messages'
import {
  FullBackupData,
  MergeResult,
  UnifiedSyncStatus
} from './types'

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
 */
export class SyncOrchestrator {
  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy
  private cloudRetryManager: RetryManager | null = null
  private localRetryManager: RetryManager | null = null

  constructor(cloudStrategy: CloudSyncStrategy, localStrategy: LocalSyncStrategy) {
    this.cloudStrategy = cloudStrategy
    this.localStrategy = localStrategy
  }

  /**
   * Create retry callback for cloud sync.
   */
  private createCloudRetryCallback(data: FullBackupData): () => Promise<{ success: boolean; error?: string }> {
    return async () => {
      const result = await this.cloudStrategy.sync(data)
      return {
        success: result.success,
        error: result.error
      }
    }
  }

  /**
   * Create retry callback for local sync.
   */
  private createLocalRetryCallback(data: FullBackupData): () => Promise<{ success: boolean; error?: string }> {
    return async () => {
      const result = await executeLocalSync(data)
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
        const cloudResult = await this.cloudStrategy.sync(data)
        if (cloudResult.success) {
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
      const localResult = await executeLocalSync(data)

      if (localResult.success) {
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

    // Cloud available: parallel sync
    // Cloud sync directly, local sync via offscreen document
    const [cloudResult, localResult] = await Promise.all([
      this.cloudStrategy.sync(data),
      executeLocalSync(data)
    ])

    // Handle skipped sync (data unchanged)
    if (cloudResult.skipped) {
      console.log('[Oh My Prompt] Cloud sync skipped: data unchanged')
    }

    if (cloudResult.success && localResult.success) {
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
        cloudRetryCount: 0,
        localRetryCount: 0,
        cloudError: undefined,
        localError: undefined
      })
      return {
        cloudSynced: true,
        localSynced: true,
        syncedAt: cloudResult.syncedAt,
        skipped: cloudResult.skipped
      }
    } else if (localResult.success) {
      // Local success, cloud failed
      await this.updateSyncStatus({
        lastLocalSyncTime: Date.now(),
        hasUnsyncedChanges: true,
        pendingCloudSync: true,
        localSyncing: false,
        localRetryCount: 0,
        localError: undefined,
        cloudError: cloudResult.error
      })
      return {
        cloudSynced: false,
        localSynced: true,
        cloudError: cloudResult.error
      }
    } else if (cloudResult.success) {
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
        cloudRetryCount: 0,
        cloudError: undefined,
        localError: localResult.error
      })
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
   * Download from cloud and merge with local.
   * Cloud wins on conflict, local-only items preserved.
   */
  async downloadAndMerge(): Promise<MergeResult> {
    const cloudData = await this.cloudStrategy.restore()
    const localData = await this.getLocalData()

    if (!cloudData) {
      // No cloud data, use local
      return {
        data: localData,
        localOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] }
      }
    }

    // Merge with cloud priority
    const mergedPrompts = this.mergeById(cloudData.prompts, localData.prompts)
    const mergedCategories = this.mergeById(cloudData.categories, localData.categories)
    const mergedTemporaryPrompts = this.mergeById(
      cloudData.temporaryPrompts,
      localData.temporaryPrompts
    )

    // Find local-only items
    const cloudPromptIds = new Set(cloudData.prompts.map(p => p.id))
    const cloudCategoryIds = new Set(cloudData.categories.map(c => c.id))
    const cloudTempIds = new Set(cloudData.temporaryPrompts.map(p => p.id))

    const localOnlyPrompts = localData.prompts.filter(p => !cloudPromptIds.has(p.id))
    const localOnlyCategories = localData.categories.filter(c => !cloudCategoryIds.has(c.id))
    const localOnlyTemporaryPrompts = localData.temporaryPrompts.filter(p => !cloudTempIds.has(p.id))

    const result: MergeResult = {
      data: {
        prompts: mergedPrompts,
        categories: mergedCategories,
        temporaryPrompts: mergedTemporaryPrompts,
        timestamp: Date.now()
      },
      localOnlyItems: {
        prompts: localOnlyPrompts,
        categories: localOnlyCategories,
        temporaryPrompts: localOnlyTemporaryPrompts
      }
    }

    // Apply merged data to storage
    await this.applyData(result.data)

    // Mark pending upload if local-only items exist
    if (localOnlyPrompts.length > 0 ||
        localOnlyCategories.length > 0 ||
        localOnlyTemporaryPrompts.length > 0) {
      await this.updateSyncStatus({
        pendingUpload: true,
        localOnlyItems: {
          promptIds: localOnlyPrompts.map(p => p.id),
          categoryIds: localOnlyCategories.map(c => c.id),
          temporaryPromptIds: localOnlyTemporaryPrompts.map(p => p.id)
        }
      })
    }

    return result
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
   * Merge arrays by ID with cloud priority.
   * Same ID: cloud item wins.
   * Local only: preserved.
   */
  private mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
    const merged = new Map<string, T>()

    // Cloud data takes priority
    for (const item of cloud) {
      merged.set(item.id, item)
    }

    // Add local-only items
    for (const item of local) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item)
      }
    }

    return Array.from(merged.values())
  }
}