# 多平台架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Lovart 专属的 content script 架构重构为支持多平台的分层适配架构，使新增平台只需创建配置文件。

**Architecture:** 分层配置驱动架构 — core/ 存放通用逻辑，platforms/ 存放平台配置和可选策略覆盖。Coordinator 作为入口，先匹配平台再初始化核心模块。

**Tech Stack:** TypeScript, React 19, Chrome Extension Manifest V3, Shadow DOM

---

## 文件结构规划

### 新建文件
```
src/content/core/
├── detector.ts            # 配置驱动的输入检测
├── injector.ts            # 配置驱动的 UI 注入
└── coordinator.ts         # 入口协调器

src/content/platforms/
├── registry.ts            # 平台注册表
├── base/
│   ├── types.ts           # 类型定义
│   ├── strategy-interface.ts  # 策略接口
│   └── default-strategies.ts  # 默认插入策略
├── lovart/
│   ├── config.ts          # Lovart 配置
│   └── strategies.ts      # Lexical 编辑器插入策略
├── chatgpt/config.ts
├── claude-ai/config.ts
├── gemini/config.ts
├── liblib/config.ts
├── jimeng/config.ts
```

### 删除文件
```
src/content/content-script.ts  # 替换为 coordinator.ts
src/content/input-detector.ts  # 替换为 core/detector.ts
src/content/ui-injector.tsx    # 替换为 core/injector.ts
src/content/insert-handler.ts  # 提取为策略模块
```

### 修改文件
```
manifest.json                 # content_scripts 改为 coordinator.ts
```

---

## Phase 1: 基础类型定义

### Task 1: 创建平台类型定义

**Files:**
- Create: `src/content/platforms/base/types.ts`

- [ ] **Step 1: 创建 types.ts 文件**

```typescript
/**
 * Platform Types - 核心类型定义
 */

/**
 * URL 匹配模式
 */
export interface UrlPattern {
  type: 'domain' | 'pathname' | 'full' | 'regex'
  value: string
}

/**
 * 输入检测配置
 */
export interface InputDetectionConfig {
  selectors: string[]
  validate?: (element: HTMLElement) => boolean
  debounceMs?: number
}

/**
 * UI 注入位置
 */
export type InjectionPosition = 'before' | 'after' | 'prepend' | 'append'

/**
 * 按钮图标类型
 */
export type ButtonIconType = 'lightning' | 'sparkle' | 'wand' | 'custom'

/**
 * 按钮样式配置
 */
export interface ButtonStyleConfig {
  icon?: ButtonIconType
  customIcon?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

/**
 * UI 注入配置
 */
export interface UIInjectionConfig {
  anchorSelector: string
  position: InjectionPosition
  buttonStyle?: ButtonStyleConfig
  customButton?: React.ComponentType<{ inputElement: HTMLElement }>
}

/**
 * 平台配置
 */
export interface PlatformConfig {
  id: string
  name: string
  urlPatterns: UrlPattern[]
  inputDetection: InputDetectionConfig
  uiInjection: UIInjectionConfig
  strategies?: StrategyOverrides
}

/**
 * 策略覆盖（可选）
 */
export interface StrategyOverrides {
  inserter?: InsertStrategy
  detector?: DetectStrategy
}

// 策略接口在 strategy-interface.ts 中定义，这里仅引用
import type { InsertStrategy, DetectStrategy } from './strategy-interface'
```

- [ ] **Step 2: 验证类型定义无语法错误**

Run: `npx tsc --noEmit src/content/platforms/base/types.ts`
Expected: 无错误输出（可能提示 strategy-interface 未创建，下一步解决）

---

### Task 2: 创建策略接口定义

**Files:**
- Create: `src/content/platforms/base/strategy-interface.ts`

- [ ] **Step 1: 创建 strategy-interface.ts 文件**

