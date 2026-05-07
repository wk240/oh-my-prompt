/**
 * Offscreen Document for File System Access API operations
 *
 * Purpose: Maintain a persistent context for file system operations
 * that requires user interaction context (permission requests).
 *
 * Service Worker cannot request permissions because it lacks DOM/user interaction context.
 * Offscreen document provides this context, reducing permission loss frequency.
 */

import { MessageType, MessageResponse } from '../shared/messages'
import type { VisionApiConfig } from '../shared/types'
import type { FullBackupData } from '../lib/sync/file-sync'
import { getFolderHandle, saveFolderHandle, checkFolderPermission, requestFolderPermission } from '../lib/sync/indexeddb'
import { syncToLocalFolder, listBackupVersions, readBackupFile } from '../lib/sync/file-sync'
import { syncApiConfigToFolder, readApiConfigFromFolder } from '../lib/sync/api-config-sync'
import { IMAGE_DIR_NAME, ALLOWED_IMAGE_EXTENSIONS } from '../shared/constants'


// Cache folder handle for synchronous access during permission requests
// IndexedDB operations are async, so we cache the handle for gesture-preserving permission requests
let _cachedFolderHandle: FileSystemDirectoryHandle | null = null

/**
 * Get cached folder handle synchronously (for permission request in user gesture context)
 * Returns null if handle not cached yet - in that case, gesture will break during async retrieval
 */
function getCachedFolderHandle(): FileSystemDirectoryHandle | null {
  return _cachedFolderHandle
}

/**
 * Cache folder handle for future synchronous access
 * Called whenever we successfully retrieve handle from IndexedDB
 */
function cacheFolderHandle(handle: FileSystemDirectoryHandle): void {
  _cachedFolderHandle = handle
  console.log('[Oh My Prompt] Folder handle cached:', handle.name)
}

/**
 * Fallback permission request when handle not cached
 * WARNING: This breaks user gesture due to async IndexedDB operation
 * Should only be used when handle couldn't be cached beforehand
 */
