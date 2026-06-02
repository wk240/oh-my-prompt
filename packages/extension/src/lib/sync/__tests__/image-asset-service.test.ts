import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageSchema } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import {
  clearImageRestoreQueueForTests,
  deletePromptImageAsset,
  drainPendingImageDeletes,
  enqueueImageRestore,
  getDisplayUrl,
  getImageRestoreStatus,
  queuePendingImageDelete,
  restoreMissingCloudImages,
  restorePromptImageAsset,
  retryImageUpload,
  retryPendingImageUploads,
  savePromptImageAsset
} from '../image-asset-service'
import { deleteImageByPath, getCachedImageUrl, saveImage } from '../image-sync'
import { deleteCloudImage, downloadCloudImage, uploadCloudImage } from '../image-cloud-client'

vi.mock('../image-sync', () => ({
  saveImage: vi.fn(async () => ({ success: true, relativePath: 'images/image-1.webp' })),
  deleteImageByPath: vi.fn(async () => ({ success: true })),
  getCachedImageUrl: vi.fn(async () => 'blob:local')
}))

vi.mock('../image-cloud-client', () => ({
  uploadCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' })),
  downloadCloudImage: vi.fn(async () => ({ success: true, blob: new Blob(['restored'], { type: 'image/webp' }) })),
  deleteCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' }))
}))

vi.mock('../image-processing', () => ({
  buildImagePath: vi.fn((id: string) => `images/${id}.webp`),
  computeBlobSha256: vi.fn(async () => 'hash-1')
}))