```typescript
/**
 * Strategy Interfaces - 插入和检测策略接口
 */

/**
 * 插入策略接口
 */
export interface InsertStrategy {
  /**
   * 将文本插入到目标输入元素
   */
  insert(element: HTMLElement, text: string): boolean

  /**
   * 清空输入元素内容（可选）
   */
  clear?(element: HTMLElement): boolean
}

/**
 * 检测策略接口（极少数平台需要覆盖）
 */
export interface DetectStrategy {
  /**
   * 自定义检测逻辑
   */
  detect(): HTMLElement | null

  /**
   * 判断元素是否有效（可选）
   */
  isValid?(element: HTMLElement): boolean
}
```

- [ ] **Step 2: 验证类型定义**

Run: `npx tsc --noEmit src/content/platforms/base/strategy-interface.ts`
Expected: 无错误输出

---

### Task 3: 创建默认插入策略

**Files:**
- Create: `src/content/platforms/base/default-strategies.ts`

- [ ] **Step 1: 创建 default-strategies.ts 文件**

```typescript
/**
 * Default Strategies - 适用于大多数平台的默认插入策略
 */

import { InsertStrategy } from './strategy-interface'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * 默认插入策略
 * 支持 textarea/input 和 contenteditable
 */
export class DefaultInserter implements InsertStrategy {
  insert(element: HTMLElement, text: string): boolean {
    try {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        this.insertIntoFormControl(element, text)
      } else {
        this.insertIntoRichText(element, text)
      }

      this.dispatchInputEvents(element)
      console.log(LOG_PREFIX, 'Prompt inserted:', text)
      return true
    } catch (error) {
      console.error(LOG_PREFIX, 'Insert failed:', error)
      return false
    }
  }

  clear(element: HTMLElement): boolean {
    element.focus()
    document.execCommand('selectAll', false)
    document.execCommand('delete', false)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  private insertIntoFormControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): void {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start

    element.value = element.value.substring(0, start) + text + element.value.substring(end)

    const newPosition = start + text.length
    element.selectionStart = newPosition
    element.selectionEnd = newPosition
  }

  private insertIntoRichText(element: HTMLElement, text: string): void {
    if (document.activeElement !== element) {
      element.focus()
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    const success = document.execCommand('insertText', false, text)

    if (!success) {
      console.warn(LOG_PREFIX, 'execCommand failed, using fallback')
      this.insertFallback(element, text)
    }
  }

  private insertFallback(element: HTMLElement, text: string): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      element.textContent += text
      return
    }

    const range = selection.getRangeAt(0)
    if (!element.contains(range.commonAncestorContainer)) {
      const newRange = document.createRange()
      newRange.selectNodeContents(element)
      newRange.collapse(false)
      selection.removeAllRanges()
      selection.addRange(newRange)
    }

    const currentRange = selection.getRangeAt(0)
    currentRange.deleteContents()
    const textNode = document.createTextNode(text)
    currentRange.insertNode(textNode)
    currentRange.setStartAfter(textNode)
    currentRange.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(currentRange)
  }

  private dispatchInputEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))

    if (element instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } else if (element instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    if (element.isContentEditable) {
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          inputType: 'insertText',
          data: null,
        })
      )
    }
  }
}

/**
 * 创建默认插入策略实例
 */
export function createDefaultInserter(): InsertStrategy {
  return new DefaultInserter()
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/platforms/base/default-strategies.ts`
Expected: 无错误输出

---

### Task 4: 创建平台注册表

**Files:**
- Create: `src/content/platforms/registry.ts`

- [ ] **Step 1: 创建 registry.ts 文件**

