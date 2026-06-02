import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import type { StorageSchema } from '@oh-my-prompt/shared/types'

const mocks = vi.hoisted(() => {
  const storageManager = {
    getData: vi.fn(),
    getDefaultData: vi.fn(),
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

vi.mock('../../lib/sync/image-asset-service', () => ({
  enqueueImageRestore: vi.fn(),
  getImageRestoreStatus: vi.fn(async () => ({ folderRequired: false, pendingCount: 0 })),
  restoreMissingCloudImages: vi.fn(async () => true)
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
  const imageMetadata = {
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudUrl: 'https://cdn.example.com/image-1.webp',
        cloudPath: 'users/user-1/images/image-1.webp',
        sourceUrl: 'https://example.com/source.png',
        mimeType: 'image/webp',
        width: 640,
        height: 480,
        size: 12345,
        hash: 'hash-1',
        status: 'synced' as const,
        updatedAt: 1710000000000
      }
    },
    pendingImageDeletes: [{
      imageId: 'image-2',
      cloudPath: 'users/user-1/images/image-2.webp',
      attempts: 1,
      updatedAt: 1710000001000
    }]
  }

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()

    runtimeMessageListener = undefined as unknown as RuntimeMessageListener
    mocks.storageManager.getDefaultData.mockReturnValue(existingData)

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

  function dispatchRuntimeMessageFromTab(
    message: { type: string; payload?: unknown },
    tabId: number,
    sendResponse = vi.fn()
  ): ReturnType<RuntimeMessageListener> {
    return runtimeMessageListener(
      message as { type: MessageType; payload?: unknown },
      { tab: { id: tabId } } as chrome.runtime.MessageSender,
      sendResponse
    )
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

  it('preserves image metadata when SET_STORAGE saves and auto-syncs', async () => {
    const imagePayload: StorageSchema = {
      ...payload,
      ...imageMetadata
    }
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ [STORAGE_KEY]: existingData })
    mocks.orchestratorTriggerSync.mockResolvedValue({
      cloudSynced: true,
      localSynced: false
    })
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({ type: MessageType.SET_STORAGE, payload: imagePayload }, sendResponse)
    await vi.advanceTimersByTimeAsync(500)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: imagePayload })
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledWith(expect.objectContaining({
      imageAssets: imagePayload.imageAssets,
      pendingImageDeletes: imagePayload.pendingImageDeletes
    }))
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        syncSuccess: true,
        syncError: undefined
      }
    })
  })

  it('includes image metadata when TRIGGER_SYNC builds the backup payload', async () => {
    const data: StorageSchema = {
      ...payload,
      ...imageMetadata
    }
    mocks.storageManager.getData.mockResolvedValue(data)
    mocks.storageManager.updateSettings.mockResolvedValue(undefined)
    mocks.orchestratorTriggerSync.mockResolvedValue({
      cloudSynced: true,
      localSynced: false
    })
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({ type: MessageType.TRIGGER_SYNC }, sendResponse)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        error: undefined
      })
    })
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledWith(expect.objectContaining({
      prompts: data.userData.prompts,
      categories: data.userData.categories,
      temporaryPrompts: data.temporaryPrompts,
      imageAssets: imageMetadata.imageAssets,
      pendingImageDeletes: imageMetadata.pendingImageDeletes
    }))
  })

  it('handles ENQUEUE_IMAGE_RESTORE from content callers', async () => {
    const { enqueueImageRestore } = await import('../../lib/sync/image-asset-service')
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({
      type: MessageType.ENQUEUE_IMAGE_RESTORE,
      payload: { imageId: 'image-1', priority: 'visible' }
    }, sendResponse)

    expect(enqueueImageRestore).toHaveBeenCalledWith('image-1', { priority: 'visible' })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('handles GET_IMAGE_RESTORE_STATUS', async () => {
    const { getImageRestoreStatus } = await import('../../lib/sync/image-asset-service')
    vi.mocked(getImageRestoreStatus).mockResolvedValueOnce({ folderRequired: true, pendingCount: 2 })
    const sendResponse = vi.fn()

    const handled = dispatchRuntimeMessage({ type: MessageType.GET_IMAGE_RESTORE_STATUS }, sendResponse)

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { folderRequired: true, pendingCount: 2 }
      })
    })
  })

  it('handles RESTORE_MISSING_CLOUD_IMAGES', async () => {
    const { restoreMissingCloudImages } = await import('../../lib/sync/image-asset-service')
    vi.mocked(restoreMissingCloudImages).mockResolvedValueOnce(true)
    const sendResponse = vi.fn()

    const handled = dispatchRuntimeMessage({ type: MessageType.RESTORE_MISSING_CLOUD_IMAGES }, sendResponse)

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(restoreMissingCloudImages).toHaveBeenCalledWith({ priority: 'background' })
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { enqueued: true }
      })
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

  it('reports cloud failure from SET_STORAGE even when local backup succeeds', async () => {
    const sendResponse = await dispatchSetStorageWithSyncResult({
      cloudSynced: false,
      localSynced: true,
      cloudError: 'NETWORK_ERROR'
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

  it('updates settings without triggering an extra backup sync', async () => {
    mocks.storageManager.updateSettings.mockResolvedValue(undefined)
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({
      type: MessageType.SET_SETTINGS_ONLY,
      payload: { settings: { syncEnabled: true, hasUnsyncedChanges: false } }
    }, sendResponse)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    expect(mocks.storageManager.updateSettings).toHaveBeenCalledWith(
      { syncEnabled: true, hasUnsyncedChanges: false },
      { triggerSync: false }
    )
    expect(mocks.orchestratorTriggerSync).not.toHaveBeenCalled()
  })

  it('routes temporary prompt transfer through debounced orchestrator sync only', async () => {
    const data: StorageSchema = {
      ...existingData,
      userData: {
        prompts: [],
        categories: [{ id: 'cat-1', name: 'Category', order: 0 }]
      },
      temporaryPrompts: [
        { id: 'temp-1', name: 'Temp', content: 'Draft', categoryId: 'temporary', order: 0 }
      ]
    }
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ [STORAGE_KEY]: data })
    mocks.orchestratorTriggerSync.mockResolvedValue({ cloudSynced: true, localSynced: true })
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({
      type: MessageType.TRANSFER_TEMPORARY_PROMPT,
      payload: { promptId: 'temp-1', targetCategoryId: 'cat-1' }
    }, sendResponse)
    await vi.advanceTimersByTimeAsync(500)

    expect(mocks.storageManager.getData).not.toHaveBeenCalled()
    expect(mocks.storageManager.saveData).not.toHaveBeenCalled()
    expect(mocks.oldTriggerSync).not.toHaveBeenCalled()
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledTimes(1)
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledWith(expect.objectContaining({
      prompts: [expect.objectContaining({ id: 'temp-1', categoryId: 'cat-1' })],
      categories: data.userData.categories,
      temporaryPrompts: []
    }))
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('preserves existing image metadata when direct-write callers omit it', async () => {
    const data: StorageSchema = {
      ...existingData,
      temporaryPrompts: [
        { id: 'temp-1', name: 'Temp 1', content: 'Draft 1', categoryId: 'temporary', order: 0 }
      ],
      ...imageMetadata
    }
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ [STORAGE_KEY]: data })
    mocks.orchestratorTriggerSync.mockResolvedValue({ cloudSynced: true, localSynced: true })
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({ type: MessageType.CLEAR_TEMPORARY_PROMPTS }, sendResponse)
    await vi.advanceTimersByTimeAsync(500)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEY]: {
        version: '1.0.0',
        userData: data.userData,
        settings: data.settings,
        temporaryPrompts: [],
        imageAssets: imageMetadata.imageAssets,
        pendingImageDeletes: imageMetadata.pendingImageDeletes
      }
    })
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledWith(expect.objectContaining({
      imageAssets: imageMetadata.imageAssets,
      pendingImageDeletes: imageMetadata.pendingImageDeletes
    }))
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('deletes one temporary prompt through debounced orchestrator sync only', async () => {
    const data: StorageSchema = {
      ...existingData,
      temporaryPrompts: [
        { id: 'temp-1', name: 'Temp 1', content: 'Draft 1', categoryId: 'temporary', order: 0 },
        { id: 'temp-2', name: 'Temp 2', content: 'Draft 2', categoryId: 'temporary', order: 1 }
      ]
    }
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ [STORAGE_KEY]: data })
    mocks.orchestratorTriggerSync.mockResolvedValue({ cloudSynced: true, localSynced: true })
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({
      type: MessageType.DELETE_TEMPORARY_PROMPT,
      payload: { promptId: 'temp-1' }
    }, sendResponse)
    await vi.advanceTimersByTimeAsync(500)

    expect(mocks.storageManager.getData).not.toHaveBeenCalled()
    expect(mocks.storageManager.saveData).not.toHaveBeenCalled()
    expect(mocks.oldTriggerSync).not.toHaveBeenCalled()
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEY]: {
        ...data,
        temporaryPrompts: [
          { id: 'temp-2', name: 'Temp 2', content: 'Draft 2', categoryId: 'temporary', order: 1 }
        ]
      }
    })
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledTimes(1)
    expect(mocks.orchestratorTriggerSync).toHaveBeenCalledWith(expect.objectContaining({
      prompts: [],
      categories: [],
      temporaryPrompts: [
        { id: 'temp-2', name: 'Temp 2', content: 'Draft 2', categoryId: 'temporary', order: 1 }
      ]
    }))
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('closes the auth callback tab that requested closure', () => {
    const sendResponse = vi.fn()

    dispatchRuntimeMessageFromTab({ type: 'CLOSE_AUTH_TAB' }, 42, sendResponse)

    expect(chrome.tabs.remove).toHaveBeenCalledWith(42)
    expect(chrome.tabs.query).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })
})