async function handleRequestPermissionFallback(): Promise<MessageResponse> {
  console.warn('[Oh My Prompt] Permission request fallback - gesture may be lost')
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Cache for future requests
  cacheFolderHandle(handle)

  const permission = await requestFolderPermission(handle, 'readwrite')
  if (permission === 'granted') {
    return { success: true, data: { permission: 'granted' } }
  }
  return { success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' }
}

// Pre-cache folder handle on startup for gesture-preserving permission requests
getFolderHandle().then(handle => {
  if (handle) {
    cacheFolderHandle(handle)
  }
}).catch(err => {
  console.warn('[Oh My Prompt] Failed to pre-cache folder handle:', err)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  switch (message.type) {
    // Handle PING for readiness check
    case MessageType.OFFSCREEN_PING:
      sendResponse({ success: true, data: 'pong' })
      return false

    case MessageType.OFFSCREEN_SYNC:
      handleSync(message.payload as { backupData: FullBackupData; version: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_BACKUP:
      handleBackup(message.payload as { backupData: FullBackupData; version: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_SAVE_IMAGE:
      handleSaveImage(message.payload as { promptId: string; data: number[]; originalFilename?: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_READ_IMAGE:
      handleReadImage(message.payload as { relativePath: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_DELETE_IMAGE:
      handleDeleteImage(message.payload as { promptId: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_CHECK_PERMISSION:
      handleCheckPermission()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_REQUEST_PERMISSION:
      // CRITICAL: User gesture must be preserved for permission request
      // Chrome propagates user gesture through message passing, but only in SYNC execution path
      // We must call requestPermission() BEFORE any await, using cached handle from IndexedDB

      // Step 1: Open IndexedDB synchronously (IDBDatabase.open is async, but we can cache)
      // For now, we need to get handle synchronously - use a cached handle approach
      const cachedHandle = getCachedFolderHandle()

      if (!cachedHandle) {
        // No cached handle - need async retrieval, gesture will break
        // This should not happen if handle was properly cached during previous operations
        handleRequestPermissionFallback()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: String(error) }))
        return true
      }

      // Step 2: Request permission synchronously BEFORE any await
      cachedHandle.requestPermission({ mode: 'readwrite' })
        .then((permission: PermissionState) => {
          if (permission === 'granted') {
            sendResponse({ success: true, data: { permission: 'granted' } })
          } else {
            sendResponse({ success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' })
          }
        })
        .catch((error: Error) => {
          sendResponse({ success: false, error: String(error) })
        })
      return true

    case MessageType.OFFSCREEN_GET_FOLDER_HANDLE:
      getFolderHandle()
        .then(handle => sendResponse({ success: true, data: handle } as MessageResponse))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_SAVE_FOLDER_HANDLE:
      const savePayload = message.payload as { handle: FileSystemDirectoryHandle }
      if (!savePayload?.handle) {
        sendResponse({ success: false, error: 'No handle provided' })
        return true
      }
      saveFolderHandle(savePayload.handle)
        .then(() => sendResponse({ success: true } as MessageResponse))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_LIST_VERSIONS:
      handleListVersions()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_READ_BACKUP:
      handleReadBackup(message.payload as { filename: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_SAVE_API_CONFIG:
      handleSaveApiConfig(message.payload as { config: VisionApiConfig })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_READ_API_CONFIG:
      handleReadApiConfig()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    default:
      // Skip non-OFFSCREEN_* messages - they are handled by service worker
      if (!message.type.startsWith('OFFSCREEN_')) {
        // Don't respond, let service worker handle it
        return false
      }
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
  }

  return true
})

// Handler functions

async function handleSync(payload: { backupData: FullBackupData; version: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Cache handle for future synchronous permission requests
  cacheFolderHandle(handle)

  // Check permission first
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    // Try to request permission (offscreen has user interaction context)
    const restored = await requestFolderPermission(handle, 'readwrite')
    if (restored !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' }
    }
  }

  try {
    await syncToLocalFolder(payload.backupData, handle, payload.version)
    return { success: true } as MessageResponse
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen sync failed:', error)
    return { success: false, error: String(error) }
  }
}

async function handleBackup(payload: { backupData: FullBackupData; version: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Check permission first
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    const restored = await requestFolderPermission(handle, 'readwrite')
    if (restored !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' }
    }
  }

  try {
    await syncToLocalFolder(payload.backupData, handle, payload.version)
    return { success: true } as MessageResponse
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen backup failed:', error)
    return { success: false, error: String(error) }
  }
}

async function handleSaveImage(payload: { promptId: string; data: number[]; originalFilename?: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Check permission
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    const restored = await requestFolderPermission(handle, 'readwrite')
    if (restored !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' }
    }
  }

  try {
    const ext = payload.originalFilename?.split('.').pop()?.toLowerCase() || 'jpg'
    const finalExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg'

    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
    const filename = `${payload.promptId}.${finalExt}`
    const fileHandle = await imagesDir.getFileHandle(filename, { create: true })

    const uint8Array = new Uint8Array(payload.data)
    const mimeType = finalExt === 'png' ? 'image/png'
      : finalExt === 'webp' ? 'image/webp'
      : finalExt === 'gif' ? 'image/gif'
      : 'image/jpeg'
    const imageBlob = new Blob([uint8Array], { type: mimeType })

    const writable = await fileHandle.createWritable()
    await writable.write(imageBlob)
    await writable.close()

    const relativePath = `${IMAGE_DIR_NAME}/${filename}`
    return { success: true, data: { relativePath } } as MessageResponse
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen save image failed:', error)
    if (error instanceof Error && error.name === 'NotFoundError') {
      return { success: false, error: 'FOLDER_NOT_FOUND' }
    }
    return { success: false, error: 'WRITE_FAILED' }
  }
}

async function handleReadImage(payload: { relativePath: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
    const filename = payload.relativePath.split('/').pop() || payload.relativePath
    const fileHandle = await imagesDir.getFileHandle(filename)
    const file = await fileHandle.getFile()

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const dataArray = Array.from(uint8Array)
    const mimeType = file.type || 'image/jpeg'

    return { success: true, data: { dataArray, mimeType } } as MessageResponse
  } catch (error) {
    console.warn('[Oh My Prompt] Offscreen read image failed:', payload.relativePath, error)
    return { success: false, error: 'FILE_NOT_FOUND' }
  }
}

async function handleDeleteImage(payload: { promptId: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
    for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
      const filename = `${payload.promptId}.${ext}`
      try {
        await imagesDir.removeEntry(filename)
      } catch {
        // File doesn't exist with this extension
      }
    }
    return { success: true } as MessageResponse
  } catch {
    // images directory doesn't exist
    return { success: true } as MessageResponse
  }
}

async function handleCheckPermission(): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: true, data: { hasFolder: false, permission: null } }
  }

  // Cache handle for future synchronous permission requests
  cacheFolderHandle(handle)

  const permission = await checkFolderPermission(handle, 'readwrite')
  return { success: true, data: { hasFolder: true, permission, folderName: handle.name } }
}

async function handleListVersions(): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const versions = await listBackupVersions(handle)
    return { success: true, data: versions }
  } catch (error) {
    return { success: false, error: 'READ_FAILED' }
  }
}

async function handleReadBackup(payload: { filename: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const userData = await readBackupFile(handle, payload.filename)
    if (!userData) {
      return { success: false, error: 'INVALID_BACKUP' }
    }
    return { success: true, data: userData }
  } catch (error) {
    return { success: false, error: 'READ_FAILED' }
  }
}

async function handleSaveApiConfig(payload: { config: VisionApiConfig }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    await syncApiConfigToFolder(payload.config, handle)
    return { success: true } as MessageResponse
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen save API config failed:', error)
    return { success: false, error: String(error) }
  }
}

async function handleReadApiConfig(): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const config = await readApiConfigFromFolder(handle)
    return { success: true, data: config }
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen read API config failed:', error)
    return { success: false, error: String(error) }
  }
}