```typescript
/**
 * Platform Registry - 平台注册表
 * 根据 URL 匹配激活对应平台
 */

import { UrlPattern, PlatformConfig } from './base/types'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * 已注册的平台列表
 * 新增平台只需在此数组添加配置
 */
const PLATFORMS: PlatformConfig[] = [
  // 平台配置将在后续 Task 中导入
]

/**
 * 根据 URL 匹配平台
 */
export function matchPlatform(url: string): PlatformConfig | null {
  for (const platform of PLATFORMS) {
    if (matchesUrlPatterns(url, platform.urlPatterns)) {
      console.log(LOG_PREFIX, `Platform matched: ${platform.name}`)
      return platform
    }
  }
  console.log(LOG_PREFIX, 'No matching platform')
  return null
}

/**
 * 检查 URL 是否匹配任一 pattern
 */
function matchesUrlPatterns(url: string, patterns: UrlPattern[]): boolean {
  return patterns.some(pattern => {
    switch (pattern.type) {
      case 'domain':
        const domain = extractDomain(url)
        return domain === pattern.value || domain.endsWith('.' + pattern.value)
      case 'pathname':
        try {
          return new URL(url).pathname.includes(pattern.value)
        } catch {
          return false
        }
      case 'full':
        return url === pattern.value
      case 'regex':
        try {
          return new RegExp(pattern.value).test(url)
        } catch {
          return false
        }
      default:
        return false
    }
  })
}

/**
 * 提取 URL 的域名
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 获取所有已注册平台（用于调试）
 */
export function getAllPlatforms(): PlatformConfig[] {
  return PLATFORMS
}

/**
 * 注册平台配置（用于动态添加）
 */
export function registerPlatform(config: PlatformConfig): void {
  PLATFORMS.push(config)
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/platforms/registry.ts`
Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/platforms/base/types.ts src/content/platforms/base/strategy-interface.ts src/content/platforms/base/default-strategies.ts src/content/platforms/registry.ts
git commit -m "feat: add platform types and registry base

- Add PlatformConfig, UrlPattern, InputDetectionConfig types
- Add InsertStrategy and DetectStrategy interfaces
- Add DefaultInserter for most platforms
- Add registry with URL matching logic

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2: 核心模块

### Task 5: 创建配置驱动的检测器

**Files:**
- Create: `src/content/core/detector.ts`

- [ ] **Step 1: 创建 detector.ts 文件**

```typescript
/**
 * Detector - 配置驱动的输入元素检测器
 * 接收平台配置的选择器，使用 MutationObserver 检测
 */

import { InputDetectionConfig } from '../platforms/base/types'

const LOG_PREFIX = '[Oh My Prompt]'
const DEFAULT_DEBOUNCE_MS = 100

export class Detector {
  private observer: MutationObserver | null = null
  private navObserver: MutationObserver | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private inputElement: HTMLElement | null = null
  private config: InputDetectionConfig
  private onDetected: (element: HTMLElement) => void
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
    for (const selector of this.config.selectors) {
      const element = document.querySelector<HTMLElement>(selector)
      if (element && this.isValidInput(element)) {
        if (element !== this.inputElement) {
          this.inputElement = element
          console.log(LOG_PREFIX, 'Input detected:', selector)
          this.onDetected(element)
        }
        return
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
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/core/detector.ts`
Expected: 无错误输出

---

### Task 6: 创建配置驱动的注入器

**Files:**
- Create: `src/content/core/injector.tsx`

- [ ] **Step 1: 创建 injector.tsx 文件**

```typescript
/**
 * Injector - 配置驱动的 UI 注入器
 * 接收平台配置的锚点和位置，挂载 Shadow DOM
 */

import { createRoot, Root } from 'react-dom/client'
import { UIInjectionConfig, ButtonStyleConfig } from '../platforms/base/types'
import { DropdownApp } from '../components/DropdownApp'
import { TriggerButton } from '../components/TriggerButton'
import { InsertStrategy } from '../platforms/base/strategy-interface'
import { DROPDOWN_STYLES, PORTAL_ID } from '../styles/dropdown-styles'

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

    // Clean up portal styles
    const portalStyles = document.getElementById(PORTAL_ID + '-styles')
    portalStyles?.remove()
    const portal = document.getElementById(PORTAL_ID)
    portal?.remove()
  }

  private getStyles(): string {
    // Trigger button styles only (Shadow DOM 内部样式)
    return `
      #react-root {
        all: initial;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      .trigger-button-wrapper {
        display: inline-flex;
        position: relative;
      }
    `
  }
}
```

