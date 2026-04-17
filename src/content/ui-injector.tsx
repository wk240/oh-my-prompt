/**
 * UIInjector - Shadow DOM container for isolated extension UI
 * Creates and manages the React mount point with CSS isolation
 */

import { createRoot, type Root } from 'react-dom/client'
import { DropdownApp } from './components/DropdownApp'
import { ErrorBoundary } from './components/ErrorBoundary'

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

    // Attach Shadow DOM
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' })

    // Inject styles and mount point
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles()}
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
        <ErrorBoundary>
          <DropdownApp
            inputElement={inputElement}
          />
        </ErrorBoundary>
      )
    }

    // Set up repositioning
    this.setupRepositioning()

    console.log(LOG_PREFIX, 'UI injected successfully')
  }

  /**
   * Position host element relative to input
   * Use fixed positioning (relative to viewport)
   */
  private positionHost(): void {
    if (!this.hostElement || !this.inputElement) return

    const rect = this.inputElement.getBoundingClientRect()

    // Trigger button dimensions (wider now for "Select Prompt" label)
    const buttonWidth = 140
    const buttonHeight = 48
    const gapX = 12
    const gapY = 4

    const verticalCenter = rect.top + (rect.height - buttonHeight) / 2 - gapY
    const leftPos = Math.max(8, rect.left - buttonWidth - gapX)

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
  private getStyles(): string {
    return `
      /* Container reset */
      #react-root {
        all: initial;
        display: block;
        width: 100%;
        height: 100%;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      /* Dropdown app wrapper */
      .dropdown-app {
        width: 100%;
        height: 100%;
        position: relative;
      }

      /* Trigger button - Select Prompt style */
      .trigger-button {
        width: auto;
        min-width: 120px;
        height: 48px;
        border-radius: 8px;
        background: #ffffff;
        border: 1px solid #E5E5E5;
        border-bottom: 1px solid #E5E5E5;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        transition: background 0.15s ease, border-color 0.15s ease;
        box-sizing: border-box;
      }

      .trigger-button:hover {
        background: #f8f8f8;
        border-color: #d0d0d0;
      }

      .trigger-button:active {
        background: #f0f0f0;
      }

      .trigger-button:focus {
        outline: 2px solid #A16207;
        outline-offset: 2px;
      }

      .trigger-button.open {
        border-bottom-color: #A16207;
      }

      .trigger-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #A16207;
      }

      .trigger-label {
        font-size: 12px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
      }

      /* Dropdown container */
      .dropdown-container {
        position: absolute;
        width: 360px;
        max-height: 400px;
        overflow-y: auto;
        overflow-x: hidden;
        background: #ffffff;
        border: 1px solid #E5E5E5;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 150ms ease-out, transform 150ms ease-out;
        padding: 16px;
        box-sizing: border-box;
      }

      .dropdown-container.open {
        opacity: 1;
        transform: translateY(0);
      }

      /* Dropdown items wrapper */
      .dropdown-items {
        display: flex;
        flex-direction: column;
      }

      /* Dropdown header */
      .dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid #E5E5E5;
        margin-bottom: 12px;
      }

      .dropdown-header-left {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }

      .dropdown-header-title {
        font-size: 10px;
        font-weight: 600;
        color: #64748B;
        letter-spacing: 1px;
        font-family: 'Inter', sans-serif;
      }

      /* Category Selector */
      .category-selector {
        position: relative;
        display: flex;
        align-items: center;
      }

      .category-selector-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: #f8f8f8;
        border: 1px solid #E5E5E5;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
        transition: background 0.15s ease, border-color 0.15s ease;
        white-space: nowrap;
      }

      .category-selector-button:hover {
        background: #f0f0f0;
        border-color: #d0d0d0;
      }

      .category-icon {
        color: #64748B;
      }

      .category-name {
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .category-chevron {
        color: #64748B;
        transition: transform 0.15s ease;
      }

      .category-chevron.open {
        transform: rotate(180deg);
      }

      .category-menu {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        min-width: 120px;
        background: #ffffff;
        border: 1px solid #E5E5E5;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        z-index: 1000;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .category-menu-item {
        display: block;
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: none;
        border-radius: 4px;
        text-align: left;
        font-size: 12px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
        cursor: pointer;
        transition: background 0.15s ease;
        white-space: nowrap;
      }

      .category-menu-item:hover {
        background: #f8f8f8;
      }

      .category-menu-item.selected {
        background: #fef3e2;
        color: #A16207;
      }

      .dropdown-close {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1px solid #171717;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .dropdown-close:hover {
        background: #f8f8f8;
      }

      .dropdown-close svg {
        color: #171717;
      }

      /* Dropdown item */
      .dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #E5E5E5;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .dropdown-item:hover {
        background: #f8f8f8;
      }

      .dropdown-item.last {
        border-bottom: none;
      }

      .dropdown-item.selected {
        background: #fef3e2;
      }

      .dropdown-item-icon {
        width: 16px;
        height: 16px;
        color: #171717;
      }

      .dropdown-item-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .dropdown-item-name {
        font-size: 12px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
      }

      .dropdown-item-preview {
        font-size: 10px;
        color: #64748B;
        font-family: 'Inter', sans-serif;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dropdown-item-arrow {
        width: 12px;
        height: 12px;
        color: #171717;
      }

      /* Empty state */
      .empty-state {
        padding: 24px;
        text-align: center;
      }

      .empty-message {
        font-size: 12px;
        color: #64748B;
        font-family: 'Inter', sans-serif;
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