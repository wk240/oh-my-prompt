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
import { usePromptStore } from '../../lib/store'
import { VisionModalManager } from '../vision-modal-manager'
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
 * Coordinator class manages content script lifecycle
 */
class Coordinator {
  private detector: Detector | null = null
  private injector: Injector | null = null
  private platform: ReturnType<typeof matchPlatform>

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

    // Ping service worker to verify connection
    this.pingServiceWorker()

    // Setup lifecycle handlers
    this.setupLifecycleHandlers()

    // Exit early if no platform matched - no UI injection needed
    if (!this.platform) {
      console.log(LOG_PREFIX, 'No platform matched, but vision modal handler ready')
      return
    }

    // Create inserter (use platform's custom strategy or default)
    const inserter = this.platform.strategies?.inserter ?? createDefaultInserter()

    // Create Injector instance
    this.injector = new Injector()

    // Create Detector instance with platform's inputDetection config
    this.detector = new Detector(
      this.platform.inputDetection,
      this.handleInputDetected.bind(this, inserter)
    )

    // Start detector
    this.detector.start()

    console.log(LOG_PREFIX, 'Coordinator initialized for platform:', this.platform.name)
  }

  /**
   * Handle input element detection
   * Inject UI when platform input is found
   */
  private handleInputDetected(
    inserter: ReturnType<typeof createDefaultInserter>,
    inputElement: HTMLElement
  ): void {
    if (!this.injector || !this.platform) return

    if (this.injector.isInjected()) {
      console.log(LOG_PREFIX, 'Cleaning up existing UI before re-injection')
    }

    console.log(LOG_PREFIX, 'Injecting UI near input element')

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

        // Create modal via VisionModalManager (singleton)
        const manager = VisionModalManager.getInstance()
        manager.create(imageUrl, tabId)

        sendResponse({ success: true })
        return true
      }

      return true // Required for async sendResponse
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
  }
}

// Create and initialize coordinator
const coordinator = new Coordinator()
coordinator.init()