# Phase 12: Prompt Insertion - Research

**Researched:** 2026-04-28
**Domain:** Chrome Extension (Manifest V3) - Cross-context message routing, clipboard API, Lovart input integration
**Confidence:** HIGH

## Summary

Phase 12 implements the final delivery step of the Image-to-Prompt feature. After Vision API generates a prompt in Phase 11, Phase 12 must: detect if user is on Lovart page, insert prompt into Lovart input field or copy to clipboard, save to a "临时" category, and provide completion feedback with auto-close.

**Primary recommendation:** Extend LoadingApp.tsx with Lovart detection, clipboard fallback, and message routing. The core InsertHandler class already works correctly for Lovart insertion. The gap is message routing: LoadingApp → Service Worker → Content Script → InsertHandler.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Lovart page detection via `chrome.tabs.query()` - check URL matches `lovart.ai` domain (including `*.lovart.ai/*`)
- **D-02:** Message path: Loading → SW → CS → InsertHandler. Loading sends `INSERT_PROMPT` to SW, SW forwards to Lovart tab's content script, CS calls `InsertHandler.insertPrompt()`
- **D-03:** New "保存并插入" feature - save prompt to "临时" category in addition to insertion/copy
- **D-04:** "临时" category fixed name in Chinese, auto-created on first save if not exists
- **D-05:** Temporary prompts manually cleaned by user (same management as regular categories)
- **D-06:** Saved prompt data from Vision API structured response
- **D-07:** Vision API returns structured object: `{ name, prompt, tags, previewImage, timestamp }` (Phase 11 dependency)
- **D-08:** Phase 11 Vision API response parsing needs update
- **D-09:** Success feedback text: "已插入Lovart输入框" / "已复制到剪贴板" / "已保存到临时分类"
- **D-10:** Auto-close after 1 second delay
- **D-11:** Lovart insert failure: save succeeds + show error text (prompt still saved)
- **D-12:** Lovart page but no input detected: fallback to clipboard + save
- **D-13:** Clipboard failure: show error, prompt saved to "临时" (manual copy available)

### Claude's Discretion
- Button layout ("确认", "取消", "保存并插入" arrangement)
- Success/failure feedback text content
- Auto-close delay time (suggest 1 second)
- Error timeout thresholds for content script response
- Lovart URL regex pattern
- "临时" category icon selection

