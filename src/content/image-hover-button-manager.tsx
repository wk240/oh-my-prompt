/**
 * ImageHoverButtonManager - Universal image hover button for prompt conversion
 * Detects images on any website and shows a floating button on hover
 * Uses MutationObserver with throttling for performance optimization
 */

import { createRoot, type Root } from 'react-dom/client'
import { VisionModalManager } from './vision-modal-manager'
import HoverButton from './components/HoverButton'

const LOG_PREFIX = '[Oh My Prompt]'

// Minimum image size to show hover button (avoid icons/buttons)
const MIN_WIDTH = 100
const MIN_HEIGHT = 100

// Maximum number of hover buttons active at once (performance limit)
const MAX_ACTIVE_BUTTONS = 20

// Debounce delay for hover detection (ms) - longer for smoother experience
const HOVER_DELAY = 300
// Graceful hide delay - allows smooth fade-out animation
const HIDE_DELAY = 150

// Throttle for MutationObserver callbacks (ms) - longer for Pinterest-like sites
const OBSERVER_THROTTLE = 300

/**
 * ImageHoverButtonManager creates hover buttons on images across all websites
 * Singleton pattern - only one manager per page
 */
export class ImageHoverButtonManager {
  private static instance: ImageHoverButtonManager | null = null

  private mutationObserver: MutationObserver | null = null
  private trackedImages: Set<HTMLImageElement> = new Set()
  private activeButtons: Map<HTMLImageElement, { overlay: HTMLDivElement; root: Root }> = new Map()
  private showTimeouts: Map<HTMLImageElement, number> = new Map()
  private hideTimeouts: Map<HTMLImageElement, number> = new Map()
  private buttonCount = 0

  // Store bound handlers and hover targets for proper cleanup
  private hoverHandlers: Map<HTMLImageElement, {
    target: HTMLElement
    enterHandler: () => void
    leaveHandler: () => void
  }> = new Map()

  // Store load listeners for proper cleanup (for incomplete images)
  private _loadListeners: Map<HTMLImageElement, () => void> = new Map()

  // Throttle state for MutationObserver
  private pendingImages: Set<HTMLImageElement> = new Set()
  private lastProcessTime = 0
  private processPendingScheduled = false

  /**
   * Get singleton instance
   */
  static getInstance(): ImageHoverButtonManager {
    if (!ImageHoverButtonManager.instance) {
      ImageHoverButtonManager.instance = new ImageHoverButtonManager()
    }
    return ImageHoverButtonManager.instance
  }

  /**
   * Start observing images on the page - lazy hover strategy
   * No IntersectionObserver, no cleanup on scroll - just add hover listeners
   */
  start(): void {
    console.log(LOG_PREFIX, 'ImageHoverButtonManager started')

    // Setup MutationObserver to detect new images (with throttling)
    this.mutationObserver = new MutationObserver((mutations) => {
      // Collect new images from mutations
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLImageElement) {
            this.pendingImages.add(node)
          }
          // Recursively check child elements
          if (node instanceof HTMLElement) {
            node.querySelectorAll('img').forEach((img) => this.pendingImages.add(img))
          }
        }
      }

