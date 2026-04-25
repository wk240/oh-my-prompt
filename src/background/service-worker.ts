import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings, UserData } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { saveFolderHandle } from '../lib/sync/indexeddb'
import { getSyncStatus, triggerSync, restorePermission } from '../lib/sync/sync-manager'
import { checkForUpdate, getUpdateStatus, clearUpdateStatus, type UpdateStatus } from '../lib/version-checker'
import '../lib/migrations/v1.0' // Register migrations

console.log('[Oh My Prompt] Service Worker started')

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

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)