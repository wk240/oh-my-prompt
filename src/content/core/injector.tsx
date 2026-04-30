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

  isInjected(): boolean {
    return this.hostElement !== null && document.contains(this.hostElement)
  }

  inject(
    inputElement: HTMLElement,
    config: UIInjectionConfig,
    inserter: InsertStrategy
  ): void {
    this.remove()

    const anchor = document.querySelector<HTMLElement>(config.anchorSelector)
    if (!anchor) {
      console.warn(LOG_PREFIX, 'Anchor not found:', config.anchorSelector)
      return
    }

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