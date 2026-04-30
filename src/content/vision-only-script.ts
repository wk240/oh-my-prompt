/**
 * Vision-only content script
 * Runs on all websites except Lovart
 * Handles Vision Modal functionality and universal prompt insertion
 */

import { MessageType } from '@/shared/messages'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Universal input selectors for detecting editable elements
 */
const UNIVERSAL_INPUT_SELECTORS = [
  // Lovart specific - Lexical editor (highest priority)
  '[data-testid="agent-message-input"]',
  '[data-lexical-editor="true"]',
  // Standard form inputs
  'textarea:not([readonly])',
  'input[type="text"]:not([readonly])',
  'input[type="search"]:not([readonly])',
  'input:not([type]):not([readonly])',  // default is text
  // Rich text editors
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]',
]

/**
 * Track the currently detected input element
 */
let currentInputElement: HTMLElement | null = null
let inputCheckInterval: ReturnType<typeof setInterval> | undefined

/**
 * Check if element is a valid input target
 */
function isValidInputElement(element: HTMLElement): boolean {
  // Must be visible
  if (element.offsetWidth === 0 || element.offsetHeight === 0) {
    return false
  }

  // Check if it's a form control or editable element
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return true
  }

  // Check for contenteditable
  if (element.isContentEditable) {
    return true
  }

  return false
}

/**
 * Find a usable input element on the page
 */
function findInputElement(): HTMLElement | null {
  for (const selector of UNIVERSAL_INPUT_SELECTORS) {
    const elements = document.querySelectorAll<HTMLElement>(selector)
    for (const element of elements) {
      if (isValidInputElement(element)) {
        return element
      }
    }
  }
  return null
}

/**
 * Periodically check for input element availability
 */