注意：
- 使用现有的 `dropdown-styles.ts` 中的 `DROPDOWN_STYLES` 和 `PORTAL_ID`
- 新增 `inserter` 参数传递给 DropdownApp
- 新增 `buttonComponent` 和 `buttonStyle` props

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/core/injector.tsx`
Expected: 无错误输出

---

### Task 6.5: 修改 DropdownApp 支持策略注入

**Files:**
- Modify: `src/content/components/DropdownApp.tsx`

- [ ] **Step 1: 修改 DropdownApp props 接口**

修改 `src/content/components/DropdownApp.tsx`，将接口改为：

```typescript
import { InsertStrategy } from '../platforms/base/strategy-interface'
import { ButtonStyleConfig } from '../platforms/base/types'

interface DropdownAppProps {
  inputElement: HTMLElement
  inserter: InsertStrategy
  buttonComponent?: React.ComponentType<{ inputElement: HTMLElement }>
  buttonStyle?: ButtonStyleConfig
}
```

- [ ] **Step 2: 修改组件内部使用策略**

将组件内部的 `InsertHandler` ref 替换为使用 props 传入的 `inserter`：

```typescript
export function DropdownApp({
  inputElement,
  inserter,
  buttonComponent,
  buttonStyle
}: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)

  // 注意：不再使用 InsertHandler ref，直接使用 inserter props

  // ... 其他代码保持不变
```

- [ ] **Step 3: 修改提示词插入逻辑**

找到 handleSelectPrompt 或类似的插入处理函数，改为使用 `inserter.insert()`：

```typescript
const handleSelectPrompt = useCallback((prompt: Prompt) => {
  const success = inserter.insert(inputElement, prompt.content)
  if (success) {
    setIsOpen(false)
    // 其他处理...
  }
}, [inputElement, inserter])
```

- [ ] **Step 4: 移除 InsertHandler 导入**

删除原有的 `InsertHandler` 导入：

```typescript
// 删除这行
import { InsertHandler } from '../insert-handler'
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit src/content/components/DropdownApp.tsx`
Expected: 无错误输出

---

### Task 7: 创建入口协调器

**Files:**
- Create: `src/content/core/coordinator.ts`

- [ ] **Step 1: 创建 coordinator.ts 文件**

```typescript
/**
 * Coordinator - Content Script 入口协调器
 * 职责：匹配平台 → 初始化核心模块 → 监听消息
 */

import { matchPlatform, registerPlatform } from '../platforms/registry'
import { Detector } from './detector'
import { Injector } from './injector'
import { createDefaultInserter } from '../platforms/base/default-strategies'
import { MessageType } from '../../shared/messages'
import type { InsertResultPayload } from '../../shared/types'
import { usePromptStore } from '../../lib/store'
import { VisionModalManager } from '../vision-modal-manager'
import { InsertStrategy } from '../platforms/base/strategy-interface'

const LOG_PREFIX = '[Oh My Prompt]'

// 导入平台配置（后续 Task 添加）
// import { lovartConfig } from '../platforms/lovart/config'
// registerPlatform(lovartConfig)

export class Coordinator {
  private platform: ReturnType<typeof matchPlatform> = null
  private detector: Detector | null = null
  private injector: Injector | null = null
  private inserter: InsertStrategy | null = null

  init(): void {
    this.platform = matchPlatform(window.location.href)

    if (!this.platform) {
      console.log(LOG_PREFIX, 'No matching platform, exiting')
      return
    }

    console.log(LOG_PREFIX, `Platform: ${this.platform.name}`)

    this.inserter = this.platform.strategies?.inserter ?? createDefaultInserter()

    this.injector = new Injector()

    this.detector = new Detector(
      this.platform.inputDetection,
      (inputElement) => this.handleInputDetected(inputElement)
    )

    this.detector.start()

    this.pingServiceWorker()
    this.setupMessageListener()

    console.log(LOG_PREFIX, 'Coordinator initialized')
  }

