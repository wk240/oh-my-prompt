import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createSyncOrchestrator } from '../index'
import { FullBackupData } from '../types'
import { CloudSyncStrategy } from '../strategies/cloud'
import { LocalSyncStrategy } from '../strategies/local'
import { executeLocalSync } from '../local-sync-executor'

// Mock the strategies
vi.mock('../strategies/cloud')
vi.mock('../strategies/local')
vi.mock('../local-sync-executor', () => ({
  executeLocalSync: vi.fn()
}))
vi.mock('../indexeddb', () => ({
  getFolderHandle: vi.fn().mockResolvedValue(null),
  checkFolderPermission: vi.fn().mockResolvedValue('prompt')
}))

describe('Sync Integration', () => {
  let storageData: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    storageData = {}

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

    // Mock fetch for cloud API calls
    global.fetch = vi.fn()

    // Mock IndexedDB for local sync
    global.indexedDB = {
      open: vi.fn().mockReturnValue({
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: {
          transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null
              }),
              put: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null
              }),
              delete: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null
              })
            })
          })
        }
      })
    } as any

    vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: Date.now() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Full Sync Flow', () => {
    it('should complete full sync flow with parallel execution', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [{ id: '1', name: 'Test Prompt', content: 'test content', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Test Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      // Mock cloud strategy as available and successful
      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.sync).mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        promptsCount: 1,
        categoriesCount: 1
      })

      // Mock local strategy as available and successful
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
      })

      await orchestrator.triggerSync(data)

      // Both strategies should be called (parallel sync)
      expect(CloudSyncStrategy.prototype.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).toHaveBeenCalledWith(data)

      // Storage should be updated with sync status
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          hasUnsyncedChanges: false,
          pendingCloudSync: false
        })
      }))
    })

    it('should sync both strategies even with empty data', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.sync).mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        promptsCount: 0,
        categoriesCount: 0
      })
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
      })

      await orchestrator.triggerSync(data)

      expect(CloudSyncStrategy.prototype.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
    })

    it('should sync temporary prompts correctly', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [
          { id: 't1', name: 'Temp Prompt', content: 'temp content', categoryId: 'temp', order: 0 }
        ],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.sync).mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        temporaryPromptsCount: 1
      })
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
      })

      await orchestrator.triggerSync(data)

      expect(CloudSyncStrategy.prototype.sync).toHaveBeenCalledWith(expect.objectContaining({
        temporaryPrompts: expect.arrayContaining([
          expect.objectContaining({ id: 't1' })
        ])
      }))
    })
  })

  describe('Offline Scenario', () => {
    it('should fallback to local-only sync when cloud unavailable', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [{ id: '1', name: 'Test', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Test Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      // Cloud unavailable
      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(false)
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({
        success: true,
        syncedAt: Date.now()
      })

      await orchestrator.triggerSync(data)

      // Cloud sync should NOT be called
      expect(CloudSyncStrategy.prototype.sync).not.toHaveBeenCalled()

      // Local sync should be called
      expect(executeLocalSync).toHaveBeenCalled()

      // Pending cloud sync should be marked
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingCloudSync: true,
          hasUnsyncedChanges: false
        })
      }))
    })

    it('should handle local unavailable gracefully', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(false)

      await orchestrator.triggerSync(data)

      // Cloud-only sync should still run when local backup is unavailable.
      expect(CloudSyncStrategy.prototype.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).not.toHaveBeenCalled()
    })

    it('should handle cloud sync failure with local success', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [{ id: '1', name: 'Test', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.sync).mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR'
      })
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({
        success: true,
        syncedAt: Date.now()
      })

      await orchestrator.triggerSync(data)

      // Both strategies called (parallel)
      expect(CloudSyncStrategy.prototype.sync).toHaveBeenCalled()
      expect(executeLocalSync).toHaveBeenCalled()

      // Pending state with error recorded
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingCloudSync: true,
          cloudError: 'NETWORK_ERROR',
          hasUnsyncedChanges: false
        })
      }))
    })
  })

  describe('Initial Sync Decision Matrix', () => {
    it('should restore from cloud when storage empty and cloud has data', async () => {
      const orchestrator = createSyncOrchestrator()

      const cloudData: FullBackupData = {
        prompts: [{ id: 'cloud-1', name: 'Cloud Prompt', content: 'cloud', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Cloud Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.restore).mockResolvedValue(cloudData)
      vi.mocked(LocalSyncStrategy.prototype.restore).mockResolvedValue(null)

      // Empty storage
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: { prompts: [], categories: [] },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      await orchestrator.initialSync()

      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([expect.objectContaining({ id: 'cloud-1' })])
          })
        })
      }))
    })

    it('should restore from local backup when storage empty and cloud unavailable', async () => {
      const orchestrator = createSyncOrchestrator()

      const localData: FullBackupData = {
        prompts: [{ id: 'local-1', name: 'Local Prompt', content: 'local', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Local Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(false)
      vi.mocked(CloudSyncStrategy.prototype.restore).mockResolvedValue(null)
      vi.mocked(LocalSyncStrategy.prototype.restore).mockResolvedValue(localData)

      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: { prompts: [], categories: [] },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      await orchestrator.initialSync()

      // Should restore from local backup (first call)
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([expect.objectContaining({ id: 'local-1' })])
          })
        })
      }))

      // Should mark initialized (pendingCloudSync is false when cloud unavailable)
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          initialized: true,
          pendingCloudSync: false  // Cloud unavailable, no pending sync needed
        })
      }))
    })

    it('should skip restore when storage already has data', async () => {
      const orchestrator = createSyncOrchestrator()

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.restore).mockResolvedValue(null)
      vi.mocked(LocalSyncStrategy.prototype.restore).mockResolvedValue(null)

      // Storage already has data
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: {
                prompts: [{ id: 'existing-1', name: 'Existing', content: 'test', categoryId: 'c1', order: 0 }],
                categories: [{ id: 'c1', name: 'Category', order: 0 }]
              },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      await orchestrator.initialSync()

      // Should only update sync status, not modify prompts
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          initialized: true
        })
      }))
    })

    it('should merge when cloud and storage both have data', async () => {
      const orchestrator = createSyncOrchestrator()

      const cloudData: FullBackupData = {
        prompts: [
          { id: 'shared', name: 'Cloud Version', content: 'cloud', categoryId: 'c1', order: 0 },
          { id: 'cloud-only', name: 'Cloud Only', content: 'cloud-only', categoryId: 'c1', order: 0 }
        ],
        categories: [{ id: 'c1', name: 'Cloud Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      // Local backup must also exist for merge to happen
      const localBackupData: FullBackupData = {
        prompts: [{ id: 'backup-1', name: 'Backup', content: 'backup', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Backup Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now() - 1000
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.restore).mockResolvedValue(cloudData)
      vi.mocked(LocalSyncStrategy.prototype.restore).mockResolvedValue(localBackupData)

      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: {
                prompts: [
                  { id: 'shared', name: 'Local Version', content: 'local', categoryId: 'c1', order: 0 },
                  { id: 'local-only', name: 'Local Only', content: 'local-only', categoryId: 'c1', order: 0 }
                ],
                categories: [{ id: 'c1', name: 'Local Category', order: 0 }]
              },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      await orchestrator.initialSync()

      // Cloud should win for shared ID, and local-only items preserved
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([
              expect.objectContaining({ id: 'shared', name: 'Cloud Version' }),
              expect.objectContaining({ id: 'cloud-only' }),
              expect.objectContaining({ id: 'local-only' })
            ])
          })
        })
      }))
    })

    it('should handle all three sources having data (cloud + local + storage)', async () => {
      const orchestrator = createSyncOrchestrator()

      const cloudData: FullBackupData = {
        prompts: [{ id: 'cloud-1', name: 'From Cloud', content: 'cloud', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Cloud Cat', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      const localBackupData: FullBackupData = {
        prompts: [{ id: 'local-1', name: 'From Local Backup', content: 'local', categoryId: 'c2', order: 0 }],
        categories: [{ id: 'c2', name: 'Local Backup Cat', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now() - 1000
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(CloudSyncStrategy.prototype.restore).mockResolvedValue(cloudData)
      vi.mocked(LocalSyncStrategy.prototype.restore).mockResolvedValue(localBackupData)

      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: {
                prompts: [{ id: 'storage-1', name: 'From Storage', content: 'storage', categoryId: 'c3', order: 0 }],
                categories: [{ id: 'c3', name: 'Storage Cat', order: 0 }]
              },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      await orchestrator.initialSync()

      // Should trigger merge - cloud wins, local-only preserved
      expect(chrome.storage.local.set).toHaveBeenCalled()
    })
  })

  describe('Error Recovery', () => {
    it('should recover from temporary network failure', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [{ id: '1', name: 'Test', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      // First call: network error
      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValueOnce(false)
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({
        success: true,
        syncedAt: Date.now()
      })

      await orchestrator.triggerSync(data)

      // Should have pending state
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({ pendingCloudSync: true })
      }))
    })

    it('should handle permission denied for local sync', async () => {
      const orchestrator = createSyncOrchestrator()
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(LocalSyncStrategy.prototype.isAvailable).mockResolvedValue(false)

      await orchestrator.triggerSync(data)

      expect(CloudSyncStrategy.prototype.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).not.toHaveBeenCalled()
    })
  })

  describe('Status Reporting', () => {
    it('should provide accurate unified status after sync', async () => {
      const orchestrator = createSyncOrchestrator()

      vi.mocked(CloudSyncStrategy.prototype.getStatus).mockResolvedValue({
        enabled: true,
        lastSyncTime: 1000
      })
      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(true)
      vi.mocked(LocalSyncStrategy.prototype.getStatus).mockResolvedValue({
        enabled: true,
        lastSyncTime: 2000
      })
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys?: string | string[]) => {
        if (keys === 'syncStatus') {
          return {
            syncStatus: {
              hasUnsyncedChanges: false,
              pendingCloudSync: false,
              pendingUpload: false,
              localOnlyItems: { promptIds: [], categoryIds: [], temporaryPromptIds: [] }
            }
          }
        }
        if (typeof keys === 'string' && keys.startsWith('sb-')) {
          return {
            [keys]: JSON.stringify({
              access_token: 'token',
              user: { id: 'user-1' },
              expires_at: Math.floor(Date.now() / 1000) + 3600
            })
          }
        }
        return {}
      })

      const status = await orchestrator.getStatus()

      expect(status.cloudEnabled).toBe(true)
      expect(status.cloudLoggedIn).toBe(true)
      expect(status.lastCloudSyncTime).toBe(1000)
      expect(status.localEnabled).toBe(true)
      expect(status.lastLocalSyncTime).toBe(2000)
      expect(status.hasUnsyncedChanges).toBe(false)
      expect(status.pendingCloudSync).toBe(false)
      expect(status.pendingUpload).toBe(false)
    })

    it('should report pending state correctly', async () => {
      const orchestrator = createSyncOrchestrator()

      vi.mocked(CloudSyncStrategy.prototype.getStatus).mockResolvedValue({
        enabled: false,
        error: 'NOT_LOGGED_IN'
      })
      vi.mocked(CloudSyncStrategy.prototype.isAvailable).mockResolvedValue(false)
      vi.mocked(LocalSyncStrategy.prototype.getStatus).mockResolvedValue({
        enabled: true,
        lastSyncTime: 3000
      })
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          hasUnsyncedChanges: true,
          pendingCloudSync: true,
          pendingUpload: false,
          localOnlyItems: { promptIds: ['local-1'], categoryIds: [], temporaryPromptIds: [] }
        }
      })

      const status = await orchestrator.getStatus()

      expect(status.cloudEnabled).toBe(false)
      expect(status.cloudLoggedIn).toBe(false)
      expect(status.cloudError).toBe('NOT_LOGGED_IN')
      expect(status.localEnabled).toBe(true)
      expect(status.hasUnsyncedChanges).toBe(true)
      expect(status.pendingCloudSync).toBe(true)
      expect(status.localOnlyItems.promptIds).toContain('local-1')
    })
  })
})
