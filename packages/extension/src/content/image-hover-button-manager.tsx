/**
 * ImageHoverButtonManager - Universal image hover button for prompt conversion
 *
 * PLAN-B: Event delegation + fixed positioning
 * - No container detection (works on Pinterest)
 * - Singleton button (one instance, dynamic positioning)
 * - Document-level event delegation (auto supports new images)
 */

import { createRoot, type Root } from 'react-dom/client'
import HoverButton from './components/HoverButton'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { TaskQueueManager } from './core/task-queue-manager'
import { VisionModalManager } from './vision-modal-manager'
import { isFileUrl, imageElementToBase64 } from '@/lib/file-image-utils'

const LOG_PREFIX = '[Oh My Prompt]'

// Minimum image size to show hover button (avoid icons/buttons)
const MIN_WIDTH = 100
const MIN_HEIGHT = 100

// Hide delay (ms) - allows mouse to move to button
const HIDE_DELAY = 100

// Debug mode - set to true for verbose logging
const DEBUG_HOVER_BUTTON = false

type RectLike = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>

export function isPointInsideRect(x: number, y: number, rect: RectLike): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

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
    // Load vision setting from storage
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings) {
        this.visionEnabled = response.data.settings.visionEnabled ?? true
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
    }

    // Find the first large enough image in the stack
    for (const el of elements) {
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement
        const rect = img.getBoundingClientRect()
        if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT) {
          return img
        } else if (DEBUG_HOVER_BUTTON) {
        }
      }

      // Handle picture elements: find the img inside
      if (el.tagName === 'PICTURE') {
        const img = el.querySelector('img')
        if (img) {
          const rect = img.getBoundingClientRect()
          if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT) {
            if (DEBUG_HOVER_BUTTON) {
            }
            return img
          }
        }
      }

      // Handle covered images: check if this element contains a large image
      // (Some sites overlay transparent divs on images for hover effects)
      if (el.tagName === 'DIV' || el.tagName === 'A' || el.tagName === 'SPAN') {
        const containedImg = this.findLargeImageInContainer(el as HTMLElement, x, y)
        if (containedImg) {
          if (DEBUG_HOVER_BUTTON) {
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
  private findLargeImageInContainer(container: HTMLElement, x: number, y: number): HTMLImageElement | null {
    // Query for images inside this container (direct children or nested)
    const images = container.querySelectorAll('img')

    if (DEBUG_HOVER_BUTTON && images.length > 0) {
    }

    // Prefer the first visible large image (main image, not preview stack)
    for (const img of images) {
      const rect = img.getBoundingClientRect()
      const style = window.getComputedStyle(img)
      const opacity = parseFloat(style.opacity)

      if (DEBUG_HOVER_BUTTON) {
      }

      // Check if image is large enough and visible (opacity > 0)
      if (rect.width >= MIN_WIDTH && rect.height >= MIN_HEIGHT && opacity > 0 && isPointInsideRect(x, y, rect)) {
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
    if (!img || img === this.currentImg) {
      return
    }

    // Size check
    const rect = img.getBoundingClientRect()
    if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) {
      return
    }

    // URL check
    const imageUrl = this.getImageUrl(img)
    if (!imageUrl) {
      return
    }

    // Clear hide timeout if mouse returns
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }

    // Show immediately (singleton button is cheap, no delay needed)
    this.showButton(img, imageUrl)
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
  }

  /**
   * Hide button
   */
  private hideButton(): void {
    if (!this.singletonButton) return

    this.singletonButton.style.display = 'none'
    this.currentImg = null

    if (DEBUG_HOVER_BUTTON) {
    }
  }

  /**
   * Handle button click - add task to Vision Modal queue
   */
  private handleButtonClick(imageUrl: string): void {
    // Vision Modal is a floating page-level modal that works independently
    // No sidepanel interaction needed
    this.processImageTask(imageUrl)
  }

  /**
   * Process image task - async operations after sidepanel is opened
   */
  private async processImageTask(imageUrl: string): Promise<void> {
    try {
      const queueManager = TaskQueueManager.getInstance()
      const visionModalManager = VisionModalManager.getInstance()

      // Ensure modal is open
      visionModalManager.create()

      // Handle file:// URLs - convert to base64 in content script context
      // Service worker cannot fetch file:// URLs due to Chrome security model
      if (isFileUrl(imageUrl)) {

        // Try to convert from the current image element (already loaded)
        const base64Data = this.currentImg ? imageElementToBase64(this.currentImg) : null

        if (base64Data) {
          // Add task with base64 data
          const task = queueManager.addTask('', base64Data)
          if (task === null) {
            this.showToast('队列已满，请等待任务完成')
            return
          }
        } else {
          // Failed to convert - show error
          console.warn(LOG_PREFIX, 'Failed to convert file:// image to base64')
          this.showToast('无法读取本地图片，请尝试其他图片')
          return
        }
      } else {
        // Normal HTTP URL - add to queue directly
        const task = queueManager.addTask(imageUrl)
        if (task === null) {
          this.showToast('队列已满，请等待任务完成')
          return
        }
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'Queue operation failed:', error)
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

    // Priority 2: Check parent <picture> element's <source> srcset
    const picture = img.closest('picture')
    if (picture) {
      const sources = picture.querySelectorAll('source')
      for (const source of sources) {
        const srcset = source.srcset
        if (srcset) {
          const parsed = srcset.split(',').map(s => {
            const parts = s.trim().split(' ')
            return { url: parts[0], size: parts[1] || '1x' }
          })
          const sorted = parsed.sort((a, b) => {
            const aNum = parseFloat(a.size) || 1
            const bNum = parseFloat(b.size) || 1
            return bNum - aNum
          })
          if (sorted[0]?.url && sorted[0].url.startsWith('http')) {
            if (DEBUG_HOVER_BUTTON) {
            }
            return sorted[0].url
          }
        }
      }
    }

    // Priority 3: Pinterest-specific attributes
    const pinterestAttrs = ['data-pin-url', 'data-pin-media', 'data-original', 'data-srcset']
    for (const attr of pinterestAttrs) {
      const value = img.getAttribute(attr)
      if (value && value.startsWith('http')) {
        if (DEBUG_HOVER_BUTTON) {
        }
        return value
      }
    }

    // Priority 4: data-src (lazy loading)
    if (img.dataset.src) {
      if (img.dataset.src.startsWith('http')) return img.dataset.src
      try {
        return new URL(img.dataset.src, window.location.origin).href
      } catch {
        // Invalid URL, fallback
      }
    }

    // Priority 5: src attribute
    if (img.src) {
      if (img.src.startsWith('http')) return img.src
      if (img.src.startsWith('data:')) {
        // Skip data URLs but log for debugging
        if (DEBUG_HOVER_BUTTON) {
        }
        return null
      }
      try {
        return new URL(img.src, window.location.origin).href
      } catch {
        return null
      }
    }

    return null
  }
}
