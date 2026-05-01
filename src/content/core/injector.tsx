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

    console.log(LOG_PREFIX, 'UI injected at', config.position, 'of', config.anchorSelector)
  }

  remove(): void {
    this.stopAnchorObserver()
    this.pendingInjection = null
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

      .trigger-button-wrapper {
        display: inline-flex;
        position: relative;
        vertical-align: middle;
      }

      .trigger-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        position: relative;
      }

      .trigger-icon {
        display: block;
      }

      .trigger-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
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
        z-index: 1000;
        pointer-events: none;
      }

      .trigger-button:hover .trigger-tooltip {
        opacity: 1;
        visibility: visible;
      }
    `
  }
}