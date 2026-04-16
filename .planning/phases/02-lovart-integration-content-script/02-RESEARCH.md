# Phase 2: Lovart Integration & Content Script - Research

**Research Date:** 2026-04-16
**Phase Goal:** Content Script检测Lovart输入框，显示Shadow DOM隔离的下拉菜单，实现提示词一键插入

---

<user_constraints>
## Locked Decisions from CONTEXT.md (DO NOT CHANGE)

These decisions are locked by user input. Research implementation details, not alternatives.

### Dropdown Trigger Style
- **D-01:** 触发按钮位置在输入框**左侧**，与Lovart UI明确分离，支持移动设备
- **D-02:** 触发按钮样式为**Minimal icon button**（简洁图标按钮）
- **D-03:** 图标使用**闪电图标（lightning bolt）**，暗示"快速/一键"效率价值
- **D-04:** 图标配色与Lovart按钮同色，融合视觉风格减少突兀感

### Prompt Display
- **D-05:** 下拉菜单显示**名称 + 内容预览**（不仅名称）
- **D-06:** 预览长度约**50字符**，平衡信息量与空间占用
- **D-07:** 提示词按分类分组展示（如"风格"、"技术参数"），便于查找

### UI Visual Style
- **D-08:** 下拉菜单整体风格为**Lovart-native**（圆角、阴影、配色），视觉融合度高
- **D-09:** 在Shadow DOM内**手动复制Lovart CSS属性**实现风格协调，保持完全隔离

### Insert Behavior
- **D-10:** 提示词插入到**光标当前位置**（非追加或替换），保留前后文本
- **D-11:** 插入后下拉菜单**保持打开**，用户可连续插入多个提示词组合
- **D-12:** 下拉菜单关闭方式为**点击触发按钮（toggle行为）**

</user_constraints>

---

## Architectural Responsibility Map

This phase is entirely **Browser Tier** — all code runs in the Chrome Extension content script context.

| Component | Responsibility | Browser Context |
|-----------|---------------|-----------------|
| InputDetector | Detect Lovart input element | Content Script (Lovart page) |
| DropdownUI | Render Shadow DOM dropdown | Content Script (Shadow DOM) |
| InsertHandler | Insert text, dispatch events | Content Script (Lovart page) |
| LovartStyleExtractor | Extract Lovart CSS properties | Content Script (Lovart page) |
| MessageRouter | Communicate with Service Worker | Content Script + Background |

**No backend tier involvement** — all data flows through Chrome Extension messaging.

---

## Standard Stack

### Chrome Extension APIs (Phase 2)

| API | Purpose | Usage Pattern |
|-----|---------|---------------|
| `chrome.runtime.sendMessage` | Send messages to Service Worker | Request prompts data |
| `chrome.runtime.onMessage` | Receive messages from Service Worker | Handle storage updates |
| `chrome.runtime.lastError` | Check for message errors | Error handling |

### Shadow DOM APIs

| API | Purpose | Usage Pattern |
|-----|---------|---------------|
| `element.attachShadow({mode: 'open'})` | Create Shadow DOM root | Isolate dropdown styles |
| `shadowRoot.innerHTML` | Inject template | Create React mount point |
| `shadowRoot.querySelector()` | Access shadow elements | Event binding |

### DOM APIs

| API | Purpose | Usage Pattern |
|-----|---------|---------------|
| `MutationObserver` | Detect dynamic DOM changes | SPA input box detection |
| `document.activeElement` | Get focused element | Cursor position tracking |
| `element.dispatchEvent()` | Trigger events | Notify Lovart of input change |
| `Selection/Range` | Cursor position handling | Insert at cursor location |

### React Integration (Shadow DOM)

| Library | Purpose | Usage Pattern |
|---------|---------|---------------|
| `react-shadow-dom-retarget` | Event retargeting | Make React events work in Shadow DOM |
| Custom render target | Mount React in Shadow DOM | `createRoot(shadowRoot.querySelector('#root'))` |

---

## Architecture Patterns

### 1. Content Script Injection Architecture

```
Lovart Page DOM
    │
    ├── Original Lovart elements
    │       └── Input box (target element)
    │
    └── Extension injected elements (Shadow DOM)
            ├── Trigger button (absolute positioned, left of input)
            └── Dropdown container (positioned below trigger)
                    ├── Category headers
                    └── Prompt items
```

