import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncOrchestrator } from '../orchestrator'
import { CloudSyncStrategy } from '../strategies/cloud'
import { LocalSyncStrategy } from '../strategies/local'
import { FullBackupData, MergeResult } from '../types'

// Mock the strategies
vi.mock('../strategies/cloud')
vi.mock('../strategies/local')

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator
  let cloudStrategy: CloudSyncStrategy
  let localStrategy: LocalSyncStrategy

  beforeEach(() => {
    vi.clearAllMocks()

    // Create fresh strategy instances
    cloudStrategy = new CloudSyncStrategy()
    localStrategy = new LocalSyncStrategy()
    orchestrator = new SyncOrchestrator(cloudStrategy, localStrategy)

    // Mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any
  })

  describe('triggerSync', () => {
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
      expect(localStrategy.sync).toHaveBeenCalledWith(data)
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

    it('should skip sync when local unavailable', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)

      await orchestrator.triggerSync(data)

      expect(cloudStrategy.sync).not.toHaveBeenCalled()
      expect(localStrategy.sync).not.toHaveBeenCalled()
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