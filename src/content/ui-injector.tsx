/**
 * UIInjector - Shadow DOM container for isolated extension UI
 * Creates and manages the React mount point with CSS isolation
 */

import { createRoot, type Root } from 'react-dom/client'
import { DropdownApp } from './components/DropdownApp'
import { extractLovartButtonStyle, getLovartIconColor } from './style-extractor'

const LOG_PREFIX = '[Lovart Injector]'

/**
 * Host element ID for Shadow DOM container
 */
const HOST_ID = 'lovart-injector-host'

/**
 * UIInjector creates Shadow DOM isolated UI container
 * positioned relative to Lovart input element
 */
export class UIInjector {
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null
  private inputElement: HTMLElement | null = null
  private lovartIconColor: string = '#666'
  private repositionCleanup: (() => void) | null = null

  /**
   * Inject UI container near the input element
   */
  inject(inputElement: HTMLElement): void {
    // Remove existing instance if present (this clears all properties)
    this.remove()

    // NOW set input element AFTER remove() clears it
    this.inputElement = inputElement

    // Create host element
    this.hostElement = document.createElement('div')
    this.hostElement.id = HOST_ID

    // Extract Lovart style at runtime
    const lovartStyle = extractLovartButtonStyle()
    this.lovartIconColor = getLovartIconColor()

    // Attach Shadow DOM
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' })

    // Inject styles and mount point
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles(lovartStyle)}
      </style>
      <div id="react-root"></div>
    `

    // Inject into page FIRST (required for style calculations)
    document.body.appendChild(this.hostElement)

    // Position host element AFTER it's in DOM
    this.positionHost()

    // Mount React
    const mountPoint = this.shadowRoot.querySelector('#react-root')
    if (mountPoint) {
      this.reactRoot = createRoot(mountPoint)
      this.reactRoot.render(
        <DropdownApp
          lovartIconColor={this.lovartIconColor}
          inputElement={inputElement}
        />
      )
    }

    // Set up repositioning
    this.setupRepositioning()

    console.log(LOG_PREFIX, 'UI injected successfully')
  }

  /**
   * Position host element relative to input
   * Use fixed positioning (relative to viewport)
   * Position button to the left of input with some distance
   */
  private positionHost(): void {
    if (!this.hostElement || !this.inputElement) return

    const rect = this.inputElement.getBoundingClientRect()

    // Button dimensions
    const buttonWidth = 44
    const buttonHeight = 44
    const gapX = 12  // Horizontal distance from input
    const gapY = 4   // Vertical offset (move slightly upward)

    // Calculate position - slightly above center, with more distance from input
    const verticalCenter = rect.top + (rect.height - buttonHeight) / 2 - gapY
    const leftPos = Math.max(8, rect.left - buttonWidth - gapX)

    // Use cssText to set all styles at once with !important for override
    this.hostElement.style.cssText = `
      position: fixed !important;
      top: ${verticalCenter}px !important;
      left: ${leftPos}px !important;
      width: ${buttonWidth}px !important;
      height: ${buttonHeight}px !important;
      z-index: 2147483647 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
    `
  }

  /**
   * Setup scroll/resize event handlers for repositioning
   */
  private setupRepositioning(): void {
    const reposition = () => this.positionHost()

    window.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition)

    // Cleanup function
    this.repositionCleanup = () => {
      window.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  }

  /**
   * Get CSS styles for Shadow DOM
   */
  private getStyles(lovartStyle: { backgroundColor: string; borderRadius: string }): string {
    return `
      /* Container reset - preserve display for visibility */
      #react-root {
        all: initial;
        display: block;
        width: 100%;
        height: 100%;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      /* Dropdown app wrapper */
      .dropdown-app {
        width: 100%;
        height: 100%;
        position: relative;
      }

      /* Trigger button (WCAG 44px touch target) */
      .trigger-button {
        width: 44px;
        height: 44px;
        border-radius: ${lovartStyle.borderRadius};
        background: ${lovartStyle.backgroundColor};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;
        padding: 0;
      }

      .trigger-button:hover {
        background: #e8e8e8;
      }

      .trigger-button:active {
        background: #dcdcdc;
      }

      .trigger-button:focus {
        outline: 2px solid #1890ff;
        outline-offset: 2px;
      }

      .trigger-button svg {
        width: 20px;
        height: 20px;
      }

      /* Dropdown container */
      .dropdown-container {
        position: absolute;
        top: 48px;
        left: 0;
        width: 280px;
        max-height: 320px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px;
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 150ms ease-out, transform 150ms ease-out;
      }

      .dropdown-container.open {
        opacity: 1;
        transform: translateY(0);
      }

      .dropdown-container.closing {
        opacity: 0;
        transform: translateY(0);
        transition: opacity 100ms ease-in;
      }

      /* Category header */
      .category-header {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        color: #999;
        text-transform: uppercase;
      }

      .category-header:first-child {
        margin-top: 0;
      }

      .category-header:not(:first-child) {
        margin-top: 12px;
      }

      /* Prompt item */
      .prompt-item {
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .prompt-item:hover {
        background: #f8f8f8;
      }

      .prompt-item.selected {
        background: #e6f4ff;
        border-left: 2px solid #1890ff;
      }

      .prompt-name {
        font-size: 14px;
        font-weight: 500;
        color: #333;
        line-height: 1.4;
      }

      .prompt-preview {
        font-size: 12px;
        color: #666;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 250px;
      }

      /* Empty state */
      .empty-state {
        padding: 24px;
        text-align: center;
      }

      .empty-message {
        font-size: 14px;
        color: #666;
      }

      .empty-subtext {
        font-size: 12px;
        color: #999;
        margin-top: 8px;
      }

      /* Scrollbar styling */
      .dropdown-container::-webkit-scrollbar {
        width: 6px;
      }

      .dropdown-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .dropdown-container::-webkit-scrollbar-thumb {
        background: #ddd;
        border-radius: 3px;
      }

      .dropdown-container::-webkit-scrollbar-thumb:hover {
        background: #ccc;
      }
    `
  }

  /**
   * Remove UI container and cleanup
   */
  remove(): void {
    // Cleanup event listeners
    if (this.repositionCleanup) {
      this.repositionCleanup()
      this.repositionCleanup = null
    }

    // Unmount React
    if (this.reactRoot) {
      this.reactRoot.unmount()
      this.reactRoot = null
    }

    // Remove host element
    if (this.hostElement) {
      this.hostElement.remove()
      this.hostElement = null
    }

    this.shadowRoot = null
    this.inputElement = null
  }

  /**
   * Check if UI is currently injected
   */
  isInjected(): boolean {
    return this.hostElement !== null && document.body.contains(this.hostElement)
  }
}