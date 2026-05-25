import { describe, expect, it, vi } from 'vitest'
import { readBackupFile } from '../file-sync'

function createDirectoryHandle(content: string): FileSystemDirectoryHandle {
  return {
    getFileHandle: vi.fn().mockResolvedValue({
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(content)
      })
    })
  } as unknown as FileSystemDirectoryHandle
}

describe('file-sync backup readers', () => {
  it('marks missing image metadata fields on legacy backup files', async () => {
    const handle = createDirectoryHandle(JSON.stringify({
      userData: {
        prompts: [],
        categories: []
      },
      temporaryPrompts: []
    }))

    const result = await readBackupFile(handle, 'omps-legacy.json')

    expect(result?.imageAssets).toEqual({})
    expect(result?.pendingImageDeletes).toEqual([])
    expect(result?.imageMetadataFields).toEqual({
      imageAssets: false,
      pendingImageDeletes: false
    })
  })

  it('marks explicitly empty image metadata fields as present', async () => {
    const handle = createDirectoryHandle(JSON.stringify({
      userData: {
        prompts: [],
        categories: []
      },
      temporaryPrompts: [],
      imageAssets: {},
      pendingImageDeletes: []
    }))

    const result = await readBackupFile(handle, 'omps-empty-images.json')

    expect(result?.imageMetadataFields).toEqual({
      imageAssets: true,
      pendingImageDeletes: true
    })
  })
})