describe('image-asset-service', () => {
  let storageData: StorageSchema

  function addCloudBackedMissingAsset(): void {
    storageData.userData.prompts[0] = {
      ...storageData.userData.prompts[0],
      imageId: 'image-1',
      localImage: 'images/image-1.webp',
      remoteImageUrl: 'https://source.test/image.png'
    }
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudUrl: 'https://blob.test/image-1.webp',
        cloudPath: 'users/u/images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 12,
        hash: 'hash-1',
        status: 'missing_local',
        updatedAt: 1
      }
    }
  }

  function addCloudBackedMissingAssetWithId(imageId: string, promptId = `prompt-${imageId}`): void {
    storageData.userData.prompts.push({
      id: promptId,
      name: `Prompt ${imageId}`,
      content: 'Text',
      categoryId: 'cat-1',
      order: storageData.userData.prompts.length,
      imageId,
      localImage: `images/${imageId}.webp`
    })
    storageData.imageAssets = {
      ...(storageData.imageAssets || {}),
      [imageId]: {
        id: imageId,
        promptId,
        localPath: `images/${imageId}.webp`,
        cloudUrl: `https://blob.test/${imageId}.webp`,
        cloudPath: `users/u/images/${imageId}.webp`,
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 12,
        hash: 'hash-1',
        status: 'missing_local',
        updatedAt: 1
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clearImageRestoreQueueForTests()
    vi.mocked(saveImage).mockReset().mockResolvedValue({ success: true, relativePath: 'images/image-1.webp' })
    vi.mocked(deleteImageByPath).mockReset().mockResolvedValue({ success: true })
    vi.mocked(getCachedImageUrl).mockReset().mockResolvedValue('blob:local')
    vi.mocked(uploadCloudImage).mockReset().mockResolvedValue({ success: false, error: 'NETWORK_ERROR' })
    vi.mocked(downloadCloudImage).mockReset().mockResolvedValue({
      success: true,
      blob: new Blob(['restored'], { type: 'image/webp' })
    })
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
      runtime: {
        sendMessage: vi.fn(async () => ({ success: true })),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({ prompt_script_data: storageData })),
          set: vi.fn(async value => {
            storageData = value.prompt_script_data
          })
        },
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined)
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

    await expect(retryImageUpload('image-1')).resolves.toBe(true)

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

  it('restores a missing cloud-backed image and marks the asset synced', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(true)
    expect(downloadCloudImage).toHaveBeenCalledWith('https://blob.test/image-1.webp', {
      size: 12,
      hash: 'hash-1'
    })
    expect(saveImage).toHaveBeenCalledWith('image-1', expect.any(Blob), 'image-1.webp')
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      localPath: 'images/image-1.webp',
      status: 'synced',
      lastError: undefined
    })
  })

  it('marks a missing cloud-backed asset synced when the local file already exists', async () => {
    addCloudBackedMissingAsset()
    storageData.imageAssets!['image-1'].lastError = 'LOCAL_IMAGE_MISSING'
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce('blob:local')

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(true)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'synced',
      lastError: undefined
    })
  })

  it('returns cloudUrl and enqueues visible restore when local display loading fails', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValue(null)

    const result = await getDisplayUrl(storageData.userData.prompts[0])

    expect(result).toBe('https://blob.test/image-1.webp')
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.ENQUEUE_IMAGE_RESTORE,
      payload: {
        imageId: 'image-1',
        priority: 'visible'
      }
    })
  })

  it('does not repair local status when the asset is unreferenced during cache lookup', async () => {
    addCloudBackedMissingAsset()
    storageData.imageAssets!['image-1'].lastError = 'LOCAL_IMAGE_MISSING'
    vi.mocked(getCachedImageUrl).mockImplementationOnce(async () => {
      storageData.userData.prompts[0].imageId = undefined
      return 'blob:local'
    })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'missing_local',
      lastError: 'LOCAL_IMAGE_MISSING'
    })
  })

  it('skips restore for an asset without cloudUrl', async () => {
    addCloudBackedMissingAsset()
    delete storageData.imageAssets?.['image-1'].cloudUrl

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('pauses restore and notifies UI when folder permission is prompt', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'prompt' }
    })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'missing_local',
      lastError: 'PERMISSION_PROMPT'
    })
    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      imageRestoreFolderRequiredPendingCount: 1
    })
  })

  it('counts a queued folder permission pause once', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValue(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      data: { hasFolder: true, permission: 'prompt' }
    })

    enqueueImageRestore('image-1', { priority: 'background' })

    await vi.waitFor(() => {
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        imageRestoreFolderRequiredPendingCount: 1
      })
    })
  })

  it('clears stale folder-required status when restore scan resumes', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'prompt' }
    })

    await restorePromptImageAsset('image-1')
    storageData.imageAssets = {}
    vi.mocked(chrome.storage.session.get).mockResolvedValueOnce({})

    await restoreMissingCloudImages()

    await expect(getImageRestoreStatus()).resolves.toEqual({
      folderRequired: false,
      pendingCount: 0
    })
  })

  it('records missing_local when cloud download validation fails', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })
    vi.mocked(downloadCloudImage).mockResolvedValueOnce({ success: false, error: 'HASH_MISMATCH' })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(true)
    expect(saveImage).not.toHaveBeenCalled()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'missing_local',
      lastError: 'HASH_MISMATCH'
    })
  })

  it('skips restore while a pending cloud delete exists for the image', async () => {
    addCloudBackedMissingAsset()
    storageData.pendingImageDeletes = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1,
      updatedAt: 1
    }]

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('deletes a restored file when the asset is unreferenced after save', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })
    vi.mocked(saveImage).mockImplementationOnce(async () => {
      storageData.userData.prompts[0].imageId = undefined
      return { success: true, relativePath: 'images/image-1.webp' }
    })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(deleteImageByPath).toHaveBeenCalledWith('images/image-1.webp')
  })

  it('retries the original queued restore after backoff when metadata appears', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      enqueueImageRestore('image-1', { priority: 'background' })
      await vi.advanceTimersByTimeAsync(0)

      addCloudBackedMissingAsset()
      vi.mocked(getCachedImageUrl).mockResolvedValue(null)
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: true,
        data: { hasFolder: true, permission: 'granted' }
      })

      expect(downloadCloudImage).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(59_999)
      expect(downloadCloudImage).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      await vi.waitFor(() => {
        expect(downloadCloudImage).toHaveBeenCalledWith('https://blob.test/image-1.webp', expect.any(Object))
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a queued restore after repeated terminal failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      enqueueImageRestore('missing-image', { priority: 'background' })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.advanceTimersByTimeAsync(60_000)

      addCloudBackedMissingAssetWithId('missing-image')
      vi.mocked(getCachedImageUrl).mockResolvedValue(null)
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: true,
        data: { hasFolder: true, permission: 'granted' }
      })
      await vi.advanceTimersByTimeAsync(60_000)

      expect(downloadCloudImage).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('prioritizes visible restore over queued background restore', async () => {
    addCloudBackedMissingAsset()
    addCloudBackedMissingAssetWithId('background-image')
    vi.mocked(getCachedImageUrl).mockResolvedValue(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })
    let releaseBackground: (() => void) | undefined
    vi.mocked(downloadCloudImage).mockImplementation(async url => {
      if (url === 'https://blob.test/background-image.webp') {
        await new Promise<void>(resolve => {
          releaseBackground = resolve
        })
      }
      return { success: true, blob: new Blob(['restored'], { type: 'image/webp' }) }
    })

    enqueueImageRestore('background-image', { priority: 'background' })
    enqueueImageRestore('image-1', { priority: 'visible' })

    await vi.waitFor(() => {
      expect(downloadCloudImage).toHaveBeenNthCalledWith(2, 'https://blob.test/image-1.webp', expect.any(Object))
    })
    releaseBackground?.()
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

  it('preserves pending deletes queued while draining existing items', async () => {
    storageData.pendingImageDeletes = [{
      imageId: 'old-image',
      cloudPath: 'users/u/images/old-image.webp',
      attempts: 1,
      updatedAt: 1
    }]
    vi.mocked(deleteCloudImage).mockImplementationOnce(async () => {
      void queuePendingImageDelete('new-image', 'users/u/images/new-image.webp')
      return { success: true }
    })

    await drainPendingImageDeletes()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(storageData.pendingImageDeletes).toEqual([expect.objectContaining({
      imageId: 'new-image',
      cloudPath: 'users/u/images/new-image.webp'
    })])
  })

  it('cleans up cloud upload when asset is deleted before retry completes', async () => {
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
    vi.mocked(uploadCloudImage).mockImplementationOnce(async () => {
      storageData.imageAssets = {}
      return {
        success: true,
        cloudUrl: 'https://blob/image-1.webp',
        cloudPath: 'users/u/images/image-1.webp',
        size: 1000
      }
    })
    vi.mocked(deleteCloudImage).mockResolvedValueOnce({ success: true })

    await retryImageUpload('image-1')

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
