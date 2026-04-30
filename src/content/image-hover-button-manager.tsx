/**
 * ImageHoverButtonManager - Universal image hover button for prompt conversion
 *
 * PLAN-B: Event delegation + fixed positioning
 * - No container detection (works on Pinterest)
 * - Singleton button (one instance, dynamic positioning)
 * - Document-level event delegation (auto supports new images)
 */

import { createRoot, type Root } from 'react-dom/client'
import { VisionModalManager } from './vision-modal-manager'
import HoverButton from './components/HoverButton'

const LOG_PREFIX = '[Oh My Prompt]'

// Minimum image size to show hover button (avoid icons/buttons)
const MIN_WIDTH = 100
const MIN_HEIGHT = 100

// Hide delay (ms) - allows mouse to move to button
const HIDE_DELAY = 100

// Debug mode - set to true for verbose logging
const DEBUG_HOVER_BUTTON = false

/**
 * ImageHoverButtonManager - Singleton pattern
 * Uses event delegation for universal image detection
 */
export class ImageHoverButtonManager {
  private static instance: ImageHoverButtonManager | null = null

  // Singleton button (created once, reused for all images)
  private singletonButton: HTMLDivElement | null = null
  private singletonRoot: Root | null = null
  private currentImg: HTMLImageElement | null = null

  // Timing control
  private hideTimeout: number | null = null

  // Bound handlers for cleanup
  private boundMouseOver: (e: MouseEvent) => void
  private boundMouseOut: (e: MouseEvent) => void

  /**
   * Get singleton instance
   */
  static getInstance(): ImageHoverButtonManager {
    if (!ImageHoverButtonManager.instance) {
      ImageHoverButtonManager.instance = new ImageHoverButtonManager()
    }
    return ImageHoverButtonManager.instance
  }

  private constructor() {
    // Pre-bind handlers for proper cleanup
    this.boundMouseOver = this.handleMouseOver.bind(this)
    this.boundMouseOut = this.handleMouseOut.bind(this)
  }

  /**
   * Start listening for image hovers
   */
  start(): void {
    console.log(LOG_PREFIX, 'ImageHoverButtonManager started (PLAN-B: event delegation)')

    // Create singleton button
    this.singletonButton = this.createSingletonButton()

    // Document-level event delegation
    document.addEventListener('mouseover', this.boundMouseOver)
    document.addEventListener('mouseout', this.boundMouseOut)
  }

  /**
   * Stop and cleanup
   */
  stop(): void {
    // Remove event listeners
    document.removeEventListener('mouseover', this.boundMouseOver)
    document.removeEventListener('mouseout', this.boundMouseOut)

    // Clear hide timeout
    if (this.hideTimeout) clearTimeout(this.hideTimeout)

    // Cleanup singleton button
    if (this.singletonRoot) {
      this.singletonRoot.unmount()
      this.singletonRoot = null
    }
    if (this.singletonButton) {
      this.singletonButton.remove()
      this.singletonButton = null
    }

    this.currentImg = null

    console.log(LOG_PREFIX, 'ImageHoverButtonManager stopped')
  }

