import { MessageType, MessageResponse } from '../shared/messages'

console.log('[Lovart Injector] Service Worker started')

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    console.log('[Lovart Injector] Received message:', message.type)

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      // Future handlers (Phase 2-3)
      case MessageType.GET_STORAGE:
        // Phase 3: Implement storage retrieval
        sendResponse({ success: false, error: 'GET_STORAGE not implemented' })
        break

      case MessageType.SET_STORAGE:
        // Phase 3: Implement storage save
        sendResponse({ success: false, error: 'SET_STORAGE not implemented' })
        break

      case MessageType.INSERT_PROMPT:
        // Phase 2: Implement prompt insertion
        sendResponse({ success: false, error: 'INSERT_PROMPT not implemented' })
        break

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)