  private handleInputDetected(inputElement: HTMLElement): void {
    if (this.injector?.isInjected()) {
      console.log(LOG_PREFIX, 'Re-injecting UI')
    }
    this.injector?.inject(inputElement, this.platform!.uiInjection, this.inserter!)
  }

  private pingServiceWorker(): void {
    chrome.runtime.sendMessage(
      { type: MessageType.PING },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(LOG_PREFIX, 'Ping failed:', chrome.runtime.lastError.message)
          return
        }
        console.log(LOG_PREFIX, 'Ping response:', response)
      }
    )
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      console.log(LOG_PREFIX, 'Message:', message.type)

      if (message.type === MessageType.GET_STORAGE) {
        sendResponse({ success: true })
        return true
      }

      if (message.type === MessageType.REFRESH_DATA) {
        usePromptStore.getState().loadFromStorage()
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: String(err) }))
        return true
      }

      if (message.type === MessageType.SYNC_FAILED) {
        // TODO: 通知 UI 显示同步失败提示
        sendResponse({ success: true })
        return true
      }

      if (message.type === MessageType.CHECK_INPUT_AVAILABILITY) {
        const hasInput = this.detector?.getInputElement() !== null
        sendResponse({ success: true, data: { hasInput } })
        return true
      }

      if (message.type === MessageType.INSERT_PROMPT_TO_CS) {
        const payload = message.payload as { prompt: string }
        if (!payload?.prompt) {
          sendResponse({ success: false, error: 'No prompt provided' } as InsertResultPayload)
          return true
        }

        const inputElement = this.detector?.getInputElement()
        if (!inputElement) {
          sendResponse({ success: false, error: 'INPUT_NOT_FOUND' } as InsertResultPayload)
          return true
        }

        const success = this.inserter!.insert(inputElement, payload.prompt)
        sendResponse({ success } as InsertResultPayload)
        return true
      }

      if (message.type === MessageType.OPEN_VISION_MODAL) {
        const { imageUrl, tabId } = message.payload as { imageUrl: string; tabId?: number }
        const manager = VisionModalManager.getInstance()
        manager.create(imageUrl, tabId)
        sendResponse({ success: true })
        return true
      }

      return true
    })
  }
}

// 启动
console.log(LOG_PREFIX, 'Content script loaded on:', window.location.href)
const coordinator = new Coordinator()
coordinator.init()

// Cleanup
window.addEventListener('pagehide', () => {
  coordinator.detector?.stop()
  coordinator.injector?.remove()
  console.log(LOG_PREFIX, 'Cleanup complete')
})

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log(LOG_PREFIX, 'Page restored from bfcache, re-initializing')
    coordinator.init()
  }
})
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/core/coordinator.ts`
Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/core/detector.ts src/content/core/injector.tsx src/content/core/coordinator.ts
git commit -m "feat: add core modules (detector, injector, coordinator)

- Detector: config-driven MutationObserver detection
- Injector: config-driven Shadow DOM injection
- Coordinator: entry point with platform matching

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3: Lovart 平台迁移

### Task 8: 创建 Lovart 配置

**Files:**
- Create: `src/content/platforms/lovart/config.ts`

- [ ] **Step 1: 创建 lovart/config.ts 文件**

```typescript
/**
 * Lovart Platform Config
 */

import { PlatformConfig } from '../base/types'
import { LovartInserter } from './strategies'