**Key Pattern:** Shadow DOM host element is injected as sibling or parent-relative to the Lovart input. All extension UI lives inside Shadow DOM for CSS isolation.

### 2. MutationObserver Pattern for SPA Detection

SPA frameworks (React, Vue, etc.) render content dynamically. Static DOM selectors fail.

**Recommended Configuration:**
```typescript
const observerConfig = {
  childList: true,      // Detect added/removed nodes
  subtree: true,        // Deep observation for nested renders
  attributes: false,    // Structure changes only (not attribute changes)
  characterData: false  // Not needed for element detection
}
```

**Debounce Pattern:**
```typescript
// Debounce callback to avoid excessive firing
let debounceTimer: number | undefined
const debouncedCallback = (mutations: MutationRecord[]) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    detectLovartInput(mutations)
  }, 100) // 100ms debounce per UI-SPEC
}
```

**Target Element:**
```typescript
// Observe the likely container for input elements
const targetNode = document.body // Or more specific: document.querySelector('.main-container')
```

### 3. Shadow DOM React Integration Pattern

**Challenge:** React expects events on document/body. Shadow DOM retargets events.

**Solution 1: react-shadow-dom-retarget-events**
```typescript
import reactShadowDomRetargetEvents from 'react-shadow-dom-retarget-events'

const shadowRoot = hostElement.attachShadow({ mode: 'open' })
shadowRoot.innerHTML = '<div id="root"></div>'

// Retarget React events to shadow root
reactShadowDomRetargetEvents(shadowRoot)

// Mount React
const root = createRoot(shadowRoot.querySelector('#root'))
root.render(<DropdownApp />)
```

**Solution 2: Manual Event Handling (simpler)**
```typescript
// Use onClick/onKeyDown handlers directly without retargeting
// React synthetic events work in Shadow DOM for most cases
// Only document-level listeners need retargeting
```

### 4. Event Dispatch Pattern for Lovart Recognition

Lovart needs to detect input changes to enable submit button.

**Required Events:**
```typescript
const inputElement = document.querySelector<HTMLInputElement>('[data-lovart-input]')

// Insert text at cursor
insertAtCursor(inputElement, promptContent)

// Dispatch events to notify Lovart
inputElement.dispatchEvent(new Event('input', { bubbles: true }))
inputElement.dispatchEvent(new Event('change', { bubbles: true }))
```

**Insert at Cursor:**
```typescript
function insertAtCursor(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = element.selectionStart ?? 0
  const end = element.selectionEnd ?? 0

  element.value = element.value.substring(0, start) + text + element.value.substring(end)

  // Move cursor after inserted text
  element.selectionStart = element.selectionEnd = start + text.length
}
```

**For Rich Text Editors (div-based):**
```typescript
function insertAtCursorInRichText(element: HTMLElement, text: string): void {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return

  const range = selection.getRangeAt(0)
  range.deleteContents()

  const textNode = document.createTextNode(text)
  range.insertNode(textNode)

  // Move cursor after text
  range.setStartAfter(textNode)
  range.setEndAfter(textNode)
  selection.removeAllRanges()
  selection.addRange(range)

  // Dispatch events
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
```

---

## Common Pitfalls

### Pitfall 3: DOM Injection Timing (SPA)

**Problem:** Lovart is likely a SPA. Input box renders after page load. Static selector fails.

**Solution:**
1. Use MutationObserver with `run_at: document_idle` (already configured in manifest)
2. Debounce observer callback (100ms)
3. Handle SPA navigation (url change without page reload)
4. Store reference to input element, re-detect if removed/recreated

**Navigation Handling:**
```typescript
// Listen for SPA navigation
let lastUrl = location.href
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    // Re-detect input on navigation
    detectAndInjectUI()
  }
}).observe(document.body, { subtree: true, childList: true })
```

### Pitfall 4: CSS Conflict

**Problem:** Lovart styles bleed into extension UI, or extension styles affect Lovart.

**Solution:**
1. Use Shadow DOM (`attachShadow({ mode: 'open' })`)
2. All extension CSS defined in `<style>` inside Shadow DOM
3. No external CSS files injected into Lovart page
4. Position trigger button with absolute positioning (no CSS inheritance issues)

