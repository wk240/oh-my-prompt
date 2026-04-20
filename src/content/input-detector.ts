/**
 * InputDetector - MutationObserver for detecting Lovart input element
 * Handles SPA dynamic rendering with debounce pattern
 */

const LOG_PREFIX = '[Oh My Prompt Script]'
const DEBOUNCE_MS = 100

/**
 * Selector patterns for Lovart input element
 * Updated based on actual Lovart page analysis (Lexical editor)
 */
const INPUT_SELECTORS = [
  // Lovart specific - Lexical editor (most reliable)
  '[data-testid="agent-message-input"]',
  '[data-lexical-editor="true"]',
  // Generic contenteditable textbox
  'div[contenteditable="true"][role="textbox"]',
  // Fallback patterns for other input types
  'textarea[placeholder*="prompt"]',
  'textarea[placeholder*="提示"]',
  '.input-area textarea',
  'textarea[class*="input"]',
  'textarea[class*="prompt"]',
]

export class InputDetector {
  private observer: MutationObserver | null = null
  private navObserver: MutationObserver | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private inputElement: HTMLElement | null = null
  private onInputDetected: (element: HTMLElement) => void
  // Store original history methods for cleanup
  private originalPushState: typeof history.pushState | null = null
  private originalReplaceState: typeof history.replaceState | null = null
  // Store bound popstate handler for cleanup
  private boundPopstateHandler: (() => void) | null = null
  // Periodic health check interval
  private healthCheckInterval: ReturnType<typeof setInterval> | undefined

  constructor(callback: (element: HTMLElement) => void) {
    this.onInputDetected = callback
  }

  /**
   * Start observing the DOM for Lovart input element
   */
  start(): void {
    // Initial detection attempt
    this.tryDetect()

    // Set up MutationObserver for dynamic changes
    this.observer = new MutationObserver((_mutations) => {
      this.debouncedDetect()
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    })

    // Handle SPA navigation
    this.watchNavigation()

    // Set up periodic health check (30 seconds)
    this.healthCheckInterval = setInterval(() => {
      // Force a detection attempt periodically if no input detected
      if (!this.inputElement) {
        this.tryDetect()
      }
    }, 30000)
  }

  /**
   * Stop observing and cleanup
   */
  stop(): void {
    this.observer?.disconnect()
    this.navObserver?.disconnect()
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
    }
    if (this.healthCheckInterval !== undefined) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
    // Restore original history methods
    if (this.originalPushState) {
      history.pushState = this.originalPushState
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState
    }
    // Remove popstate listener
    if (this.boundPopstateHandler) {
      window.removeEventListener('popstate', this.boundPopstateHandler)
    }
  }

  /**
   * Get the currently detected input element
   */
  getInputElement(): HTMLElement | null {
    return this.inputElement
  }

  private debouncedDetect(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.tryDetect()
    }, DEBOUNCE_MS)
  }

  private tryDetect(): void {
    const input = this.findLovartInput()
    if (input && input !== this.inputElement) {
      this.inputElement = input
      console.log(LOG_PREFIX, 'Input detected:', input)
      this.onInputDetected(input)
    }
  }

  private findLovartInput(): HTMLElement | null {
    // Try each selector pattern
    for (const selector of INPUT_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector)
      if (element && this.isValidInputElement(element)) {
        return element
      }
    }
    return null
  }

  /**
   * Check if element is a valid input target
   */
  private isValidInputElement(element: HTMLElement): boolean {
    // Must be visible and editable
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
   * Handle SPA navigation - reset and re-detect
   */
  private handleNavigation(): void {
    console.log(LOG_PREFIX, 'Navigation detected via history API')
    this.inputElement = null
    this.tryDetect()
  }

  /**
   * Watch for SPA navigation (URL changes without page reload)
   */
  private watchNavigation(): void {
    // Store original history methods
    this.originalPushState = history.pushState
    this.originalReplaceState = history.replaceState

    // Intercept history.pushState
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      this.originalPushState!.apply(history, args)
      this.handleNavigation()
    }

    // Intercept history.replaceState
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      this.originalReplaceState!.apply(history, args)
      this.handleNavigation()
    }

    // Listen for popstate (back/forward navigation)
    this.boundPopstateHandler = () => this.handleNavigation()
    window.addEventListener('popstate', this.boundPopstateHandler)

    // Keep MutationObserver-based URL watching as fallback
    let lastUrl = location.href

    this.navObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        console.log(LOG_PREFIX, 'Navigation detected:', lastUrl)
        // Re-detect on navigation
        this.inputElement = null
        this.tryDetect()
      }
    })

    this.navObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }
}