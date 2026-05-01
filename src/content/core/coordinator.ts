/**
 * Coordinator - Content script entry point for multi-platform support
 * Matches platform, initializes components, and handles lifecycle events
 */

import { matchPlatform, registerPlatform } from '../platforms/registry'
import { Detector } from './detector'
import { Injector } from './injector'
import { createDefaultInserter } from '../platforms/base/default-strategies'
import { MessageType } from '../../shared/messages'
import type { InsertResultPayload } from '../../shared/types'
import type { InputDetectionConfig } from '../platforms/base/types'
import { usePromptStore } from '../../lib/store'
import { VisionModalManager } from '../vision-modal-manager'
import { ImageHoverButtonManager } from '../image-hover-button-manager'
import { lovartConfig } from '../platforms/lovart/config'
import { chatgptConfig } from '../platforms/chatgpt/config'
import { claudeAiConfig } from '../platforms/claude-ai/config'
import { geminiConfig } from '../platforms/gemini/config'
import { liblibConfig } from '../platforms/liblib/config'
import { jimengConfig } from '../platforms/jimeng/config'

// Register platform configurations
registerPlatform(lovartConfig)
registerPlatform(chatgptConfig)
registerPlatform(claudeAiConfig)
registerPlatform(geminiConfig)
registerPlatform(liblibConfig)
registerPlatform(jimengConfig)

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Universal input detection config - works on any page with contenteditable or textarea
 * Uses relaxed validation: accept textarea/input even if hidden (offset=0)
 */
const UNIVERSAL_INPUT_CONFIG: InputDetectionConfig = {
  selectors: [
    // Priority: specific patterns first, then generic
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="message"]',
    'textarea[placeholder*="prompt"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="描述"]',
    'textarea[placeholder*="chat"]',
    'textarea[id*="chat"]',
    'textarea[id*="input"]',
    'textarea[class*="chat"]',
    'textarea[class*="input"]',
    'textarea',  // Generic fallback
    '[data-lexical-editor="true"]',
    '.ProseMirror[contenteditable="true"]',
    'input[type="text"][placeholder*="message"]',
    'input[type="text"][placeholder*="prompt"]',
  ],
  debounceMs: 100,
  // Relaxed validation: accept textarea/input regardless of visibility
  validate: (element: HTMLElement) => {
    // Always accept textarea and input[type="text"]
    if (element instanceof HTMLTextAreaElement) {
      return true
    }
    if (element instanceof HTMLInputElement && element.type === 'text') {
      return true
    }
    // For contenteditable, still check visibility (avoid hidden containers)
    if (element.isContentEditable) {
      return element.offsetWidth > 0 && element.offsetHeight > 0
    }
    return false
  },
}

/**
 * Coordinator class manages content script lifecycle
 */
class Coordinator {
  private detector: Detector | null = null
  private injector: Injector | null = null
  private hoverButtonManager: ImageHoverButtonManager | null = null
  private platform: ReturnType<typeof matchPlatform>
  private sidePanelPort: chrome.runtime.Port | null = null

  constructor() {
    this.platform = matchPlatform(window.location.href)
  }

  /**
   * Initialize the coordinator
   * Always sets up message listener for vision modal, even on non-platform pages
   */
  init(): void {
    console.log(LOG_PREFIX, 'Coordinator initializing on:', window.location.href)

    // Setup message listener FIRST - always needed for vision modal on any page
    this.setupMessageListener()

    // Setup Port connection listener for SidePanel
    this.setupPortListener()

    // Ping service worker to verify connection
    this.pingServiceWorker()

    // Setup lifecycle handlers
    this.setupLifecycleHandlers()

    // Start ImageHoverButtonManager on all pages (universal image hover button)
    this.hoverButtonManager = ImageHoverButtonManager.getInstance()
    this.hoverButtonManager.start()
    console.log(LOG_PREFIX, 'ImageHoverButtonManager started')

    // Create Injector BEFORE Detector if platform matches
    // This ensures Injector is ready when Detector immediately finds input
    if (this.platform) {
      this.injector = new Injector()
    }

    // Create universal detector for ALL pages (no platform restriction)
    this.detector = new Detector(
      UNIVERSAL_INPUT_CONFIG,
      this.handleUniversalInputDetected.bind(this)
    )
    this.detector.setStatusChangedCallback(this.handleInputStatusChanged.bind(this))
    this.detector.start()
    console.log(LOG_PREFIX, 'Universal detector started')

    // Exit early if no platform matched - no UI injection needed
    if (!this.platform) {
      console.log(LOG_PREFIX, 'No platform matched, but detector is active for input detection')
      return
    }

    console.log(LOG_PREFIX, 'Coordinator initialized for platform:', this.platform.name)
  }