**Shadow DOM CSS Isolation:**
```typescript
const shadowRoot = host.attachShadow({ mode: 'open' })
shadowRoot.innerHTML = `
  <style>
    /* All styles here are isolated from Lovart */
    .trigger-button { ... }
    .dropdown { ... }
  </style>
  <div id="react-root"></div>
`
```

### Pitfall 6: Event Dispatch

**Problem:** Lovart doesn't recognize inserted text. Submit button stays disabled.

**Solution:**
1. Dispatch `input` event (bubbles: true)
2. Dispatch `change` event (bubbles: true)
3. For React-based Lovart, may need synthetic event simulation
4. Test with actual Lovart platform to determine exact event needs

**React Event Simulation (if needed):**
```typescript
// React uses synthetic events. May need this:
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)?.set

if (nativeInputValueSetter) {
  nativeInputValueSetter.call(inputElement, inputElement.value)
}

inputElement.dispatchEvent(new Event('input', { bubbles: true }))
```

### Additional Pitfalls

#### Pitfall A: Input Element Selector Unknown

**Problem:** Lovart input element selector is unknown. Need actual page analysis.

**Research Required:**
- Visit lovart.ai, inspect input element with DevTools
- Capture element attributes, classes, data-* properties
- Test selector reliability across page navigation
- Handle multiple input elements (chat, design prompts, etc.)

**Selector Strategy:**
```typescript
// Try multiple selector patterns
const INPUT_SELECTORS = [
  'textarea[data-lovart-input]',
  'input[type="text"][data-lovart-input]',
  '.lovart-input textarea',
  '.prompt-input textarea',
  // Add discovered selectors
]

function findLovartInput(): HTMLElement | null {
  for (const selector of INPUT_SELECTORS) {
    const element = document.querySelector(selector)
    if (element) return element as HTMLElement
  }
  return null
}
```

#### Pitfall B: Trigger Button Positioning

**Problem:** Absolute positioning relative to dynamic input element.

**Solution:**
```typescript
// Position relative to input element
function positionTriggerButton(trigger: HTMLElement, input: HTMLElement): void {
  const inputRect = input.getBoundingClientRect()
  trigger.style.position = 'absolute'
  trigger.style.top = `${inputRect.top + window.scrollY}px`
  trigger.style.left = `${inputRect.left - 44 - 8}px` // 44px button + 8px gap
  trigger.style.zIndex = '9999'
}

// Reposition on scroll/resize
window.addEventListener('scroll', () => positionTriggerButton(trigger, input))
window.addEventListener('resize', () => positionTriggerButton(trigger, input))
```

#### Pitfall C: Shadow DOM Focus Management

**Problem:** Focus trapped in Shadow DOM. Keyboard navigation difficult.

**Solution:**
1. Use `tabindex="0"` on trigger button
2. Implement keyboard navigation (Arrow keys, Enter, Escape)
3. Focus dropdown on open
4. Return focus to trigger on close

```typescript
// Keyboard navigation
function handleKeyboardNav(event: KeyboardEvent, dropdown: HTMLElement): void {
  const items = dropdown.querySelectorAll('.prompt-item')
  const focused = document.activeElement

  if (event.key === 'ArrowDown') {
    // Move focus to next item
  } else if (event.key === 'ArrowUp') {
    // Move focus to previous item
  } else if (event.key === 'Enter') {
    // Select focused item
  } else if (event.key === 'Escape') {
    // Close dropdown, focus trigger
  }
}
```

#### Pitfall D: Lovart Style Extraction

**Problem:** Need Lovart-native visual style but can't use Lovart CSS.

**Solution:**
```typescript
// Extract Lovart button styles at runtime
function extractLovartButtonStyle(): LovartStyleConfig {
  const lovartButton = document.querySelector('.lovart-button')
  if (!lovartButton) return DEFAULT_STYLE

  const computed = window.getComputedStyle(lovartButton)
  return {
    backgroundColor: computed.backgroundColor,
    borderRadius: computed.borderRadius,
    boxShadow: computed.boxShadow,
    color: computed.color,
    fontSize: computed.fontSize,
  }
}

const DEFAULT_STYLE = {
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  boxShadow: 'none',
  color: '#666',
  fontSize: '14px',
}
```

---

## Code Examples

### 1. Complete MutationObserver Pattern

