import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LocalSyncStrategy } from '../strategies/local'
import { FullBackupData } from '../types'

// Mock indexeddb module functions
vi.mock('../indexeddb', () => ({
  getFolderHandle: vi.fn(),
  saveFolderHandle: vi.fn(),
  removeFolderHandle: vi.fn(),
  checkFolderPermission: vi.fn(),
}))

import { getFolderHandle, saveFolderHandle, removeFolderHandle, checkFolderPermission } from '../indexeddb'

// Mock indexedDB operations
const mockIndexedDB = {
  open: vi.fn(),
}

// Mock FileSystemDirectoryHandle
const createMockDirHandle = () => ({
  getFileHandle: vi.fn(),
  removeEntry: vi.fn(),
  keys: vi.fn().mockImplementation(async function* () {
    yield 'omps-backup-20260510-120000.json'
  }),
  queryPermission: vi.fn().mockResolvedValue('granted'),
  requestPermission: vi.fn().mockResolvedValue('granted'),
})

// Mock FileSystemFileHandle
const createMockFileHandle = (content: string) => ({
  getFile: vi.fn().mockResolvedValue({
    text: vi.fn().mockResolvedValue(content),
  }),
  createWritable: vi.fn().mockResolvedValue({
    write: vi.fn(),
    close: vi.fn(),
  }),
})

