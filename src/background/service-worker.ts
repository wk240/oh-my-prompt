import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { getFolderHandle, saveFolderHandle } from '../lib/sync/indexeddb'
import { backupToFolder, selectSyncFolder } from '../lib/sync/file-sync'
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

      case MessageType.BACKUP_TO_FOLDER:
        // Backup to local folder - needs to run in extension context for IndexedDB access
        getFolderHandle()
          .then(handle => {
            if (!handle) {
              sendResponse({ success: false, error: 'No folder handle configured' })
              return null
            }
            return storageManager.getData().then(data => {
              console.log('[Oh My Prompt Script] Backing up', data.userData.prompts.length, 'prompts')
              return backupToFolder(data.userData, handle)
            })
          })
          .then(() => storageManager.updateSettings({ lastSyncTime: Date.now() }))
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt Script] BACKUP_TO_FOLDER error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SELECT_AND_SAVE_FOLDER:
        // Select folder via File System Access API and save handle to IndexedDB
        let selectedHandle: FileSystemDirectoryHandle | null = null
        selectSyncFolder()
          .then(handle => {
            if (!handle) {
              sendResponse({ success: false, error: 'Folder selection cancelled' })
              return null
            }
            selectedHandle = handle
            return saveFolderHandle(handle).then(() => handle)
          })
          .then(handle => {
            if (!handle) return
            // Perform initial backup
            return storageManager.getData().then(data => {
              console.log('[Oh My Prompt Script] Initial backup to selected folder')
              return backupToFolder(data.userData, handle)
            })
          })
          .then(() => {
            if (!selectedHandle) return // skip if handle was null
            return storageManager.updateSettings({ lastSyncTime: Date.now() })
          })
          .then(() => getSyncStatus())
          .then(status => sendResponse({ success: true, data: status } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt Script] SELECT_AND_SAVE_FOLDER error:', error)
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

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)