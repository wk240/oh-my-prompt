import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageSchema } from '@oh-my-prompt/shared/types'
import { savePromptImageAsset, deletePromptImageAsset, queuePendingImageDelete } from '../image-asset-service'

vi.mock('../image-sync', () => ({
  saveImage: vi.fn(async () => ({ success: true, relativePath: 'images/image-1.webp' })),
  deleteImageByPath: vi.fn(async () => ({ success: true })),
  getCachedImageUrl: vi.fn(async () => 'blob:local')
}))

vi.mock('../image-cloud-client', () => ({
  uploadCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' })),
  deleteCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' }))
}))

vi.mock('../image-processing', () => ({
  buildImagePath: vi.fn((id: string) => `images/${id}.webp`),
  computeBlobSha256: vi.fn(async () => 'hash-1')
}))

describe('image-asset-service', () => {
  let storageData: StorageSchema

  beforeEach(() => {
    storageData = {
      version: '1.0.0',
      userData: {
        prompts: [{ id: 'prompt-1', name: 'Prompt', content: 'Text', categoryId: 'cat-1', order: 0 }],
        categories: [{ id: 'cat-1', name: 'Cat', order: 0 }]
      },
      settings: { showBuiltin: true, syncEnabled: true },
      temporaryPrompts: [],
      imageAssets: {},
      pendingImageDeletes: []
    }
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('image-1' as `${string}-${string}-${string}-${string}-${string}`)
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({ prompt_script_data: storageData })),
          set: vi.fn(async value => {
            storageData = value.prompt_script_data
          })
        }
      }
    } as unknown as typeof chrome
  })

  it('saves image asset metadata and updates prompt compatibility fields', async () => {
    const result = await savePromptImageAsset({
      promptId: 'prompt-1',
      blob: new Blob(['abc'], { type: 'image/png' }),
      sourceUrl: 'https://example.com/source.png',
      canUseCloud: false,
      width: 100,
      height: 80,
      size: 1000,
      hash: 'hash-1'
    })

    expect(result.success).toBe(true)
    expect(storageData.userData.prompts[0]).toMatchObject({
      imageId: 'image-1',
      localImage: 'images/image-1.webp',
      remoteImageUrl: 'https://example.com/source.png'
    })
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      promptId: 'prompt-1',
      status: 'local_only',
      localPath: 'images/image-1.webp'
    })
  })

  it('queues pending delete with copied cloudPath after cloud delete failure', async () => {
    storageData.userData.prompts[0].imageId = 'image-1'
    storageData.userData.prompts[0].localImage = 'images/image-1.webp'
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudPath: 'users/u/images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'synced',
        updatedAt: 1
      }
    }

    await deletePromptImageAsset('prompt-1')

    expect(storageData.imageAssets?.['image-1']).toBeUndefined()
    expect(storageData.pendingImageDeletes).toEqual([expect.objectContaining({
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1
    })])
  })

  it('dedupes pending delete queue entries', async () => {
    await queuePendingImageDelete('image-1', 'users/u/images/image-1.webp', 'first')
    await queuePendingImageDelete('image-1', 'users/u/images/image-1.webp', 'second')

    expect(storageData.pendingImageDeletes).toHaveLength(1)
    expect(storageData.pendingImageDeletes?.[0]).toMatchObject({
      attempts: 2,
      lastError: 'second'
    })
  })
})
