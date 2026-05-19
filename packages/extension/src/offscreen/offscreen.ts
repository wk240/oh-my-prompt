/**
 * Offscreen Document for File System Access API operations
 *
 * Purpose: Maintain a persistent context for file system operations
 * that requires user interaction context (permission requests).
 *
 * Service Worker cannot request permissions because it lacks DOM/user interaction context.
 * Offscreen document provides this context, reducing permission loss frequency.
 */

import { MessageType, MessageResponse } from '@oh-my-prompt/shared/messages'
import type { VisionApiConfig, ProviderConfigsStorage } from '@oh-my-prompt/shared/types'
import type { FullBackupData } from '../lib/sync/file-sync'
import { getFolderHandle, saveFolderHandle, checkFolderPermission, requestFolderPermission } from '../lib/sync/indexeddb'
import { syncToLocalFolder, listBackupVersions, readBackupFile } from '../lib/sync/file-sync'
import { syncApiConfigToFolder, readApiConfigFromFolder, syncProviderConfigsToFolder, readProviderConfigsFromFolder } from '../lib/sync/api-config-sync'
import { IMAGE_DIR_NAME, ALLOWED_IMAGE_EXTENSIONS } from '@oh-my-prompt/shared/constants'


// Cache folder handle for synchronous access during permission requests
// IndexedDB operations are async, so we cache the handle for gesture-preserving permission requests
let _cachedFolderHandle: FileSystemDirectoryHandle | null = null

// Track initialization completion status (synchronous check)
let _initComplete = false

// Track initialization promise
let _initPromise: Promise<void> | null = null

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
 * Initialize offscreen document - pre-cache folder handle
 * This must complete before permission requests can work with user gesture
 *
 * We retry initialization multiple times to handle edge cases:
 * - IndexedDB may not be ready immediately after document creation
 * - Service Worker may restart during initialization
 */
async function initialize(): Promise<void> {
  const maxRetries = 5
  const retryDelay = 1000

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const handle = await getFolderHandle()
      if (handle) {
        cacheFolderHandle(handle)
        console.log(`[Oh My Prompt] Offscreen initialized, handle cached: "${handle.name}" (attempt ${attempt})`)
        return
      } else {
        // No handle in IndexedDB - folder not configured
        console.log(`[Oh My Prompt] Init attempt ${attempt}: No backup folder configured yet`)
      }
    } catch (err) {
      console.warn(`[Oh My Prompt] Init attempt ${attempt} failed with error:`, err)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }

  }

// Start initialization immediately
_initPromise = initialize().then(() => {
  _initComplete = true
}).catch(() => {
  _initComplete = true // Still mark as complete even on failure
})

/**
 * Fallback permission request when handle not cached
 * WARNING: This breaks user gesture due to async IndexedDB operation
 * Should only be used when handle couldn't be cached beforehand
 */
