import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import type { StorageSchema } from '@oh-my-prompt/shared/types'

const mocks = vi.hoisted(() => {
  const storageManager = {
    getData: vi.fn(),
    saveData: vi.fn(),
    updateSettings: vi.fn()
  }
  const oldTriggerSync = vi.fn()
  const orchestratorTriggerSync = vi.fn()
  const orchestrator = {
    initialSync: vi.fn(),
    triggerSync: orchestratorTriggerSync,
    getStatus: vi.fn(),
    uploadLocalOnlyItems: vi.fn(),
    downloadAndMerge: vi.fn(),
    previewMerge: vi.fn()
  }

  return {
    storageManager,
    oldTriggerSync,
    orchestratorTriggerSync,
    orchestrator,
    createSyncOrchestrator: vi.fn(() => orchestrator)
  }
})

vi.mock('../../lib/storage', () => ({
  StorageManager: {
    getInstance: vi.fn(() => mocks.storageManager)
  },
  storageManager: mocks.storageManager
}))

vi.mock('../../lib/sync/sync-manager', () => ({
  getSyncStatus: vi.fn(),
  triggerSync: mocks.oldTriggerSync,
  restorePermission: vi.fn(),
  initialSync: vi.fn(() => Promise.resolve()),
  triggerProviderConfigsSync: vi.fn()
}))

vi.mock('../../lib/sync', () => ({
  createSyncOrchestrator: mocks.createSyncOrchestrator
}))

vi.mock('../../lib/sync/indexeddb', () => ({
  saveFolderHandle: vi.fn(),
  getFolderHandle: vi.fn(() => Promise.resolve(null)),
  checkFolderPermission: vi.fn()
}))

vi.mock('../../lib/sync/api-config-sync', () => ({
  syncApiConfigToFolder: vi.fn()
}))

vi.mock('../../lib/version-checker', () => ({
  checkForUpdate: vi.fn(),
  getUpdateStatus: vi.fn(),
  clearUpdateStatus: vi.fn()
}))

vi.mock('../../lib/vision-api', () => ({
  executeVisionApiCallWithProviderConfig: vi.fn(),
  classifyApiError: vi.fn(),
  getLanguagePreference: vi.fn()
}))

vi.mock('../../lib/image-utils', () => ({
  asyncCompressImageFromUrl: vi.fn()
}))

vi.mock('../../lib/config-validator', () => ({
  validateProviderConfig: vi.fn(),
  maskApiKey: vi.fn()
}))

vi.mock('../../lib/offscreen-manager', () => ({
  sendToOffscreen: vi.fn()
}))

vi.mock('../../lib/migrations/register', () => ({}))

vi.mock('../../lib/cloud-sync/supabase-client', () => ({
  clearSupabaseClient: vi.fn()
}))

vi.mock('../agent-handler', () => ({
  handleAgentGenerate: vi.fn(),
  handleEcommerceAiWrite: vi.fn()
}))