  /**
   * Setup Port connection listener for SidePanel real-time communication
   */
  private setupPortListener(): void {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'sidepanel-connection') {
        console.log(LOG_PREFIX, 'SidePanel Port connected')
        this.sidePanelPort = port

        // Handle messages from SidePanel
        port.onMessage.addListener((message) => {
          if (message.type === MessageType.CHECK_INPUT_PORT) {
            // Respond with current input status
            const hasInput = this.detector?.getInputElement() !== null
            port.postMessage({
              type: MessageType.INPUT_STATUS_CHANGED,
              hasInput
            })
          }
        })

        // Handle disconnection (tab closed, refreshed, or SidePanel closed)
        port.onDisconnect.addListener(() => {
          console.log(LOG_PREFIX, 'SidePanel Port disconnected')
          this.sidePanelPort = null
        })

        // Send initial status immediately
        const hasInput = this.detector?.getInputElement() !== null
        port.postMessage({
          type: MessageType.INPUT_STATUS_CHANGED,
          hasInput
        })
      }
    })
  }

  /**
   * Handle input status changes and notify SidePanel via Port
   */
  private handleInputStatusChanged(hasInput: boolean): void {
    console.log(LOG_PREFIX, 'Input status changed:', hasInput)
    if (this.sidePanelPort) {
      try {
        this.sidePanelPort.postMessage({
          type: MessageType.INPUT_STATUS_CHANGED,
          hasInput
        })
      } catch (error) {
        // Port may be disconnected, ignore error
        console.warn(LOG_PREFIX, 'Failed to send status via Port:', error)
        this.sidePanelPort = null
      }
    }
  }

  /**
   * Handle universal input element detection (all pages)
   * Inject UI only if platform matches
   */
  private handleUniversalInputDetected(inputElement: HTMLElement): void {
    console.log(LOG_PREFIX, 'Universal input detected:', inputElement)

    // Only inject UI if platform matches
    if (!this.platform || !this.injector) {
      console.log(LOG_PREFIX, 'No platform match or injector, skipping UI injection')
      return
    }

    const inserter = this.platform.strategies?.inserter ?? createDefaultInserter()

    if (this.injector.isInjected()) {
      console.log(LOG_PREFIX, 'Cleaning up existing UI before re-injection')
      this.injector.remove()
    }

    console.log(LOG_PREFIX, 'Injecting UI near input element for platform:', this.platform.name)

    this.injector.inject(
      inputElement,
      this.platform.uiInjection,
      inserter
    )
  }

  /**
   * Setup message listener for service worker communication
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      console.log(LOG_PREFIX, 'Received message:', message.type)

      // Handle storage updates
      if (message.type === MessageType.GET_STORAGE) {
        sendResponse({ success: true })
        return true
      }

      // Handle refresh data from backup page
      if (message.type === MessageType.REFRESH_DATA) {
        console.log(LOG_PREFIX, 'Refreshing data from backup...')
        usePromptStore.getState().loadFromStorage()
          .then(() => {
            console.log(LOG_PREFIX, 'Data refreshed successfully')
            sendResponse({ success: true })
          })
          .catch((err) => {
            console.error(LOG_PREFIX, 'Failed to refresh data:', err)
            sendResponse({ success: false, error: String(err) })
          })
        return true // Required for async sendResponse
      }

      // Handle sync failure - show backup reminder
      if (message.type === MessageType.SYNC_FAILED) {
        console.log(LOG_PREFIX, 'Sync failed, notifying UI to show backup reminder')
        // Future: notify UI component to show warning banner
        sendResponse({ success: true })
        return true
      }

      // Handle input availability check from sidepanel
      if (message.type === MessageType.CHECK_INPUT_AVAILABILITY) {
        const hasInput = this.detector?.getInputElement() !== null
        console.log(LOG_PREFIX, 'CHECK_INPUT_AVAILABILITY response:', hasInput)
        sendResponse({ success: true, data: { hasInput } })
        return true
      }

      // Handle PING from sidepanel (connection check)
      if (message.type === MessageType.PING) {
        console.log(LOG_PREFIX, 'PING received, responding...')
        sendResponse({ success: true })
        return true
      }

      // Handle prompt insertion from service worker
      if (message.type === MessageType.INSERT_PROMPT_TO_CS) {
        console.log(LOG_PREFIX, 'Received INSERT_PROMPT_TO_CS')

        const payload = message.payload as { prompt: string }
        if (!payload || !payload.prompt) {
          sendResponse({ success: false, error: 'No prompt provided' } as InsertResultPayload)
          return true
        }

        // Get input element from detector
        const inputElement = this.detector?.getInputElement()

        if (!inputElement) {
          console.warn(LOG_PREFIX, 'Input element not found')
          sendResponse({ success: false, error: 'INPUT_NOT_FOUND' } as InsertResultPayload)
          return true
        }

        // Create inserter and insert prompt
        const inserter = this.platform?.strategies?.inserter ?? createDefaultInserter()
        const success = inserter.insert(inputElement, payload.prompt)

        if (success) {
          console.log(LOG_PREFIX, 'Prompt inserted successfully')
          sendResponse({ success: true } as InsertResultPayload)
        } else {
          console.error(LOG_PREFIX, 'Insertion failed')
          sendResponse({ success: false, error: 'INSERT_FAILED' } as InsertResultPayload)
        }
        return true
      }

      // Handle Vision Modal open request
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
            const manager = VisionModalManager.getInstance()
            manager.create(imageUrl, tabId)
            sendResponse({ success: true })
          } else {
            // Failed to get settings, default to enabled
            console.warn(LOG_PREFIX, 'Failed to get settings, defaulting to enabled')
            const manager = VisionModalManager.getInstance()
            manager.create(imageUrl, tabId)
            sendResponse({ success: true })
          }
        })

        return true // Required for async sendResponse
      }

      // Unhandled message types - return false to indicate no async response
      return false
    })
  }

  /**
   * Ping service worker to verify connection
   */
  private pingServiceWorker(): void {
    chrome.runtime.sendMessage(
      { type: MessageType.PING },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(LOG_PREFIX, 'Ping failed:', chrome.runtime.lastError.message)
          return
        }
        console.log(LOG_PREFIX, 'Ping response:', response)
      }
    )
  }

  /**
   * Setup lifecycle handlers for cleanup and bfcache recovery
   */
  private setupLifecycleHandlers(): void {
    // Cleanup on page hide (replaces unload for bfcache compatibility)
    window.addEventListener('pagehide', () => {
      this.cleanup()
      console.log(LOG_PREFIX, 'Cleanup complete')
    })

    // Handle bfcache restoration - re-initialize when page is restored from cache
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log(LOG_PREFIX, 'Page restored from bfcache, re-initializing...')
        // Re-start input detection after bfcache restoration
        this.detector?.start()
      }
    })
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.detector?.stop()
    this.injector?.remove()
    this.hoverButtonManager?.stop()
  }
}

// Create and initialize coordinator
const coordinator = new Coordinator()
coordinator.init()