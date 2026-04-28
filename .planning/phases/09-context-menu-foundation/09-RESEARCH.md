# Phase 9: Context Menu Foundation - Research

**Researched:** 2026-04-28
**Domain:** Chrome Extension Context Menus API (Manifest V3)
**Confidence:** HIGH

## Summary

This phase implements the Chrome Context Menus API to add a "转提示词" right-click menu item on images across all websites. The implementation is straightforward: create the menu in `chrome.runtime.onInstalled`, handle clicks in `chrome.contextMenus.onClicked`, and store captured URLs in `chrome.storage.local`.

**Primary recommendation:** Use the established pattern from verified GitHub examples - create context menu in `onInstalled` listener with `contexts: ['image']` and `targetUrlPatterns: ['http://*/*', 'https://*/*']`, then capture `srcUrl` from the `onClicked` callback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 菜单项文字为"转提示词"（中文），与现有popup UI风格一致
- **D-02:** 菜单在所有网站激活（`<all_urls>`），与ROADMAP定义一致。非Lovart页面生成提示词后复制到剪贴板（Phase 12处理）
- **D-03:** 仅支持标准http/https URL。Vision API需要可访问的HTTP URL
- **D-04:** 菜单项使用lightning bolt图标（`assets/icon-16.png`），与扩展品牌一致
- **D-05:** 点击菜单后，图片URL存储到`chrome.storage.local`，等待Phase 11的Vision API处理
- **D-06:** Context menu在`chrome.runtime.onInstalled`事件时创建一次。Chrome扩展的context menu是持久化的，无需每次service worker启动时重新创建
- **D-07:** 使用`targetUrlPatterns: ["http://*/*", "https://*/*"]`过滤，确保菜单仅出现在http/https图片上
- **D-08:** 使用单独存储键存储捕获的图片URL（如`captured_image_url`），不放在`StorageSchema`中。减少与现有数据结构的耦合

### Claude's Discretion
- 存储键的具体命名（如`captured_image_url`或`_capturedImage`）
- 存储数据结构的具体字段（如是否包含`capturedAt`时间戳）
- Context menu click handler的代码组织（放在service-worker.ts或新建文件）
- 新增MessageType的定义（如`CAPTURE_IMAGE_URL`）
- Manifest permission添加`contextMenus`的具体方式

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Scope creep items noted:
- 提示词生成和插入（Phase 12）
- API密钥配置（Phase 10）
- Vision API调用（Phase 11）
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MENU-01 | User sees "转提示词" option when right-clicking any image on any website | Chrome Context Menus API with `contexts: ['image']` activates on all `<img>` elements |
| MENU-02 | Menu item only appears on image elements (not text, links, other elements) | `contexts: ['image']` restricts menu to `ContextType.IMAGE` only |
| MENU-03 | Click captures image URL (`srcUrl`) for processing | `OnClickData.srcUrl` field contains the image's `src` attribute URL |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Context menu creation | Background (Service Worker) | — | Context menus are managed by the extension's service worker |
| URL capture and storage | Background (Service Worker) | — | Service worker handles storage operations |
| Menu visibility filtering | Chrome Browser | Background | Browser applies `contexts` and `targetUrlPatterns` filters |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrome.contextMenus | Built-in | Context menu API | Chrome Extension standard API [VERIFIED: DefinitelyTyped] |
| chrome.runtime.onInstalled | Built-in | Menu creation lifecycle | Required pattern for Manifest V3 service workers [VERIFIED: GitHub examples] |
| chrome.storage.local | Built-in | URL storage | Project already uses this for data persistence |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/chrome | 0.0.260 | TypeScript definitions | Already installed for type safety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chrome.runtime.onInstalled` | Create on every service worker start | Wasteful - Chrome persists context menus, recreating causes "ID already exists" errors |
| Separate storage key | Add to `StorageSchema` | More coupling, complicates data structure for transient data |

## Architecture Patterns

### System Architecture Diagram

```
User Right-Click on Image
         │
         ▼
┌─────────────────────────────────┐
│   Chrome Browser (Context Menu) │
│   - Checks contexts: ['image']  │
│   - Checks targetUrlPatterns    │
│   - Shows "转提示词" menu item   │
└─────────────────────────────────┘
         │
         │ (User clicks menu)
         ▼
