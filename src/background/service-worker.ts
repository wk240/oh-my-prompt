import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings, UserData, VisionApiConfig, InsertPromptPayload, InsertResultPayload, SaveTemporaryPromptPayload, Prompt } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { saveFolderHandle, getFolderHandle, checkFolderPermission, requestFolderPermission } from '../lib/sync/indexeddb'
import { getSyncStatus, triggerSync, restorePermission, initialSync } from '../lib/sync/sync-manager'
import { syncApiConfigToFolder } from '../lib/sync/api-config-sync'
import { checkForUpdate, getUpdateStatus, clearUpdateStatus, type UpdateStatus } from '../lib/version-checker'
import { executeVisionApiCall, classifyApiError, getLanguagePreference } from '../lib/vision-api'
import { asyncCompressImageFromUrl } from '../lib/image-utils'
import { IMAGE_DIR_NAME, ALLOWED_IMAGE_EXTENSIONS, CAPTURED_IMAGE_STORAGE_KEY, VISION_API_CONFIG_STORAGE_KEY } from '../shared/constants'
import '../lib/migrations/register' // Register all migrations

console.log('[Oh My Prompt] Service Worker started')

// Create context menu on startup (survives service worker restarts)
function createContextMenu(): void {
  chrome.contextMenus.create({
    id: 'convert-to-prompt',
    title: '用 OhMyPrompt 将此图片转为Prompt',
    contexts: ['image'], // D-02, MENU-02: Only appear on image elements
    targetUrlPatterns: ['http://*/*', 'https://*/*'] // D-03, D-07: Filter to http/https URLs only
  }, () => {
    if (chrome.runtime.lastError) {
      // Chrome runtime.lastError has message property
      const errorMsg = chrome.runtime.lastError.message
      // Ignore duplicate/already exists errors on restart
      if (errorMsg && (errorMsg.includes('already exists') || errorMsg.includes('duplicate'))) {
        console.log('[Oh My Prompt] Context menu already exists (service worker restarted)')
      } else {
        console.error('[Oh My Prompt] Context menu creation error:', errorMsg || JSON.stringify(chrome.runtime.lastError))
      }
    } else {
      console.log('[Oh My Prompt] Context menu created successfully')
    }
  })
}

// Create on startup
createContextMenu()

// Run initial sync on startup (restores data from backup folder including encrypted API config)
initialSync().catch(err => console.error('[Oh My Prompt] Initial sync error:', err))

// Also create on install (for clean install)
chrome.runtime.onInstalled.addListener(() => {
  createContextMenu()

  // Set side panel to open on action click (Chrome 116+)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Oh My Prompt] Side panel behavior error:', error))

  // Run initial sync on install (restores data from backup folder)
  initialSync().catch(err => console.error('[Oh My Prompt] Initial sync on install error:', err))
})

