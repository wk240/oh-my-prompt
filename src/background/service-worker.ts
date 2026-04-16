import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema } from '../shared/types'
import { StorageManager } from '../lib/storage'

console.log('[Lovart Injector] Service Worker started')

const storageManager = StorageManager.getInstance()

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    console.log('[Lovart Injector] Received message:', message.type)

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      case MessageType.GET_STORAGE:
        storageManager.getData()
          .then(data => sendResponse({ success: true, data } as MessageResponse<StorageSchema>))
          .catch(error => {
            console.error('[Lovart Injector] GET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage retrieval failed' })
          })
        return true // Required for async response

      case MessageType.SET_STORAGE:
        if (!message.payload) {
          sendResponse({ success: false, error: 'No payload provided' })
          return true
        }
        storageManager.saveData(message.payload as StorageSchema)
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Lovart Injector] SET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      case MessageType.INSERT_PROMPT:
        // Phase 2: Return success for content script acknowledgment
        // Phase 3 will add storage retrieval
        sendResponse({ success: true, data: message.payload } as MessageResponse)
        break

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)