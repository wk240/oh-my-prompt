import type { ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'
import { mergeImageAssets, mergePendingImageDeletes } from '../image-metadata-merge'

function asset(overrides: Partial<ImageAsset>): ImageAsset {
  return {
    id: 'image-1',
    promptId: 'prompt-1',
    localPath: 'images/image-1.webp',
    mimeType: 'image/webp',
    width: 100,
    height: 80,
    size: 1000,
    hash: 'hash-1',
    status: 'local_only',
    updatedAt: 1,
    ...overrides
  }
}

describe('image metadata merge', () => {
  it('preserves cloud fields from older asset when newer local asset lacks them', () => {
    const merged = mergeImageAssets(
      { 'image-1': asset({ cloudUrl: 'https://blob/img.webp', cloudPath: 'users/u/images/image-1.webp', status: 'synced', updatedAt: 1 }) },
      { 'image-1': asset({ status: 'pending_upload', updatedAt: 2 }) }
    )

    expect(merged['image-1']).toMatchObject({
      status: 'pending_upload',
      cloudUrl: 'https://blob/img.webp',
      cloudPath: 'users/u/images/image-1.webp',
      updatedAt: 2
    })
  })

  it('does not resurrect stale asset lastError from older fallback metadata', () => {
    const merged = mergeImageAssets(
      { 'image-1': asset({ lastError: 'old upload failed', status: 'error', updatedAt: 1 }) },
      { 'image-1': asset({ status: 'pending_upload', updatedAt: 2 }) }
    )

    expect(merged['image-1'].lastError).toBeUndefined()
  })

  it('dedupes pending deletes and keeps highest attempts with latest error', () => {
    const cloud: PendingImageDelete[] = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1,
      lastError: 'first',
      updatedAt: 10
    }]
    const local: PendingImageDelete[] = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 3,
      lastError: 'latest',
      updatedAt: 20
    }]

    expect(mergePendingImageDeletes(cloud, local)).toEqual([{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 3,
      lastError: 'latest',
      updatedAt: 20
    }])
  })

  it('does not resurrect stale pending delete lastError from older records', () => {
    const cloud: PendingImageDelete[] = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 4,
      lastError: 'old delete failed',
      updatedAt: 10
    }]
    const local: PendingImageDelete[] = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1,
      updatedAt: 20
    }]

    expect(mergePendingImageDeletes(cloud, local)).toEqual([{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 4,
      lastError: undefined,
      updatedAt: 20
    }])
  })
})
