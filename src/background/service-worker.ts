import { MessageType, MessageResponse, NetworkDataResponse } from '../shared/messages'
import type { StorageSchema } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { NanoBananaProvider } from '../lib/providers/nano-banana'
import { NETWORK_TIMEOUT } from '../shared/constants'

console.log('[Prompt-Script] Service Worker started')

const storageManager = StorageManager.getInstance()
const nanoBananaProvider = new NanoBananaProvider()

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    console.log('[Prompt-Script] Received message:', message.type)

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      case MessageType.GET_STORAGE:
        storageManager.getData()
          .then(data => sendResponse({ success: true, data } as MessageResponse<StorageSchema>))
          .catch(error => {
            console.error('[Prompt-Script] GET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage retrieval failed' })
          })
        return true // Required for async response

      case MessageType.SET_STORAGE:
        console.log('[Prompt-Script] SET_STORAGE payload:', message.payload)
        if (!message.payload) {
          console.error('[Prompt-Script] SET_STORAGE: No payload provided')
          sendResponse({ success: false, error: 'No payload provided' })
          return true
        }
        storageManager.saveData(message.payload as StorageSchema)
          .then(() => {
            console.log('[Prompt-Script] SET_STORAGE: Save successful')
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Prompt-Script] SET_STORAGE error:', error)
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
            console.error('[Prompt-Script] OPEN_SETTINGS error:', error)
            sendResponse({ success: false, error: 'Failed to open settings' })
          })
        return true // Required for async response

      case MessageType.FETCH_NETWORK_PROMPTS:
        // D-06: 10 second timeout with AbortController
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT)

        nanoBananaProvider.fetch()
          .then(rawData => {
            clearTimeout(timeoutId)
            const prompts = nanoBananaProvider.parse(rawData)
            const categories = nanoBananaProvider.getCategories()

            console.log('[Prompt-Script] FETCH_NETWORK_PROMPTS: parsed', prompts.length, 'prompts')

            sendResponse({
              success: true,
              data: { prompts, categories }
            } as MessageResponse<NetworkDataResponse>)
          })
          .catch(error => {
            clearTimeout(timeoutId)
            const errorMsg = error instanceof Error
              ? (error.name === 'AbortError' ? 'Request timeout' : error.message)
              : 'Network fetch failed'
            console.error('[Prompt-Script] FETCH_NETWORK_PROMPTS error:', errorMsg)
            sendResponse({ success: false, error: errorMsg })
          })
        return true // Required for async response

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)