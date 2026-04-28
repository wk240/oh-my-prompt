import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings, UserData } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { saveFolderHandle, getFolderHandle, checkFolderPermission, requestFolderPermission } from '../lib/sync/indexeddb'
import { getSyncStatus, triggerSync, restorePermission } from '../lib/sync/sync-manager'
import { checkForUpdate, getUpdateStatus, clearUpdateStatus, type UpdateStatus } from '../lib/version-checker'
import { IMAGE_DIR_NAME, ALLOWED_IMAGE_EXTENSIONS, CAPTURED_IMAGE_STORAGE_KEY } from '../shared/constants'
import '../lib/migrations/v1.0' // Register migrations

console.log('[Oh My Prompt] Service Worker started')

// Phase 9: Create context menu on extension install (D-06)
chrome.runtime.onInstalled.addListener(() => {
  // Type assertion for icons property (supported in Chrome 88+, not in @types/chrome yet)
  chrome.contextMenus.create({
    id: 'convert-to-prompt',
    title: '转提示词',
    icons: { '16': 'assets/icon-16.png' }, // D-04: Lightning bolt icon matching extension brand
    contexts: ['image'], // D-02, MENU-02: Only appear on image elements
    targetUrlPatterns: ['http://*/*', 'https://*/*'] // D-03, D-07: Filter to http/https URLs only
  } as chrome.contextMenus.CreateProperties & { icons: Record<string, string> }, () => {
    if (chrome.runtime.lastError) {
      console.error('[Oh My Prompt] Context menu creation error:', chrome.runtime.lastError)
    } else {
      console.log('[Oh My Prompt] Context menu created successfully')
    }
  })
})