┌─────────────────────────────────┐
│   Service Worker                │
│   - chrome.contextMenus.onClicked│
│   - Extracts info.srcUrl        │
│   - Stores URL to storage.local │
│   - Ready for Phase 11 Vision   │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   chrome.storage.local          │
│   - Key: _capturedImageUrl      │
│   - Value: { url, capturedAt }  │
│   - Awaited by Phase 11         │
└─────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── background/
│   └── service-worker.ts    # Add context menu creation + click handler
├── shared/
│   ├── messages.ts          # Optional: Add CAPTURED_IMAGE_URL MessageType
│   └── constants.ts         # Add CAPTURED_IMAGE_STORAGE_KEY constant
manifest.json                 # Add "contextMenus" permission
```

### Pattern 1: Context Menu Creation in onInstalled
**What:** Create context menu once when extension is installed or updated
**When to use:** All Manifest V3 extensions with context menus
**Example:**
```typescript
// Source: [VERIFIED: GitHub - kevmo314/magic-copy/src/background.ts]
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'convert-to-prompt',
    title: '转提示词',
    contexts: ['image'],
    targetUrlPatterns: ['http://*/*', 'https://*/*']
  });
});
```

### Pattern 2: onClicked Handler for URL Capture
**What:** Handle menu item clicks and extract the image URL
**When to use:** When user clicks the context menu item
**Example:**
```typescript
// Source: [VERIFIED: GitHub - kevmo314/magic-copy/src/background.ts]
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'convert-to-prompt' && info.srcUrl) {
    // Store the captured URL for Phase 11
    chrome.storage.local.set({
      _capturedImageUrl: {
        url: info.srcUrl,
        capturedAt: Date.now(),
        tabId: tab?.id  // Optional: for later message to tab
      }
    });
    console.log('[Oh My Prompt] Captured image URL:', info.srcUrl);
  }
});
```

### Pattern 3: TypeScript CreateProperties Interface
**What:** Type-safe context menu configuration
**When to use:** When defining menu item properties
**Example:**
```typescript
// Source: [VERIFIED: DefinitelyTyped/types/chrome/index.d.ts]
interface CreateProperties {
  id?: string;                    // Required for service worker
  title?: string;                 // Menu item text
  contexts?: ContextType[];       // ['image'] for images only
  targetUrlPatterns?: string[];   // URL pattern filter
  type?: 'normal' | 'checkbox' | 'radio' | 'separator';
  enabled?: boolean;
  visible?: boolean;
}

interface OnClickData {
  srcUrl?: string;                // Image URL - our target field
  menuItemId: number | string;    // Identifies which menu item
  pageUrl?: string;               // Page where click occurred
  mediaType?: 'image' | 'video' | 'audio';
}
```

### Anti-Patterns to Avoid
- **Creating menu on every service worker start:** Chrome persists context menus across service worker restarts. Creating again causes "ID already exists" error. Use `onInstalled` only.
- **Using onclick callback in CreateProperties:** Not available in service workers. Must use `chrome.contextMenus.onClicked.addListener()` instead.
- **Storing in StorageSchema:** The captured URL is transient data for Phase 11. Keep it in a separate storage key to avoid coupling with existing data structure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context menu item | Custom DOM overlay | `chrome.contextMenus.create()` | Chrome's native context menu API is more reliable and doesn't require content script injection on every page |
| URL capture from click | Event listener on img elements | `OnClickData.srcUrl` | Chrome provides the URL directly in the callback - no DOM inspection needed |
| Image type detection | Manual element type checking | `contexts: ['image']` + `OnClickData.mediaType` | Browser handles filtering automatically |

**Key insight:** The Chrome Context Menus API handles all the hard work - menu visibility filtering, element type detection, and URL extraction. We just configure and handle the click.

## Runtime State Inventory

> This is a greenfield feature - no runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new feature | Create new storage key |
| Live service config | None — no external services | — |
| OS-registered state | None — browser handles menu registration | — |
| Secrets/env vars | None — Phase 10 handles API keys | — |
| Build artifacts | None — TypeScript compilation handles | — |

## Common Pitfalls

### Pitfall 1: Menu Not Appearing After Install
**What goes wrong:** User installs extension but doesn't see the menu item
**Why it happens:** Service worker may not have executed `onInstalled` listener yet, or Chrome needs a moment to register the menu
**How to avoid:** Menu registration is automatic on `onInstalled`. Chrome handles persistence. If issue persists, verify `contextMenus` permission is in manifest.
**Warning signs:** Menu item missing after extension update

### Pitfall 2: Menu Appears on Non-Image Elements
**What goes wrong:** Menu item appears when right-clicking text or links
**Why it happens:** Missing `contexts: ['image']` or incorrect context type
**How to avoid:** Always use `contexts: ['image']` exactly. Do not use `'all'` or other context types.
**Warning signs:** Menu appears on text selection or hyperlinks

### Pitfall 3: Data URLs and Blob URLs Captured
**What goes wrong:** `srcUrl` is a `data:` or `blob:` URL that Vision API cannot process
**Why it happens:** `targetUrlPatterns` not configured to filter URLs
**How to avoid:** Use `targetUrlPatterns: ['http://*/*', 'https://*/*']` to restrict to HTTP/HTTPS URLs only.
**Warning signs:** URL starts with `data:` or `blob:` in stored data

### Pitfall 4: Duplicate Menu Creation Error
**What goes wrong:** `chrome.runtime.lastError` with "Cannot create item with duplicate id"
**Why it happens:** Creating menu on every service worker wake instead of only on `onInstalled`
**How to avoid:** Only create menu in `chrome.runtime.onInstalled` listener. Chrome persists the menu.
**Warning signs:** Error logs on service worker restart

### Pitfall 5: Service Worker onclick Not Available
**What goes wrong:** Using `onclick` callback in `create()` properties
**Why it happens:** The `onclick` property is not available in service workers (Manifest V3)
**How to avoid:** Use `chrome.contextMenus.onClicked.addListener()` instead of `onclick` callback.
**Warning signs:** TypeScript error or runtime error about onclick

## Code Examples

Verified patterns from official sources and GitHub examples:

### Context Menu Creation (Manifest V3 Service Worker)
```typescript
// Source: [VERIFIED: GitHub - kevmo314/magic-copy/src/background.ts]
// Pattern: Create menu once on install, handle clicks separately

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'convert-to-prompt',
    title: '转提示词',
    contexts: ['image'],
    targetUrlPatterns: ['http://*/*', 'https://*/*']
  }, () => {
    // Check for errors during creation
    if (chrome.runtime.lastError) {
      console.error('[Oh My Prompt] Context menu creation error:', chrome.runtime.lastError);
    } else {
      console.log('[Oh My Prompt] Context menu created successfully');
    }
  });
});
```

### URL Capture Handler
```typescript
// Source: [VERIFIED: GitHub - kevmo314/magic-copy/src/background.ts]
// Pattern: Extract srcUrl from OnClickData, store for later processing

chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === 'convert-to-prompt') {
    if (!info.srcUrl) {
      console.warn('[Oh My Prompt] No srcUrl in click data');
      return;
    }
    
    // Validate URL is http/https (targetUrlPatterns should handle this, but double-check)
    if (!info.srcUrl.startsWith('http://') && !info.srcUrl.startsWith('https://')) {
      console.warn('[Oh My Prompt] Invalid URL type (not http/https):', info.srcUrl);
      return;
    }
    
    // Store captured URL for Phase 11 Vision API processing
    chrome.storage.local.set({
      _capturedImageUrl: {
        url: info.srcUrl,
        capturedAt: Date.now(),
        tabId: tab?.id
      }
    });
    
    console.log('[Oh My Prompt] Captured image URL:', info.srcUrl, 'from tab:', tab?.id);
  }
});
```

### Manifest Permission Addition
```json
// Source: [VERIFIED: DefinitelyTyped/types/chrome/index.d.ts - permission requirement]
{
  "permissions": [
    "activeTab",
    "downloads",
    "storage",
    "tabs",
    "alarms",
    "contextMenus"  // Add this line
  ]
}
```

### Storage Key Constants
```typescript
// Source: [ASSUMED] - Following project pattern in src/shared/constants.ts

export const CAPTURED_IMAGE_STORAGE_KEY = '_capturedImageUrl'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| onclick callback in create() | onClicked.addListener() | Manifest V3 (2022) | Service workers cannot use inline callbacks |
| recreate menu on wake | create only on onInstalled | Chrome behavior | Menu persists across service worker restarts |

**Deprecated/outdated:**
- `onclick` property in `CreateProperties`: Not available in Manifest V3 service workers. Use `onClicked.addListener()` instead.

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Storage key `_capturedImageUrl` follows project underscore convention for internal keys | Storage Key Constants | Minor - can use any key name |
| A2 | `capturedAt` timestamp may be useful for Phase 11 but not strictly required | Storage data structure | Minor - optional field |

**All other claims verified via:** DefinitelyTyped type definitions, GitHub code examples.

## Open Questions

1. **Should we add a MessageType for CAPTURED_IMAGE_URL notification?**
   - What we know: CONTEXT.md lists this as Claude's discretion. Phase 11 will consume the stored URL directly from storage.
   - What's unclear: Whether Phase 11 should be notified via message or just read from storage.
   - Recommendation: Skip MessageType for Phase 9. Phase 11 can read from storage directly. This keeps Phase 9 minimal and focused.

