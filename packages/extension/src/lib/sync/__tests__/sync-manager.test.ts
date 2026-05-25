import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FullBackupData } from '../file-sync'

vi.mock('../indexeddb', () => ({
  getFolderHandle: vi.fn(),
  saveFolderHandle: vi.fn(),
  checkFolderPermission: vi.fn()
}))

vi.mock('../file-sync', () => ({
  readFromLocalFolder: vi.fn(),
  selectSyncFolder: vi.fn(),
  syncToLocalFolder: vi.fn()
}))

const updateSettings = vi.fn()
const getData = vi.fn()
const saveData = vi.fn()
const updateUserData = vi.fn()
const updateTemporaryPrompts = vi.fn()

vi.mock('../../storage', () => ({
  StorageManager: {
    getInstance: () => ({
      getData,
      saveData,
      updateSettings,
      updateUserData,
      updateTemporaryPrompts
    })
  }
}))

vi.mock('../../offscreen-manager', () => ({
  ensureOffscreenDocument: vi.fn(),
  sendToOffscreen: vi.fn()
}))

vi.mock('../api-config-sync', () => ({
  readApiConfigFromFolder: vi.fn()
}))

import { enableSync, changeSyncFolder, manualSync, restoreFromBackup } from '../sync-manager'
import { readFromLocalFolder, selectSyncFolder, syncToLocalFolder } from '../file-sync'
import { getFolderHandle, saveFolderHandle } from '../indexeddb'
import { sendToOffscreen } from '../../offscreen-manager'

const backupData: FullBackupData = {
  prompts: [{ id: 'p1', name: 'Saved', content: 'backup', categoryId: 'c1', order: 0 }],
  categories: [{ id: 'c1', name: 'Category', order: 0 }],
  temporaryPrompts: []
}

const currentData = {
  version: '2.0.0',
  userData: {
    prompts: [{ id: 'p-current', name: 'Current', content: 'current', categoryId: 'c-current', order: 0 }],
    categories: [{ id: 'c-current', name: 'Current Category', order: 0 }]
  },
  settings: {
    showBuiltin: true,
    syncEnabled: true
  },
  temporaryPrompts: [],
  imageAssets: {
    'image-current': {
      id: 'image-current',
      promptId: 'p-current',
      localPath: 'images/image-current.webp',
      mimeType: 'image/webp' as const,
      width: 100,
      height: 80,
      size: 1000,
      hash: 'hash-current',
      status: 'pending_upload' as const,
      updatedAt: 1700000000000
    }
  },
  pendingImageDeletes: [{
    imageId: 'image-delete-current',
    cloudPath: 'users/u/images/image-delete-current.webp',
    attempts: 1,
    updatedAt: 1700000000001
  }],
  _migrationComplete: true
}

function createFolderHandle() {
  return {
    name: 'Prompt Backups',
    getDirectoryHandle: vi.fn().mockResolvedValue({})
  } as unknown as FileSystemDirectoryHandle
}

describe('sync-manager folder selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    global.chrome = {
      runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '2.0.0' })
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    getData.mockResolvedValue(currentData)
    saveData.mockResolvedValue(undefined)
    updateSettings.mockResolvedValue(undefined)
    updateUserData.mockResolvedValue(undefined)
    updateTemporaryPrompts.mockResolvedValue(undefined)
    vi.mocked(getFolderHandle).mockResolvedValue(null)
    vi.mocked(saveFolderHandle).mockResolvedValue(undefined)
    vi.mocked(selectSyncFolder).mockResolvedValue(createFolderHandle())
    vi.mocked(readFromLocalFolder).mockResolvedValue(null)
    vi.mocked(syncToLocalFolder).mockResolvedValue({ createdNewBackup: true })
    vi.mocked(sendToOffscreen).mockResolvedValue({ success: true })
  })

  it('does not enable auto-sync before the user decides when enabling a folder with existing backup data', async () => {
    vi.mocked(readFromLocalFolder).mockResolvedValue(backupData)

    const result = await enableSync()

    expect(result.existingBackup?.hasBackup).toBe(true)
    expect(updateSettings).not.toHaveBeenCalled()
    expect(syncToLocalFolder).not.toHaveBeenCalled()
  })

  it('does not enable auto-sync before the user decides when changing to a folder with existing backup data', async () => {
    vi.mocked(readFromLocalFolder).mockResolvedValue(backupData)

    const result = await changeSyncFolder()

    expect(result.existingBackup?.hasBackup).toBe(true)
    expect(updateSettings).not.toHaveBeenCalled()
    expect(syncToLocalFolder).not.toHaveBeenCalled()
  })

  it('includes image metadata when manually syncing current storage data', async () => {
    vi.mocked(sendToOffscreen).mockImplementation(async (type: string) => {
      if (type === 'OFFSCREEN_CHECK_PERMISSION') {
        return { success: true, data: { hasFolder: true, permission: 'granted' } }
      }
      return { success: true }
    })

    const result = await manualSync()

    expect(result.success).toBe(true)
    expect(sendToOffscreen).toHaveBeenCalledWith('OFFSCREEN_SYNC', {
      backupData: expect.objectContaining({
        imageAssets: currentData.imageAssets,
        pendingImageDeletes: currentData.pendingImageDeletes
      }),
      version: '2.0.0'
    })
  })

  it('writes image metadata when replacing storage from a backup', async () => {
    const restoredData: FullBackupData = {
      prompts: [{ id: 'p-restored', name: 'Restored', content: 'restored', categoryId: 'c-restored', order: 0 }],
      categories: [{ id: 'c-restored', name: 'Restored Category', order: 0 }],
      temporaryPrompts: [],
      imageAssets: {
        'image-restored': {
          id: 'image-restored',
          promptId: 'p-restored',
          localPath: 'images/image-restored.webp',
          mimeType: 'image/webp',
          width: 120,
          height: 90,
          size: 1200,
          hash: 'hash-restored',
          status: 'synced',
          updatedAt: 1700000000100
        }
      },
      pendingImageDeletes: [{
        imageId: 'image-delete-restored',
        cloudPath: 'users/u/images/image-delete-restored.webp',
        attempts: 2,
        updatedAt: 1700000000101
      }]
    }
    vi.mocked(sendToOffscreen).mockImplementation(async (type: string) => {
      if (type === 'OFFSCREEN_READ_BACKUP') {
        return { success: true, data: restoredData }
      }
      return { success: true }
    })

    const result = await restoreFromBackup('omps-latest.json', false, 'replace')

    expect(result.success).toBe(true)
    expect(saveData).toHaveBeenCalledWith(
      expect.objectContaining({
        userData: {
          prompts: restoredData.prompts,
          categories: restoredData.categories
        },
        temporaryPrompts: restoredData.temporaryPrompts,
        imageAssets: restoredData.imageAssets,
        pendingImageDeletes: restoredData.pendingImageDeletes
      }),
      { triggerSync: false }
    )
  })
})
