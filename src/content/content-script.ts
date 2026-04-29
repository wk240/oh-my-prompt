/**
 * Content Script - Main entry point for Lovart page integration
 * Coordinates input detection, UI injection, prompt insertion, and Vision Modal
 */

import { MessageType } from '../shared/messages'
import type { InsertResultPayload } from '../shared/types'
import { InputDetector } from './input-detector'
import { UIInjector } from './ui-injector'
import { InsertHandler } from './insert-handler'
import { usePromptStore } from '../lib/store'
import { VisionModalManager } from './vision-modal-manager'

console.log('[Oh My Prompt] Content script loaded on:', window.location.href)

// Initialize components
const inputDetector = new InputDetector(handleInputDetected)
const uiInjector = new UIInjector()
const insertHandler = new InsertHandler()

/**
 * Handle input element detection
 * Inject UI when Lovart input is found
 */
function handleInputDetected(inputElement: HTMLElement): void {
  if (uiInjector.isInjected()) {
    console.log('[Oh My Prompt] Cleaning up existing UI before re-injection')
  }
  console.log('[Oh My Prompt] Injecting UI near input element')
  uiInjector.inject(inputElement)
}

/**
 * Start input detection on page load
 */
inputDetector.start()

// Test message routing with ping
chrome.runtime.sendMessage(
  { type: MessageType.PING },
  (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Oh My Prompt] Ping failed:', chrome.runtime.lastError.message)
      return
    }
    console.log('[Oh My Prompt] Ping response:', response)
  }
)

/**
 * Handle messages from Service Worker
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Oh My Prompt] Received message:', message.type)

  // Handle storage updates (Phase 3)
  if (message.type === MessageType.GET_STORAGE) {
    // Phase 3: Refresh prompts from storage
    sendResponse({ success: true })
  }

  // Handle refresh data from backup page
  if (message.type === MessageType.REFRESH_DATA) {
    console.log('[Oh My Prompt] Refreshing data from backup...')
    usePromptStore.getState().loadFromStorage()
      .then(() => {
        console.log('[Oh My Prompt] Data refreshed successfully')
        sendResponse({ success: true })
      })
      .catch((err) => {
        console.error('[Oh My Prompt] Failed to refresh data:', err)
        sendResponse({ success: false, error: String(err) })
      })
    return true // Required for async sendResponse
  }

  // Handle sync failure - show backup reminder
  if (message.type === MessageType.SYNC_FAILED) {
    console.log('[Oh My Prompt] Sync failed, notifying UI to show backup reminder')
    uiInjector.notifySyncFailed()
    sendResponse({ success: true })
  }

  // Phase 12: Handle prompt insertion from service worker (INSERT-01)
  if (message.type === MessageType.INSERT_PROMPT_TO_CS) {
    console.log('[Oh My Prompt] Received INSERT_PROMPT_TO_CS')

    const payload = message.payload as { prompt: string }
    if (!payload || !payload.prompt) {
      sendResponse({ success: false, error: 'No prompt provided' } as InsertResultPayload)
      return true
    }

    // Find Lovart input element (D-11 fallback detection)
    const inputElement = document.querySelector('[data-testid="agent-message-input"]') as HTMLElement ||
                        document.querySelector('[data-lexical-editor="true"]') as HTMLElement

    if (!inputElement) {
      console.warn('[Oh My Prompt] Lovart input element not found')
      sendResponse({ success: false, error: 'INPUT_NOT_FOUND' } as InsertResultPayload)
      return true
    }

    // Insert prompt using InsertHandler (D-02)
    const success = insertHandler.insertPrompt(inputElement, payload.prompt)

    if (success) {
      console.log('[Oh My Prompt] Prompt inserted successfully')
      sendResponse({ success: true } as InsertResultPayload)
    } else {
      console.error('[Oh My Prompt] InsertHandler failed')
      sendResponse({ success: false, error: 'INSERT_FAILED' } as InsertResultPayload)
    }
    return true
  }

  // Vision Modal: Handle OPEN_VISION_MODAL from service worker
  if (message.type === MessageType.OPEN_VISION_MODAL) {
    const { imageUrl, tabId } = message.payload as { imageUrl: string; tabId?: number }

    console.log('[Oh My Prompt] Received OPEN_VISION_MODAL:', imageUrl.substring(0, 50) + '...')

    // Create modal via VisionModalManager (singleton)
    const manager = VisionModalManager.getInstance()
    manager.create(imageUrl, tabId)

    sendResponse({ success: true })
    return true
  }

  return true // Required for async sendResponse
})

/**
 * Cleanup on page hide (replaces unload for bfcache compatibility)
 */
window.addEventListener('pagehide', () => {
  inputDetector.stop()
  uiInjector.remove()
  console.log('[Oh My Prompt] Cleanup complete')
})