function startInputDetection(): void {
  // Initial check
  currentInputElement = findInputElement()
  if (currentInputElement) {
    console.log(LOG_PREFIX, 'Universal input detected:', currentInputElement)
  }

  // Periodic check every 1 second (reduced from 2s for faster detection)
  inputCheckInterval = setInterval(() => {
    const input = findInputElement()
    if (input && input !== currentInputElement) {
      currentInputElement = input
      console.log(LOG_PREFIX, 'Input element updated:', input)
    }
  }, 1000)

  // Also observe DOM changes
  const observer = new MutationObserver(() => {
    const input = findInputElement()
    if (input && input !== currentInputElement) {
      currentInputElement = input
      console.log(LOG_PREFIX, 'Input detected via mutation:', input)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

/**
 * Insert prompt text into input element
 */
function insertPrompt(inputElement: HTMLElement, text: string): boolean {
  try {
    if (
      inputElement instanceof HTMLInputElement ||
      inputElement instanceof HTMLTextAreaElement
    ) {
      // Form control insertion
      const start = inputElement.selectionStart ?? inputElement.value.length
      const end = inputElement.selectionEnd ?? start
      inputElement.value = inputElement.value.substring(0, start) + text + inputElement.value.substring(end)
      const newPosition = start + text.length
      inputElement.selectionStart = newPosition
      inputElement.selectionEnd = newPosition

      // Dispatch events
      inputElement.dispatchEvent(new Event('input', { bubbles: true }))
      inputElement.dispatchEvent(new Event('change', { bubbles: true }))

      // React native setter
      const nativeSetter = Object.getOwnPropertyDescriptor(
        inputElement instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(inputElement, inputElement.value)
        inputElement.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } else {
      // Contenteditable insertion
      if (document.activeElement !== inputElement) {
        inputElement.focus()
      }

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || !inputElement.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        const range = document.createRange()
        range.selectNodeContents(inputElement)
        range.collapse(false)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }

      const success = document.execCommand('insertText', false, text)
      if (!success) {
        // Fallback
        const currentRange = selection?.getRangeAt(0)
        if (currentRange) {
          currentRange.deleteContents()
          const textNode = document.createTextNode(text)
          currentRange.insertNode(textNode)
          currentRange.setStartAfter(textNode)
          currentRange.setEndAfter(textNode)
          selection?.removeAllRanges()
          selection?.addRange(currentRange)
        }
      }

      inputElement.dispatchEvent(new Event('input', { bubbles: true }))
    }

    console.log(LOG_PREFIX, 'Prompt inserted successfully')
    return true
  } catch (error) {
    console.error(LOG_PREFIX, 'Insert failed:', error)
    return false
  }
}

// Start input detection on load
startInputDetection()

/**
 * Listen for messages from service worker and sidepanel
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Log all incoming messages for debugging
  console.log(LOG_PREFIX, 'Received message type:', message.type, 'from:', _sender.id ? 'extension' : 'external')

  // Vision Modal handling
  if (message.type === MessageType.OPEN_VISION_MODAL) {
    const { imageUrl, tabId } = message.payload as { imageUrl: string; tabId?: number }
    console.log(LOG_PREFIX, 'Received OPEN_VISION_MODAL:', imageUrl.substring(0, 50) + '...')

    // Check if vision feature is enabled
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (settingsResponse) => {
      if (settingsResponse?.success && settingsResponse?.data?.settings) {
        const visionEnabled = settingsResponse.data.settings.visionEnabled ?? true
        if (!visionEnabled) {
          console.log(LOG_PREFIX, 'Vision feature is disabled')
          sendResponse({ success: false, error: 'VISION_DISABLED' })
          return
        }

        // Vision enabled, create modal
        import('./vision-modal-manager')
          .then(({ VisionModalManager }) => {
            try {
              const manager = VisionModalManager.getInstance()
              manager.create(imageUrl, tabId)
              console.log(LOG_PREFIX, 'Vision modal created successfully')
              sendResponse({ success: true })
            } catch (error) {
              console.error(LOG_PREFIX, 'Vision modal creation failed:', error)
              sendResponse({ success: false, error: 'Modal creation failed' })
            }
          })
          .catch((error) => {
            console.error(LOG_PREFIX, 'Failed to import VisionModalManager:', error)
            sendResponse({ success: false, error: 'Module import failed' })
          })
      } else {
        // Failed to get settings, default to enabled
        console.warn(LOG_PREFIX, 'Failed to get settings, defaulting to enabled')
        import('./vision-modal-manager')
          .then(({ VisionModalManager }) => {
            try {
              const manager = VisionModalManager.getInstance()
              manager.create(imageUrl, tabId)
              sendResponse({ success: true })
            } catch (error) {
              sendResponse({ success: false, error: 'Modal creation failed' })
            }
          })
          .catch(() => {
            sendResponse({ success: false, error: 'Module import failed' })
          })
      }
    })

    return true
  }

  // Check input availability
  if (message.type === MessageType.CHECK_INPUT_AVAILABILITY) {
    const hasInput = currentInputElement !== null || findInputElement() !== null
    console.log(LOG_PREFIX, 'CHECK_INPUT_AVAILABILITY response:', hasInput)
    sendResponse({ success: true, data: { hasInput } })
    return true
  }

  // Handle prompt insertion from sidepanel
  if (message.type === MessageType.INSERT_PROMPT_TO_CS) {
    console.log(LOG_PREFIX, 'Received INSERT_PROMPT_TO_CS')

    const payload = message.payload as { prompt: string }
    if (!payload || !payload.prompt) {
      sendResponse({ success: false, error: 'No prompt provided' })
      return true
    }

    // Find input element (use cached or search again)
    const inputElement = currentInputElement || findInputElement()

    if (!inputElement) {
      console.warn(LOG_PREFIX, 'No input element found on this page')
      sendResponse({ success: false, error: 'INPUT_NOT_FOUND' })
      return true
    }

    const success = insertPrompt(inputElement, payload.prompt)
    if (success) {
      sendResponse({ success: true })
    } else {
      sendResponse({ success: false, error: 'INSERT_FAILED' })
    }
    return true
  }

  return false
})

console.log(LOG_PREFIX, 'Vision-only content script loaded (with universal input support):', window.location.href)

// Cleanup on page hide (replaces unload for bfcache compatibility)
window.addEventListener('pagehide', () => {
  if (inputCheckInterval !== undefined) {
    clearInterval(inputCheckInterval)
  }
})