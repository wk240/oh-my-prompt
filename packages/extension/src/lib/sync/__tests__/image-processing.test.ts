import { buildImagePath, computeBlobSha256, getImageFilenameFromPath, validateImageId } from '../image-processing'

describe('image-processing helpers', () => {
  it('builds stable WebP image paths from safe IDs', () => {
    expect(buildImagePath('11111111-1111-4111-8111-111111111111')).toBe('images/11111111-1111-4111-8111-111111111111.webp')
  })

  it('rejects unsafe image IDs', () => {
    expect(validateImageId('../bad')).toBe(false)
    expect(validateImageId('11111111-1111-4111-8111-111111111111')).toBe(true)
  })

  it('extracts filenames only from canonical image paths', () => {
    expect(getImageFilenameFromPath('images/11111111-1111-4111-8111-111111111111.webp')).toBe('11111111-1111-4111-8111-111111111111.webp')
    expect(getImageFilenameFromPath('foo/11111111-1111-4111-8111-111111111111.webp')).toBeNull()
    expect(getImageFilenameFromPath('images/../11111111-1111-4111-8111-111111111111.webp')).toBeNull()
    expect(getImageFilenameFromPath('images/not-a-uuid.webp')).toBeNull()
    expect(getImageFilenameFromPath('images/')).toBeNull()
  })

  it('computes SHA-256 for blobs', async () => {
    const hash = await computeBlobSha256(new Blob(['abc'], { type: 'text/plain' }))
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