  /**
   * Create singleton button container
   */
  private createSingletonButton(): HTMLDivElement {
    const container = document.createElement('div')
    container.className = 'omp-hover-button-singleton'
    container.style.cssText = `
      position: fixed;
      display: none;
      z-index: 2147483647;
      pointer-events: none;
    `

    // Shadow DOM for style isolation
    const shadow = container.attachShadow({ mode: 'closed' })

    // Styles
    const style = document.createElement('style')
    style.textContent = `
      :host {
        all: initial;
        box-sizing: border-box;
      }

      .button-wrapper {
        pointer-events: auto;
        opacity: 0;
        animation: fadeIn 0.2s ease forwards;
      }

      .button-wrapper.fading-out {
        animation: fadeOut 0.15s ease forwards;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 1; transform: scale(1); }
      }

      @keyframes fadeOut {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
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
    shadow.appendChild(style)

    // Button wrapper
    const buttonWrapper = document.createElement('div')
    buttonWrapper.className = 'button-wrapper'
    shadow.appendChild(buttonWrapper)

    // Mount to body
    document.body.appendChild(container)

    // React root (will render on demand)
    this.singletonRoot = createRoot(buttonWrapper)

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'Singleton button created')
    }

    return container
  }

  /**
   * Find image at mouse position
   */
  private findImageAtPoint(x: number, y: number): HTMLImageElement | null {
    // Get all elements at this point
    const elements = document.elementsFromPoint(x, y)

    // Find the first large enough image in the stack
    for (const el of elements) {
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement
        const rect = img.getBoundingClientRect()
        if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT) {
          return img
        }
      }
    }

    return null
  }

  /**
   * Handle document mouseover - detect image hover
   */
  private handleMouseOver(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null
    if (!target) return

    // Find image - use mouse position for accurate detection
    const img = this.findImageAtPoint(e.clientX, e.clientY)
    if (!img || img === this.currentImg) return

    // Size check
    const rect = img.getBoundingClientRect()
    if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) {
      if (DEBUG_HOVER_BUTTON) {
        console.log(LOG_PREFIX, 'Image too small, skipping', { width: rect.width, height: rect.height })
      }
      return
    }

    // URL check
    const imageUrl = this.getImageUrl(img)
    if (!imageUrl) {
      if (DEBUG_HOVER_BUTTON) {
        console.log(LOG_PREFIX, 'No valid image URL, skipping')
      }
      return
    }

    // Clear hide timeout if mouse returns
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }

    // Show immediately (singleton button is cheap, no delay needed)
    this.showButton(img, imageUrl)

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'Image detected, showing button', {
        src: imageUrl.substring(0, 50),
        size: { width: rect.width, height: rect.height }
      })
    }
  }

  /**
   * Handle document mouseout - hide button
   */
  private handleMouseOut(e: MouseEvent): void {
    // Check if mouse left the area containing the current image
    if (!this.currentImg) return

    const target = e.target instanceof Element ? e.target : null
    const relatedTarget = e.relatedTarget instanceof Element ? e.relatedTarget : null

    // Check if mouse moved to our button (don't hide)
    if (relatedTarget && this.singletonButton?.contains(relatedTarget)) {
      if (DEBUG_HOVER_BUTTON) {
        console.log(LOG_PREFIX, 'Mouse moved to button, not hiding')
      }
      return
    }

    // Check if mouse left the current image or its container
    // Only hide if truly leaving the image area
    if (target && this.currentImg.contains(target)) {
      // Mouse left from a child element of the image (shouldn't happen for img)
      return
    }

    // Check if relatedTarget is still within an ancestor of the current image
    // (e.g., moved from img to parent wrapper)
    if (relatedTarget && relatedTarget.contains(this.currentImg)) {
      return
    }

    // Delayed hide (allows mouse to reach button)
    if (this.hideTimeout) clearTimeout(this.hideTimeout)

    this.hideTimeout = window.setTimeout(() => {
      this.hideButton()
      this.hideTimeout = null
    }, HIDE_DELAY)

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'Mouse left image, scheduling hide')
    }
  }

  /**
   * Show button positioned at image
   */
  private showButton(img: HTMLImageElement, imageUrl: string): void {
    if (!this.singletonButton || !this.singletonRoot) return

    const rect = img.getBoundingClientRect()

    // Position at image top-left corner (8px offset)
    this.singletonButton.style.top = `${rect.top + 8}px`
    this.singletonButton.style.left = `${rect.left + 8}px`
    this.singletonButton.style.display = 'block'

    // Update state
    this.currentImg = img

    // Render React button
    this.singletonRoot.render(
      <HoverButton
        imageUrl={imageUrl}
        onClick={() => this.handleButtonClick(imageUrl)}
      />
    )

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'Button shown', {
        position: { top: rect.top + 8, left: rect.left + 8 },
        imageUrl: imageUrl.substring(0, 50)
      })
    }
  }

  /**
   * Hide button
   */
  private hideButton(): void {
    if (!this.singletonButton) return

    this.singletonButton.style.display = 'none'
    this.currentImg = null

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'Button hidden')
    }
  }

  /**
   * Handle button click - open Vision Modal
   */
  private handleButtonClick(imageUrl: string): void {
    console.log(LOG_PREFIX, 'Hover button clicked, opening Vision Modal')

    const visionManager = VisionModalManager.getInstance()
    visionManager.create(imageUrl)

    // Hide button after click
    this.hideButton()
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
        const url = sorted[0].url
        if (url.startsWith('http')) return url
        try {
          return new URL(url, window.location.origin).href
        } catch {
          // Invalid URL, fallback
        }
      }
    }

    // Priority 2: data-src (lazy loading)
    if (img.dataset.src) {
      if (img.dataset.src.startsWith('http')) return img.dataset.src
      try {
        return new URL(img.dataset.src, window.location.origin).href
      } catch {
        // Invalid URL, fallback
      }
    }

    // Priority 3: src attribute
    if (img.src) {
      if (img.src.startsWith('http')) return img.src
      if (img.src.startsWith('data:')) return null // Skip data URLs
      try {
        return new URL(img.src, window.location.origin).href
      } catch {
        return null
      }
    }

    return null
  }
}