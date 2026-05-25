import { IMAGE_DIR_NAME } from '@oh-my-prompt/shared/constants'

export const TARGET_IMAGE_SIZE = 500 * 1024
export const HARD_IMAGE_SIZE_LIMIT = 1024 * 1024
export const MAX_IMAGE_SIDE = 2000
export const INITIAL_WEBP_QUALITY = 0.82
export const MIN_WEBP_QUALITY = 0.72

export interface NormalizedImageResult {
  data: number[]
  mimeType: 'image/webp'
  width: number
  height: number
  size: number
  hash: string
}

export function validateImageId(imageId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageId)
}

export function buildImagePath(imageId: string): string {
  if (!validateImageId(imageId)) {
    throw new Error('INVALID_IMAGE_ID')
  }
  return `${IMAGE_DIR_NAME}/${imageId}.webp`
}

export function getImageFilenameFromPath(relativePath: string): string | null {
  const match = relativePath.match(new RegExp(`^${IMAGE_DIR_NAME}/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.webp$`, 'i'))
  if (!match) {
    return null
  }

  const imageId = match[1]
  if (buildImagePath(imageId) !== relativePath) {
    return null
  }

  return `${imageId}.webp`
}

export async function computeBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}
