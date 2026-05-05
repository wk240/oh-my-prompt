/**
 * Injector - 配置驱动的 UI 注入器
 * 接收平台配置的锚点和位置，挂载 Shadow DOM
 */

import { createRoot, Root } from 'react-dom/client'
import type { UIInjectionConfig } from '../platforms/base/types'
import type { InsertStrategy } from '../platforms/base/strategy-interface'
import { DropdownApp } from '../components/DropdownApp'
import { TriggerButton } from '../components/TriggerButton'

const LOG_PREFIX = '[Oh My Prompt]'
const HOST_ID = 'oh-my-prompt-host'
const TOOLTIP_ID = 'oh-my-prompt-tooltip'

export class Injector {
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null
  private anchorObserver: MutationObserver | null = null
  private pendingInjection: {
    inputElement: HTMLElement
    config: UIInjectionConfig
    inserter: InsertStrategy
  } | null = null
  private tooltipElement: HTMLDivElement | null = null
  private tooltipObserver: MutationObserver | null = null

  isInjected(): boolean {
    return this.hostElement !== null && document.contains(this.hostElement)
  }

  inject(
    inputElement: HTMLElement,
    config: UIInjectionConfig,
    inserter: InsertStrategy
  ): void {
    this.remove()
    this.stopAnchorObserver()

    const anchor = document.querySelector<HTMLElement>(config.anchorSelector)
    if (!anchor) {
      console.warn(LOG_PREFIX, 'Anchor not found:', config.anchorSelector, '- waiting for anchor to appear...')
      this.waitForAnchor(inputElement, config, inserter)
      return
    }

    this.performInjection(inputElement, config, inserter, anchor)
  }

