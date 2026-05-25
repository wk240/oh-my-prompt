import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../indexeddb', () => ({
  getFolderHandle: vi.fn(),
  checkFolderPermission: vi.fn(),
  requestFolderPermission: vi.fn(),
}))

import { getFolderHandle, checkFolderPermission } from '../indexeddb'
import { buildImagePath } from '../image-processing'
import { deleteImageByPath, readImage } from '../image-sync'

describe('image-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not read local images while folder permission is still restorable', async () => {
    const folderHandle = {
      getDirectoryHandle: vi.fn().mockRejectedValue(new DOMException('Permission required', 'NotAllowedError')),
    }

    vi.mocked(getFolderHandle).mockResolvedValue(folderHandle as unknown as FileSystemDirectoryHandle)
    vi.mocked(checkFolderPermission).mockResolvedValue('prompt')

    const result = await readImage('images/example.png')

    expect(result).toEqual({ success: false, error: 'PERMISSION_PROMPT' })
    expect(folderHandle.getDirectoryHandle).not.toHaveBeenCalled()
  })

  it('deletes exact image asset path without deriving extensions from prompt id', async () => {
    const imagesDir = {
      removeEntry: vi.fn().mockResolvedValue(undefined),
    }
    const folderHandle = {
      getDirectoryHandle: vi.fn().mockResolvedValue(imagesDir),
    }

    vi.mocked(getFolderHandle).mockResolvedValue(folderHandle as unknown as FileSystemDirectoryHandle)

    const result = await deleteImageByPath(buildImagePath('11111111-1111-4111-8111-111111111111'))

    expect(result.success).toBe(true)
    expect(folderHandle.getDirectoryHandle).toHaveBeenCalledWith('images')
    expect(imagesDir.removeEntry).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111.webp')
  })

  it('rejects malformed exact image asset paths before touching storage', async () => {
    const result = await deleteImageByPath('foo/11111111-1111-4111-8111-111111111111.webp')

    expect(result).toEqual({ success: false, error: 'INVALID_PATH' })
    expect(getFolderHandle).not.toHaveBeenCalled()
  })
})
