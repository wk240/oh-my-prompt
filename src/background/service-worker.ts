import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings, UserData, VisionApiConfig, InsertPromptPayload, InsertResultPayload, SaveTemporaryPromptPayload, Prompt } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { saveFolderHandle, getFolderHandle, checkFolderPermission, requestFolderPermission } from '../lib/sync/indexeddb'
import { getSyncStatus, triggerSync, restorePermission } from '../lib/sync/sync-manager'
import { checkForUpdate, getUpdateStatus, clearUpdateStatus, type UpdateStatus } from '../lib/version-checker'
import { executeVisionApiCall, classifyApiError, getLanguagePreference } from '../lib/vision-api'
import { IMAGE_DIR_NAME, ALLOWED_IMAGE_EXTENSIONS, CAPTURED_IMAGE_STORAGE_KEY, VISION_API_CONFIG_STORAGE_KEY } from '../shared/constants'
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
          .then(() => sendResponse({ success: true } as MessageResponse))
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
                error: { type: 'invalid_key', message: 'API Key 未配置', action: 'reconfigure' }
              })
              return
            }

            // Get language preference
            const languagePreference = await getLanguagePreference()

            // Execute Vision API call (security validations inside executeVisionApiCall)
            const retryCount = visionCallPayload.retryCount || 0
            // SECURITY: Log request details without apiKey (T-11-01)
            console.log('[Oh My Prompt] VISION_API_CALL: baseUrl=', config.baseUrl, 'modelName=', config.modelName, 'retryCount=', retryCount)

            try {
              const prompt = await executeVisionApiCall(config, imageUrl, languagePreference)
              sendResponse({ success: true, data: { prompt } })
            } catch (apiError) {
              const classifiedError = classifyApiError(apiError, retryCount)
              sendResponse({ success: false, error: classifiedError })
            }
          })
          .catch((storageError) => {
            console.error('[Oh My Prompt] VISION_API_CALL storage error:', storageError)
            sendResponse({
              success: false,
              error: { type: 'network', message: '读取配置失败', action: 'reconfigure' }
            })
          })
        return true // Required for async response

      // Phase 12: Save to temporary category (D-03, D-04)
      case MessageType.SAVE_TEMPORARY_PROMPT:
        const savePayload = message.payload as SaveTemporaryPromptPayload
        if (!savePayload || !savePayload.name || !savePayload.content) {
          sendResponse({ success: false, error: 'Invalid payload: name and content required' })
          return true
        }

        storageManager.getData()
          .then(async (data) => {
            const categories = data.userData.categories
            const prompts = data.userData.prompts

            // Find or create '临时' category (D-04)
            let tempCategory = categories.find(c => c.name === '临时')
            if (!tempCategory) {
              tempCategory = {
                id: crypto.randomUUID(),
                name: '临时',
                order: categories.length
              }
              categories.push(tempCategory)
              console.log('[Oh My Prompt] Created 临时 category')
            }

            // Calculate order (max order + 1 in temporary category)
            const tempPrompts = prompts.filter(p => p.categoryId === tempCategory!.id)
            const maxOrder = tempPrompts.length > 0 ? Math.max(...tempPrompts.map(p => p.order)) : -1

            // Add new prompt (D-06)
            const newPrompt: Prompt = {
              id: crypto.randomUUID(),
              name: savePayload.name,
              content: savePayload.content,
              categoryId: tempCategory.id,
              order: maxOrder + 1,
              remoteImageUrl: savePayload.imageUrl // Optional source URL
            }
            prompts.push(newPrompt)

            // Save to storage
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: { prompts, categories },
              settings: data.settings
            })

            console.log('[Oh My Prompt] Saved prompt to 临时 category:', savePayload.name)
            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] SAVE_TEMPORARY_PROMPT error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
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

    // Phase 10: Check API config before proceeding (AUTH-03)
    // If no config or apiKey, open settings page for onboarding
    chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
      .then((result) => {
        const config = result[VISION_API_CONFIG_STORAGE_KEY] as VisionApiConfig | undefined
        if (!config || !config.apiKey) {
          // Open settings page for onboarding
          chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
          console.log('[Oh My Prompt] No API config found, opened settings for onboarding')
          return
        }

        // API config exists, proceed with URL capture for Phase 11 Vision API processing (D-05, D-08)
        chrome.storage.local.set({
          [CAPTURED_IMAGE_STORAGE_KEY]: {
            url: info.srcUrl,
            capturedAt: Date.now(),
            tabId: tab?.id // Store tab ID for Phase 12 insert vs clipboard decision
          }
        })
          .then(() => {
            // Phase 11: Open loading page for Vision API processing (D-04)
            chrome.tabs.create({
              url: chrome.runtime.getURL('src/popup/loading.html')
            })
            console.log('[Oh My Prompt] Captured image URL, opened loading page:', info.srcUrl, 'from tab:', tab?.id)
          })
      })
      .catch((error) => {
        console.error('[Oh My Prompt] API config check error:', error)
        // On error, still proceed with URL capture and open loading page (graceful degradation)
        chrome.storage.local.set({
          [CAPTURED_IMAGE_STORAGE_KEY]: {
            url: info.srcUrl,
            capturedAt: Date.now(),
            tabId: tab?.id
          }
        })
          .then(() => {
            chrome.tabs.create({
              url: chrome.runtime.getURL('src/popup/loading.html')
            })
            console.log('[Oh My Prompt] Captured image URL (fallback), opened loading page:', info.srcUrl, 'from tab:', tab?.id)
          })
      })
  }
})