// Open side panel when extension icon is clicked (fallback for older Chrome versions)
chrome.action.onClicked.addListener((tab) => {
  // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
  if (tab.id !== undefined && tab.id >= 0) {
    chrome.sidePanel.open({ tabId: tab.id })
      .catch((error) => console.error('[Oh My Prompt] Side panel open error:', error))
  }
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
            return triggerSync(userData).then(syncResult => {
              if (!syncResult.success) {
                console.warn('[Oh My Prompt] Sync failed:', syncResult.error?.type, syncResult.error?.message)

                // Notify UI about sync failure with error details
                chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
                  tabs.forEach(tab => {
                    // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
                    if (tab.id !== undefined && tab.id >= 0) {
                      chrome.tabs.sendMessage(tab.id, {
                        type: MessageType.SYNC_FAILED,
                        payload: {
                          errorType: syncResult.error?.type,
                          errorMessage: syncResult.error?.message
                        }
                      })
                    }
                  })
                })
              }
              // Return sync status and error info in response
              sendResponse({
                success: true,
                data: {
                  syncSuccess: syncResult.success,
                  syncError: syncResult.error
                }
              } as MessageResponse)
            })
          })
          .catch(error => {
            console.error('[Oh My Prompt] SET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      case MessageType.INSERT_PROMPT:
        // Phase 12: Forward INSERT_PROMPT to content script (D-02)
        const insertPayload = message.payload as InsertPromptPayload
        if (!insertPayload || !insertPayload.prompt || !insertPayload.tabId) {
          sendResponse({ success: false, error: 'Invalid payload: prompt and tabId required' })
          return true
        }

        // Forward to content script on Lovart tab
        chrome.tabs.sendMessage(insertPayload.tabId, {
          type: MessageType.INSERT_PROMPT_TO_CS,
          payload: { prompt: insertPayload.prompt }
        })
          .then((response: InsertResultPayload | undefined) => {
            if (response && response.success) {
              sendResponse({ success: true })
            } else {
              sendResponse({
                success: false,
                error: response?.error || 'Insert failed'
              })
            }
          })
          .catch((error) => {
            console.error('[Oh My Prompt] INSERT_PROMPT forwarding error:', error)
            sendResponse({ success: false, error: 'Tab not reachable' })
          })
        return true // Required for async response

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

      case MessageType.OPEN_SETTINGS_PAGE:
        // Open settings.html for settings center (called from dropdown or VisionModal)
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_SETTINGS_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open settings page' })
          })
        return true // Required for async response

      case MessageType.OPEN_API_CONFIG_PAGE:
        // Open api-config.html from Vision Modal (content script cannot use chrome.tabs)
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/api-config.html') })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_API_CONFIG_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open API config page' })
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

      // Phase 10: API configuration handlers (AUTH-01, AUTH-02, AUTH-04)
      case MessageType.GET_API_CONFIG:
        // Get Vision API configuration from storage
        chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
          .then((result) => {
            const config = result[VISION_API_CONFIG_STORAGE_KEY] as VisionApiConfig | undefined
            sendResponse({ success: true, data: config || null } as MessageResponse<VisionApiConfig | null>)
          })
          .catch(error => {
            console.error('[Oh My Prompt] GET_API_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SET_API_CONFIG:
        // Save Vision API configuration with timestamp
        const apiConfigPayload = message.payload as VisionApiConfig
        if (!apiConfigPayload || !apiConfigPayload.baseUrl || !apiConfigPayload.apiKey || !apiConfigPayload.modelName) {
          sendResponse({ success: false, error: 'Invalid payload: baseUrl, apiKey, and modelName required' })
          return true
        }
        // SECURITY: Log baseUrl and modelName only, never apiKey (AUTH-02, T-10-01)
        console.log('[Oh My Prompt] SET_API_CONFIG: baseUrl=', apiConfigPayload.baseUrl, 'modelName=', apiConfigPayload.modelName)
        const configWithTimestamp: VisionApiConfig = {
          ...apiConfigPayload,
          configuredAt: Date.now()
        }
        chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: configWithTimestamp })
          .then(async () => {
            sendResponse({ success: true } as MessageResponse)

            // Auto-sync encrypted config to backup folder (if configured)
            try {
              const handle = await getFolderHandle()
              if (handle) {
                const encrypted = await syncApiConfigToFolder(configWithTimestamp, handle)
                if (encrypted) {
                  console.log('[Oh My Prompt] API config encrypted and saved to backup folder')
                }
              }
            } catch (encryptError) {
              // Encryption failed, but storage save succeeded - log warning only
              console.warn('[Oh My Prompt] Failed to encrypt API config to folder:', encryptError)
            }
          })
          .catch(error => {
            console.error('[Oh My Prompt] SET_API_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.DELETE_API_CONFIG:
        // Delete Vision API configuration
        chrome.storage.local.remove(VISION_API_CONFIG_STORAGE_KEY)
          .then(() => {
            console.log('[Oh My Prompt] API config deleted')
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt] DELETE_API_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      // Phase 11: Vision API call handler (VISION-01, VISION-02)
      // Now compresses image to base64 before sending to API
      case MessageType.VISION_API_CALL:
        const visionCallPayload = message.payload as { imageUrl: string; retryCount?: number }
        if (!visionCallPayload || !visionCallPayload.imageUrl) {
          sendResponse({ success: false, error: { type: 'network', message: '无效的图片URL', action: 'close' } })
          return true
        }

        // SECURITY: Validate imageUrl starts with http/https (T-11-03)
        const imageUrl = visionCallPayload.imageUrl
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          sendResponse({ success: false, error: { type: 'unsupported_image', message: '图片URL格式无效', action: 'close' } })
          return true
        }

        // Get API config from storage
        chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
          .then(async (result) => {
            const config = result[VISION_API_CONFIG_STORAGE_KEY] as VisionApiConfig | undefined
            if (!config || !config.apiKey) {
              sendResponse({
                success: false,
                error: { type: 'invalid_key', message: 'API Key 未配置', action: 'settings' }
              })
              return
            }

            // Compress image to base64 (reduces payload size for large images)
            const retryCount = visionCallPayload.retryCount || 0
            console.log('[Oh My Prompt] VISION_API_CALL: baseUrl=', config.baseUrl, 'modelName=', config.modelName, 'retryCount=', retryCount)
            console.log('[Oh My Prompt] Compressing image from URL...')

            try {
              // Step 1: Compress image to base64
              const base64Image = await asyncCompressImageFromUrl(imageUrl)
              console.log('[Oh My Prompt] Image compressed successfully')

              // Step 2: Execute Vision API call with base64 data (returns structured result)
              const resultData = await executeVisionApiCall(config, base64Image, 'base64')
              // Get language preference for primary prompt selection
              const languagePreference = await getLanguagePreference()
              const primaryPrompt = languagePreference === 'en' ? resultData.en.prompt : resultData.zh.prompt
              sendResponse({ success: true, data: { prompt: primaryPrompt, fullData: resultData } })
            } catch (apiError) {
              // If compression fails, classify as unsupported_image
              if (apiError instanceof Error && apiError.message.includes('Failed to fetch image')) {
                sendResponse({
                  success: false,
                  error: { type: 'network', message: '图片下载失败，请检查图片链接', action: 'close' }
                })
                return
              }
              if (apiError instanceof Error && apiError.message.includes('Unsupported image type')) {
                sendResponse({
                  success: false,
                  error: { type: 'unsupported_image', message: '图片格式不支持', action: 'close' }
                })
                return
              }
              const classifiedError = classifyApiError(apiError, retryCount)
              sendResponse({ success: false, error: classifiedError })
            }
          })
          .catch((storageError) => {
            console.error('[Oh My Prompt] VISION_API_CALL storage error:', storageError)
            sendResponse({
              success: false,
              error: { type: 'network', message: '读取配置失败', action: 'settings' }
            })
          })
        return true // Required for async response

      // Phase 12: Save to temporary library (independent storage, not in category system)
      // Now also saves image locally if folder is configured
      case MessageType.SAVE_TEMPORARY_PROMPT:
        const savePayload = message.payload as SaveTemporaryPromptPayload
        if (!savePayload || !savePayload.name || !savePayload.content) {
          sendResponse({ success: false, error: 'Invalid payload: name and content required' })
          return true
        }

        storageManager.getData()
          .then(async (data) => {
            // Get or initialize temporary prompts array
            const temporaryPrompts = data.temporaryPrompts || []

            // Calculate order (max order + 1 in temporary prompts)
            const maxOrder = temporaryPrompts.length > 0 ? Math.max(...temporaryPrompts.map(p => p.order)) : -1

            // Add new prompt to temporary library - support bilingual content and description
            const newPrompt: Prompt = {
              id: crypto.randomUUID(),
              name: savePayload.name,
              nameEn: savePayload.nameEn, // English name (optional)
              content: savePayload.content,
              contentEn: savePayload.contentEn, // English content (optional)
              description: savePayload.description, // Chinese analysis (optional)
              descriptionEn: savePayload.descriptionEn, // English analysis (optional)
              categoryId: 'temporary', // Special marker for temporary library
              order: maxOrder + 1,
              remoteImageUrl: savePayload.imageUrl // Optional source URL
            }

            // Try to save image locally if imageUrl provided and folder configured
            let localImageSaved = false
            if (savePayload.imageUrl) {
              try {
                const folderHandle = await getFolderHandle()
                if (folderHandle) {
                  // Check permission
                  const permission = await checkFolderPermission(folderHandle, 'readwrite')
                  if (permission === 'granted' || permission === 'prompt') {
                    // Request permission if needed
                    const actualPermission = permission === 'prompt'
                      ? await requestFolderPermission(folderHandle, 'readwrite')
                      : permission

                    if (actualPermission === 'granted') {
                      // Download image
                      console.log('[Oh My Prompt] Downloading image for local save:', savePayload.imageUrl)
                      const imageResponse = await fetch(savePayload.imageUrl)
                      if (imageResponse.ok) {
                        const imageBlob = await imageResponse.blob()

                        // Determine extension
                        const ext = savePayload.imageUrl.split('.').pop()?.toLowerCase() || 'jpg'
                        const finalExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext)
                          ? (ext === 'jpeg' ? 'jpg' : ext)
                          : 'jpg'

                        // Save to images directory
                        const imagesDir = await folderHandle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
                        const filename = `${newPrompt.id}.${finalExt}`
                        const fileHandle = await imagesDir.getFileHandle(filename, { create: true })

                        // Write image data
                        const writable = await fileHandle.createWritable()
                        await writable.write(imageBlob)
                        await writable.close()

                        // Update prompt with local image path
                        newPrompt.localImage = `${IMAGE_DIR_NAME}/${filename}`
                        localImageSaved = true
                        console.log('[Oh My Prompt] Image saved locally:', newPrompt.localImage)
                      }
                    }
                  }
                }
              } catch (imageError) {
                // Image save failed, but prompt is already saved
                // Keep remoteImageUrl as fallback
                console.warn('[Oh My Prompt] Image save failed:', imageError)
              }
            }

            // Add to temporary prompts array
            temporaryPrompts.push(newPrompt)

            // Save to storage with temporaryPrompts field
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: data.userData,
              settings: data.settings,
              temporaryPrompts
            })

            console.log('[Oh My Prompt] Saved prompt to temporary library:', savePayload.name,
              localImageSaved ? '(image saved locally)' : '(image URL only)')

            // Broadcast REFRESH_DATA to all Lovart tabs so dropdown updates immediately
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true, data: { localImageSaved } })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] SAVE_TEMPORARY_PROMPT error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      // Clear all temporary prompts
      case MessageType.CLEAR_TEMPORARY_PROMPTS:
        storageManager.getData()
          .then(async (data) => {
            // Clear temporary prompts array
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: data.userData,
              settings: data.settings,
              temporaryPrompts: []
            })

            console.log('[Oh My Prompt] Cleared all temporary prompts')

            // Broadcast REFRESH_DATA to all Lovart tabs
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] CLEAR_TEMPORARY_PROMPTS error:', error)
            sendResponse({ success: false, error: 'Storage clear failed' })
          })
        return true // Required for async response

      // Transfer temporary prompt to a category
      case MessageType.TRANSFER_TEMPORARY_PROMPT:
        const transferPayload = message.payload as { promptId: string; targetCategoryId: string }
        if (!transferPayload || !transferPayload.promptId || !transferPayload.targetCategoryId) {
          sendResponse({ success: false, error: 'Invalid payload: promptId and targetCategoryId required' })
          return true
        }

        storageManager.getData()
          .then(async (data) => {
            const temporaryPrompts = data.temporaryPrompts || []
            const prompts = data.userData.prompts

            // Find the prompt in temporary library
            const promptIndex = temporaryPrompts.findIndex(p => p.id === transferPayload.promptId)
            if (promptIndex === -1) {
              sendResponse({ success: false, error: 'Prompt not found in temporary library' })
              return
            }

            const promptToTransfer = temporaryPrompts[promptIndex]

            // Calculate order in target category
            const categoryPrompts = prompts.filter(p => p.categoryId === transferPayload.targetCategoryId)
            const maxOrder = categoryPrompts.length > 0 ? Math.max(...categoryPrompts.map(p => p.order)) : -1

            // Update prompt for transfer
            promptToTransfer.categoryId = transferPayload.targetCategoryId
            promptToTransfer.order = maxOrder + 1

            // Remove from temporary and add to prompts
            temporaryPrompts.splice(promptIndex, 1)
            prompts.push(promptToTransfer)

            // Save to storage
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: { prompts, categories: data.userData.categories },
              settings: data.settings,
              temporaryPrompts
            })

            console.log('[Oh My Prompt] Transferred prompt to category:', promptToTransfer.name, '→', transferPayload.targetCategoryId)

            // Broadcast REFRESH_DATA to all Lovart tabs
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] TRANSFER_TEMPORARY_PROMPT error:', error)
            sendResponse({ success: false, error: 'Transfer failed' })
          })
        return true // Required for async response

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)