```typescript
// src/content/input-detector.ts
const LOG_PREFIX = '[Lovart Injector]'
const DEBOUNCE_MS = 100

export class InputDetector {
  private observer: MutationObserver | null = null
  private debounceTimer: number | undefined
  private inputElement: HTMLElement | null = null
  private onInputDetected: (element: HTMLElement) => void

  constructor(callback: (element: HTMLElement) => void) {
    this.onInputDetected = callback
  }

  start(): void {
    // Initial detection attempt
    this.tryDetect()

    // Set up observer for dynamic changes
    this.observer = new MutationObserver((mutations) => {
      this.debouncedDetect(mutations)
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // Handle SPA navigation
    this.watchNavigation()
  }

  private debouncedDetect(_mutations: MutationRecord[]): void {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.tryDetect()
    }, DEBOUNCE_MS)
  }

  private tryDetect(): void {
    const input = this.findLovartInput()
    if (input && input !== this.inputElement) {
      this.inputElement = input
      console.log(LOG_PREFIX, 'Input detected:', input)
      this.onInputDetected(input)
    }
  }

  private findLovartInput(): HTMLElement | null {
    // Selector patterns to try (update after Lovart analysis)
    const selectors = [
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="提示"]',
      '.input-area textarea',
      '[data-testid="prompt-input"]',
    ]

    for (const selector of selectors) {
      const element = document.querySelector(selector)
      if (element) return element as HTMLElement
    }

    return null
  }

  private watchNavigation(): void {
    let lastUrl = location.href

    const navObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        console.log(LOG_PREFIX, 'Navigation detected:', lastUrl)
        // Re-detect on navigation
        this.inputElement = null
        this.tryDetect()
      }
    })

    navObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  stop(): void {
    this.observer?.disconnect()
    clearTimeout(this.debounceTimer)
  }
}
```

### 2. Shadow DOM React Mount

```typescript
// src/content/ui-injector.ts
import { createRoot } from 'react-dom/client'
import { DropdownApp } from './components/DropdownApp'

const LOG_PREFIX = '[Lovart Injector]'

export class UIInjector {
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null
  private triggerButton: HTMLElement | null = null
  private dropdownContainer: HTMLElement | null = null

  inject(inputElement: HTMLElement): void {
    // Create host element
    this.hostElement = document.createElement('div')
    this.hostElement.id = 'lovart-injector-host'
    this.hostElement.style.position = 'absolute'
    this.positionHost(inputElement)

    // Attach Shadow DOM
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' })

    // Inject styles and mount point
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles()}
      </style>
      <div id="react-root"></div>
    `

    // Mount React
    const mountPoint = this.shadowRoot.querySelector('#react-root')
    if (mountPoint) {
      this.reactRoot = createRoot(mountPoint)
      this.reactRoot.render(<DropdownApp />)
    }

    // Inject into page
    document.body.appendChild(this.hostElement)

    // Set up repositioning
    this.setupRepositioning(inputElement)
  }

  private positionHost(inputElement: HTMLElement): void {
    const rect = inputElement.getBoundingClientRect()
    this.hostElement!.style.top = `${rect.top + window.scrollY}px`
    this.hostElement!.style.left = `${rect.left - 44 - 8}px` // button width + gap
    this.hostElement!.style.zIndex = '9999'
  }

  private setupRepositioning(inputElement: HTMLElement): void {
    const reposition = () => this.positionHost(inputElement)
    window.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition)
  }

  private getStyles(): string {
    return `
      /* Trigger button styles */
      .trigger-button {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        background: #f5f5f5;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;
      }

      .trigger-button:hover {
        background: #e8e8e8;
      }

      .trigger-button:active {
        background: #dcdcdc;
      }

      .trigger-button svg {
        width: 20px;
        height: 20px;
        color: #666;
      }

      /* Dropdown styles */
      .dropdown {
        position: absolute;
        top: 48px; /* below trigger button */
        left: 0;
        width: 280px;
        max-height: 320px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px;
      }

      .category-header {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        color: #999;
        text-transform: uppercase;
      }

      .prompt-item {
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s ease;
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
      }

      .prompt-preview {
        font-size: 12px;
        color: #666;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 250px;
      }
    `
  }

  remove(): void {
    this.reactRoot?.unmount()
    this.hostElement?.remove()
  }
}
```

### 3. Prompt Insertion Handler

```typescript
// src/content/insert-handler.ts
const LOG_PREFIX = '[Lovart Injector]'