      // Process immediately if throttle time has passed
      const now = Date.now()
      if (now - this.lastProcessTime >= OBSERVER_THROTTLE) {
        this.processPendingImages()
      } else if (!this.processPendingScheduled && this.pendingImages.size > 0) {
        // Schedule processing after throttle delay
        this.processPendingScheduled = true
        setTimeout(() => {
          this.processPendingImages()
          this.processPendingScheduled = false
        }, OBSERVER_THROTTLE)
      }
    })

    // Attach hover listeners to existing images
    document.querySelectorAll('img').forEach((img) => this.attachHoverListener(img))

    // Start observing DOM changes
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * Stop observing and cleanup all buttons
   */
  stop(): void {
    this.mutationObserver?.disconnect()

    // Cleanup all active buttons
    for (const [img] of this.activeButtons) {
      this.cleanupImage(img)
    }

    this.trackedImages.clear()
    this.activeButtons.clear()
    this.showTimeouts.clear()
    this.hideTimeouts.clear()
    this.hoverHandlers.clear()
    this.buttonCount = 0

    console.log(LOG_PREFIX, 'ImageHoverButtonManager stopped')
  }

  /**
   * Process pending images collected by MutationObserver (throttled)
   */
  private processPendingImages(): void {
    this.lastProcessTime = Date.now()
    const images = Array.from(this.pendingImages)
    this.pendingImages.clear()

    for (const img of images) {
      this.attachHoverListener(img)
    }
  }

  /**
   * Attach hover listener directly to image (lazy strategy - no IntersectionObserver)
   */
  private attachHoverListener(img: HTMLImageElement): void {
    if (this.trackedImages.has(img)) return
    if (img.dataset.ompTracked) return

    this.trackedImages.add(img)
    img.dataset.ompTracked = 'true'

    // For incomplete images, wait for load
    if (!img.complete) {
      const loadHandler = () => {
        this.prepareImageForHover(img)
        this._loadListeners.delete(img)
      }
      this._loadListeners.set(img, loadHandler)
      img.addEventListener('load', loadHandler, { once: true })
      return
    }

    // Image is complete, prepare immediately
    this.prepareImageForHover(img)
  }

  /**
   * Prepare image for hover button (add event listeners)
   */
  private prepareImageForHover(img: HTMLImageElement): void {
    // Skip if already prepared
    if (img.dataset.ompPrepared) return

    // Skip if no valid URL (even for incomplete images, check URL early)
    const imageUrl = this.getImageUrl(img)
    if (!imageUrl) {
      // For incomplete images, wait for load and retry
      if (!img.complete) {
        const loadHandler = () => {
          const newUrl = this.getImageUrl(img)
          if (newUrl) {
            this.prepareImageForHover(img)
          }
          this._loadListeners.delete(img)
        }
        this._loadListeners.set(img, loadHandler)
        img.addEventListener('load', loadHandler, { once: true })
      }
      return
    }

    // For incomplete images, always wait for load before checking size
    // This ensures we get accurate dimensions and the image is renderable
    if (!img.complete) {
      // Create and store load listener for proper cleanup
      const loadHandler = () => {
        this.prepareImageForHover(img)
        this._loadListeners.delete(img)
      }
      this._loadListeners.set(img, loadHandler)
      img.addEventListener('load', loadHandler, { once: true })
      return
    }

    // Now check size (image is complete, dimensions are accurate)
    if (!this.isLargeEnough(img)) {
      return
    }

    // Mark as prepared
    img.dataset.ompPrepared = 'true'
    img.dataset.ompImageUrl = imageUrl

    // Find the best container to attach hover events
    // Use the parent container if it has positioning, otherwise use img
    const hoverTarget = this.findBestHoverTarget(img)
    img.dataset.ompHoverTarget = hoverTarget === img ? 'self' : 'parent'

    // Create bound handlers and store them for proper cleanup
    const enterHandler = this.handleImageMouseEnter.bind(this, img)
    const leaveHandler = this.handleImageMouseLeave.bind(this, img)

    // Store handlers and target for cleanup
    this.hoverHandlers.set(img, {
      target: hoverTarget,
      enterHandler,
      leaveHandler
    })

    // Add hover event listeners to the hover target (container or image)
    hoverTarget.addEventListener('mouseenter', enterHandler)
    hoverTarget.addEventListener('mouseleave', leaveHandler)

    console.log(LOG_PREFIX, 'prepareImageForHover:', {
      src: img.src?.substring(0, 50),
      hoverTarget: hoverTarget === img ? 'img' : 'parent',
      prepared: true
    })
  }

  /**
   * Find the best element to attach hover events
   * Prefer parent container if it wraps the image nicely (handles overlays)
   */
  private findBestHoverTarget(img: HTMLImageElement): HTMLElement {
    const parent = img.parentElement
    if (!parent) return img

    const imgRect = img.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()

    // Check if parent is a good wrapper (similar size, positioned)
    const isGoodWrapper =
      // Parent contains the image
      parentRect.width >= imgRect.width * 0.9 &&
      parentRect.height >= imgRect.height * 0.9 &&
      parentRect.width <= imgRect.width * 1.5 &&
      parentRect.height <= imgRect.height * 1.5 &&
      // Parent is positioned (relative/absolute/fixed) or has a click handler
      (this.isPositioned(parent) || parent.onclick !== null || parent.style.cursor === 'pointer')

    if (isGoodWrapper) {
      return parent
    }

    // Check grandparent for sites like Pinterest with deep nesting
    const grandparent = parent.parentElement
    if (grandparent) {
      const gpRect = grandparent.getBoundingClientRect()
      const isGoodGrandparent =
        gpRect.width >= imgRect.width * 0.9 &&
        gpRect.height >= imgRect.height * 0.9 &&
        gpRect.width <= imgRect.width * 1.5 &&
        gpRect.height <= imgRect.height * 1.5 &&
        this.isPositioned(grandparent)

      if (isGoodGrandparent) {
        return grandparent
      }
    }

    return img
  }

  /**
   * Check if element has positioning that would capture events
   */
  private isPositioned(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el)
    const position = style.position
    return position === 'relative' || position === 'absolute' || position === 'fixed' || position === 'sticky'
  }

  /**
   * Handle mouse enter on image - show hover button with delay
   */
  private handleImageMouseEnter(img: HTMLImageElement): void {
    // Clear hide timeout if mouse returns
    const hideTimeout = this.hideTimeouts.get(img)
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      this.hideTimeouts.delete(img)
    }

    // Clear any existing show timeout
    const existingTimeout = this.showTimeouts.get(img)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout to show button
    const timeout = window.setTimeout(() => {
      this.showButton(img)
      this.showTimeouts.delete(img)
    }, HOVER_DELAY)

    this.showTimeouts.set(img, timeout)
  }

  /**
   * Handle mouse leave on image - delay hide (allows mouse to move to button)
   */
  private handleImageMouseLeave(img: HTMLImageElement): void {
    // Clear show timeout if mouse left before button shown
    const showTimeout = this.showTimeouts.get(img)
    if (showTimeout) {
      clearTimeout(showTimeout)
      this.showTimeouts.delete(img)
    }

    // Delay hide - allows mouse to move to button
    const hideTimeout = window.setTimeout(() => {
      this.hideButton(img)
      this.hideTimeouts.delete(img)
    }, HIDE_DELAY)

    this.hideTimeouts.set(img, hideTimeout)
  }

  /**
   * Handle mouse enter on overlay - cancel hide
   */
  private handleOverlayMouseEnter(img: HTMLImageElement): void {
    // Clear hide timeout
    const hideTimeout = this.hideTimeouts.get(img)
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      this.hideTimeouts.delete(img)
    }
  }

  /**
   * Handle mouse leave on overlay - hide button
   */
  private handleOverlayMouseLeave(img: HTMLImageElement): void {
    // Hide button immediately when leaving overlay
    this.hideButton(img)
  }

  /**
   * Show hover button on image (positioned overlay)
   */
  private showButton(img: HTMLImageElement): void {
    // Check if button already active
    if (this.activeButtons.has(img)) return

    // Check button count limit
    if (this.buttonCount >= MAX_ACTIVE_BUTTONS) {
      console.log(LOG_PREFIX, 'Max active buttons reached, skipping')
      return
    }

    const imageUrl = img.dataset.ompImageUrl
    if (!imageUrl) return

    // Get image position
    const rect = img.getBoundingClientRect()

    // Create overlay container (positioned fixed relative to viewport)
    const overlay = document.createElement('div')
    overlay.className = 'omp-hover-button-overlay'
    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 2147483647;
      pointer-events: none;
    `
    overlay.dataset.ompOverlay = 'true'
    overlay.dataset.ompImageId = this.getImageId(img)

    // Add hover events to overlay to keep button visible when hovering it
    overlay.addEventListener('mouseenter', this.handleOverlayMouseEnter.bind(this, img))
    overlay.addEventListener('mouseleave', this.handleOverlayMouseLeave.bind(this, img))

    // Create Shadow DOM for style isolation
    const shadowRoot = overlay.attachShadow({ mode: 'closed' })

    // Inject styles with smooth animations
    const style = document.createElement('style')
    style.textContent = `
      :host {
        all: initial;
        box-sizing: border-box;
      }

      .button-container {
        position: absolute;
        top: 8px;
        left: 8px;
        pointer-events: auto;
        opacity: 0;
        animation: fadeIn 0.2s ease forwards;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 1; transform: scale(1); }
      }

      @keyframes fadeOut {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
      }

      .button-container.fading-out {
        animation: fadeOut 0.15s ease forwards;
      }

      .hover-button {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.7);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .hover-button:hover {
        background: rgba(0, 0, 0, 0.85);
        transform: scale(1.1);
      }

      .hover-button svg {
        width: 18px;
        height: 18px;
        color: #fff;
      }

      .tooltip {
        position: absolute;
        top: 0;
        left: calc(100% + 8px);
        background: #1f1f1f;
        color: #fff;
        font-size: 12px;
        font-weight: 500;
        padding: 6px 10px;
        border-radius: 6px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.15s, visibility 0.15s;
        pointer-events: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .hover-button:hover .tooltip {
        opacity: 1;
        visibility: visible;
      }
    `
    shadowRoot.appendChild(style)

    // Create button container
    const buttonContainer = document.createElement('div')
    buttonContainer.className = 'button-container'
    shadowRoot.appendChild(buttonContainer)

    // Mount to body (not inside img)
    document.body.appendChild(overlay)

    // Mount React component
    const root = createRoot(buttonContainer)
    root.render(
      <HoverButton
        imageUrl={imageUrl}
        onClick={() => this.handleButtonClick(imageUrl)}
      />
    )

    this.activeButtons.set(img, { overlay, root })
    this.buttonCount++
  }

  /**
   * Get unique ID for image element
   */
  private getImageId(img: HTMLImageElement): string {
    // Use a combination of src and position as ID
    return `${img.src?.substring(0, 30) || 'img'}-${img.getBoundingClientRect().top}`
  }

  /**
   * Hide hover button from image
   */
  private hideButton(img: HTMLImageElement): void {
    const buttonData = this.activeButtons.get(img)
    if (!buttonData) return

    // Unmount React
    buttonData.root.unmount()

    // Remove overlay from body
    buttonData.overlay.remove()

    this.activeButtons.delete(img)
    this.buttonCount--
  }

  /**
   * Handle button click - open Vision Modal
   */
  private handleButtonClick(imageUrl: string): void {
    console.log(LOG_PREFIX, 'Hover button clicked, opening Vision Modal')

    const visionManager = VisionModalManager.getInstance()
    visionManager.create(imageUrl)
  }

  /**
   * Cleanup image - remove hover listeners and buttons, but keep observing
   * This allows the image to be re-prepared when it re-enters viewport
   */
  private cleanupImage(img: HTMLImageElement): void {
    // Hide button if active
    this.hideButton(img)

    // Clear timeouts
    const showTimeout = this.showTimeouts.get(img)
    if (showTimeout) {
      clearTimeout(showTimeout)
      this.showTimeouts.delete(img)
    }

    const hideTimeout = this.hideTimeouts.get(img)
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      this.hideTimeouts.delete(img)
    }

    // Remove load listeners (for incomplete images)
    const loadListener = this._loadListeners.get(img)
    if (loadListener) {
      img.removeEventListener('load', loadListener)
      this._loadListeners.delete(img)
    }

    // Remove hover event listeners using stored handlers
    const handlers = this.hoverHandlers.get(img)
    if (handlers) {
      handlers.target.removeEventListener('mouseenter', handlers.enterHandler)
      handlers.target.removeEventListener('mouseleave', handlers.leaveHandler)
      this.hoverHandlers.delete(img)
    }

    // Clear prepared state only - keep ompTracked so IntersectionObserver continues watching
    // When image re-enters viewport, prepareImageForHover will be called again
    delete img.dataset.ompPrepared
    delete img.dataset.ompImageUrl
    delete img.dataset.ompHoverTarget

    // DO NOT unobserve - keep watching for re-entry into viewport
    // DO NOT delete ompTracked - prevents duplicate observeImage calls
  }

  /**
   * Check if image is large enough for hover button
   */
  private isLargeEnough(img: HTMLImageElement): boolean {
    const rect = img.getBoundingClientRect()
    return rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT
  }

  /**
   * Get best available image URL
   */
  private getImageUrl(img: HTMLImageElement): string | null {
    // Priority 1: srcset (largest size)
    if (img.srcset) {
      const sources = img.srcset.split(',').map(s => {
        const parts = s.trim().split(' ')
        return { url: parts[0], size: parts[1] || '1x' }
      })

      // Sort by size and get largest
      const sorted = sources.sort((a, b) => {
        const aNum = parseFloat(a.size) || 1
        const bNum = parseFloat(b.size) || 1
        return bNum - aNum
      })

      if (sorted[0]?.url) {
        // Handle relative URLs in srcset
        const url = sorted[0].url
        if (url.startsWith('http')) return url
        // Resolve relative URL
        return new URL(url, window.location.origin).href
      }
    }

    // Priority 2: data-src (lazy loading)
    if (img.dataset.src) {
      if (img.dataset.src.startsWith('http')) return img.dataset.src
      // Resolve relative URL
      try {
        return new URL(img.dataset.src, window.location.origin).href
      } catch {
        return null
      }
    }

    // Priority 3: src attribute
    if (img.src) {
      if (img.src.startsWith('http')) return img.src
      if (img.src.startsWith('data:')) return null // Skip data URLs
      // Resolve relative URL
      try {
        return new URL(img.src, window.location.origin).href
      } catch {
        return null
      }
    }

    return null
  }
}