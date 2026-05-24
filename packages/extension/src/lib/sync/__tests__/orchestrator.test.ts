import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncOrchestrator } from '../orchestrator'
import { CloudSyncStrategy } from '../strategies/cloud'
import { LocalSyncStrategy } from '../strategies/local'
import { FullBackupData, MergeResult } from '../types'
import { computeBackupDataHash } from '../hash'
import { executeLocalSync } from '../local-sync-executor'

// Mock the strategies
vi.mock('../strategies/cloud')
vi.mock('../strategies/local')
vi.mock('../local-sync-executor', () => ({
  executeLocalSync: vi.fn()
}))

function makeBackupData({ promptId, updatedAt }: { promptId: string; updatedAt: number }): FullBackupData {
  return {
    prompts: [
      {
        id: promptId,
        name: `Prompt ${promptId}`,
        content: `Content ${updatedAt}`,
        categoryId: 'c1',
        order: 0,
        updatedAt
      }
    ],
    categories: [{ id: 'c1', name: 'Category', order: 0, updatedAt }],
    temporaryPrompts: [],
    timestamp: updatedAt
  }
}

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator
  let cloudStrategy: CloudSyncStrategy
  let localStrategy: LocalSyncStrategy
  let storageData: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    storageData = {}

    // Create fresh strategy instances
    cloudStrategy = new CloudSyncStrategy()
    localStrategy = new LocalSyncStrategy()
    orchestrator = new SyncOrchestrator(cloudStrategy, localStrategy)

    // Mock chrome.storage.local
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getManifest: vi.fn().mockReturnValue({ version: '2.0.0' })
      },
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[]) => {
            if (!keys) return storageData
            if (typeof keys === 'string') {
              return { [keys]: storageData[keys] }
            }
            return keys.reduce<Record<string, unknown>>((result, key) => {
              result[key] = storageData[key]
              return result
            }, {})
          }),
          set: vi.fn(async (updates: Record<string, unknown>) => {
            Object.assign(storageData, updates)
          })
        }
      }
    } as any

    vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 1 })
  })

  describe('triggerSync', () => {
    it('should skip upload when persisted lastUploadedHash matches the current snapshot', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const hash = await computeBackupDataHash(data)

      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: { guard: { lastUploadedHash: hash } }
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const result = await orchestrator.triggerSync(data)

      expect(result.skipped).toBe(true)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()
    })

    it('should recover an orphaned persisted in-flight guard and run sync', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          lastUploadStartedAt: Date.now()
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should recover a stale persisted in-flight guard and clear durable pending state', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          pendingSnapshotHash: 'stale-pending',
          lastUploadStartedAt: 1
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should leave guard clean after draining the latest pending snapshot', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 1 })

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      })).mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = orchestrator.triggerSync(second)
      const thirdRun = orchestrator.triggerSync(third)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })
      releaseFirst()
      await Promise.all([firstRun, secondRun, thirdRun])

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should not throw when runtime messaging is unavailable in tests', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      global.chrome = {
        storage: {
          local: chrome.storage.local
        }
      } as any
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      await expect(orchestrator.triggerSync(data)).resolves.toEqual(expect.objectContaining({
        cloudSynced: true
      }))
    })

    it('should recover a stale persisted in-flight guard and run sync', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          guard: {
            syncInFlight: true,
            lastUploadStartedAt: 1
          }
        }
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
    })

    it('should coalesce same-tick trigger calls before storage guard writes finish', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

      let releaseStorageRead: (() => void) | undefined
      let delayNextSyncStatusRead = true
      vi.mocked(chrome.storage.local.get).mockImplementation((key?: string | string[]) => {
        if (key === 'syncStatus' && delayNextSyncStatusRead) {
          delayNextSyncStatusRead = false
          return new Promise(resolve => {
            releaseStorageRead = () => resolve({})
          })
        }
        return Promise.resolve({})
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = orchestrator.triggerSync(second)
      const thirdRun = orchestrator.triggerSync(third)

      await vi.waitFor(() => {
        expect(releaseStorageRead).toBeTypeOf('function')
      })
      releaseStorageRead()
      await Promise.all([firstRun, secondRun, thirdRun])

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(1, first)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
    })

    it('should not skip identical cloud hash when local retry state is pending', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const hash = await computeBackupDataHash(data)

      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          guard: { lastUploadedHash: hash },
          localError: 'PERMISSION_DENIED'
        }
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.skipped).not.toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
    })

    it('should run one follow-up sync with the latest pending snapshot after an in-flight sync finishes', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 1 })

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      })).mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = orchestrator.triggerSync(second)
      const thirdRun = orchestrator.triggerSync(third)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })
      releaseFirst()
      await Promise.all([firstRun, secondRun, thirdRun])

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
    })

    it('should trigger sync to both strategies when cloud available', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      // Mock strategies
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        promptsCount: 0,
        categoriesCount: 0
      })
      vi.spyOn(localStrategy, 'sync').mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        promptsCount: 0,
        categoriesCount: 0
      })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      await orchestrator.triggerSync(data)

      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
    })

    it('should mark pendingCloudSync when cloud unavailable', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(localStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: Date.now() })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const setSpy = chrome.storage.local.set as any

      await orchestrator.triggerSync(data)

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({ pendingCloudSync: true })
      }))
    })

    it('should sync cloud when local unavailable and cloud available', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: Date.now() })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)

      await orchestrator.triggerSync(data)

      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).not.toHaveBeenCalled()
    })

    it('should handle cloud sync failure with local success', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR'
      })
      vi.spyOn(localStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: Date.now() })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const setSpy = chrome.storage.local.set as any

      await orchestrator.triggerSync(data)

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingCloudSync: true,
          cloudError: 'NETWORK_ERROR'
        })
      }))
    })
  })

  describe('downloadAndMerge', () => {
    it('should merge data with cloud priority', async () => {
      const cloudData: FullBackupData = {
        prompts: [
          { id: '1', name: 'Cloud Prompt', content: 'cloud', categoryId: 'c1', order: 0 }
        ],
        categories: [{ id: 'c1', name: 'Cloud Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      const localData: FullBackupData = {
        prompts: [
          { id: '1', name: 'Local Prompt', content: 'local', categoryId: 'c1', order: 0 },
          { id: '2', name: 'Local Only', content: 'local-only', categoryId: 'c1', order: 0 }
        ],
        categories: [
          { id: 'c1', name: 'Local Category', order: 0 },
          { id: 'c2', name: 'Local Only Category', order: 0 }
        ],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      vi.spyOn(localStrategy, 'restore').mockResolvedValue(null)
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const result = await orchestrator.downloadAndMerge()

      expect(result.data.prompts).toHaveLength(2)
      expect(result.data.prompts.find(p => p.id === '1')?.name).toBe('Cloud Prompt')
      expect(result.localOnlyItems.prompts).toHaveLength(1)
      expect(result.localOnlyItems.prompts[0].id).toBe('2')
    })

    it('should return local data when cloud unavailable', async () => {
      const localData: FullBackupData = {
        prompts: [{ id: '1', name: 'Local', content: 'local', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(null)
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const result = await orchestrator.downloadAndMerge()

      expect(result.data.prompts).toHaveLength(1)
      expect(result.localOnlyItems.prompts).toHaveLength(0)
    })

    it('should mark pendingUpload when local-only items exist', async () => {
      const cloudData: FullBackupData = {
        prompts: [{ id: '1', name: 'Cloud', content: 'cloud', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Cloud Cat', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      const localData: FullBackupData = {
        prompts: [
          { id: '1', name: 'Local', content: 'local', categoryId: 'c1', order: 0 },
          { id: '2', name: 'Local Only', content: 'local-only', categoryId: 'c1', order: 0 }
        ],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const setSpy = chrome.storage.local.set as any

      await orchestrator.downloadAndMerge()

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingUpload: true,
          localOnlyItems: expect.objectContaining({
            promptIds: ['2']
          })
        })
      }))
    })
  })

  describe('uploadLocalOnlyItems', () => {
    it('should upload local-only items when pending', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'syncStatus') {
          return {
            syncStatus: {
              pendingUpload: true,
              localOnlyItems: {
                promptIds: ['local-1'],
                categoryIds: [],
                temporaryPromptIds: []
              }
            }
          }
        }
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: {
                prompts: [{ id: 'local-1', name: 'Local Only', content: 'test', categoryId: 'c1', order: 0 }],
                categories: []
              },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      vi.spyOn(cloudStrategy, 'uploadPartial').mockResolvedValue({ success: true, syncedAt: Date.now() })

      await orchestrator.uploadLocalOnlyItems()

      expect(cloudStrategy.uploadPartial).toHaveBeenCalled()
    })

    it('should skip upload when not pending', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          pendingUpload: false,
          localOnlyItems: { promptIds: [], categoryIds: [], temporaryPromptIds: [] }
        }
      })

      vi.spyOn(cloudStrategy, 'uploadPartial').mockResolvedValue({ success: true, syncedAt: Date.now() })

      await orchestrator.uploadLocalOnlyItems()

      expect(cloudStrategy.uploadPartial).not.toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('should return unified sync status', async () => {
      vi.spyOn(cloudStrategy, 'getStatus').mockResolvedValue({
        enabled: true,
        lastSyncTime: 1000
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'getStatus').mockResolvedValue({
        enabled: true,
        lastSyncTime: 2000
      })
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          hasUnsyncedChanges: false,
          pendingCloudSync: false,
          pendingUpload: false,
          localOnlyItems: { promptIds: [], categoryIds: [], temporaryPromptIds: [] }
        }
      })

      const status = await orchestrator.getStatus()

      expect(status.cloudEnabled).toBe(true)
      expect(status.cloudLoggedIn).toBe(true)
      expect(status.lastCloudSyncTime).toBe(1000)
      expect(status.localEnabled).toBe(true)
      expect(status.lastLocalSyncTime).toBe(2000)
    })
  })

  describe('initialSync', () => {
    it('should restore from cloud when storage empty', async () => {
      const cloudData: FullBackupData = {
        prompts: [{ id: '1', name: 'Cloud Prompt', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      vi.spyOn(localStrategy, 'restore').mockResolvedValue(null)
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return { prompt_script_data: { userData: { prompts: [], categories: [] }, temporaryPrompts: [] } }
        }
        return {}
      })

      await orchestrator.initialSync()

      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([expect.objectContaining({ id: '1' })])
          })
        })
      }))
    })

    it('should restore from local when cloud unavailable and storage empty', async () => {
      const localData: FullBackupData = {
        prompts: [{ id: '1', name: 'Local Prompt', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(null)
      vi.spyOn(localStrategy, 'restore').mockResolvedValue(localData)
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return { prompt_script_data: { userData: { prompts: [], categories: [] }, temporaryPrompts: [] } }
        }
        return {}
      })

      await orchestrator.initialSync()

      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([expect.objectContaining({ id: '1' })])
          })
        })
      }))
    })
  })
})