async function handleRequestPermissionFallback(): Promise<MessageResponse> {
  console.log('[Oh My Prompt] Permission request fallback - retrieving handle from IndexedDB')
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  // Cache for future requests
  cacheFolderHandle(handle)

  // Check permission first
  const currentPermission = await handle.queryPermission({ mode: 'readwrite' })
  if (currentPermission === 'granted') {
    return { success: true, data: { permission: 'granted' } }
  }

  // Request permission (may fail due to gesture loss)
  const permission = await requestFolderPermission(handle, 'readwrite')
  if (permission === 'granted') {
    return { success: true, data: { permission: 'granted' } }
  }
  return { success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'GESTURE_LOST' }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  switch (message.type) {
    // Handle PING for readiness check
    case MessageType.OFFSCREEN_PING:
      // Check init completion synchronously first (after init finishes, promise may be null)
      if (_initComplete) {
        const handle = getCachedFolderHandle()
        if (handle) {
          console.log('[Oh My Prompt] PING: init complete, handle cached')
          sendResponse({ success: true, data: 'pong', handleCached: true })
        } else {
          console.log('[Oh My Prompt] PING: init complete, no handle (folder not configured)')
          sendResponse({ success: true, data: 'pong', handleCached: false })
        }
        return true
      }

      // Init still running - wait for completion
      _initPromise?.then(() => {
        const handle = getCachedFolderHandle()
        if (handle) {
          console.log('[Oh My Prompt] PING: init complete, handle cached')
          sendResponse({ success: true, data: 'pong', handleCached: true })
        } else {
          console.log('[Oh My Prompt] PING: init complete, no handle (folder not configured)')
          sendResponse({ success: true, data: 'pong', handleCached: false })
        }
      }).catch(() => {
        console.warn('[Oh My Prompt] PING: init failed')
        sendResponse({ success: true, data: 'pong', handleCached: false })
      })
      return true

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
      // Chrome propagates user gesture through message passing, but only if requestPermission()
      // is called in the SYNC execution path BEFORE any Promise.then() callback
      //
      // Key insight: requestPermission() returns 'granted' immediately if permission already granted
      // So we can call it directly without checking first - no dialog for already-granted permission
      console.log('[Oh My Prompt] Offscreen received permission request')

      // Step 1: Get cached handle synchronously (no await)
      const cachedHandle = getCachedFolderHandle()

      if (!cachedHandle) {
        // No cached handle - need async retrieval, gesture will break
        console.log('[Oh My Prompt] No cached handle, using fallback path')
        handleRequestPermissionFallback()
          .then(result => {
            console.log('[Oh My Prompt] Fallback permission result:', result.success ? 'granted' : result.error)
            sendResponse(result)
          })
          .catch(error => {
            console.warn('[Oh My Prompt] Fallback error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true
      }

      // Step 2: Request permission DIRECTLY (not via queryPermission first)
      // This preserves user gesture because requestPermission is called in sync path
      // If permission already granted, returns 'granted' immediately without dialog
      console.log('[Oh My Prompt] Calling requestPermission directly for:', cachedHandle.name)
      cachedHandle.requestPermission({ mode: 'readwrite' })
        .then((permission: PermissionState) => {
          console.log('[Oh My Prompt] Permission result:', permission)
          if (permission === 'granted') {
            sendResponse({ success: true, data: { permission: 'granted' } })
          } else {
            sendResponse({ success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' })
          }
        })
        .catch((error: Error) => {
          // SecurityError expected when user gesture lost (extension opened via sidebar panel)
          // This is normal - user needs to click restore button explicitly
          const errorName = error.name || 'Unknown'
          console.warn('[Oh My Prompt] Permission request failed:', errorName)
          sendResponse({ success: false, error: 'GESTURE_LOST' })
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

    case MessageType.OFFSCREEN_SAVE_PROVIDER_CONFIGS:
      handleSaveProviderConfigs(message.payload as { storage: ProviderConfigsStorage })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_READ_PROVIDER_CONFIGS:
      handleReadProviderConfigs()
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
    // Don't auto-request permission - requires user gesture
    // Return specific error so caller can prompt user to restore permission
    return { success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' }
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

  // Cache handle for future synchronous permission requests
  cacheFolderHandle(handle)

  // Check permission first
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    // Don't auto-request permission - requires user gesture
    // Return specific error so caller can prompt user to restore permission
    return { success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' }
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

  // Cache handle for future synchronous permission requests
  cacheFolderHandle(handle)

  // Check permission
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    // Don't auto-request permission - requires user gesture
    return { success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' }
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

async function handleSaveProviderConfigs(payload: { storage: ProviderConfigsStorage }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    await syncProviderConfigsToFolder(payload.storage, handle)
    return { success: true } as MessageResponse
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen save provider configs failed:', error)
    return { success: false, error: String(error) }
  }
}

async function handleReadProviderConfigs(): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const storage = await readProviderConfigsFromFolder(handle)
    return { success: true, data: storage }
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen read provider configs failed:', error)
    return { success: false, error: String(error) }
  }
}