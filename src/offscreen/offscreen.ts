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
import type { UserData, VisionApiConfig } from '../shared/types'
import { getFolderHandle, saveFolderHandle, checkFolderPermission, requestFolderPermission } from '../lib/sync/indexeddb'
import { syncToLocalFolder, listBackupVersions, readBackupFile } from '../lib/sync/file-sync'
import { syncApiConfigToFolder, readApiConfigFromFolder } from '../lib/sync/api-config-sync'
import { IMAGE_DIR_NAME, ALLOWED_IMAGE_EXTENSIONS } from '../shared/constants'

console.log('[Oh My Prompt] Offscreen document started')

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Oh My Prompt] Offscreen received message:', message.type)

  switch (message.type) {
    // Handle PING for readiness check
    case MessageType.OFFSCREEN_PING:
      sendResponse({ success: true, data: 'pong' })
      return false

    case MessageType.OFFSCREEN_SYNC:
      handleSync(message.payload as { userData: UserData; version: string })
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case MessageType.OFFSCREEN_BACKUP:
      handleBackup(message.payload as { userData: UserData; version: string })
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
      handleRequestPermission()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: String(error) }))
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
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
  }

  return true
})

// Handler functions

async function handleSync(payload: { userData: UserData; version: string }): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

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
    await syncToLocalFolder(payload.userData, handle, payload.version)
    return { success: true } as MessageResponse
  } catch (error) {
    console.error('[Oh My Prompt] Offscreen sync failed:', error)
    return { success: false, error: String(error) }
  }
}

async function handleBackup(payload: { userData: UserData; version: string }): Promise<MessageResponse> {
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
    await syncToLocalFolder(payload.userData, handle, payload.version)
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
    console.log('[Oh My Prompt] Image saved via offscreen:', relativePath)
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

    console.log('[Oh My Prompt] Image read via offscreen:', filename, 'size:', file.size)
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
        console.log('[Oh My Prompt] Image deleted via offscreen:', filename)
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

  const permission = await checkFolderPermission(handle, 'readwrite')
  return { success: true, data: { hasFolder: true, permission, folderName: handle.name } }
}

async function handleRequestPermission(): Promise<MessageResponse> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  const permission = await requestFolderPermission(handle, 'readwrite')
  if (permission === 'granted') {
    return { success: true, data: { permission: 'granted' } }
  }
  return { success: false, error: permission === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_PROMPT' }
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