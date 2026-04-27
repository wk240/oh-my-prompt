/**
 * image-sync.ts - Image file operations for local folder backup
 * Uses File System Access API for reading/writing image files
 *
 * IMPORTANT: FileSystemDirectoryHandle cannot cross origin boundaries via messaging.
 * Content scripts (lovart.ai) and service worker (chrome-extension://xxx) are different origins.
 * Therefore, content scripts send image data to service worker for file operations.
 */

import { IMAGE_DIR_NAME, MAX_IMAGE_SIZE, ALLOWED_IMAGE_EXTENSIONS } from '@/shared/constants'
import { getFolderHandle, checkFolderPermission, requestFolderPermission } from './indexeddb'
import { MessageType } from '@/shared/messages'

/**
 * Check if we're in content script context
 * Content scripts run in web page context (lovart.ai), service worker and popup in extension context
 * Key difference: extension pages have chrome-extension:// URLs, content scripts don't
 */
function isContentScriptContext(): boolean {
  try {
    // Check if window.location is a chrome-extension:// URL
    // Extension pages (popup, options, service worker) have chrome-extension:// URLs
    // Content scripts run in web page context (lovart.ai) - NOT chrome-extension://
    return typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      window.location.href.startsWith('chrome-extension://') === false
  } catch {
    return false
  }
}

/**
 * Image operation result types
 */
export interface ImageSaveResult {
  success: boolean
  relativePath?: string
  error?: 'FOLDER_NOT_CONFIGURED' | 'FOLDER_NOT_FOUND' | 'PERMISSION_DENIED' | 'WRITE_FAILED' | 'FILE_TOO_LARGE' | 'INVALID_FORMAT'
}

export interface ImageReadResult {
  success: boolean
  blob?: Blob
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
  if (isContentScriptContext()) {
    // Content script: ask service worker
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_SYNC_STATUS })
      return response?.success && response.data?.hasFolder
    } catch {
      return false
    }
  }
  // Extension context: direct access
  const handle = await getFolderHandle()
  return handle !== null
}

/**
 * Get extension from filename or content-type
 */
function getImageExtension(filename: string, contentType?: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext && ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }
  if (contentType) {
    const typeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    return typeMap[contentType] || 'jpg'
  }
  return 'jpg'
}

/**
 * Save image via service worker (content script context)
 */
async function saveImageViaServiceWorker(
  promptId: string,
  blob: Blob,
  originalFilename?: string
): Promise<ImageSaveResult> {
  console.log('[Oh My Prompt] saveImage: sending to service worker, promptId:', promptId, 'blob size:', blob.size)

  // Convert blob to Uint8Array and then to plain array for messaging
  // ArrayBuffer cannot be reliably passed cross-origin (content script -> service worker)
  const arrayBuffer = await blob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  const dataArray = Array.from(uint8Array)  // Plain array can be serialized cross-origin
  console.log('[Oh My Prompt] Data array created, length:', dataArray.length)

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.SAVE_IMAGE,
      payload: {
        promptId,
        data: dataArray,  // Use plain array instead of ArrayBuffer
        originalFilename
      }
    })

    if (response?.success) {
      console.log('[Oh My Prompt] Image saved via service worker:', response.data?.relativePath)
      return { success: true, relativePath: response.data?.relativePath }
    }
    console.error('[Oh My Prompt] Save image failed:', response?.error)
    return { success: false, error: response?.error }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to send save image message:', error)
    return { success: false, error: 'WRITE_FAILED' }
  }
}

/**
 * Save image directly (extension context: popup or service worker)
 */
async function saveImageDirect(
  promptId: string,
  blob: Blob,
  originalFilename?: string
): Promise<ImageSaveResult> {
  console.log('[Oh My Prompt] saveImage direct, promptId:', promptId, 'blob size:', blob.size)

  const handle = await getFolderHandle()
  if (!handle) {
    console.log('[Oh My Prompt] No folder handle found')
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Check and request permission if needed
  const permission = await checkFolderPermission(handle, 'readwrite')
  console.log('[Oh My Prompt] Permission status:', permission)
  if (permission === 'denied') {
    return { success: false, error: 'PERMISSION_DENIED' }
  }
  if (permission === 'prompt') {
    const restored = await requestFolderPermission(handle, 'readwrite')
    if (restored !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' }
    }
  }

  if (blob.size > MAX_IMAGE_SIZE) {
    return { success: false, error: 'FILE_TOO_LARGE' }
  }

  const ext = getImageExtension(originalFilename || '', blob.type)

  try {
    console.log('[Oh My Prompt] Creating images directory...')
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
    console.log('[Oh My Prompt] Images directory ready')

    const filename = `${promptId}.${ext}`
    const fileHandle = await imagesDir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()

    const relativePath = `${IMAGE_DIR_NAME}/${filename}`
    console.log('[Oh My Prompt] Image saved:', relativePath)
    return { success: true, relativePath }
  } catch (error) {
    console.error('[Oh My Prompt] Save image failed:', error)
    if (error instanceof Error && error.name === 'NotFoundError') {
      return { success: false, error: 'FOLDER_NOT_FOUND' }
    }
    return { success: false, error: 'WRITE_FAILED' }
  }
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
  if (isContentScriptContext()) {
    return await saveImageViaServiceWorker(promptId, blob, originalFilename)
  }
  return await saveImageDirect(promptId, blob, originalFilename)
}

/**
 * Delete image via service worker (content script context)
 */
async function deleteImageViaServiceWorker(promptId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.DELETE_IMAGE,
      payload: { promptId }
    })
    return { success: response?.success ?? false, error: response?.error }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to send delete image message:', error)
    return { success: false, error: 'DELETE_FAILED' }
  }
}

/**
 * Delete image directly (extension context)
 */
async function deleteImageDirect(promptId: string): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
    for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
      const filename = `${promptId}.${ext}`
      try {
        await imagesDir.removeEntry(filename)
        console.log('[Oh My Prompt] Image deleted:', filename)
      } catch {
        // File doesn't exist, try next
      }
    }
    return { success: true }
  } catch {
    return { success: true }
  }
}

/**
 * Delete image file from folder
 */
export async function deleteImage(promptId: string): Promise<{ success: boolean; error?: string }> {
  if (isContentScriptContext()) {
    return await deleteImageViaServiceWorker(promptId)
  }
  return await deleteImageDirect(promptId)
}

/**
 * Read image blob from relative path (extension context only)
 * Note: Content script cannot read images directly - must use cached URLs from service worker
 */
export async function readImage(relativePath: string): Promise<ImageReadResult> {
  // Content script should not call this - images are read via service worker during preview
  if (isContentScriptContext()) {
    console.warn('[Oh My Prompt] readImage called in content script context - use getCachedImageUrl instead')
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

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
      console.warn('[Oh My Prompt] Response content-type is not an image:', contentType)
    }

    const blob = await response.blob()
    if (blob.size > MAX_IMAGE_SIZE) {
      return { success: false, error: 'DOWNLOAD_FAILED' }
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
  if (imageUrlCache.has(relativePath)) {
    return imageUrlCache.get(relativePath)!
  }

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
 * Clear all cached image URLs
 */
export function clearImageUrlCache(): void {
  imageUrlCache.forEach((url) => URL.revokeObjectURL(url))
  imageUrlCache.clear()
}