2. **Should tabId be stored with the captured URL?**
   - What we know: The `tab` parameter in `onClicked` contains tab info.
   - What's unclear: Whether Phase 11 needs to message back to the original tab.
   - Recommendation: Store `tabId` for Phase 12's use case (inserting prompt on Lovart vs clipboard on other sites).

## Environment Availability

> No external dependencies for this phase - Chrome APIs are built-in.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Chrome Context Menus API | Phase 9 core | Built-in | — | — |
| chrome.storage.local | URL storage | Built-in | — | — |
| TypeScript 5.x | Development | Available | 5.x | — |
| @crxjs/vite-plugin | Build | Available | 2.x | — |

**Missing dependencies with no fallback:**
- None — all dependencies are built-in Chrome APIs or existing project dependencies.

## Validation Architecture

> nyquist_validation is enabled in config.json.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59.1 |
| Config file | `playwright.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MENU-01 | Context menu appears on right-click image | E2E | `playwright test tests/e2e/context-menu.spec.ts` | Wave 0 - needs creation |
| MENU-02 | Menu only on images (not text/links) | E2E | `playwright test tests/e2e/context-menu.spec.ts` | Wave 0 - needs creation |
| MENU-03 | Click captures srcUrl | Unit (SW) | — (no unit test framework) | Wave 0 - needs creation |

**Note:** Playwright E2E testing for Chrome extensions requires special setup (loading unpacked extension). The `tests/` directory currently contains only backup JSON files - no automated test files exist.

### Sampling Rate
- **Per task commit:** No quick test available - manual verification required
- **Per wave merge:** `npm run test` (when tests exist)
- **Phase gate:** Manual E2E verification in Chrome browser

### Wave 0 Gaps
- [ ] `tests/e2e/context-menu.spec.ts` — E2E test for MENU-01~03
- [ ] Playwright extension loading setup — requires `--load-extension` or fixture
- [ ] Test fixture for context menu simulation — Playwright doesn't natively support context menu events

**Wave 0 approach:** Since Playwright has limited context menu support and no existing test infrastructure, Phase 9 will rely on:
1. TypeScript type checking (`npx tsc --noEmit`)
2. Manual E2E verification in Chrome browser
3. Service worker console log verification

## Security Domain

> Security enforcement enabled (not explicitly false in config).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase 10 handles API auth |
| V3 Session Management | No | No session state in Phase 9 |
| V4 Access Control | No | No user data access |
| V5 Input Validation | Yes | URL validation via `targetUrlPatterns` + type check |
| V6 Cryptography | No | No encryption in Phase 9 |

### Known Threat Patterns for Chrome Extensions

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious image URL | Spoofing | `targetUrlPatterns` restricts to http/https only |
| XSS from URL | Tampering | URL stored as string, not executed |
| Data URL injection | Tampering | Filtered by `targetUrlPatterns` |
| Storage key collision | Tampering | Use underscore prefix `_capturedImageUrl` |

**Security considerations:**
- `targetUrlPatterns` prevents `data:` and `blob:` URLs (which could contain malicious content)
- URL is stored as string only - no execution or rendering
- Separate storage key prevents collision with existing data

## Sources

### Primary (HIGH confidence)
- [GitHub - kevmo314/magic-copy/src/background.ts](https://github.com/kevmo314/magic-copy/blob/main/src/background.ts) - Context menu pattern verified
- [GitHub - vsDizzy/SaveAsMHT/src/worker.ts](https://github.com/vsDizzy/SaveAsMHT/blob/main/src/worker.ts) - onInstalled + onClicked pattern
- [GitHub - BlackGlory/copycat/src/background/menu.ts](https://github.com/BlackGlory/copycat/blob/main/src/background/menu.ts) - CreateProperties interface usage
- [DefinitelyTyped/types/chrome/index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/chrome/index.d.ts) - TypeScript type definitions

### Secondary (MEDIUM confidence)
- [Chrome Extensions Context Menus API Reference](https://developer.chrome.com/docs/extensions/reference/api/contextMenus) - Official documentation [CITED: CONTEXT.md canonical refs]

### Tertiary (LOW confidence)
- None - all claims verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Built-in Chrome API with verified TypeScript definitions
- Architecture: HIGH - Multiple GitHub examples confirm patterns
- Pitfalls: HIGH - Pitfalls documented in Chrome docs and verified via type definitions

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (Chrome APIs are stable, 30-day validity appropriate)