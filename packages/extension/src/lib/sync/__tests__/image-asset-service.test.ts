import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageSchema } from '@oh-my-prompt/shared/types'
import {
  deletePromptImageAsset,
  drainPendingImageDeletes,
  queuePendingImageDelete,
  retryImageUpload,
  retryPendingImageUploads,
  savePromptImageAsset
} from '../image-asset-service'
import { deleteImageByPath, getCachedImageUrl, saveImage } from '../image-sync'
import { deleteCloudImage, uploadCloudImage } from '../image-cloud-client'

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
    vi.clearAllMocks()
    vi.mocked(saveImage).mockReset().mockResolvedValue({ success: true, relativePath: 'images/image-1.webp' })
    vi.mocked(deleteImageByPath).mockReset().mockResolvedValue({ success: true })
    vi.mocked(getCachedImageUrl).mockReset().mockResolvedValue('blob:local')
    vi.mocked(uploadCloudImage).mockReset().mockResolvedValue({ success: false, error: 'NETWORK_ERROR' })
    vi.mocked(deleteCloudImage).mockReset().mockResolvedValue({ success: false, error: 'NETWORK_ERROR' })
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['abc'], { type: 'image/webp' }))))
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

  it('cleans up replaced asset metadata and queues old cloud delete failure', async () => {
    storageData.userData.prompts[0] = {
      ...storageData.userData.prompts[0],
      imageId: 'old-image',
      localImage: 'images/old-image.webp',
      remoteImageUrl: 'https://example.com/old.png'
    }
    storageData.imageAssets = {
      'old-image': {
        id: 'old-image',
        promptId: 'prompt-1',
        localPath: 'images/old-image.webp',
        cloudPath: 'users/u/images/old-image.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'old-hash',
        status: 'synced',
        updatedAt: 1
      }
    }

    await savePromptImageAsset({
      promptId: 'prompt-1',
      blob: new Blob(['new'], { type: 'image/png' }),
      canUseCloud: false,
      width: 120,
      height: 90,
      size: 1100,
      hash: 'new-hash'
    })

    expect(deleteImageByPath).toHaveBeenCalledWith('images/old-image.webp')
    expect(deleteCloudImage).toHaveBeenCalledWith('old-image', 'users/u/images/old-image.webp')
    expect(storageData.imageAssets?.['old-image']).toBeUndefined()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      promptId: 'prompt-1',
      localPath: 'images/image-1.webp'
    })
    expect(storageData.userData.prompts[0]).toMatchObject({
      imageId: 'image-1',
      localImage: 'images/image-1.webp'
    })
    expect(storageData.userData.prompts[0].remoteImageUrl).toBeUndefined()
    expect(storageData.pendingImageDeletes).toEqual([expect.objectContaining({
      imageId: 'old-image',
      cloudPath: 'users/u/images/old-image.webp',
      attempts: 1
    })])
  })

  it('aborts replacement and keeps old metadata when old local delete fails', async () => {
    storageData.userData.prompts[0] = {
      ...storageData.userData.prompts[0],
      imageId: 'old-image',
      localImage: 'images/old-image.webp',
      remoteImageUrl: 'https://example.com/old.png'
    }
    storageData.imageAssets = {
      'old-image': {
        id: 'old-image',
        promptId: 'prompt-1',
        localPath: 'images/old-image.webp',
        cloudPath: 'users/u/images/old-image.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'old-hash',
        status: 'synced',
        updatedAt: 1
      }
    }
    vi.mocked(deleteImageByPath)
      .mockResolvedValueOnce({ success: false, error: 'PERMISSION_DENIED' })
      .mockResolvedValueOnce({ success: true })

    const result = await savePromptImageAsset({
      promptId: 'prompt-1',
      blob: new Blob(['new'], { type: 'image/png' }),
      canUseCloud: false,
      width: 120,
      height: 90,
      size: 1100,
      hash: 'new-hash'
    })

    expect(result).toEqual({ success: false, error: 'PERMISSION_DENIED' })
    expect(deleteImageByPath).toHaveBeenNthCalledWith(1, 'images/old-image.webp')
    expect(deleteImageByPath).toHaveBeenNthCalledWith(2, 'images/image-1.webp')
    expect(deleteCloudImage).not.toHaveBeenCalled()
    expect(storageData.userData.prompts[0]).toMatchObject({
      imageId: 'old-image',
      localImage: 'images/old-image.webp',
      remoteImageUrl: 'https://example.com/old.png'
    })
    expect(storageData.imageAssets?.['old-image']).toMatchObject({
      localPath: 'images/old-image.webp',
      lastError: 'PERMISSION_DENIED'
    })
    expect(storageData.imageAssets?.['image-1']).toBeUndefined()
  })

  it('marks retry upload as failed when local blob fetch rejects', async () => {
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'pending_upload',
        updatedAt: 1
      }
    }
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce('blob:local')
    vi.mocked(fetch).mockRejectedValueOnce(new Error('blob fetch failed'))

    await expect(retryImageUpload('image-1')).resolves.toBeUndefined()

    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'upload_failed',
      lastError: 'blob fetch failed'
    })
  })

  it('retries local-only image uploads when cloud sync becomes available', async () => {
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'local_only',
        updatedAt: 1
      }
    }
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce('blob:local')
    vi.mocked(uploadCloudImage).mockResolvedValueOnce({
      success: true,
      cloudUrl: 'https://blob/image-1.webp',
      cloudPath: 'users/u/images/image-1.webp',
      size: 1000
    })

    await retryPendingImageUploads()

    expect(uploadCloudImage).toHaveBeenCalledWith(expect.objectContaining({
      imageId: 'image-1',
      promptId: 'prompt-1'
    }))
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'synced',
      cloudUrl: 'https://blob/image-1.webp',
      cloudPath: 'users/u/images/image-1.webp'
    })
  })

  it('drains successful pending cloud deletes', async () => {
    storageData.pendingImageDeletes = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1,
      updatedAt: 1
    }]
    vi.mocked(deleteCloudImage).mockResolvedValueOnce({ success: true })

    await drainPendingImageDeletes()

    expect(deleteCloudImage).toHaveBeenCalledWith('image-1', 'users/u/images/image-1.webp')
    expect(storageData.pendingImageDeletes).toEqual([])
  })

  it('preserves prompt and asset metadata when local delete fails', async () => {
    storageData.userData.prompts[0].imageId = 'image-1'
    storageData.userData.prompts[0].localImage = 'images/image-1.webp'
    storageData.userData.prompts[0].remoteImageUrl = 'https://example.com/source.png'
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'local_only',
        updatedAt: 1
      }
    }
    vi.mocked(deleteImageByPath).mockResolvedValueOnce({ success: false, error: 'PERMISSION_DENIED' })

    const result = await deletePromptImageAsset('prompt-1')

    expect(result).toEqual({ success: false, error: 'PERMISSION_DENIED' })
    expect(storageData.userData.prompts[0]).toMatchObject({
      imageId: 'image-1',
      localImage: 'images/image-1.webp',
      remoteImageUrl: 'https://example.com/source.png'
    })
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      localPath: 'images/image-1.webp',
      lastError: 'PERMISSION_DENIED'
    })
  })

  it('deletes legacy local image files without image asset metadata', async () => {
    storageData.userData.prompts[0].localImage = 'images/legacy.webp'
    storageData.userData.prompts[0].remoteImageUrl = 'https://example.com/source.png'

    const result = await deletePromptImageAsset('prompt-1')

    expect(result.success).toBe(true)
    expect(deleteImageByPath).toHaveBeenCalledWith('images/legacy.webp')
    expect(storageData.userData.prompts[0]).toMatchObject({
      imageId: undefined,
      localImage: undefined,
      remoteImageUrl: undefined
    })
  })

  it('updates temporary prompt compatibility fields when saving', async () => {
    storageData.userData.prompts = []
    storageData.temporaryPrompts = [
      { id: 'temp-1', name: 'Temp', content: 'Text', categoryId: 'temporary', order: 0 }
    ]

    const result = await savePromptImageAsset({
      promptId: 'temp-1',
      blob: new Blob(['abc'], { type: 'image/png' }),
      sourceUrl: 'https://example.com/temp.png',
      canUseCloud: false,
      width: 100,
      height: 80,
      size: 1000,
      hash: 'hash-1'
    })

    expect(result.success).toBe(true)
    expect(storageData.temporaryPrompts?.[0]).toMatchObject({
      imageId: 'image-1',
      localImage: 'images/image-1.webp',
      remoteImageUrl: 'https://example.com/temp.png'
    })
  })
})