const storageManager = StorageManager.getInstance()

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    console.log('[Oh My Prompt] Received message:', message.type)

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      case MessageType.GET_STORAGE:
        storageManager.getData()
          .then(data => sendResponse({ success: true, data } as MessageResponse<StorageSchema>))
          .catch(error => {
            console.error('[Oh My Prompt] GET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage retrieval failed' })
          })
        return true // Required for async response

      case MessageType.SET_STORAGE:
        console.log('[Oh My Prompt] SET_STORAGE payload:', message.payload)
        if (!message.payload) {
          console.error('[Oh My Prompt] SET_STORAGE: No payload provided')
          sendResponse({ success: false, error: 'No payload provided' })
          return true
        }

        // Merge with existing settings to preserve syncEnabled, etc.
        storageManager.getData()
          .then(existingData => {
            const payload = message.payload as StorageSchema
            // Preserve existing settings if payload doesn't have full settings
            const mergedSettings: SyncSettings = {
              ...existingData.settings,
              ...payload.settings
            }

            const mergedData: StorageSchema = {
              version: payload.version,
              userData: payload.userData,
              settings: mergedSettings,
              _migrationComplete: payload._migrationComplete ?? existingData._migrationComplete
            }

            return storageManager.saveData(mergedData).then(() => mergedData.userData)
          })
          .then((userData: UserData) => {
            console.log('[Oh My Prompt] SET_STORAGE: Save successful')
            // Trigger sync and wait for completion before responding
            return triggerSync(userData).then(syncSuccess => {
              if (!syncSuccess) {
                console.warn('[Oh My Prompt] Sync failed, notifying UI')
                chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
                  tabs.forEach(tab => {
                    if (tab.id) {
                      chrome.tabs.sendMessage(tab.id, { type: MessageType.SYNC_FAILED })
                    }
                  })
                })
              }
              // Return sync status in response so caller knows the result
              sendResponse({ success: true, data: { syncSuccess } } as MessageResponse)
            })
          })
          .catch(error => {
            console.error('[Oh My Prompt] SET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      case MessageType.INSERT_PROMPT:
        // Phase 2: Return success for content script acknowledgment
        // Phase 3 will add storage retrieval
        sendResponse({ success: true, data: message.payload } as MessageResponse)
        break

      case MessageType.SAVE_FOLDER_HANDLE:
        // Save handle from content script (backup already done in content script)
        const handle = message.payload?.handle as FileSystemDirectoryHandle | undefined
        const folderName = message.payload?.folderName as string | undefined
        const lastSyncTime = message.payload?.lastSyncTime as number | undefined
        if (!handle) {
          sendResponse({ success: false, error: 'No handle provided' })
          return true
        }
        saveFolderHandle(handle)
          .then(() => storageManager.updateSettings({
            lastSyncTime: lastSyncTime || Date.now()
          }))
          .then(() => getSyncStatus())
          .then(status => {
            // Update status with folder name if provided
            if (folderName && status) {
              status.folderName = folderName
            }
            sendResponse({ success: true, data: status } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt] SAVE_FOLDER_HANDLE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.GET_SYNC_STATUS:
        // Get current sync status for UI display
        getSyncStatus()
          .then(status => sendResponse({ success: true, data: status } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] GET_SYNC_STATUS error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.GET_FOLDER_HANDLE:
        // Get folder handle for content script (IndexedDB is context-isolated)
        // NOTE: FileSystemDirectoryHandle cannot be passed cross-origin via message
        // This is kept for backward compatibility but content scripts should use SAVE_IMAGE instead
        getFolderHandle()
          .then(handle => sendResponse({ success: true, data: handle } as MessageResponse<FileSystemDirectoryHandle | null>))
          .catch(error => {
            console.error('[Oh My Prompt] GET_FOLDER_HANDLE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SAVE_IMAGE:
        // Save image to folder (content script cannot access FileSystemDirectoryHandle cross-origin)
        // Note: ArrayBuffer cannot be passed cross-origin, so we use plain number array
        const saveImagePayload = message.payload as { promptId: string; data: number[]; originalFilename?: string }
        if (!saveImagePayload || !saveImagePayload.promptId || !saveImagePayload.data) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        console.log('[Oh My Prompt] SAVE_IMAGE: promptId:', saveImagePayload.promptId, 'data array length:', saveImagePayload.data.length)
        getFolderHandle()
          .then(async (handle) => {
            if (!handle) {
              return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
            }
            // Check permission
            const permission = await checkFolderPermission(handle, 'readwrite')
            if (permission === 'denied') {
              return { success: false, error: 'PERMISSION_DENIED' }
            }
            if (permission === 'prompt') {
              const restored = await requestFolderPermission(handle, 'readwrite')
              if (restored !== 'granted') {
                return { success: false, error: 'PERMISSION_DENIED' }
              }
            }
            // Get extension
            const ext = saveImagePayload.originalFilename?.split('.').pop()?.toLowerCase() || 'jpg'
            const finalExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg'
            // Create images directory and save file
            try {
              const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
              const filename = `${saveImagePayload.promptId}.${finalExt}`
              const fileHandle = await imagesDir.getFileHandle(filename, { create: true })
              // Convert plain array to Uint8Array and create Blob
              const uint8Array = new Uint8Array(saveImagePayload.data)
              const mimeType = finalExt === 'png' ? 'image/png'
                : finalExt === 'webp' ? 'image/webp'
                : finalExt === 'gif' ? 'image/gif'
                : 'image/jpeg'
              const imageBlob = new Blob([uint8Array], { type: mimeType })
              console.log('[Oh My Prompt] Writing blob, size:', imageBlob.size, 'type:', imageBlob.type, 'uint8Array length:', uint8Array.length)
              const writable = await fileHandle.createWritable()
              await writable.write(imageBlob)
              await writable.close()
              const relativePath = `${IMAGE_DIR_NAME}/${filename}`
              console.log('[Oh My Prompt] Image saved via service worker:', relativePath)
              return { success: true, data: { relativePath } }
            } catch (dirError) {
              console.error('[Oh My Prompt] Save image failed:', dirError)
              if (dirError instanceof Error && dirError.name === 'NotFoundError') {
                return { success: false, error: 'FOLDER_NOT_FOUND' }
              }
              return { success: false, error: 'WRITE_FAILED' }
            }
          })
          .then(result => sendResponse(result as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] SAVE_IMAGE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.READ_IMAGE:
        // Read image from folder and return as data array (content script cannot access FileSystemDirectoryHandle cross-origin)
        const readImagePayload = message.payload as { relativePath: string }
        if (!readImagePayload || !readImagePayload.relativePath) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        getFolderHandle()
          .then(async (handle) => {
            if (!handle) {
              return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
            }
            try {
              const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
              const filename = readImagePayload.relativePath.split('/').pop() || readImagePayload.relativePath
              const fileHandle = await imagesDir.getFileHandle(filename)
              const file = await fileHandle.getFile()
              // Convert blob to plain array for cross-origin messaging
              const arrayBuffer = await file.arrayBuffer()
              const uint8Array = new Uint8Array(arrayBuffer)
              const dataArray = Array.from(uint8Array)
              const mimeType = file.type || 'image/jpeg'
              console.log('[Oh My Prompt] Image read via service worker:', filename, 'size:', file.size, 'type:', mimeType)
              return { success: true, data: { dataArray, mimeType } }
            } catch (error) {
              console.warn('[Oh My Prompt] Read image failed:', readImagePayload.relativePath, error)
              return { success: false, error: 'FILE_NOT_FOUND' }
            }
          })
          .then(result => sendResponse(result as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] READ_IMAGE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.DELETE_IMAGE:
        // Delete image from folder (content script cannot access FileSystemDirectoryHandle cross-origin)
        const deleteImagePayload = message.payload as { promptId: string }
        if (!deleteImagePayload || !deleteImagePayload.promptId) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        getFolderHandle()
          .then(async (handle) => {
            if (!handle) {
              return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
            }
            try {
              const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
              for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
                const filename = `${deleteImagePayload.promptId}.${ext}`
                try {
                  await imagesDir.removeEntry(filename)
                  console.log('[Oh My Prompt] Image deleted via service worker:', filename)
                } catch {
                  // File doesn't exist with this extension, try next
                }
              }
              return { success: true }
            } catch {
              // images directory doesn't exist - nothing to delete
              return { success: true }
            }
          })
          .then(result => sendResponse(result as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] DELETE_IMAGE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SET_UNSYNCED_FLAG:
        // Set hasUnsyncedChanges flag after reorder operations
        storageManager.updateSettings({ hasUnsyncedChanges: true })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] SET_UNSYNCED_FLAG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.OPEN_BACKUP_PAGE:
        // Open backup page in a new tab with source tab ID
        const sourceTabId = _sender.tab?.id
        const url = sourceTabId
          ? `src/popup/backup.html?sourceTabId=${sourceTabId}`
          : 'src/popup/backup.html'
        chrome.tabs.create({ url: chrome.runtime.getURL(url) })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_BACKUP_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open backup page' })
          })
        return true // Required for async response

      case MessageType.REFRESH_DATA:
        // Broadcast refresh to all content scripts (handled by tabs.sendMessage)
        // This is just a confirmation from backup page
        sendResponse({ success: true } as MessageResponse)
        break

      case MessageType.CHECK_UPDATE:
        // Manual update check triggered from popup (no badge notification)
        checkForUpdate()
          .then(status => {
            sendResponse({ success: true, data: status } as MessageResponse<UpdateStatus>)
          })
          .catch(error => {
            console.error('[Oh My Prompt] CHECK_UPDATE error:', error)
            sendResponse({ success: false, error: 'Failed to check for updates' })
          })
        return true // Required for async response

      case MessageType.GET_UPDATE_STATUS:
        // Get stored update status for popup display
        getUpdateStatus()
          .then(status => sendResponse({ success: true, data: status } as MessageResponse<UpdateStatus | null>))
          .catch(error => {
            console.error('[Oh My Prompt] GET_UPDATE_STATUS error:', error)
            sendResponse({ success: false, error: 'Failed to get update status' })
          })
        return true // Required for async response

      case MessageType.CLEAR_UPDATE_STATUS:
        // Clear update notification (user dismissed)
        clearUpdateStatus()
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] CLEAR_UPDATE_STATUS error:', error)
            sendResponse({ success: false, error: 'Failed to clear update status' })
          })
        return true // Required for async response

      case MessageType.OPEN_EXTENSIONS:
        // Open Chrome extensions page (cannot use window.open in content script)
        chrome.tabs.create({ url: 'chrome://extensions' })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_EXTENSIONS error:', error)
            sendResponse({ success: false, error: 'Failed to open extensions page' })
          })
        return true // Required for async response

      case MessageType.EXPORT_DATA:
        // Export data as JSON file download using data URL (service worker doesn't support blob URLs)
        const exportPayload = message.payload as { version: string; userData: { prompts: unknown[]; categories: unknown[] }; settings: unknown }
        const exportFilename = 'oh-my-prompt.json'
        const exportJson = JSON.stringify(exportPayload, null, 2)
        const exportDataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(exportJson)}`
        chrome.downloads.download({
          url: exportDataUrl,
          filename: exportFilename,
          saveAs: true
        })
          .then(() => {
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt] EXPORT_DATA error:', error)
            sendResponse({ success: false, error: 'Failed to download file' })
          })
        return true // Required for async response

      case MessageType.DISMISS_BACKUP_WARNING:
        // User dismissed backup warning - save preference
        storageManager.updateSettings({ dismissedBackupWarning: true })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] DISMISS_BACKUP_WARNING error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.RESTORE_PERMISSION:
        // Restore folder permission after extension update
        restorePermission()
          .then(result => sendResponse({ success: result.success, error: result.error } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] RESTORE_PERMISSION error:', error)
            sendResponse({ success: false, error: 'Failed to restore permission' })
          })
        return true // Required for async response

      case MessageType.SET_SETTINGS_ONLY:
        // Update settings only, no backup trigger (for language toggle)
        const settingsPayload = message.payload as { settings: SyncSettings }
        if (!settingsPayload || !settingsPayload.settings) {
          sendResponse({ success: false, error: 'No settings provided' })
          return true
        }
        storageManager.updateSettings(settingsPayload.settings)
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] SET_SETTINGS_ONLY error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)

// Phase 9: Handle context menu click - capture image URL (MENU-03, D-05)
chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === 'convert-to-prompt') {
    if (!info.srcUrl) {
      console.warn('[Oh My Prompt] No srcUrl in context menu click data')
      return
    }

    // Double-check URL type (targetUrlPatterns should handle this, but validate defensively)
    if (!info.srcUrl.startsWith('http://') && !info.srcUrl.startsWith('https://')) {
      console.warn('[Oh My Prompt] Invalid URL type (not http/https):', info.srcUrl)
      return
    }

    // Store captured URL for Phase 11 Vision API processing (D-05, D-08)
    chrome.storage.local.set({
      [CAPTURED_IMAGE_STORAGE_KEY]: {
        url: info.srcUrl,
        capturedAt: Date.now(),
        tabId: tab?.id // Store tab ID for Phase 12 insert vs clipboard decision
      }
    })

    console.log('[Oh My Prompt] Captured image URL:', info.srcUrl, 'from tab:', tab?.id)
  }
})