import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../indexeddb', () => ({
  getFolderHandle: vi.fn(),
  checkFolderPermission: vi.fn(),
  requestFolderPermission: vi.fn(),
}))

import { getFolderHandle, checkFolderPermission } from '../indexeddb'
import { readImage } from '../image-sync'

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
})
