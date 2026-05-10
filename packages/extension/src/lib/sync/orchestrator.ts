import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { executeLocalSync } from './local-sync-executor'
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

  constructor(cloudStrategy: CloudSyncStrategy, localStrategy: LocalSyncStrategy) {
    this.cloudStrategy = cloudStrategy
    this.localStrategy = localStrategy
  }

  /**
   * Trigger sync on data change.
   * Uses sync-manager for local sync (offscreen document for Service Worker context).
   * Cloud sync is done directly via CloudSyncStrategy (fetch works in Service Worker).
   */
  async triggerSync(data: FullBackupData): Promise<void> {
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
            pendingCloudSync: false
          })
        }
      }
      return
    }

    if (!cloudAvailable) {
      // Cloud unavailable: local backup only via offscreen document
      const localResult = await executeLocalSync(data)

      if (localResult.success) {
        await this.updateSyncStatus({
          lastLocalSyncTime: localResult.syncedAt || Date.now(),
          hasUnsyncedChanges: true,
          pendingCloudSync: true
        })
      } else {
        console.warn('[Oh My Prompt] Local sync failed:', localResult.error)
      }
      return
    }

    // Cloud available: parallel sync
    // Cloud sync directly, local sync via offscreen document
    const [cloudResult, localResult] = await Promise.all([
      this.cloudStrategy.sync(data),
      executeLocalSync(data)
    ])

    if (cloudResult.success && localResult.success) {
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult.syncedAt,
        lastLocalSyncTime: Date.now(),
        hasUnsyncedChanges: false,
        pendingCloudSync: false
      })
    } else if (localResult.success) {
      // Local success, cloud failed
      await this.updateSyncStatus({
        lastLocalSyncTime: Date.now(),
        hasUnsyncedChanges: true,
        pendingCloudSync: true,
        cloudError: cloudResult.error
      })
    } else if (cloudResult.success) {
      // Cloud success, local failed
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult.syncedAt,
        hasUnsyncedChanges: true,
        localError: localResult.error
      })
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
   */
  async getStatus(): Promise<UnifiedSyncStatus> {
    const [cloudStatus, localStatus] = await Promise.all([
      this.cloudStrategy.getStatus(),
      this.localStrategy.getStatus()
    ])

    const settings = await this.getSyncStatus()

    return {
      cloudEnabled: cloudStatus.enabled,
      cloudLoggedIn: await this.cloudStrategy.isAvailable(),
      lastCloudSyncTime: cloudStatus.lastSyncTime,
      cloudError: cloudStatus.error,
      localEnabled: localStatus.enabled,
      lastLocalSyncTime: localStatus.lastSyncTime,
      localError: localStatus.error,
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