export class InsertHandler {
  insertPrompt(inputElement: HTMLElement, content: string): boolean {
    try {
      // Check element type
      if (inputElement instanceof HTMLInputElement ||
          inputElement instanceof HTMLTextAreaElement) {
        this.insertIntoFormControl(inputElement, content)
      } else {
        this.insertIntoRichText(inputElement, content)
      }

      // Dispatch events for Lovart recognition
      this.dispatchInputEvents(inputElement)

      console.log(LOG_PREFIX, 'Prompt inserted:', content)
      return true
    } catch (error) {
      console.error(LOG_PREFIX, 'Insert failed:', error)
      return false
    }
  }

  private insertIntoFormControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): void {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start

    // Insert at cursor
    element.value = element.value.substring(0, start) + text + element.value.substring(end)

    // Move cursor after inserted text
    const newPosition = start + text.length
    element.selectionStart = newPosition
    element.selectionEnd = newPosition
  }

  private insertIntoRichText(element: HTMLElement, text: string): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      // No cursor position, append to end
      element.textContent += text
      return
    }

    const range = selection.getRangeAt(0)

    // Check if cursor is in this element
    if (!element.contains(range.commonAncestorContainer)) {
      // Focus element and append
      element.focus()
      element.textContent += text
      return
    }

    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)

    // Move cursor after text
    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private dispatchInputEvents(element: HTMLElement): void {
    // Standard DOM events
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))

    // For React-based apps, may need additional handling
    // React tracks value through the native setter
    if (element instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
      }
    }
  }
}
```

---

## Validation Architecture

### Testing Framework

Chrome Extension testing requires special approaches:

| Test Type | Tool | Purpose |
|-----------|------|---------|
| Unit Tests | Vitest | Test isolated functions (InsertHandler, selectors) |
| E2E Tests | Playwright + Chrome Extension | Full flow testing with real extension |
| Manual Tests | Chrome DevTools | Lovart platform-specific validation |

### Test Cases for Phase 2

**Unit Tests (Vitest):**
```typescript
// tests/insert-handler.test.ts
describe('InsertHandler', () => {
  it('should insert text at cursor position in textarea', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'Hello World'
    textarea.selectionStart = 5
    textarea.selectionEnd = 5

    const handler = new InsertHandler()
    handler.insertIntoFormControl(textarea, 'Beautiful ')

    expect(textarea.value).toBe('Hello Beautiful World')
    expect(textarea.selectionStart).toBe(14)
  })

  it('should dispatch input event after insertion', () => {
    const input = document.createElement('input')
    const eventSpy = vi.fn()
    input.addEventListener('input', eventSpy)

    const handler = new InsertHandler()
    handler.insertPrompt(input, 'test')

    expect(eventSpy).toHaveBeenCalled()
  })
})
```

**E2E Tests (Playwright):**
```typescript
// tests/e2e/lovart-integration.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Lovart Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Load extension context
    // Note: Playwright extension testing requires special setup
  })

  test('trigger button appears next to Lovart input', async ({ page }) => {
    await page.goto('https://lovart.ai')
    // Wait for SPA render
    await page.waitForSelector('.lovart-input', { timeout: 10000 })

    const triggerButton = page.locator('#lovart-injector-host .trigger-button')
    await expect(triggerButton).toBeVisible()
  })

  test('dropdown opens on click', async ({ page }) => {
    await page.goto('https://lovart.ai')
    await page.waitForSelector('.lovart-input')

    const triggerButton = page.locator('#lovart-injector-host .trigger-button')
    await triggerButton.click()

    const dropdown = page.locator('#lovart-injector-host .dropdown')
    await expect(dropdown).toBeVisible()
  })

  test('prompt inserts into Lovart input', async ({ page }) => {
    await page.goto('https://lovart.ai')
    await page.waitForSelector('.lovart-input')

    // Open dropdown and select prompt
    await page.locator('#lovart-injector-host .trigger-button').click()
    await page.locator('.prompt-item').first().click()

    // Verify input contains prompt
    const input = page.locator('.lovart-input textarea')
    await expect(input).not.toBeEmpty()
  })
})
```

### Manual Validation Checklist

1. [ ] Lovart page loads, extension activates (no console errors)
2. [ ] Trigger button appears positioned correctly (left of input)
3. [ ] Trigger button icon visible, Lovart-native colors
4. [ ] Click trigger opens dropdown
5. [ ] Dropdown shows sample prompts by category
6. [ ] Hover states work (trigger and items)
7. [ ] Click prompt item inserts text
8. [ ] Lovart submit button activates after insertion
9. [ ] Multiple insertions work (dropdown stays open)
10. [ ] Click trigger closes dropdown
11. [ ] Lovart page styles unchanged (no CSS bleed)
12. [ ] SPA navigation handled (button re-positions)

---

## Open Questions

### Lovart Platform Specifics (Requires Actual Page Analysis)

**Q1: Input Element Selector**
- What is the exact selector for Lovart's prompt input?
- Is it a `<textarea>` or rich text `<div>`?
- What attributes/classes/data-* does it have?
- Does the selector change on different Lovart pages?

**Q2: Event Requirements**
- Does Lovart use React synthetic events?
- What events trigger submit button activation?
- Is there a custom Lovart event we need to dispatch?
- Does Lovart validate input content (length, format)?

**Q3: Input Container Structure**
- What element contains the input box?
- Is the container positioned differently on different pages?
- Are there multiple input areas (chat, design, etc.)?

**Q4: Lovart Visual Style**
- What are the exact Lovart button colors?
- What font does Lovart use?
- What is Lovart's border-radius pattern?
- What shadow style does Lovart use for cards?

**Q5: SPA Navigation**
- Does Lovart use hash routing or history API?
- How does Lovart handle page transitions?
- Is input element destroyed/recreated on navigation?

### Research Actions Required

1. **Visit lovart.ai** with DevTools open
2. **Inspect input element** - capture selector, attributes, event listeners
3. **Test manual input** - observe event dispatch patterns
4. **Extract Lovart CSS** - capture button/card styling
5. **Test SPA navigation** - verify extension behavior on page change

---

## Standard Patterns Reference

### Chrome Extension MV3 Content Script Pattern

```typescript
// Standard content script structure
// 1. Initial setup (runs on load)
// 2. MutationObserver for dynamic content
// 3. Message listener for background communication
// 4. UI injection (Shadow DOM)
// 5. User interaction handlers

