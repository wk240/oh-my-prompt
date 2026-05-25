import { computeBackupDataHash } from '../hash'

describe('computeBackupDataHash image metadata', () => {
  const base = {
    prompts: [],
    categories: [],
    temporaryPrompts: [],
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp' as const,
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'pending_upload' as const,
        updatedAt: 1
      }
    },
    pendingImageDeletes: []
  }

  it('changes when durable image metadata changes', async () => {
    const first = await computeBackupDataHash(base)
    const second = await computeBackupDataHash({
      ...base,
      imageAssets: {
        'image-1': {
          ...base.imageAssets['image-1'],
          cloudUrl: 'https://blob/img.webp',
          cloudPath: 'users/u/images/image-1.webp',
          status: 'synced',
          updatedAt: 2
        }
      }
    })

    expect(second).not.toBe(first)
  })

  it('ignores lastError to avoid retry noise hash churn', async () => {
    const first = await computeBackupDataHash(base)
    const second = await computeBackupDataHash({
      ...base,
      imageAssets: {
        'image-1': {
          ...base.imageAssets['image-1'],
          lastError: 'network failed'
        }
      }
    })

    expect(second).toBe(first)
  })
})