### Deferred Ideas (OUT OF SCOPE)
- Prompt editing in preview (future enhancement)
- Category selection when saving (future enhancement)
- Usage analytics/logging (Out of Scope per REQUIREMENTS.md)
- Batch processing (Out of Scope per REQUIREMENTS.md)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INSERT-01 | Generated prompt inserted into Lovart input field when user is on Lovart page | InsertHandler class (line 18-40 in insert-handler.ts) implements `insertPrompt()` method supporting form controls and Lexical editors via `execCommand('insertText')` |
| INSERT-02 | When not on Lovart page, prompt copied to clipboard with notification toast | Clipboard API (`navigator.clipboard.writeText()`), ToastNotification component exists in content script |
| INSERT-03 | User sees prompt preview before insertion (preview dialog with confirm/cancel) | LoadingApp.tsx success state already shows preview with confirm/cancel buttons (lines 131-147) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lovart page detection | Extension Page (LoadingApp) | Service Worker | Loading page has access to chrome.tabs API to check active tab URL |
| Lovart input insertion | Content Script | - | Content script runs in Lovart page context and can access DOM |
| Clipboard copy | Extension Page (LoadingApp) | - | Clipboard API requires document focus; extension page has it |
| Prompt save to category | Service Worker | Extension Page | Service worker handles storage operations; LoadingApp initiates via message |
| Toast notification | Content Script | - | Shadow DOM portal renders toast in host page |
| Auto-close timing | Extension Page (LoadingApp) | - | window.close() available in extension page context |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome Extension APIs | Manifest V3 | Cross-context messaging | Native extension platform APIs |
| navigator.clipboard | Web API | Clipboard write | Native browser API, no library needed |
| React | 19.x | LoadingApp UI | Project standard, already used |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 1.8.0 | Icons (Check, X, Copy) | Already imported in LoadingApp |
| Radix UI primitives | - | Button, Toast | Already in popup components |
| zustand | 5.x | Store access | For saving prompt via store.addPrompt() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| navigator.clipboard.writeText() | document.execCommand('copy') | execCommand deprecated, clipboard API modern standard |
| ToastNotification portal | alert() dialog | alert() blocks UI, portal toast is non-blocking and styled |

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 12 PROMPT DELIVERY FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

                    User clicks "确认" in LoadingApp.tsx
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Lovart Page Detection (chrome.tabs.query)                               │
│     - Get active tab URL                                                    │
│     - Match *.lovart.ai/* pattern                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
        Lovart Page                     Non-Lovart Page
              │                               │
              ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│  2a. Send INSERT_PROMPT to SW │   │  2b. Copy to Clipboard        │
│      (with prompt + tabId)    │   │      (navigator.clipboard)    │
└───────────────────────────────┘   └───────────────────────────────┘
              │                               │
              ▼                               │
┌───────────────────────────────┐             │
│  3a. SW forwards to CS        │             │
│      (chrome.tabs.sendMessage)│             │
└───────────────────────────────┘             │
              │                               │
              ▼                               │
┌───────────────────────────────┐             │
│  4a. CS calls InsertHandler   │             │
│      (insertPrompt method)    │             │
└───────────────────────────────┘             │
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. Save to "临时" Category (SW handles storage)                            │
│     - Create "临时" category if not exists                                  │
│     - addPrompt with name, content, categoryId, order                      │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. Show Feedback + Auto-close                                              │
│     - "已保存并插入" / "已保存并复制"                                        │
│     - setTimeout(1000ms) → window.close()                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (Phase 12 additions)
```
src/
├── popup/
│   └── LoadingApp.tsx         # [MODIFY] Add Lovart detection, clipboard, save logic
│
├── background/
│   └── service-worker.ts      # [MODIFY] Add INSERT_PROMPT forwarding, SAVE_PROMPT handler
│
├── content/
│   ├── content-script.ts      # [MODIFY] Add INSERT_PROMPT message handler
│   └── insert-handler.ts      # [EXISTING] Use existing insertPrompt() method
│
├── shared/
│   ├── messages.ts            # [MODIFY] Add SAVE_PROMPT MessageType
│   └── types.ts               # [MODIFY] Add InsertPromptPayload, SavePromptPayload
│
└── lib/
    └── vision-api.ts          # [MODIFY - Phase 11 dependency] Structured response parsing
```

### Pattern 1: Lovart Page Detection
**What:** Check if current active tab URL matches Lovart domain
**When to use:** When user clicks "确认" in LoadingApp
**Example:**
```typescript
// From LoadingApp.tsx
const detectLovartPage = async (): Promise<boolean> => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const activeTab = tabs[0]
  if (!activeTab?.url) return false
  
  // Match lovart.ai with subdomain support
  const lovartPattern = /^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/
  return lovartPattern.test(activeTab.url)
}
```

### Pattern 2: Message Routing (Loading → SW → CS)
**What:** Three-hop message path for cross-context communication
**When to use:** Inserting prompt into Lovart input field
**Example:**
```typescript
// Step 1: LoadingApp sends to SW
const response = await chrome.runtime.sendMessage({
  type: MessageType.INSERT_PROMPT,
  payload: { prompt: state.prompt, tabId: lovartTab.id }
})

// Step 2: SW forwards to CS (in service-worker.ts)
case MessageType.INSERT_PROMPT:
  const insertPayload = message.payload as { prompt: string; tabId: number }
  chrome.tabs.sendMessage(insertPayload.tabId, {
    type: MessageType.INSERT_PROMPT_TO_CS,
    payload: { prompt: insertPayload.prompt }
  })
  // Wait for CS response
  return true

// Step 3: CS handles and calls InsertHandler (in content-script.ts)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.INSERT_PROMPT_TO_CS) {
    const inputElement = document.querySelector('[data-testid="agent-message-input"]') ||
                         document.querySelector('[data-lexical-editor="true"]')
    if (inputElement) {
      const success = insertHandler.insertPrompt(inputElement, message.payload.prompt)
      sendResponse({ success })
    } else {
      sendResponse({ success: false, error: 'Input element not found' })
    }
    return true
  }
})
```

### Pattern 3: Clipboard Copy Fallback
**What:** Use navigator.clipboard.writeText() when not on Lovart
**When to use:** User confirms on non-Lovart page
**Example:**
```typescript
// From LoadingApp.tsx
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('[Oh My Prompt] Clipboard write failed:', err)
    return false
  }
}
```

### Pattern 4: Save to Temporary Category
**What:** Create "临时" category if not exists, then save prompt
**When to use:** After successful insertion or clipboard copy
**Example:**
```typescript
// In service-worker.ts
case MessageType.SAVE_TEMPORARY_PROMPT:
  const savePayload = message.payload as { name: string; content: string; imageUrl?: string }
  
  // Get current storage
  const data = await storageManager.getData()
  const categories = data.userData.categories
  const prompts = data.userData.prompts
  
  // Find or create "临时" category
  let tempCategory = categories.find(c => c.name === '临时')
  if (!tempCategory) {
    tempCategory = {
      id: crypto.randomUUID(),
      name: '临时',
      order: categories.length
    }
    categories.push(tempCategory)
  }
  
  // Calculate order
  const tempPrompts = prompts.filter(p => p.categoryId === tempCategory.id)
  const maxOrder = tempPrompts.length > 0 ? Math.max(...tempPrompts.map(p => p.order)) : -1
  
  // Add prompt
  const newPrompt: Prompt = {
    id: crypto.randomUUID(),
    name: savePayload.name,
    content: savePayload.content,
    categoryId: tempCategory.id,
    order: maxOrder + 1,
    remoteImageUrl: savePayload.imageUrl
  }
  prompts.push(newPrompt)
  
  // Save to storage
  await storageManager.saveData({ ...data, userData: { prompts, categories } })
  sendResponse({ success: true })
  return true
```

### Anti-Patterns to Avoid
- **Don't call InsertHandler from LoadingApp directly:** Content script and extension page are different contexts; must route through service worker
- **Don't skip timeout for CS response:** Content script may take time to find and insert; need reasonable timeout (e.g., 5 seconds)
- **Don't forget auto-create "临时" category:** First-time users won't have this category
- **Don't use alert() for toast:** Blocks UI and looks unprofessional; use ToastNotification portal pattern

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lovart input insertion | Custom DOM manipulation | InsertHandler.insertPrompt() | Already handles Lexical/React editors with execCommand |
| Toast notification | Custom div positioning | ToastNotification.tsx component | Portal pattern with Shadow DOM isolation |
| Category creation | Manual storage manipulation | storageManager.getData/saveData | Handles schema merging and sync triggers |
| Button styling | Custom CSS classes | Button component (default/outline variants) | Consistent with existing UI |

**Key insight:** InsertHandler is battle-tested for Lovart's Lexical editor. The challenge is message routing, not insertion logic.

## Common Pitfalls

### Pitfall 1: Content Script Not Responding
**What goes wrong:** INSERT_PROMPT message sent but content script never responds, causing indefinite wait
**Why it happens:** Content script might not be loaded on Lovart page (SPA navigation), or Lovart input element not yet detected
**How to avoid:** Set timeout (5 seconds) on chrome.tabs.sendMessage response; fallback to clipboard if timeout
**Warning signs:** LoadingApp shows "confirming..." state indefinitely

### Pitfall 2: Clipboard API Permission/Focus Issues
**What goes wrong:** navigator.clipboard.writeText() fails with "NotAllowedError" or "Document not focused"
**Why it happens:** Clipboard API requires document focus; some browsers restrict clipboard access in extension pages
**How to avoid:** Use try-catch; check document.hasFocus() before clipboard write; show error feedback with manual copy suggestion
**Warning signs:** Clipboard write throws NotAllowedError

### Pitfall 3: Lovart URL Pattern Too Strict
**What goes wrong:** lovart.ai subdomain variations not matched (e.g., app.lovart.ai, studio.lovart.ai)
**Why it happens:** Using exact URL match instead of regex pattern
**How to avoid:** Use regex `/^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/` to match any subdomain
**Warning signs:** User on lovart.ai subdomain but clipboard copy triggers instead of Lovart insertion

### Pitfall 4: "临时" Category Duplicate Creation
**What goes wrong:** Multiple "临时" categories created if concurrent saves happen before category check
**Why it happens:** No transaction lock on storage operations
**How to avoid:** Check for existing "临时" category before creating; use category name as unique identifier
**Warning signs:** Multiple categories with name "临时" in storage

### Pitfall 5: Vision API Response Format Mismatch
**What goes wrong:** LoadingApp expects structured response but Vision API returns plain string
**Why it happens:** Phase 11 implementation (vision-api.ts) returns `prompt: string`, not `{ name, prompt, tags, previewImage, timestamp }`
**How to avoid:** Either update Phase 11 response parsing OR adapt Phase 12 to use current plain string format with generated name
**Warning signs:** state.prompt is string, not structured object; name field undefined

## Code Examples

### Current LoadingApp.tsx Confirm Handler (Placeholder)
```typescript
// From src/popup/LoadingApp.tsx (lines 97-103)
const handleConfirm = () => {
  // Phase 12 will handle prompt insertion
  // For now, show success feedback and close
  console.log('[Oh My Prompt] User confirmed prompt:', state.prompt?.substring(0, 50) + '...')
  // TODO: Phase 12 - Insert to Lovart input or copy to clipboard
  window.close()
}
```

### Existing InsertHandler.insertPrompt() Method (Complete Implementation)
```typescript
// From src/content/insert-handler.ts (lines 18-40)
insertPrompt(inputElement: HTMLElement, content: string): boolean {
  try {
    if (inputElement instanceof HTMLInputElement || inputElement instanceof HTMLTextAreaElement) {
      this.insertIntoFormControl(inputElement, content)
    } else {
      this.insertIntoRichText(inputElement, content)
    }
    this.dispatchInputEvents(inputElement)
    console.log(LOG_PREFIX, 'Prompt inserted:', content)
    return true
  } catch (error) {
    console.error(LOG_PREFIX, 'Insert failed:', error)
    return false
  }
}
```

### Existing ToastNotification Component (Shadow DOM Portal)
```typescript
// From src/content/components/ToastNotification.tsx (lines 26-56)
export function ToastNotification({ message, onClose }: ToastNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => { onClose() }, 2000)
    return () => clearTimeout(timer)
  }, [onClose])

  return createPortal(
    <div role="status" aria-live="polite" style={{
      position: 'fixed', top: '16px', right: '16px',
      background: '#171717', color: '#ffffff',
      padding: '12px 16px', borderRadius: '8px',
      fontSize: '12px', zIndex: 2147483647
    }}>
      {message}
    </div>,
    getPortalContainer()
  )
}
```

### Current Service Worker INSERT_PROMPT Handler (Echo Only)
```typescript
// From src/background/service-worker.ts (lines 102-106)
case MessageType.INSERT_PROMPT:
  // Phase 2: Return success for content script acknowledgment
  // Phase 3 will add storage retrieval
  sendResponse({ success: true, data: message.payload } as MessageResponse)
  break
```
**Note:** This handler only echoes acknowledgment. Phase 12 needs to add forwarding logic.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| document.execCommand('copy') | navigator.clipboard.writeText() | 2024+ browser standards | Async, permission-aware, modern API |
| Direct DOM insertion for React editors | execCommand('insertText') + event dispatch | Phase 2 design | Works with React/Lexical state tracking |
| chrome.tabs.sendRequest | chrome.tabs.sendMessage | Chrome 41+ | Async callback pattern, requires return true |

**Deprecated/outdated:**
- document.execCommand('copy'): Deprecated in favor of Clipboard API
- chrome.tabs.sendRequest: Removed in Chrome 41+, use sendMessage

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vision API returns structured response per D-07 | Phase 11 Dependency | Need to adapt Phase 12 to handle plain string if Phase 11 not updated |
| A2 | Clipboard API works in extension page context | Clipboard Pattern | May need fallback to SW-based clipboard write if permission denied |
| A3 | Content script is always loaded on Lovart pages | Pitfall 1 | SPA navigation may not trigger content script reload |
| A4 | Lovart input selector `[data-testid="agent-message-input"]` is stable | InsertHandler | If Lovart changes selector, InsertHandler needs update |

## Open Questions

1. **Vision API Response Format Conflict**
   - What we know: Current vision-api.ts returns `prompt: string` (plain text)
   - What CONTEXT.md expects: `{ name, prompt, tags, previewImage, timestamp }` structured response
   - Recommendation: Either update Phase 11 vision-api.ts parseVisionResponse() OR adapt Phase 12 to generate name from prompt content (e.g., first 50 chars + timestamp)

2. **Toast Notification for Clipboard Copy**
   - What we know: ToastNotification exists in content script context (Shadow DOM portal)
   - What's unclear: How to show toast after clipboard copy from extension page
   - Recommendation: Use inline success feedback in LoadingApp (no toast needed), or open small notification page

3. **Content Script Response Timeout**
   - What we know: chrome.tabs.sendMessage can hang indefinitely if no response
   - What's unclear: Reasonable timeout threshold for Lovart insertion
   - Recommendation: 5 seconds timeout, fallback to clipboard with "插入失败" message

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Chrome Extension APIs | Cross-context messaging | Yes | Manifest V3 | - |
| navigator.clipboard | Clipboard copy | Yes | Web API | Show manual copy text |
| chrome.tabs.query | Lovart detection | Yes | Native | - |
| chrome.tabs.sendMessage | CS insertion | Yes | Native | Clipboard fallback |
| Zustand store | Prompt saving | Yes | 5.x | Direct storage.local.set |

**Missing dependencies with no fallback:**
- None identified

**Missing dependencies with fallback:**
- None identified

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59.1 |
| Config file | playwright.config.ts |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INSERT-01 | Prompt inserted into Lovart input field | e2e | `playwright test tests/lovart-insert.spec.ts` | No - Wave 0 |
| INSERT-02 | Prompt copied to clipboard on non-Lovart page | e2e | `playwright test tests/clipboard-copy.spec.ts` | No - Wave 0 |
| INSERT-03 | Preview dialog with confirm/cancel | unit | `playwright test tests/loading-preview.spec.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (type check)
- **Per wave merge:** `npm run build` (full build)
- **Phase gate:** Build passes + manual Lovart insertion test

### Wave 0 Gaps
- [ ] `tests/lovart-insert.spec.ts` — covers INSERT-01 (Lovart page insertion flow)
- [ ] `tests/clipboard-copy.spec.ts` — covers INSERT-02 (clipboard fallback flow)
- [ ] `tests/loading-preview.spec.ts` — covers INSERT-03 (preview dialog UI)
- [ ] Framework ready: Playwright installed, config exists

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this phase |
| V3 Session Management | No | No session state in this phase |
| V4 Access Control | No | No user roles in this phase |
| V5 Input Validation | Yes | Prompt content validated before storage |
| V6 Cryptography | No | No encryption in this phase |

### Known Threat Patterns for Chrome Extension

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS in prompt content | Tampering | Content sanitization before display (prompt is text, not HTML) |
| Storage overflow | Denial of Service | Quota limits in chrome.storage.local |
| Message injection | Tampering | MessageType validation in handlers |
| Clipboard read without permission | Information Disclosure | Use clipboard.writeText only (no read) |

## Phase 11 Dependency Analysis

**Critical Finding:** Current Phase 11 implementation does NOT match D-07 structured response expectation.

| Expected (D-07) | Current Implementation | Gap |
|-----------------|-----------------------|-----|
| `{ name, prompt, tags, previewImage, timestamp }` | `{ prompt: string }` | Missing name, tags, previewImage, timestamp |
| VisionApiResponse interface | VisionApiResultPayload (prompt only) | Interface mismatch |
| parseVisionResponse extracts structured data | Returns plain text | Parsing logic needs update |

**Options:**
1. **Update Phase 11** (preferred): Modify vision-api.ts to request structured JSON from AI, parse into VisionApiResponse
2. **Adapt Phase 12**: Generate name from prompt (first 30 chars), timestamp from Date.now(), skip tags/previewImage

**Recommendation:** Adapt Phase 12 to work with current plain string response. Generate name as `提示词-${Date.now()}` or extract from first line of prompt. This avoids Phase 11 rework and delivers the feature.

## Sources

### Primary (HIGH confidence)
- Codebase verification: insert-handler.ts, LoadingApp.tsx, service-worker.ts, messages.ts [VERIFIED: Read tool]
- Chrome Extension documentation: https://developer.chrome.com/docs/extensions/reference/api/tabs [CITED: Official docs]
- Clipboard API documentation: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API [CITED: MDN]

### Secondary (MEDIUM confidence)
- ToastNotification pattern from src/content/components/ToastNotification.tsx [VERIFIED: Read tool]
- Zustand store pattern from src/lib/store.ts [VERIFIED: Read tool]

### Tertiary (LOW confidence)
- None needed - all critical patterns verified from codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Chrome Extension APIs and Clipboard API are native, well-documented
- Architecture: HIGH - InsertHandler exists and works; message routing pattern clear
- Pitfalls: HIGH - Identified from codebase analysis and Chrome Extension best practices
- Phase 11 dependency: MEDIUM - Structured response format mismatch needs resolution decision

**Research date:** 2026-04-28
**Valid until:** 30 days (stable APIs)