export const lovartConfig: PlatformConfig = {
  id: 'lovart',
  name: 'Lovart',

  urlPatterns: [
    { type: 'domain', value: 'lovart.ai' },
  ],

  inputDetection: {
    selectors: [
      '[data-testid="agent-message-input"]',
      '[data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    debounceMs: 100,
  },

  uiInjection: {
    anchorSelector: '[data-testid="agent-input-bottom-more-button"]',
    position: 'before',
  },

  strategies: {
    inserter: new LovartInserter(),
  },
}
```

---

### Task 9: 创建 Lovart 插入策略

**Files:**
- Create: `src/content/platforms/lovart/strategies.ts`

- [ ] **Step 1: 创建 lovart/strategies.ts 文件**

```typescript
/**
 * Lovart Insert Strategy
 * 专门处理 Lexical 编辑器的插入逻辑
 */

import { InsertStrategy } from '../base/strategy-interface'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Lovart 使用 Lexical 编辑器，需要特殊的插入处理
 * 复用现有 insert-handler.ts 的逻辑
 */
export class LovartInserter implements InsertStrategy {
  insert(element: HTMLElement, text: string): boolean {
    try {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        this.insertIntoFormControl(element, text)
      } else {
        this.insertIntoRichText(element, text)
      }

      this.dispatchInputEvents(element)
      console.log(LOG_PREFIX, 'Prompt inserted:', text)
      return true
    } catch (error) {
      console.error(LOG_PREFIX, 'Insert failed:', error)
      return false
    }
  }

  clear(element: HTMLElement): boolean {
    element.focus()
    document.execCommand('selectAll', false)
    document.execCommand('delete', false)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  private insertIntoFormControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): void {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start

    element.value = element.value.substring(0, start) + text + element.value.substring(end)

    const newPosition = start + text.length
    element.selectionStart = newPosition
    element.selectionEnd = newPosition
  }

  private insertIntoRichText(element: HTMLElement, text: string): void {
    if (document.activeElement !== element) {
      element.focus()
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    const success = document.execCommand('insertText', false, text)

    if (!success) {
      console.warn(LOG_PREFIX, 'execCommand failed, using fallback')
      this.insertFallback(element, text)
    }
  }

  private insertFallback(element: HTMLElement, text: string): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      element.textContent += text
      return
    }

    const range = selection.getRangeAt(0)
    if (!element.contains(range.commonAncestorContainer)) {
      const newRange = document.createRange()
      newRange.selectNodeContents(element)
      newRange.collapse(false)
      selection.removeAllRanges()
      selection.addRange(newRange)
    }

    const currentRange = selection.getRangeAt(0)
    currentRange.deleteContents()
    const textNode = document.createTextNode(text)
    currentRange.insertNode(textNode)
    currentRange.setStartAfter(textNode)
    currentRange.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(currentRange)
  }

  private dispatchInputEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))

    if (element instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } else if (element instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    if (element.isContentEditable) {
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          inputType: 'insertText',
          data: null,
        })
      )
    }
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/platforms/lovart/`
Expected: 无错误输出

---

### Task 10: 注册 Lovart 平台

**Files:**
- Modify: `src/content/core/coordinator.ts:13-14`

- [ ] **Step 1: 添加 Lovart 平台导入**

修改 `src/content/core/coordinator.ts`：

```typescript
// 在文件顶部添加导入
import { lovartConfig } from '../platforms/lovart/config'
import { InsertStrategy } from '../platforms/base/strategy-interface'

// 在 registerPlatform 注释后添加
registerPlatform(lovartConfig)
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit src/content/core/coordinator.ts`
Expected: 无错误输出

---

### Task 11: 修改 Manifest

**Files:**
- Modify: `manifest.json:11-30`

- [ ] **Step 1: 修改 content_scripts 配置**

将 manifest.json 的 content_scripts 部分改为：

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/core/coordinator.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Commit Phase 3**

```bash
git add src/content/platforms/lovart/config.ts src/content/platforms/lovart/strategies.ts src/content/core/coordinator.ts manifest.json
git commit -m "feat: add Lovart platform config and update manifest

- Lovart config with Lexical-specific selectors
- LovartInserter strategy for Lexical editor
- Register Lovart in coordinator
- Manifest uses <all_urls> with coordinator entry

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 4: 新平台配置

### Task 12: 创建 ChatGPT 配置

**Files:**
- Create: `src/content/platforms/chatgpt/config.ts`

- [ ] **Step 1: 创建 chatgpt/config.ts**