type RuntimeMessageListener = (
  message: { type: MessageType; payload?: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void

describe('service worker message handling', () => {
  let runtimeMessageListener: RuntimeMessageListener
  const existingData: StorageSchema = {
    version: '1.0.0',
    userData: {
      prompts: [],
      categories: []
    },
    settings: {
      showBuiltin: true,
      syncEnabled: true,
      visionEnabled: true,
      visionDefaultFormat: 'natural'
    },
    temporaryPrompts: [],
    _migrationComplete: true
  }
  const payload: StorageSchema = {
    ...existingData,
    userData: {
      prompts: [{ id: 'prompt-1', name: 'Prompt', content: 'Content', categoryId: 'cat-1', order: 0 }],
      categories: [{ id: 'cat-1', name: 'Category', order: 0 }]
    }
  }

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()

    runtimeMessageListener = undefined as unknown as RuntimeMessageListener

    global.chrome = {
      contextMenus: {
        create: vi.fn((_options, callback) => callback?.()),
        onClicked: {
          addListener: vi.fn()
        }
      },
      runtime: {
        lastError: undefined,
        getManifest: vi.fn(() => ({ version: '1.0.0' })),
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
        onMessage: {
          addListener: vi.fn((listener: RuntimeMessageListener) => {
            runtimeMessageListener = listener
          })
        },
        onStartup: {
          addListener: vi.fn()
        },
        onInstalled: {
          addListener: vi.fn()
        },
        sendMessage: vi.fn(() => Promise.resolve())
      },
      sidePanel: {
        setPanelBehavior: vi.fn(() => Promise.resolve())
      },
      storage: {
        local: {
          get: vi.fn(() => Promise.resolve({})),
          set: vi.fn(() => Promise.resolve()),
          remove: vi.fn(() => Promise.resolve())
        },
        session: {
          set: vi.fn(() => Promise.resolve())
        }
      },
      tabs: {
        query: vi.fn((_queryInfo, callback) => callback([])),
        sendMessage: vi.fn(() => Promise.resolve()),
        create: vi.fn(),
        remove: vi.fn()
      },
      downloads: {
        download: vi.fn()
      },
      notifications: {
        create: vi.fn()
      }
    } as unknown as typeof chrome

    await import('../service-worker')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function dispatchRuntimeMessage(
    message: { type: MessageType; payload?: unknown },
    sendResponse = vi.fn()
  ): ReturnType<RuntimeMessageListener> {
    return runtimeMessageListener(message, {} as chrome.runtime.MessageSender, sendResponse)
  }

  async function dispatchSetStorageWithSyncResult(syncResult: {
    cloudSynced: boolean
    localSynced: boolean
    cloudError?: string
    localError?: string
    skipped?: boolean
  }) {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ [STORAGE_KEY]: existingData })
    mocks.storageManager.getData.mockImplementation(async () => {
      await mocks.storageManager.saveData(existingData)
      return existingData
    })
    mocks.storageManager.saveData.mockImplementation(async (data: StorageSchema) => {
      await mocks.orchestratorTriggerSync({
        prompts: data.userData.prompts,
        categories: data.userData.categories,
        temporaryPrompts: data.temporaryPrompts || [],
        timestamp: Date.now()
      })
    })
    mocks.oldTriggerSync.mockResolvedValue({ success: true })
    mocks.orchestratorTriggerSync.mockResolvedValue(syncResult)
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({ type: MessageType.SET_STORAGE, payload }, sendResponse)
    await vi.advanceTimersByTimeAsync(500)

    return sendResponse
  }

  it('routes debounced SET_STORAGE auto-sync through the orchestrator only', async () => {
    const sendResponse = await dispatchSetStorageWithSyncResult({
      cloudSynced: true,
      localSynced: false
    })

    expect(mocks.oldTriggerSync).not.toHaveBeenCalled()
    expect(mocks.storageManager.getData).not.toHaveBeenCalled()
    expect(mocks.storageManager.saveData).not.toHaveBeenCalled()
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: payload })
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        syncSuccess: true,
        syncError: undefined
      }
    })
  })

  it('treats local-only orchestrator sync as successful SET_STORAGE auto-sync', async () => {
    const sendResponse = await dispatchSetStorageWithSyncResult({
      cloudSynced: false,
      localSynced: true
    })

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        syncSuccess: true,
        syncError: undefined
      }
    })
  })

  it('treats skipped orchestrator sync as successful SET_STORAGE auto-sync', async () => {
    const sendResponse = await dispatchSetStorageWithSyncResult({
      cloudSynced: false,
      localSynced: false,
      skipped: true
    })

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        syncSuccess: true,
        syncError: undefined
      }
    })
  })

  it('propagates cloud/local orchestrator errors from failed SET_STORAGE auto-sync', async () => {
    const sendResponse = await dispatchSetStorageWithSyncResult({
      cloudSynced: false,
      localSynced: false,
      cloudError: 'NETWORK_ERROR',
      localError: 'PERMISSION_DENIED'
    })

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        syncSuccess: false,
        syncError: {
          type: 'unknown',
          message: 'NETWORK_ERROR'
        }
      }
    })
  })

  it('propagates local orchestrator error when cloud error is absent', async () => {
    const sendResponse = await dispatchSetStorageWithSyncResult({
      cloudSynced: false,
      localSynced: false,
      localError: 'PERMISSION_DENIED'
    })

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        syncSuccess: false,
        syncError: {
          type: 'unknown',
          message: 'PERMISSION_DENIED'
        }
      }
    })
  })
})