  /**
   * Wait for anchor element to appear using MutationObserver
   */
  private waitForAnchor(
    inputElement: HTMLElement,
    config: UIInjectionConfig,
    inserter: InsertStrategy
  ): void {
    this.pendingInjection = { inputElement, config, inserter }

    this.anchorObserver = new MutationObserver(() => {
      const anchor = document.querySelector<HTMLElement>(config.anchorSelector)
      if (anchor && this.pendingInjection) {
        console.log(LOG_PREFIX, 'Anchor appeared:', config.anchorSelector)
        this.stopAnchorObserver()
        this.performInjection(
          this.pendingInjection.inputElement,
          this.pendingInjection.config,
          this.pendingInjection.inserter,
          anchor
        )
        this.pendingInjection = null
      }
    })

    this.anchorObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      if (this.pendingInjection) {
        console.warn(LOG_PREFIX, 'Anchor wait timeout for:', config.anchorSelector)
        this.stopAnchorObserver()
        this.pendingInjection = null
      }
    }, 10000)
  }

  private stopAnchorObserver(): void {
    this.anchorObserver?.disconnect()
    this.anchorObserver = null
  }

  /**
   * Create tooltip element at document.body level
   */
  private createTooltip(): void {
    if (this.tooltipElement) return

    this.tooltipElement = document.createElement('div')
    this.tooltipElement.id = TOOLTIP_ID
    this.tooltipElement.style.cssText = `
      position: fixed;
      background: #1f1f1f;
      color: #fff;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: nowrap;
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      isolation: isolate;
    `
    this.tooltipElement.textContent = 'Oh, My Prompt'
    document.body.appendChild(this.tooltipElement)

    // Listen for tooltip events from shadow DOM
    this.tooltipObserver = new MutationObserver(() => {
      const host = this.hostElement
      if (!host) return

      const showAttr = host.getAttribute('data-tooltip-show')
      if (showAttr === 'true') {
        // Move tooltip to end of body to ensure highest DOM order
        document.body.appendChild(this.tooltipElement!)

        const rect = host.getBoundingClientRect()
        this.tooltipElement!.style.left = `${rect.left + rect.width / 2}px`
        this.tooltipElement!.style.top = `${rect.top - 12}px`
        this.tooltipElement!.style.transform = 'translate(-50%, -100%)'
        this.tooltipElement!.style.opacity = '1'

        // Check if tooltip is clipped by any overflow:hidden parent
        // For fixed elements, check against viewport boundaries and potential overlays
        this.ensureTooltipVisible()
      } else {
        this.tooltipElement!.style.opacity = '0'
      }
    })

    this.tooltipObserver.observe(this.hostElement!, {
      attributes: true,
      attributeFilter: ['data-tooltip-show', 'data-tooltip-position'],
    })
  }

  /**
   * Find the highest z-index container on the page
   */
  private findTopmostContainer(): HTMLElement {
    const candidates: HTMLElement[] = [document.body]

    // Find elements with very high z-index (modal backdrops, overlays, etc.)
    const allElements = document.querySelectorAll<HTMLElement>('*')
    for (const el of allElements) {
      const style = getComputedStyle(el)
      const zIndex = parseInt(style.zIndex)
      if (zIndex > 1000000 && style.position !== 'static') {
        candidates.push(el)
      }
    }

    // Sort by z-index descending, pick the highest
    let topmost = document.body
    let highestZ = 0
    for (const el of candidates) {
      const zIndex = parseInt(getComputedStyle(el).zIndex) || 0
      if (zIndex >= highestZ) {
        highestZ = zIndex
        topmost = el
      }
    }

    return topmost
  }

  /**
   * Ensure tooltip is visible by moving it to the topmost container
   */
  private ensureTooltipVisible(): void {
    if (!this.tooltipElement) return

    // Find and attach to the topmost container on the page
    const topmost = this.findTopmostContainer()

    // If topmost is not body, append tooltip to it (or create a layer inside)
    if (topmost !== document.body) {
      // Append to the topmost container to ensure visibility
      topmost.appendChild(this.tooltipElement!)
    } else {
      // Still ensure it's at the end of body
      document.body.appendChild(this.tooltipElement!)
    }
  }

  /**
   * Perform the actual UI injection
   */
  private performInjection(
    inputElement: HTMLElement,
    config: UIInjectionConfig,
    inserter: InsertStrategy,
    anchor: HTMLElement
  ): void {
    this.hostElement = document.createElement('span')
    this.hostElement.id = HOST_ID
    this.hostElement.setAttribute('data-testid', 'oh-my-prompt-trigger')

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' })

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <div id="react-root"></div>
    `

    // 根据配置插入
    switch (config.position) {
      case 'before':
        anchor.parentNode?.insertBefore(this.hostElement, anchor)
        break
      case 'after':
        anchor.parentNode?.insertBefore(this.hostElement, anchor.nextSibling)
        break
      case 'prepend':
        anchor.prepend(this.hostElement)
        break
      case 'append':
        anchor.append(this.hostElement)
        break
    }

    const mountPoint = this.shadowRoot.querySelector('#react-root')
    if (mountPoint) {
      const ButtonComponent = config.customButton ?? TriggerButton
      this.reactRoot = createRoot(mountPoint)
      this.reactRoot.render(
        <DropdownApp
          inputElement={inputElement}
          inserter={inserter}
          buttonComponent={ButtonComponent}
          buttonStyle={config.buttonStyle}
        />
      )
    }

    // Create tooltip at document.body level (outside Shadow DOM)
    this.createTooltip()

    console.log(LOG_PREFIX, 'UI injected at', config.position, 'of', config.anchorSelector)
  }

  remove(): void {
    this.stopAnchorObserver()
    this.pendingInjection = null
    this.tooltipObserver?.disconnect()
    this.tooltipObserver = null
    this.tooltipElement?.remove()
    this.tooltipElement = null
    if (this.reactRoot) {
      this.reactRoot.unmount()
      this.reactRoot = null
    }
    this.hostElement?.remove()
    this.hostElement = null
    this.shadowRoot = null
  }

  private getStyles(): string {
    return `
      #react-root {
        all: initial;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      .trigger-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        border-radius: 20px;
        min-width: 32px;
        min-height: 32px;
        transition: background-color 0.15s ease;
      }

      .trigger-button:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      .trigger-icon {
        display: block;
        width: 20px;
        height: 20px;
        color: inherit;
      }
    `
  }
}