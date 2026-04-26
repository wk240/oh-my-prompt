/**
 * image-sync.ts - Image file operations for local folder backup
 * Uses File System Access API for reading/writing image files
 */

import { IMAGE_DIR_NAME, MAX_IMAGE_SIZE, ALLOWED_IMAGE_EXTENSIONS } from '@/shared/constants'
import { getFolderHandle } from './indexeddb'

/**
 * Image operation result types
 */
export interface ImageSaveResult {
  success: boolean
  relativePath?: string
  error?: 'FOLDER_NOT_CONFIGURED' | 'WRITE_FAILED' | 'FILE_TOO_LARGE' | 'INVALID_FORMAT'
}

export interface ImageReadResult {
  success: boolean
  blob?: Blob
  /** Blob URL created via URL.createObjectURL. WARNING: Caller must revoke via URL.revokeObjectURL() to avoid memory leaks. Prefer getCachedImageUrl() for managed URL lifecycle. */
  url?: string
  error?: 'FOLDER_NOT_CONFIGURED' | 'READ_FAILED' | 'FILE_NOT_FOUND'
}

export interface ImageDownloadResult {
  success: boolean
  blob?: Blob
  error?: 'DOWNLOAD_FAILED' | 'INVALID_RESPONSE'
}

/**
 * Check if folder is configured and accessible
 */
export async function isFolderConfigured(): Promise<boolean> {
  const handle = await getFolderHandle()
  return handle !== null
}

/**
 * Get extension from filename or content-type
 */
function getImageExtension(filename: string, contentType?: string): string {
  // Try filename extension first
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext && ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }

  // Try content-type
  if (contentType) {
    const typeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    return typeMap[contentType] || 'jpg'
  }

  return 'jpg' // Default fallback
}

/**
 * Save image to folder: images/{promptId}.{ext}
 * Returns relative path for storage in Prompt.localImage
 */
export async function saveImage(
  promptId: string,
  blob: Blob,
  originalFilename?: string
): Promise<ImageSaveResult> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Check file size
  if (blob.size > MAX_IMAGE_SIZE) {
    return { success: false, error: 'FILE_TOO_LARGE' }
  }

  // Determine extension
  const ext = getImageExtension(originalFilename || '', blob.type)

  try {
    // Ensure images directory exists
    let imagesDir: FileSystemDirectoryHandle
    try {
      imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
    } catch {
      return { success: false, error: 'WRITE_FAILED' }
    }

    // Write image file
    const filename = `${promptId}.${ext}`
    const fileHandle = await imagesDir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()

    const relativePath = `${IMAGE_DIR_NAME}/${filename}`
    console.log('[Oh My Prompt] Image saved:', relativePath)
    return { success: true, relativePath }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to save image:', error)
    return { success: false, error: 'WRITE_FAILED' }
  }
}

/**
 * Delete image file from folder
 */
export async function deleteImage(promptId: string): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)

    // Try all possible extensions
    for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
      const filename = `${promptId}.${ext}`
      try {
        await imagesDir.removeEntry(filename)
        console.log('[Oh My Prompt] Image deleted:', filename)
      } catch {
        // File doesn't exist with this extension, try next
      }
    }

    return { success: true }
  } catch (error) {
    // images directory doesn't exist - nothing to delete
    return { success: true }
  }
}

/**
 * Read image blob from relative path.
 *
 * WARNING: This function returns a blob URL created via URL.createObjectURL().
 * The caller is responsible for revoking the URL via URL.revokeObjectURL() when
 * no longer needed to avoid memory leaks. For automatic URL lifecycle management,
 * prefer getCachedImageUrl() which handles caching and cleanup.
 */
export async function readImage(relativePath: string): Promise<ImageReadResult> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
    const filename = relativePath.split('/').pop() || relativePath
    const fileHandle = await imagesDir.getFileHandle(filename)
    const file = await fileHandle.getFile()

    return { success: true, blob: file, url: URL.createObjectURL(file) }
  } catch (error) {
    console.warn('[Oh My Prompt] Failed to read image:', relativePath, error)
    return { success: false, error: 'FILE_NOT_FOUND' }
  }
}

/**
 * Download image from URL and return blob
 */
export async function downloadImageFromUrl(url: string): Promise<ImageDownloadResult> {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      return { success: false, error: 'DOWNLOAD_FAILED' }
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      console.warn('[Oh My Prompt] Response content-type is not an image type:', contentType, 'for URL:', url)
    }

    const blob = await response.blob()

    // Validate blob size
    if (blob.size > MAX_IMAGE_SIZE) {
      return { success: false, error: 'DOWNLOAD_FAILED' } // Treat as download failure for size
    }

    return { success: true, blob }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to download image:', url, error)
    return { success: false, error: 'DOWNLOAD_FAILED' }
  }
}

/**
 * Image URL cache - prevents repeated blob URL creation
 */
const imageUrlCache = new Map<string, string>()

/**
 * Get cached image URL or create new one
 */
export async function getCachedImageUrl(relativePath: string): Promise<string | null> {
  // Return cached URL if exists
  if (imageUrlCache.has(relativePath)) {
    return imageUrlCache.get(relativePath)!
  }

  // Read image and create URL
  const result = await readImage(relativePath)
  if (result.success && result.url) {
    imageUrlCache.set(relativePath, result.url)
    return result.url
  }

  return null
}

/**
 * Revoke cached image URL and remove from cache
 */
export function revokeCachedImageUrl(relativePath: string): void {
  const url = imageUrlCache.get(relativePath)
  if (url) {
    URL.revokeObjectURL(url)
    imageUrlCache.delete(relativePath)
  }
}

/**
 * Clear all cached image URLs (cleanup on dropdown close)
 */
export function clearImageUrlCache(): void {
  imageUrlCache.forEach((url) => {
    URL.revokeObjectURL(url)
  })
  imageUrlCache.clear()
}