```typescript
/**
 * ChatGPT Platform Config
 */

import { PlatformConfig } from '../base/types'

export const chatgptConfig: PlatformConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',

  urlPatterns: [
    { type: 'domain', value: 'chatgpt.com' },
    { type: 'domain', value: 'chat.openai.com' },
  ],

  inputDetection: {
    selectors: [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
  },

  uiInjection: {
    anchorSelector: '[data-testid="composer-footer-actions"]',
    position: 'prepend',
  },
}
```

- [ ] **Step 2: 注册 ChatGPT 平台**

在 `src/content/core/coordinator.ts` 添加：

```typescript
import { chatgptConfig } from '../platforms/chatgpt/config'
registerPlatform(chatgptConfig)
```

---

### Task 13: 创建 Claude.ai 配置

**Files:**
- Create: `src/content/platforms/claude-ai/config.ts`

- [ ] **Step 1: 创建 claude-ai/config.ts**

```typescript
/**
 * Claude.ai Platform Config
 */

import { PlatformConfig } from '../base/types'

export const claudeAiConfig: PlatformConfig = {
  id: 'claude-ai',
  name: 'Claude.ai',

  urlPatterns: [
    { type: 'domain', value: 'claude.ai' },
  ],

  inputDetection: {
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      '.ProseMirror[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.composer-footer',
    position: 'prepend',
  },
}
```

- [ ] **Step 2: 注册 Claude.ai 平台**

在 `src/content/core/coordinator.ts` 添加：

```typescript
import { claudeAiConfig } from '../platforms/claude-ai/config'
registerPlatform(claudeAiConfig)
```

---

### Task 14: 创建 Gemini 配置

**Files:**
- Create: `src/content/platforms/gemini/config.ts`

- [ ] **Step 1: 创建 gemini/config.ts**

```typescript
/**
 * Gemini Platform Config
 */

import { PlatformConfig } from '../base/types'

export const geminiConfig: PlatformConfig = {
  id: 'gemini',
  name: 'Gemini',

  urlPatterns: [
    { type: 'domain', value: 'gemini.google.com' },
  ],

  inputDetection: {
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[aria-label*="Enter a prompt"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.input-area-container',
    position: 'append',
  },
}
```

- [ ] **Step 2: 注册 Gemini 平台**

在 `src/content/core/coordinator.ts` 添加：

```typescript
import { geminiConfig } from '../platforms/gemini/config'
registerPlatform(geminiConfig)
```

---

### Task 15: 创建 LibLib 配置

**Files:**
- Create: `src/content/platforms/liblib/config.ts`

- [ ] **Step 1: 创建 liblib/config.ts**

```typescript
/**
 * LibLib Platform Config (国内设计平台)
 */

import { PlatformConfig } from '../base/types'

export const liblibConfig: PlatformConfig = {
  id: 'liblib',
  name: 'LibLib',

  urlPatterns: [
    { type: 'domain', value: 'liblib.art' },
  ],

  inputDetection: {
    selectors: [
      'textarea[placeholder*="提示词"]',
      'textarea[placeholder*="prompt"]',
      'div[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.input-container',
    position: 'append',
  },
}
```

- [ ] **Step 2: 注册 LibLib 平台**

在 `src/content/core/coordinator.ts` 添加：

```typescript
import { liblibConfig } from '../platforms/liblib/config'
registerPlatform(liblibConfig)
```

---

### Task 16: 创建即梦配置

**Files:**
- Create: `src/content/platforms/jimeng/config.ts`

- [ ] **Step 1: 创建 jimeng/config.ts**

```typescript
/**
 * 即梦 Platform Config (国内设计平台)
 */

import { PlatformConfig } from '../base/types'

export const jimengConfig: PlatformConfig = {
  id: 'jimeng',
  name: '即梦',

  urlPatterns: [
    { type: 'domain', value: 'jimeng.jianying.com' },
  ],

  inputDetection: {
    selectors: [
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="提示"]',
      'div[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.prompt-input-area',
    position: 'append',
  },
}
```

- [ ] **Step 2: 注册即梦平台**

在 `src/content/core/coordinator.ts` 添加：

