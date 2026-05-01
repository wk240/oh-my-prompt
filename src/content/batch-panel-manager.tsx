/**
 * BatchPanelManager - Shadow DOM container for BatchProgressPanel
 * Creates and manages the panel mount point with CSS isolation
 */

import { createRoot, type Root } from 'react-dom/client'
import BatchProgressPanel, { getBatchPanelStyles } from './components/BatchProgressPanel'
import { ErrorBoundary } from './components/ErrorBoundary'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Host element ID for Shadow DOM container
 */
const HOST_ID = 'omp-batch-panel-host'

/**
 * BatchPanelManager creates Shadow DOM isolated panel container
 * Singleton pattern - only one panel can exist at a time
 */
export class BatchPanelManager {
  private static instance: BatchPanelManager | null = null
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null

  /**
   * Get singleton instance
   */
  static getInstance(): BatchPanelManager {
    if (!BatchPanelManager.instance) {
      BatchPanelManager.instance = new BatchPanelManager()
    }
    return BatchPanelManager.instance
  }

  /**
   * Create panel in current page
   */
  create(): void {
    // Remove existing instance if present (singleton)
    this.destroy()

    // Create host element
    this.hostElement = document.createElement('div')
    this.hostElement.id = HOST_ID

    // Attach Shadow DOM for style isolation (closed mode for security)
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' })

    // Inject styles
    const styleElement = document.createElement('style')
    styleElement.textContent = getBatchPanelStyles()
    this.shadowRoot.appendChild(styleElement)

    // Create panel root for React
    const panelRoot = document.createElement('div')
    panelRoot.id = 'panel-root'
    this.shadowRoot.appendChild(panelRoot)

    // Mount to body
    document.body.appendChild(this.hostElement)

    // Mount React component
    this.reactRoot = createRoot(panelRoot)
    this.reactRoot.render(
      <ErrorBoundary>
        <BatchProgressPanel />
      </ErrorBoundary>
    )

    console.log(LOG_PREFIX, 'Batch panel created')
  }

  /**
   * Destroy panel and cleanup
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

    console.log(LOG_PREFIX, 'Batch panel destroyed')
  }

  /**
   * Check if panel is currently visible
   */
  isOpen(): boolean {
    return this.hostElement !== null && document.body.contains(this.hostElement)
  }

  /**
   * Ensure panel exists (create if needed)
   */
  ensureOpen(): void {
    if (!this.isOpen()) {
      this.create()
    }
  }
}