// Vision Modal: Handle context menu click - request permission and send message to content script
chrome.contextMenus.onClicked.addListener(async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
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

    // Store image URL for tracking (optional, modal uses imageUrl directly)
    chrome.storage.local.set({
      [CAPTURED_IMAGE_STORAGE_KEY]: {
        url: info.srcUrl,
        capturedAt: Date.now(),
        tabId: tab?.id
      }
    })
      .then(() => {
        // Send message to content script to open modal
        // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
        if (tab?.id !== undefined && tab.id >= 0) {
          chrome.tabs.sendMessage(tab.id, {
            type: MessageType.OPEN_VISION_MODAL,
            payload: {
              imageUrl: info.srcUrl,
              tabId: tab.id
            }
          })
            .then((response) => {
              // Any response means content script handled it (success or error shown in modal)
              if (response?.success) {
                console.log('[Oh My Prompt] Vision modal opened in tab:', tab.id)
              } else {
                // Content script received but had internal error - don't open new tab
                // Error will be shown in the modal or logged
                console.warn('[Oh My Prompt] Vision modal internal error:', response?.error)
              }
            })
            .catch((error) => {
              console.error('[Oh My Prompt] Failed to send message to content script:', error)
              // Only open new tab if content script is completely unreachable
              // This happens on special pages (chrome://, about:, etc.)
              chrome.tabs.create({
                url: chrome.runtime.getURL('src/popup/loading.html')
              })
            })
        } else {
          // No valid tab ID, fallback to loading page
          chrome.tabs.create({
            url: chrome.runtime.getURL('src/popup/loading.html')
          })
        }
      })
      .catch((error) => {
        console.error('[Oh My Prompt] Storage error:', error)
        // Fallback: try to open modal anyway - check tab.id is valid
        if (tab?.id !== undefined && tab.id >= 0) {
          chrome.tabs.sendMessage(tab.id, {
            type: MessageType.OPEN_VISION_MODAL,
            payload: {
              imageUrl: info.srcUrl,
              tabId: tab.id
            }
          })
        } else {
          chrome.tabs.create({
            url: chrome.runtime.getURL('src/popup/loading.html')
          })
        }
      })
  }
})