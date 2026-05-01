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
import { MessageType } from '@/shared/messages'
import { TaskQueueManager } from './core/task-queue-manager'
import { BatchPanelManager } from './batch-panel-manager'

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

  // Vision feature enabled (cached from storage)
  private visionEnabled: boolean = true

  // Timing control
  private hideTimeout: number | null = null

  // Bound handlers for cleanup
  private boundMouseOver: (e: MouseEvent) => void
  private boundMouseOut: (e: MouseEvent) => void
  private boundStorageChange: (changes: { [key: string]: chrome.storage.StorageChange }) => void

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
    this.boundStorageChange = this.handleStorageChange.bind(this)
  }

  /**
   * Start listening for image hovers
   */
  start(): void {
    console.log(LOG_PREFIX, 'ImageHoverButtonManager started (PLAN-B: event delegation)')

    // Load vision setting from storage
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings) {
        this.visionEnabled = response.data.settings.visionEnabled ?? true
        console.log(LOG_PREFIX, 'Vision feature setting loaded:', this.visionEnabled)
      }
    })

    // Listen for storage changes to update visionEnabled
    chrome.storage.onChanged.addListener(this.boundStorageChange)

    // Create singleton button
    this.singletonButton = this.createSingletonButton()

    // Document-level event delegation
    document.addEventListener('mouseover', this.boundMouseOver)
    document.addEventListener('mouseout', this.boundMouseOut)
  }

  /**
   * Handle storage changes - update visionEnabled when settings change
   */
  private handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
    if (changes['prompt_script_data']?.newValue?.settings?.visionEnabled !== undefined) {
      this.visionEnabled = changes['prompt_script_data'].newValue.settings.visionEnabled
      console.log(LOG_PREFIX, 'Vision feature setting updated:', this.visionEnabled)
    }
  }

  /**
   * Stop and cleanup
   */
  stop(): void {
    // Remove event listeners
    document.removeEventListener('mouseover', this.boundMouseOver)
    document.removeEventListener('mouseout', this.boundMouseOut)
    chrome.storage.onChanged.removeListener(this.boundStorageChange)

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

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'elementsFromPoint stack:', elements.slice(0, 10).map(el => ({
        tag: el.tagName,
        class: el.className?.toString().slice(0, 50),
        src: el.tagName === 'IMG' ? (el as HTMLImageElement).src?.slice(0, 50) : undefined
      })))
    }

    // Find the first large enough image in the stack
    for (const el of elements) {
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement
        const rect = img.getBoundingClientRect()
        if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT) {
          return img
        } else if (DEBUG_HOVER_BUTTON) {
          console.log(LOG_PREFIX, 'Image found but too small:', { width: rect.width, height: rect.height })
        }
      }

      // Handle covered images: check if this element contains a large image
      // (Some sites overlay transparent divs on images for hover effects)
      if (el.tagName === 'DIV') {
        const containedImg = this.findLargeImageInContainer(el as HTMLElement)
        if (containedImg) {
          if (DEBUG_HOVER_BUTTON) {
            console.log(LOG_PREFIX, 'Found covered image in DIV:', containedImg.src?.slice(0, 50))
          }
          return containedImg
        }
      }
    }

    return null
  }

  /**
   * Find a large image inside a container element
   * Used when images are covered by transparent overlay divs
   */
  private findLargeImageInContainer(container: HTMLElement): HTMLImageElement | null {
    // Query for images inside this container (direct children or nested)
    const images = container.querySelectorAll('img')

    if (DEBUG_HOVER_BUTTON && images.length > 0) {
      console.log(LOG_PREFIX, 'Container has images:', images.length)
    }

    // Prefer the first visible large image (main image, not preview stack)
    for (const img of images) {
      const rect = img.getBoundingClientRect()
      const style = window.getComputedStyle(img)
      const opacity = parseFloat(style.opacity)

      if (DEBUG_HOVER_BUTTON) {
        console.log(LOG_PREFIX, 'Checking image in container:', {
          src: img.src?.slice(0, 50),
          width: rect.width,
          height: rect.height,
          opacity
        })
      }

      // Check if image is large enough and visible (opacity > 0)
      if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT && opacity > 0) {
        return img as HTMLImageElement
      }
    }

    return null
  }

  /**
   * Handle document mouseover - detect image hover
   */
  private handleMouseOver(e: MouseEvent): void {
    // Check if vision feature is enabled (cached value)
    if (!this.visionEnabled) {
      return // Don't show button if feature is disabled
    }

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
      if (DEBUG_HOVER_BUTTON) {
        console.log(LOG_PREFIX, 'Cleared hide timeout (mouse returned)')
      }
    }

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'About to show button', {
        imgRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        currentImg: this.currentImg?.src?.slice(0, 30),
        newImg: img.src?.slice(0, 30)
      })
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
   * Handle document mouseout - check if mouse left image area
   */
  private handleMouseOut(e: MouseEvent): void {
    if (!this.currentImg) return

    // Use mouse position to check if still over the image
    // This is more reliable than event target hierarchy (handles Pinterest's sibling overlay)
    const imgRect = this.currentImg.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY

    // Check if mouse is still within image bounds (with small margin)
    const margin = 20 // Allow some margin for smoother experience
    if (x >= imgRect.left - margin && x <= imgRect.right + margin &&
        y >= imgRect.top - margin && y <= imgRect.bottom + margin) {
      // Mouse still near the image, don't hide
      return
    }

    // Check if mouse moved to our button
    const relatedTarget = e.relatedTarget instanceof Element ? e.relatedTarget : null
    if (relatedTarget && this.singletonButton?.contains(relatedTarget)) {
      return
    }

    // Mouse left image area, schedule hide
    if (this.hideTimeout) clearTimeout(this.hideTimeout)

    this.hideTimeout = window.setTimeout(() => {
      this.hideButton()
      this.hideTimeout = null
    }, HIDE_DELAY)

    if (DEBUG_HOVER_BUTTON) {
      console.log(LOG_PREFIX, 'Mouse left image area, scheduling hide')
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
   * Handle button click - route to queue or VisionModal
   */
  private handleButtonClick(imageUrl: string): void {
    console.log(LOG_PREFIX, 'Hover button clicked')

    const queueManager = TaskQueueManager.getInstance()
    const batchPanelManager = BatchPanelManager.getInstance()

    // Check if queue has tasks
    if (!queueManager.isEmpty()) {
      // Multi-task mode: add to queue
      const task = queueManager.addTask(imageUrl)

      if (task === null) {
        // Queue is full, show toast
        this.showToast('队列已满，请等待任务完成')
        return
      }

      // Ensure batch panel is open
      batchPanelManager.ensureOpen()
    } else {
      // Single-task mode: use VisionModal
      const visionManager = VisionModalManager.getInstance()
      visionManager.create(imageUrl)
    }

    // Hide button after click
    this.hideButton()
  }

  /**
   * Show toast notification
   */
  private showToast(message: string): void {
    // Create toast in Shadow DOM
    const toastContainer = document.createElement('div')
    toastContainer.style.cssText = 'position: fixed; z-index: 2147483647;'

    const shadow = toastContainer.attachShadow({ mode: 'closed' })

    // Minimal toast styles
    const style = document.createElement('style')
    style.textContent = `
      .toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(23, 23, 23, 0.9);
        color: #fff;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        opacity: 1;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }
      .toast.fading {
        opacity: 0;
      }
    `
    shadow.appendChild(style)

    const toastEl = document.createElement('div')
    toastEl.className = 'toast'
    toastEl.textContent = message
    shadow.appendChild(toastEl)

    document.body.appendChild(toastContainer)

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toastEl.classList.add('fading')
      setTimeout(() => {
        toastContainer.remove()
      }, 300)
    }, 3000)
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