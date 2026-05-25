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

vi.mock('../../storage', () => ({
  StorageManager: {
    getInstance: () => ({
      getData,
      updateSettings
    })
  }
}))

vi.mock('../offscreen-manager', () => ({
  ensureOffscreenDocument: vi.fn(),
  sendToOffscreen: vi.fn()
}))

vi.mock('../api-config-sync', () => ({
  readApiConfigFromFolder: vi.fn()
}))

import { enableSync, changeSyncFolder } from '../sync-manager'
import { readFromLocalFolder, selectSyncFolder, syncToLocalFolder } from '../file-sync'
import { getFolderHandle, saveFolderHandle } from '../indexeddb'

const backupData: FullBackupData = {
  prompts: [{ id: 'p1', name: 'Saved', content: 'backup', categoryId: 'c1', order: 0 }],
  categories: [{ id: 'c1', name: 'Category', order: 0 }],
  temporaryPrompts: []
}

const currentData = {
  userData: {
    prompts: [],
    categories: []
  },
  temporaryPrompts: []
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
    updateSettings.mockResolvedValue(undefined)
    vi.mocked(getFolderHandle).mockResolvedValue(null)
    vi.mocked(saveFolderHandle).mockResolvedValue(undefined)
    vi.mocked(selectSyncFolder).mockResolvedValue(createFolderHandle())
    vi.mocked(readFromLocalFolder).mockResolvedValue(null)
    vi.mocked(syncToLocalFolder).mockResolvedValue({ createdNewBackup: true })
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
})
