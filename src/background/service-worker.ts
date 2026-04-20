import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings } from '../shared/types'
import { StorageManager } from '../lib/storage'
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

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)