/**
 * Detector - 配置驱动的输入元素检测器
 * 接收平台配置的选择器，使用 MutationObserver 检测
 */

import type { InputDetectionConfig } from '../platforms/base/types'

const LOG_PREFIX = '[Oh My Prompt]'
const DEFAULT_DEBOUNCE_MS = 100

export class Detector {
  private observer: MutationObserver | null = null
  private navObserver: MutationObserver | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private inputElement: HTMLElement | null = null
  private config: InputDetectionConfig
  private onDetected: (element: HTMLElement) => void
  private onStatusChanged: ((hasInput: boolean) => void) | null = null
  private healthCheckInterval: ReturnType<typeof setInterval> | undefined

  // History API interception
  private originalPushState: typeof history.pushState | null = null
  private originalReplaceState: typeof history.replaceState | null = null
  private boundPopstateHandler: (() => void) | null = null

  constructor(
    config: InputDetectionConfig,
    onDetected: (element: HTMLElement) => void
  ) {
    this.config = config
    this.onDetected = onDetected
  }

  /**
   * Set callback for input status changes (used by Port connection)
   */
  setStatusChangedCallback(callback: (hasInput: boolean) => void): void {
    this.onStatusChanged = callback
  }

  start(): void {
    this.stop()
    this.inputElement = null

    this.tryDetect()

    this.observer = new MutationObserver(() => {
      this.debouncedDetect()
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    })

    this.watchNavigation()

    this.healthCheckInterval = setInterval(() => {
      if (!this.inputElement) {
        this.tryDetect()
      }
    }, 30000)
  }

  stop(): void {
    this.observer?.disconnect()
    this.navObserver?.disconnect()

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
    }

    if (this.healthCheckInterval !== undefined) {
      clearInterval(this.healthCheckInterval)
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState
    }
    if (this.boundPopstateHandler) {
      window.removeEventListener('popstate', this.boundPopstateHandler)
    }
  }

  getInputElement(): HTMLElement | null {
    return this.inputElement
  }

  private debouncedDetect(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer)
    }
    const debounceMs = this.config.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.debounceTimer = setTimeout(() => {
      this.tryDetect()
    }, debounceMs)
  }

  private tryDetect(): void {
    const previousElement = this.inputElement
    for (const selector of this.config.selectors) {
      const element = document.querySelector<HTMLElement>(selector)
      if (element && this.isValidInput(element)) {
        if (element !== this.inputElement) {
          this.inputElement = element
          console.log(LOG_PREFIX, 'Input detected:', selector)
          this.onDetected(element)
        }
        // Notify status change if callback is set
        if (this.onStatusChanged && previousElement === null) {
          this.onStatusChanged(true)
        }
        return
      }
    }
    // No input found - clear and notify if previously had input
    if (this.inputElement !== null) {
      this.inputElement = null
      if (this.onStatusChanged) {
        this.onStatusChanged(false)
      }
    }
  }

  private isValidInput(element: HTMLElement): boolean {
    if (element.offsetWidth === 0 || element.offsetHeight === 0) {
      return false
    }

    // 使用平台自定义验证（如果有）
    if (this.config.validate) {
      return this.config.validate(element)
    }

    // 默认验证逻辑
    return (
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLInputElement ||
      element.isContentEditable
    )
  }

  private watchNavigation(): void {
    this.originalPushState = history.pushState
    this.originalReplaceState = history.replaceState

    const handleNav = () => {
      console.log(LOG_PREFIX, 'Navigation detected')
      this.inputElement = null
      this.tryDetect()
    }

    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      this.originalPushState!.apply(history, args)
      handleNav()
    }

    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      this.originalReplaceState!.apply(history, args)
      handleNav()
    }

    this.boundPopstateHandler = handleNav
    window.addEventListener('popstate', this.boundPopstateHandler)

    // MutationObserver fallback for URL changes
    let lastUrl = location.href
    this.navObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        handleNav()
      }
    })

    this.navObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }
}