describe('LocalSyncStrategy', () => {
  let strategy: LocalSyncStrategy

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock global indexedDB
    global.indexedDB = mockIndexedDB as unknown as IDBFactory

    // Mock window.showDirectoryPicker for node environment
    ;(global as any).window = {
      showDirectoryPicker: vi.fn(),
    }

    strategy = new LocalSyncStrategy()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('basic properties', () => {
    it('should have correct id and name', () => {
      expect(strategy.id).toBe('local')
      expect(strategy.name).toBe('Local Backup')
    })
  })

  describe('isAvailable', () => {
    it('should return false when no folder handle', async () => {
      vi.mocked(getFolderHandle).mockResolvedValue(null)

      const available = await strategy.isAvailable()
      expect(available).toBe(false)
    })

    it('should return false when folder handle has no permission', async () => {
      const mockDirHandle = createMockDirHandle()
      mockDirHandle.queryPermission.mockResolvedValue('denied')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)
      vi.mocked(checkFolderPermission).mockResolvedValue('denied')

      const available = await strategy.isAvailable()
      expect(available).toBe(false)
    })

    it('should return true when folder handle has permission', async () => {
      const mockDirHandle = createMockDirHandle()
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)
      vi.mocked(checkFolderPermission).mockResolvedValue('granted')

      const available = await strategy.isAvailable()
      expect(available).toBe(true)
    })
  })

  describe('sync', () => {
    it('should return error when no folder handle', async () => {
      vi.mocked(getFolderHandle).mockResolvedValue(null)

      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now(),
      }

      const result = await strategy.sync(data)
      expect(result.success).toBe(false)
      expect(result.error).toBe('PERMISSION_DENIED')
    })

    it('should sync data to file successfully', async () => {
      const mockDirHandle = createMockDirHandle()
      const mockFileHandle = createMockFileHandle('{}')

      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle)
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)

      const data: FullBackupData = {
        prompts: [{ id: 'p1', name: 'Test Prompt', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Test Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now(),
      }

      const result = await strategy.sync(data)

      expect(result.success).toBe(true)
      expect(result.syncedAt).toBeDefined()
      expect(result.promptsCount).toBe(1)
      expect(result.categoriesCount).toBe(1)
      expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith('omps-latest.json', { create: true })
      expect(mockFileHandle.createWritable).toHaveBeenCalled()
    })

    it('should handle sync errors gracefully', async () => {
      const mockDirHandle = createMockDirHandle()
      mockDirHandle.getFileHandle.mockRejectedValue(new Error('Write failed'))
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)

      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now(),
      }

      const result = await strategy.sync(data)
      expect(result.success).toBe(false)
      expect(result.error).toBe('SYNC_FAILED')
    })
  })

  describe('restore', () => {
    it('should return null when no folder handle', async () => {
      vi.mocked(getFolderHandle).mockResolvedValue(null)

      const result = await strategy.restore()
      expect(result).toBeNull()
    })

    it('should restore data from backup file', async () => {
      const mockDirHandle = createMockDirHandle()
      const backupContent = JSON.stringify({
        version: '1.0.0',
        userData: {
          prompts: [{ id: 'p1', name: 'Restored', content: 'test', categoryId: 'c1', order: 0 }],
          categories: [{ id: 'c1', name: 'Category', sortOrder: 0 }],
        },
        temporaryPrompts: [],
        backupTime: '2026-05-10T12:00:00Z',
        contentHash: 'abc123',
      })

      const mockFileHandle = createMockFileHandle(backupContent)
      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle)
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)

      const result = await strategy.restore()

      expect(result).not.toBeNull()
      expect(result?.prompts).toHaveLength(1)
      expect(result?.prompts[0].name).toBe('Restored')
      expect(result?.categories).toHaveLength(1)
      expect(result?.temporaryPrompts).toHaveLength(0)
    })

    it('should handle invalid backup format', async () => {
      const mockDirHandle = createMockDirHandle()
      const mockFileHandle = createMockFileHandle('invalid json')

      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle)
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)

      const result = await strategy.restore()
      expect(result).toBeNull()
    })

    it('should handle legacy backup format', async () => {
      const mockDirHandle = createMockDirHandle()
      const backupContent = JSON.stringify({
        prompts: [{ id: 'p1', name: 'Legacy', content: 'test', categoryId: 'c1' }],
        categories: [{ id: 'c1', name: 'Legacy Category' }],
      })

      const mockFileHandle = createMockFileHandle(backupContent)
      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle)
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)

      const result = await strategy.restore()

      expect(result).not.toBeNull()
      expect(result?.prompts).toHaveLength(1)
      expect(result?.temporaryPrompts).toHaveLength(0)
    })
  })

  describe('getStatus', () => {
    it('should return disabled status when no folder handle', async () => {
      vi.mocked(getFolderHandle).mockResolvedValue(null)

      const status = await strategy.getStatus()
      expect(status.enabled).toBe(false)
    })

    it('should return enabled status with folder handle', async () => {
      const mockDirHandle = createMockDirHandle()
      mockDirHandle.queryPermission.mockResolvedValue('granted')

      // Mock successful restore to get last sync time
      const backupContent = JSON.stringify({
        userData: { prompts: [], categories: [] },
        temporaryPrompts: [],
        backupTime: '2026-05-10T12:00:00Z',
      })
      const mockFileHandle = createMockFileHandle(backupContent)
      mockDirHandle.getFileHandle.mockResolvedValue(mockFileHandle)

      vi.mocked(getFolderHandle).mockResolvedValue(mockDirHandle as any)

      const status = await strategy.getStatus()
      expect(status.enabled).toBe(true)
    })
  })

  describe('selectFolder', () => {
    it('should return handle when user selects folder', async () => {
      const mockDirHandle = createMockDirHandle()
      ;(global as any).window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirHandle)
      vi.mocked(saveFolderHandle).mockResolvedValue(undefined)

      const handle = await strategy.selectFolder()

      expect(handle).toBe(mockDirHandle)
      expect(saveFolderHandle).toHaveBeenCalledWith(mockDirHandle)
    })

    it('should return null when user cancels', async () => {
      ;(global as any).window.showDirectoryPicker = vi.fn().mockRejectedValue(new Error('User cancelled'))

      const handle = await strategy.selectFolder()
      expect(handle).toBeNull()
    })
  })

  describe('disconnect', () => {
    it('should remove folder handle', async () => {
      vi.mocked(removeFolderHandle).mockResolvedValue(undefined)

      await strategy.disconnect()
      expect(removeFolderHandle).toHaveBeenCalled()
    })
  })
})