```typescript
import { jimengConfig } from '../platforms/jimeng/config'
registerPlatform(jimengConfig)
```

- [ ] **Step 3: Commit Phase 4**

```bash
git add src/content/platforms/chatgpt/ src/content/platforms/claude-ai/ src/content/platforms/gemini/ src/content/platforms/liblib/ src/content/platforms/jimeng/ src/content/core/coordinator.ts
git commit -m "feat: add platform configs for ChatGPT, Claude.ai, Gemini, LibLib, Jimeng

- Each platform has config with URL patterns and selectors
- Registered in coordinator for URL matching
- Note: Selectors need real-world testing/validation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5: 清理与文档

### Task 17: 删除旧文件

**Files:**
- Delete: `src/content/content-script.ts`
- Delete: `src/content/input-detector.ts`
- Delete: `src/content/ui-injector.tsx`
- Delete: `src/content/insert-handler.ts`

- [ ] **Step 1: 删除已替换的旧文件**

```bash
rm src/content/content-script.ts
rm src/content/input-detector.ts
rm src/content/ui-injector.tsx
rm src/content/insert-handler.ts
```

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old content script files

- content-script.ts → coordinator.ts
- input-detector.ts → core/detector.ts
- ui-injector.tsx → core/injector.tsx
- insert-handler.ts → strategies modules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 18: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 Architecture 部分**

在 CLAUDE.md 的 Architecture 部分，更新 content script 结构描述：

```markdown
### Three-Part Extension Structure

```
src/
├── content/           # Runs on supported platforms (Shadow DOM isolated)
│   ├── core/               # Core modules (shared across platforms)
│   │   ├── coordinator.ts  # Entry point, platform matching
│   │   ├── detector.ts     # Config-driven input detection
│   │   └── injector.tsx    # Config-driven UI injection
│   │
│   ├── platforms/          # Platform configs and strategies
│   │   ├── registry.ts     # URL → Platform matching
│   │   ├── base/           # Types and default strategies
│   │   ├── lovart/         # Lovart (Lexical editor)
│   │   ├── chatgpt/        # ChatGPT
│   │   ├── claude-ai/      # Claude.ai (ProseMirror)
│   │   ├── gemini/         # Gemini
│   │   └── ...             # More platforms
│   │
│   ├── components/         # Dropdown UI React components
│   └── styles/             # Shadow DOM styles
│
├── background/        # Service worker (no DOM access)
│   └── service-worker.ts    # Message routing, storage ops
│
├── popup/             # Extension popup (React + Tailwind)
│   └── ...
```

### Platform Configuration

Each platform requires a `config.ts` with:
- `urlPatterns`: URL matching rules (domain/pathname/regex)
- `inputDetection.selectors`: Input element selectors (priority order)
- `uiInjection`: Anchor selector + position (before/after/prepend/append)

Complex platforms can override strategies (e.g., Lovart's Lexical inserter).

### Manifest Configuration

Content script uses `<all_urls>` match, coordinator internally checks platform and exits early on non-target pages.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for multi-platform architecture

- Document new content script structure
- Explain platform config format
- Note manifest <all_urls> pattern

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 验收清单

实施完成后验证：

1. **Lovart 功能测试**
   - 在 lovart.ai 页面加载扩展
   - 闪电按钮出现在 more button 前面
   - 下拉菜单正常展开
   - 提示词插入正常

2. **非目标页面测试**
   - 在任意非支持页面加载
   - Content script 加载后立即退出
   - 无 UI 注入，无副作用

3. **新平台测试**
   - ChatGPT、Claude.ai 等页面
   - 检测选择器是否正确（可能需要调整）
   - UI 注入位置是否合适

4. **构建验证**
   - `npm run build` 成功
   - TypeScript 无类型错误

---

## 待定事项

- 新平台选择器需要在实际平台测试验证
- 国内设计平台（LibLib、即梦）的锚点位置可能需要调整
- 如果 DropdownApp 需要接收 buttonComponent/buttonStyle props，需要修改组件