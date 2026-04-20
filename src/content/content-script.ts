/**
 * Content Script - Main entry point for Lovart page integration
 * Coordinates input detection, UI injection, and prompt insertion
 */

import { MessageType } from '../shared/messages'
import { InputDetector } from './input-detector'
import { UIInjector } from './ui-injector'
import { usePromptStore } from '../lib/store'

console.log('[Oh My Prompt Script] Content script loaded on:', window.location.href)

// Initialize components
const inputDetector = new InputDetector(handleInputDetected)
const uiInjector = new UIInjector()

/**
 * Handle input element detection
 * Inject UI when Lovart input is found
 */
function handleInputDetected(inputElement: HTMLElement): void {
  if (uiInjector.isInjected()) {
    console.log('[Oh My Prompt Script] Cleaning up existing UI before re-injection')
  }
  console.log('[Oh My Prompt Script] Injecting UI near input element')
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
      console.error('[Oh My Prompt Script] Ping failed:', chrome.runtime.lastError.message)
      return
    }
    console.log('[Oh My Prompt Script] Ping response:', response)
  }
)

/**
 * Handle messages from Service Worker
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Oh My Prompt Script] Received message:', message.type)

  // Handle storage updates (Phase 3)
  if (message.type === MessageType.GET_STORAGE) {
    // Phase 3: Refresh prompts from storage
    sendResponse({ success: true })
  }

  // Handle refresh data from backup page
  if (message.type === MessageType.REFRESH_DATA) {
    console.log('[Oh My Prompt Script] Refreshing data from backup...')
    usePromptStore.getState().loadFromStorage()
      .then(() => {
        console.log('[Oh My Prompt Script] Data refreshed successfully')
        sendResponse({ success: true })
      })
      .catch((err) => {
        console.error('[Oh My Prompt Script] Failed to refresh data:', err)
        sendResponse({ success: false, error: String(err) })
      })
    return true // Required for async sendResponse
  }

  return true // Required for async sendResponse
})

/**
 * Cleanup on page unload
 */
window.addEventListener('unload', () => {
  inputDetector.stop()
  uiInjector.remove()
  console.log('[Oh My Prompt Script] Cleanup complete')
})