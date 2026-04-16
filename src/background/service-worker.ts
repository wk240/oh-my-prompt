import { MessageType, MessageResponse } from '../shared/messages'

console.log('[Lovart Injector] Service Worker started')

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
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