/**
 * Vision-only content script
 * Runs on all websites except Lovart
 * Only handles Vision Modal functionality (no dropdown menu)
 */

import { MessageType } from '@/shared/messages'
import { VisionModalManager } from './vision-modal-manager'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Listen for OPEN_VISION_MODAL message from service worker
 * Creates modal in current page when user right-clicks an image
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.OPEN_VISION_MODAL) {
    const { imageUrl, tabId } = message.payload as { imageUrl: string; tabId?: number }

    console.log(LOG_PREFIX, 'Received OPEN_VISION_MODAL:', imageUrl.substring(0, 50) + '...')

    // Create modal via VisionModalManager (singleton)
    const manager = VisionModalManager.getInstance()
    manager.create(imageUrl, tabId)

    // Send response confirming modal opened
    sendResponse({ success: true })

    // Required for async response
    return true
  }

  return false
})

console.log(LOG_PREFIX, 'Vision-only content script loaded on:', window.location.href)