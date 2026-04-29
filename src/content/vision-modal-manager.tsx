/**
 * VisionModalManager - Shadow DOM container for Vision API modal
 * Creates and manages the modal mount point with CSS isolation
 * Works on all websites (not just Lovart)
 */

import { createRoot, type Root } from 'react-dom/client'
import VisionModal from './components/VisionModal'
import { ErrorBoundary } from './components/ErrorBoundary'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Host element ID for Shadow DOM container
 */
const HOST_ID = 'omp-vision-modal-host'

/**
 * VisionModalManager creates Shadow DOM isolated modal container
 * Singleton pattern - only one modal can exist at a time
 */
export class VisionModalManager {
  private static instance: VisionModalManager | null = null
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null

  /**
   * Get singleton instance
   */
  static getInstance(): VisionModalManager {
    if (!VisionModalManager.instance) {
      VisionModalManager.instance = new VisionModalManager()
    }
    return VisionModalManager.instance
  }

  /**
   * Create modal in current page
   * @param imageUrl - The image URL to process
   * @param tabId - Optional tab ID for Lovart insertion
   */
  create(imageUrl: string, tabId?: number): void {
    // Remove existing instance if present (singleton)
    this.destroy()

    // Create host element
    this.hostElement = document.createElement('div')
    this.hostElement.id = HOST_ID

    // Attach Shadow DOM for style isolation (closed mode for security)
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' })

    // Inject styles
    const styleElement = document.createElement('style')
    styleElement.textContent = this.getStyles()
    this.shadowRoot.appendChild(styleElement)

    // Create modal root for React
    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    this.shadowRoot.appendChild(modalRoot)

    // Mount to body
    document.body.appendChild(this.hostElement)

    // Mount React component
    this.reactRoot = createRoot(modalRoot)
    this.reactRoot.render(
      <ErrorBoundary>
        <VisionModal
          imageUrl={imageUrl}
          tabId={tabId}
          onClose={this.destroy.bind(this)}
        />
      </ErrorBoundary>
    )

    console.log(LOG_PREFIX, 'Vision modal created for image:', imageUrl.substring(0, 50) + '...')
  }

  /**
   * Destroy modal and cleanup
   */
  destroy(): void {
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

    console.log(LOG_PREFIX, 'Vision modal destroyed')
  }

  /**
   * Check if modal is currently visible
   */
  isOpen(): boolean {
    return this.hostElement !== null && document.body.contains(this.hostElement)
  }

  /**
   * Get CSS styles for Shadow DOM
   * Compiled Tailwind-like styles for modal UI
   */
  private getStyles(): string {
    return `
      /* Modal root container */
      #modal-root {
        all: initial;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      /* Overlay - semi-transparent backdrop */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647; /* Maximum z-index */
      }

      /* Modal card - centered floating box */
      .modal-card {
        width: 480px;
        max-width: 90vw;
        max-height: 90vh;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* Modal header */
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid #E5E5E5;
      }

      .modal-title {
        font-size: 14px;
        font-weight: 600;
        color: #171717;
      }

      .modal-close {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .modal-close:hover {
        background: #f8f8f8;
      }

      .modal-close svg {
        width: 16px;
        height: 16px;
        color: #64748B;
      }

      /* Modal content */
      .modal-content {
        padding: 16px;
        flex: 1;
        overflow-y: auto;
      }

      /* Loading view */
      .loading-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 32px 0;
      }

      .loading-spinner {
        width: 32px;
        height: 32px;
        animation: spin 1s linear infinite;
        color: #64748B;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .loading-text {
        font-size: 14px;
        color: #64748B;
      }

      /* Success view - prompt preview */
      .success-view {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .success-label {
        font-size: 14px;
        font-weight: 500;
        color: #171717;
      }

      .prompt-preview {
        background: #f8f8f8;
        border: 1px solid #E5E5E5;
        border-radius: 8px;
        padding: 12px;
        font-size: 14px;
        color: #171717;
        white-space: pre-wrap;
        max-height: 200px;
        overflow-y: auto;
        line-height: 1.5;
      }

      /* Action buttons */
      .action-buttons {
        display: flex;
        gap: 8px;
      }

      .btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      .btn-primary {
        background: #1890ff;
        border: 1px solid #1890ff;
        color: #ffffff;
      }

      .btn-primary:hover {
        background: #40a9ff;
        border-color: #40a9ff;
      }

      .btn-outline {
        background: #ffffff;
        border: 1px solid #E5E5E5;
        color: #171717;
      }

      .btn-outline:hover {
        background: #f8f8f8;
        border-color: #d0d0d0;
      }

      .btn svg {
        width: 16px;
        height: 16px;
      }

      /* Error view */
      .error-view {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .error-message {
        font-size: 14px;
        color: #ef4444;
      }

      /* Feedback view */
      .feedback-view {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .feedback-success {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #22c55e;
      }

      .feedback-success svg {
        width: 16px;
        height: 16px;
      }

      .feedback-text {
        font-size: 14px;
      }

      .feedback-hint {
        font-size: 12px;
        color: #64748B;
      }

      /* Config view - API configuration form */
      .config-view {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .config-description {
        font-size: 14px;
        color: #64748B;
        line-height: 1.5;
      }

      .config-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .config-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .config-label {
        font-size: 12px;
        font-weight: 500;
        color: #171717;
      }

      .config-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #E5E5E5;
        border-radius: 8px;
        font-size: 14px;
        color: #171717;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      .config-input:focus {
        outline: none;
        border-color: #1890ff;
      }

      .config-input::placeholder {
        color: #9CA3AF;
      }

      /* Scrollbar styling */
      .prompt-preview::-webkit-scrollbar,
      .modal-content::-webkit-scrollbar {
        width: 6px;
      }

      .prompt-preview::-webkit-scrollbar-track,
      .modal-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .prompt-preview::-webkit-scrollbar-thumb,
      .modal-content::-webkit-scrollbar-thumb {
        background: #ddd;
        border-radius: 3px;
      }

      .prompt-preview::-webkit-scrollbar-thumb:hover,
      .modal-content::-webkit-scrollbar-thumb:hover {
        background: #ccc;
      }
    `
  }
}