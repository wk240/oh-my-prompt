import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { saveFolderHandle } from '../lib/sync/indexeddb'
import { getSyncStatus } from '../lib/sync/sync-manager'
import '../lib/migrations/v1.0' // Register migrations

console.log('[Oh My Prompt Script] Service Worker started')

const storageManager = StorageManager.getInstance()

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    console.log('[Oh My Prompt Script] Received message:', message.type)

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      case MessageType.GET_STORAGE:
        storageManager.getData()
          .then(data => sendResponse({ success: true, data } as MessageResponse<StorageSchema>))
          .catch(error => {
            console.error('[Oh My Prompt Script] GET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage retrieval failed' })
          })
        return true // Required for async response

      case MessageType.SET_STORAGE:
        console.log('[Oh My Prompt Script] SET_STORAGE payload:', message.payload)
        if (!message.payload) {
          console.error('[Oh My Prompt Script] SET_STORAGE: No payload provided')
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

            return storageManager.saveData(mergedData)
          })
          .then(() => {
            console.log('[Oh My Prompt Script] SET_STORAGE: Save successful')
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt Script] SET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      case MessageType.INSERT_PROMPT:
        // Phase 2: Return success for content script acknowledgment
        // Phase 3 will add storage retrieval
        sendResponse({ success: true, data: message.payload } as MessageResponse)
        break

      case MessageType.OPEN_SETTINGS:
        // Open settings page in a new tab (bypasses ad blockers)
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt Script] OPEN_SETTINGS error:', error)
            sendResponse({ success: false, error: 'Failed to open settings' })
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
            console.error('[Oh My Prompt Script] SAVE_FOLDER_HANDLE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.GET_SYNC_STATUS:
        // Get current sync status for UI display
        getSyncStatus()
          .then(status => sendResponse({ success: true, data: status } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt Script] GET_SYNC_STATUS error:', error)
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
            console.error('[Oh My Prompt Script] OPEN_BACKUP_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open backup page' })
          })
        return true // Required for async response

      case MessageType.REFRESH_DATA:
        // Broadcast refresh to all content scripts (handled by tabs.sendMessage)
        // This is just a confirmation from backup page
        sendResponse({ success: true } as MessageResponse)
        break

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)