// manifest.json configuration
{
  "content_scripts": [{
    "matches": ["*://*.lovart.ai/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"  // Wait for initial DOM
  }]
}
```

### Shadow DOM CSS Pattern

```typescript
// All styles in Shadow DOM, no external CSS
const styles = `
  :host {
    all: initial;  /* Reset all inherited styles */
    font-family: system-ui, sans-serif;
  }

  /* Component styles follow */
  .button { ... }
`

// Inject via style element
shadowRoot.innerHTML = `<style>${styles}</style><div id="root"></div>`
```

### React Shadow DOM Pattern

```typescript
// Mount React in Shadow DOM
import { createRoot } from 'react-dom/client'

const shadowRoot = host.attachShadow({ mode: 'open' })
const mountPoint = shadowRoot.appendChild(document.createElement('div'))
mountPoint.id = 'react-root'

const root = createRoot(mountPoint)
root.render(<App />)

// Note: Some React events need retargeting
// Consider react-shadow-dom-retarget-events if needed
```

---

## RESEARCH COMPLETE

**Summary:**
- Locked user constraints documented (trigger style, dropdown display, insert behavior)
- Architectural responsibility mapped to Browser tier (Content Script)
- Standard stack identified: Chrome Extension APIs, Shadow DOM, MutationObserver
- Architecture patterns documented: SPA detection, Shadow DOM React integration, event dispatch
- Pitfalls catalogued: DOM timing (Pitfall 3), CSS conflict (Pitfall 4), event dispatch (Pitfall 6), plus positioning, focus, style extraction
- Code examples provided: InputDetector, UIInjector, InsertHandler
- Validation architecture: Vitest for unit tests, Playwright for E2E, manual checklist
- Open questions identified: Lovart-specific selectors, events, structure, styling, navigation

**Key Research Findings:**
1. MutationObserver with 100ms debounce is standard for SPA detection
2. Shadow DOM with manual CSS replication is the correct isolation strategy
3. Event dispatch (input + change) required for Lovart recognition
4. Lovart platform specifics require actual page analysis (cannot be researched theoretically)

**Next Steps:**
1. Planner should create PLAN.md based on this research
2. First implementation task should include Lovart page analysis to resolve open questions
3. Test framework setup should precede implementation for validation-ready development

---
*Research completed: 2026-04-16*
*Phase: 02-lovart-integration-content-script*