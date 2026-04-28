# Phase 10: API Key Management - Research

**Researched:** 2026-04-28
**Domain:** Chrome Extension settings UI, API key storage security, onboarding triggers
**Confidence:** HIGH

## Summary

Phase 10 implements the Settings UI for Vision AI API key configuration, enabling users to securely manage their API credentials. The architecture follows established patterns from Phase 9 (separate storage key for special data) and the existing BackupApp popup UI (React + Tailwind + Radix UI). Key implementation involves: (1) Creating SettingsApp.tsx as the new popup entry point, (2) Adding API config message handlers to service-worker.ts, (3) Implementing onboarding trigger via chrome.tabs.create when context menu click detects no API config.

**Primary recommendation:** Follow the Phase 9 `CAPTURED_IMAGE_STORAGE_KEY` pattern for `_visionApiConfig` storage, and mirror BackupApp.tsx's React/Tailwind/Radix UI patterns for SettingsApp.tsx.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Settings UI采用新建`SettingsApp.tsx`作为popup入口。manifest.action.default_popup改为`settings.html`指向SettingsApp.tsx。备份设置作为Settings页的一个section或tab，API密钥配置作为主要入口。用户点击扩展图标首先看到Settings，可切换到Backup section。
- **D-02:** Onboarding触发方式：Service worker在context menu click handler检测无API密钥配置时，使用`chrome.tabs.create`打开settings popup页面（通过extension URL如`chrome-extension://[id]/settings.html`）。用户看到完整settings UI进行配置。
- **D-03:** API密钥存储架构：使用单独存储键存储API配置，与`StorageSchema`解耦。类似Phase 9的`captured_image_url`处理方式。存储键建议命名：`_visionApiConfig`（包含base URL、key、model）。
- **D-04:** 无预设provider选项（Claude/OpenAI），用户直接输入API配置。更灵活，支持任意Vision AI API provider。
- **D-05:** API配置字段结构：三个独立输入框
  - API Base URL（如 `https://api.openai.com/v1`）
  - API Key
  - Model Name（如 `gpt-4-vision-preview`, `claude-3-opus`）

### Claude's Discretion
- 存储键的具体命名（`_visionApiConfig`或其他）
- 存储数据结构的具体字段（是否包含`configuredAt`时间戳）
- Settings page的具体布局（tabs vs sections vs accordion）
- Backup section与API section的视觉分隔方式
- Input validation的具体规则（URL格式、key格式、model name格式）
- Save/Update/Delete按钮的具体行为和UI文案

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can configure API key in popup settings page | SettingsApp.tsx pattern from BackupApp.tsx; Radix UI Button/Input patterns |
| AUTH-02 | API key stored securely in chrome.storage.local (not sync, not exposed in logs) | chrome.storage.local security analysis; log sanitization pattern |
| AUTH-03 | First-time use of "转提示词" triggers onboarding dialog to configure API key | chrome.tabs.create pattern; context menu handler integration from Phase 9 |
| AUTH-04 | User can select Vision AI provider (Claude Vision or OpenAI GPT-4V) | D-04 locked: No preset providers - user enters config directly (three fields) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings UI Rendering | Popup Layer | — | React app for user configuration interface |
| API Config Storage | Service Worker | chrome.storage.local | StorageManager handles persistence, separate key pattern |
| Onboarding Trigger | Service Worker | — | Context menu handler checks config, opens settings tab |
| Input Validation | Popup Layer | — | Client-side validation before save operation |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Project-wide standard for popup UI |
| Radix UI Dialog | 1.1.15 | Modal dialogs | Already used in BackupApp.tsx for confirmation dialogs |
| Radix UI Button | (via button.tsx) | UI buttons | Existing component with variants (default, outline, ghost) |
| Tailwind CSS | 3.x | Styling | Project-wide standard for popup styling |
| chrome.storage.local | — | Persistence | Chrome Extension standard for local data |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 1.8.0 | Icons | Save, Delete, Settings icons (Check, X patterns from BackupApp) |
| zustand | 5.0.12 | State management | Optional - can use useState like BackupApp |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chrome.storage.local | chrome.storage.sync | Sync has 100KB limit, unsuitable for API configs; local has 10MB |
| Separate storage key | StorageSchema field | Less coupling, cleaner separation of concerns per Phase 9 pattern |
| Manual input fields | Preset provider dropdown | D-04 locked: Direct input more flexible for any Vision AI provider |

**Installation:** No new packages needed — all dependencies already in package.json.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 10: API KEY MANAGEMENT                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐                                                │
│  │   User Action    │                                                │
│  │ (Click Extension │                                                │
│  │     Icon)        │                                                │
│  └──────────────────┘                                                │
│          │                                                           │
│          ▼                                                           │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │  settings.html   │────▶│  SettingsApp.tsx │                      │
│  │  (Popup Entry)   │     │  (React UI)      │                      │
│  └──────────────────┘     └──────────────────┘                      │
│                              │                                       │
│                              │ User fills:                           │
│                              │ - API Base URL                        │
│                              │ - API Key                             │
│                              │ - Model Name                          │
│                              │                                       │
│                              │ Save/Delete operations                │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 chrome.runtime.sendMessage                      │  │
│  │   { type: SET_API_CONFIG, payload: { baseUrl, key, model } }   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    service-worker.ts                            │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  MessageType.SET_API_CONFIG handler                     │   │  │
│  │  │  → chrome.storage.local.set({ _visionApiConfig })       │   │  │
│  │  │  → sendResponse({ success: true })                      │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  MessageType.GET_API_CONFIG handler                     │   │  │
│  │  │  → chrome.storage.local.get(_visionApiConfig)           │   │  │
│  │  │  → sendResponse({ success: true, data: config })        │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  MessageType.DELETE_API_CONFIG handler                  │   │  │
│  │  │  → chrome.storage.local.remove(_visionApiConfig)        │   │  │
│  │  │  → sendResponse({ success: true })                      │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 chrome.storage.local                            │  │
│  │  Key: _visionApiConfig                                         │  │
│  │  Value: { baseUrl, apiKey, modelName, configuredAt? }          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                    ONBOARDING TRIGGER (D-02)                         │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  ┌──────────────────┐                                                │
│  │  Context Menu    │                                                │
│  │  Click (Phase 9) │                                                │
│  └──────────────────┘                                                │
│          │                                                           │
│          ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Check chrome.storage.local.get(_visionApiConfig)              │  │
│  │  If no config:                                                  │  │
│  │    → chrome.tabs.create({                                       │  │
│  │        url: chrome.runtime.getURL('src/popup/settings.html')   │  │
│  │      })                                                         │  │
│  │  Else: proceed to Phase 11 Vision API                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── popup/
│   ├── settings.html           # NEW: Entry HTML (manifest action.default_popup)
│   ├── settings.tsx            # NEW: Entry TypeScript (mounts SettingsApp)
│   ├── SettingsApp.tsx         # NEW: Main settings component
│   ├── components/
│   │   ├── ApiConfigSection.tsx    # NEW: API key input fields
│   │   └── BackupSection.tsx       # NEW or refactor from BackupApp
│   │   └── ui/
│   │       ├── button.tsx      # EXISTING: Reuse
│   │       ├── dialog.tsx      # EXISTING: Reuse for confirm dialogs
│   │       ├── input.tsx       # NEW: Create if needed (or use native input)
│   │       └── toast.tsx       # EXISTING: Reuse for feedback
│   └── backup.html             # KEEP: For standalone backup access (optional)
│   └── BackupApp.tsx           # KEEP: May refactor as BackupSection
│
├── background/
│   └── service-worker.ts       # MODIFY: Add API config handlers
│
├── shared/
│   ├── messages.ts             # MODIFY: Add GET_API_CONFIG, SET_API_CONFIG, DELETE_API_CONFIG
│   ├── types.ts                # MODIFY: Add VisionApiConfig interface
│   ├── constants.ts            # MODIFY: Add VISION_API_CONFIG_STORAGE_KEY
│
├── lib/
│   └── api-config.ts           # NEW: Optional helper for API config operations
```

### Pattern 1: Separate Storage Key Pattern (from Phase 9)
**What:** Store special data in separate chrome.storage.local keys, not in main StorageSchema
**When to use:** For data that doesn't fit the main data model or needs independent lifecycle
**Example:**
```typescript
// Source: Phase 9 implementation in constants.ts
export const CAPTURED_IMAGE_STORAGE_KEY = '_capturedImageUrl'

// Pattern to follow for Phase 10:
export const VISION_API_CONFIG_STORAGE_KEY = '_visionApiConfig'

// Usage in service-worker.ts:
chrome.storage.local.set({
  [VISION_API_CONFIG_STORAGE_KEY]: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-...', // NEVER log this
    modelName: 'gpt-4-vision-preview',
    configuredAt: Date.now()
  }
})
```

### Pattern 2: Popup UI Pattern (from BackupApp.tsx)
**What:** React functional component with useState for loading/error/success states
**When to use:** All popup pages in this project
**Example:**
```typescript
// Source: src/popup/BackupApp.tsx
function SettingsApp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<VisionApiConfig | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_API_CONFIG })
      if (response.success) {
        setConfig(response.data)
      }
      setError(null)
    } catch (err) {
      setError('获取配置失败')
    } finally {
      setLoading(false)
    }
  }

  // 480px width card, Tailwind styling, Radix UI components
  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header with close button */}
        {/* Content with status rows */}
        {/* Buttons */}
      </div>
    </div>
  )
}
```

### Pattern 3: Message Handler Pattern (from service-worker.ts)
**What:** Async handler with `return true` for sendResponse
**When to use:** All chrome.runtime.onMessage handlers
**Example:**
```typescript
// Source: src/background/service-worker.ts lines 32-99
case MessageType.GET_API_CONFIG:
  chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
    .then(result => {
      const config = result[VISION_API_CONFIG_STORAGE_KEY]
      // SECURITY: Never log apiKey value
      sendResponse({ success: true, data: config } as MessageResponse<VisionApiConfig>)
    })
    .catch(error => {
      console.error('[Oh My Prompt] GET_API_CONFIG error:', error)
      sendResponse({ success: false, error: 'Failed to get API config' })
    })
  return true // Required for async response
```

### Anti-Patterns to Avoid
- **Logging API key:** Never console.log the apiKey value — mask or omit in all logs
- **Using chrome.storage.sync:** Sync has 100KB limit and syncs across devices (security risk for API keys)
- **Hardcoded providers:** D-04 locked — no preset provider dropdowns, user enters config directly
- **Direct storage from popup:** Use message protocol for consistency with existing architecture

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input styling | Custom input CSS | Tailwind classes + existing patterns | Consistent with BackupApp styling |
| Confirmation dialog | Custom modal | Radix UI Dialog (existing) | Already imported in BackupApp.tsx |
| Button styling | Custom button | Button component (existing) | Has variants (default, outline, ghost) |
| State management | Complex state | useState (like BackupApp) | Zustand optional, simpler for this scope |

**Key insight:** BackupApp.tsx provides complete patterns for popup UI — copy its structure and adapt for API config fields.

## Runtime State Inventory

> This is a greenfield feature addition, not a rename/refactor phase. Skip this section.

**Nothing found in category:** Not applicable — Phase 10 creates new storage key `_visionApiConfig` with no existing runtime state to migrate.

## Common Pitfalls

### Pitfall 1: API Key in Console Logs
**What goes wrong:** API key exposed in console.log statements during debugging
**Why it happens:** Developers naturally log full objects for debugging, including sensitive fields
**How to avoid:** 
- Use `apiKey: '***'` or `apiKey: '[REDACTED]'` in all log statements
- Create a sanitizeConfig helper that masks apiKey before logging
- Review all log statements before commit
**Warning signs:** Any console.log containing the full config object

### Pitfall 2: Wrong Storage API
**What goes wrong:** Using chrome.storage.sync for API key storage
**Why it happens:** Sync seems convenient for cross-device access
**How to avoid:** 
- Use chrome.storage.local explicitly (10MB quota, device-local)
- Sync has 100KB limit AND syncs to other devices (security risk)
**Warning signs:** References to chrome.storage.sync in code

### Pitfall 3: Onboarding Tab Not Opening
**What goes wrong:** chrome.tabs.create fails or opens wrong URL
**Why it happens:** Extension internal URLs need chrome.runtime.getURL()
**How to avoid:** 
- Always use: `chrome.runtime.getURL('src/popup/settings.html')`
- Verify path matches actual file location in dist/
**Warning signs:** Relative URLs in chrome.tabs.create calls

### Pitfall 4: Manifest Popup Mismatch
**What goes wrong:** Settings.html not found after changing manifest
**Why it happens:** Vite build needs explicit input entry for new HTML files
**How to avoid:** 
- Add `settings: 'src/popup/settings.html'` to vite.config.ts rollupOptions.input
- Verify dist/ contains settings.html after build
**Warning signs:** Missing entry in vite.config.ts input object

### Pitfall 5: Settings State Not Persisting
**What goes wrong:** API config appears to save but disappears on popup reopen
**Why it happens:** chrome.storage.local.set not awaited, or wrong key used
**How to avoid:** 
- Always await storage operations
- Use constant for storage key (VISION_API_CONFIG_STORAGE_KEY)
- Verify GET_API_CONFIG returns saved data immediately after SET
**Warning signs:** Missing await, hardcoded key strings

## Code Examples

Verified patterns from existing codebase:

### API Config Storage Key Constant
```typescript
// Source: src/shared/constants.ts (pattern from Phase 9)
export const VISION_API_CONFIG_STORAGE_KEY = '_visionApiConfig'
```

### VisionApiConfig Interface
```typescript
// Source: Pattern from src/shared/types.ts
export interface VisionApiConfig {
  baseUrl: string       // e.g., 'https://api.openai.com/v1'
  apiKey: string        // User's API key - NEVER log this
  modelName: string     // e.g., 'gpt-4-vision-preview', 'claude-3-opus'
  configuredAt?: number // Optional timestamp for tracking
}
```

### MessageType Extensions
```typescript
// Source: src/shared/messages.ts (add to enum)
export enum MessageType {
  // ... existing types ...
  GET_API_CONFIG = 'GET_API_CONFIG',
  SET_API_CONFIG = 'SET_API_CONFIG',
  DELETE_API_CONFIG = 'DELETE_API_CONFIG'
}
```

### Service Worker Handler (Security Pattern)
```typescript
// Source: Pattern from src/background/service-worker.ts
case MessageType.SET_API_CONFIG:
  const configPayload = message.payload as VisionApiConfig
  if (!configPayload || !configPayload.baseUrl || !configPayload.apiKey || !configPayload.modelName) {
    sendResponse({ success: false, error: 'Invalid config payload' })
    return true
  }
  
  chrome.storage.local.set({
    [VISION_API_CONFIG_STORAGE_KEY]: {
      ...configPayload,
      configuredAt: Date.now()
    }
  })
    .then(() => {
      // SECURITY: Log without apiKey
      console.log('[Oh My Prompt] API config saved: baseUrl=' + configPayload.baseUrl + ', model=' + configPayload.modelName)
      sendResponse({ success: true } as MessageResponse)
    })
    .catch(error => {
      console.error('[Oh My Prompt] SET_API_CONFIG error:', error)
      sendResponse({ success: false, error: 'Failed to save API config' })
    })
  return true
```

### Onboarding Trigger in Context Menu Handler
```typescript
// Source: Pattern from Phase 9 handler in service-worker.ts lines 426-450
// Add API config check before processing captured URL
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'convert-to-prompt') {
    // Check for API config first (Phase 10 onboarding trigger)
    const configResult = await chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
    const apiConfig = configResult[VISION_API_CONFIG_STORAGE_KEY]
    
    if (!apiConfig || !apiConfig.apiKey) {
      // D-02: Open settings page for onboarding
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/popup/settings.html')
      })
      console.log('[Oh My Prompt] No API config found, opened settings for onboarding')
      return // Don't proceed to Phase 11 yet
    }
    
    // Proceed with Phase 11 Vision API processing...
    // (existing URL capture logic)
  }
})
```

### SettingsApp Component Structure
```typescript
// Source: Pattern from src/popup/BackupApp.tsx
import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog'
import { Check, X, Trash2 } from 'lucide-react'
import type { VisionApiConfig } from '@/shared/types'
import { MessageType } from '@/shared/messages'

function SettingsApp() {
  const [config, setConfig] = useState<VisionApiConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Form fields
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_API_CONFIG })
      if (response.success && response.data) {
        setConfig(response.data)
        setBaseUrl(response.data.baseUrl)
        setApiKey(response.data.apiKey)
        setModelName(response.data.modelName)
      }
    } catch {
      setError('获取配置失败')
    } finally {
      setLoading(false)
    }
  }

  // ... save, delete handlers
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Preset provider dropdowns | Three-field manual input | D-04 locked (2026-04-28) | More flexible, supports any Vision AI provider |
| chrome.storage.sync | chrome.storage.local | Project standard | Better security (device-local), larger quota |
| Settings in StorageSchema | Separate storage key | Phase 9 pattern | Less coupling, cleaner architecture |

**Deprecated/outdated:**
- chrome.storage.sync for API keys: Security risk (syncs across devices)
- Hardcoded provider options: D-04 explicitly rejected this approach

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | chrome.storage.local is sufficient for API key security (not encrypted but isolated per extension) | Security Domain | Low - standard Chrome Extension practice |
| A2 | No encryption needed beyond chrome.storage.local isolation | Security Domain | Medium - if user has higher security requirements, may need additional measures |
| A3 | Input validation rules: URL must start with http:// or https://, apiKey non-empty, modelName non-empty | Claude's Discretion | Low - reasonable defaults |

**Low-risk assumptions:** All claims are based on standard Chrome Extension patterns and project conventions.

## Open Questions

1. **Backup Section Integration**
   - What we know: D-01 says backup is a "section or tab" within SettingsApp
   - What's unclear: Whether to refactor BackupApp entirely or keep both HTMLs
   - Recommendation: Start with API section only, add Backup as collapsible section later (incremental approach)

2. **Input Component Choice**
   - What we know: No input.tsx exists in popup/components/ui/
   - What's unclear: Create styled input component or use native <input> with Tailwind
   - Recommendation: Use native <input> with Tailwind classes (simpler, matches BackupApp patterns)

## Environment Availability

> All dependencies are internal Chrome Extension APIs — no external services required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| chrome.storage.local | API config storage | ✓ | — | — |
| chrome.tabs.create | Onboarding trigger | ✓ | — | — |
| chrome.runtime.getURL | Extension URL resolution | ✓ | — | — |
| React 19.x | UI rendering | ✓ | 19.0.0 | — |
| Radix UI | Dialog/Button | ✓ | 1.1.15 | — |
| Tailwind CSS | Styling | ✓ | 3.4.19 | — |

**Missing dependencies with no fallback:** None — all required dependencies are available.

**Missing dependencies with fallback:** None.

## Validation Architecture

> nyquist_validation enabled per config.json workflow.nyquist_validation: true

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59.1 |
| Config file | playwright.config.ts (check existence) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | User can configure API key in popup settings page | E2E | `playwright test tests/settings.spec.ts -x` | ❌ Wave 0 |
| AUTH-02 | API key stored securely (not exposed in logs) | Unit | `playwright test tests/security.spec.ts -x` | ❌ Wave 0 |
| AUTH-03 | First-time use triggers onboarding dialog | E2E | `playwright test tests/onboarding.spec.ts -x` | ❌ Wave 0 |
| AUTH-04 | User inputs API config (three fields) | E2E | `playwright test tests/settings.spec.ts -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Manual UI verification (popup is user-facing)
- **Per wave merge:** E2E test pass for settings UI flow
- **Phase gate:** All AUTH tests green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/settings.spec.ts` — AUTH-01, AUTH-04: Settings UI CRUD operations
- [ ] `tests/onboarding.spec.ts` — AUTH-03: Context menu → settings page trigger
- [ ] `tests/security.spec.ts` — AUTH-02: API key not in console logs
- [ ] Framework setup: `playwright.config.ts` may need update for popup testing

*(Existing test infrastructure: Playwright configured in package.json, tests/ directory empty)*

## Security Domain

> Required for API key handling phase.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (user-provided key, not extension auth) |
| V3 Session Management | no | — |
| V4 Access Control | yes | chrome.storage.local isolation (per-extension) |
| V5 Input Validation | yes | URL format validation, non-empty checks |
| V6 Cryptography | no | — (storage isolation sufficient for this scope) |

### Known Threat Patterns for Chrome Extension API Key Storage

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in logs | Information Disclosure | Sanitize logs, mask apiKey in all console.log |
| API key sync to other devices | Information Disclosure | Use chrome.storage.local (not sync) |
| Malicious extension access | Tampering | Chrome's per-extension isolation (automatic) |
| XSS in popup UI | Tampering | React's JSX escapes, CSP restrictions |
| Phishing/fake settings page | Spoofing | Extension internal URL only (chrome.runtime.getURL) |

### Security Best Practices

1. **Log Sanitization:** Never log apiKey value
   ```typescript
   // BAD
   console.log('[Oh My Prompt] Config saved:', config)
   
   // GOOD
   console.log('[Oh My Prompt] Config saved: baseUrl=' + config.baseUrl + ', model=' + config.modelName)
   ```

2. **Storage Choice:** chrome.storage.local (not sync)
   - Local: 10MB quota, device-local only
   - Sync: 100KB quota, syncs across all user's Chrome instances (security risk)

3. **Input Validation:**
   ```typescript
   // URL must be http/https
   if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
     setError('API Base URL must start with http:// or https://')
     return
   }
   
   // apiKey non-empty
   if (!apiKey.trim()) {
     setError('API Key cannot be empty')
     return
   }
   
   // modelName non-empty
   if (!modelName.trim()) {
     setError('Model Name cannot be empty')
     return
   }
   ```

## Sources

### Primary (HIGH confidence)
- `.planning/phases/10-api-key-management/10-CONTEXT.md` - User decisions (D-01 through D-05) [CITED]
- `.planning/phases/09-context-menu-foundation/09-CONTEXT.md` - Separate storage key pattern [CITED]
- `src/background/service-worker.ts` - Message handler patterns [VERIFIED: codebase]
- `src/popup/BackupApp.tsx` - Popup UI patterns (React, Tailwind, Radix) [VERIFIED: codebase]
- `src/shared/constants.ts` - CAPTURED_IMAGE_STORAGE_KEY pattern [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `manifest.json` - Extension structure, permissions [VERIFIED: codebase]
- `src/shared/messages.ts` - MessageType enum pattern [VERIFIED: codebase]
- `src/shared/types.ts` - Interface patterns [VERIFIED: codebase]
- `vite.config.ts` - Build configuration, popup entry points [VERIFIED: codebase]

### Tertiary (LOW confidence)
- Chrome Extension security documentation (developer.chrome.com) - Not fetched due to network restrictions [ASSUMED]
  - Assumption: chrome.storage.local provides per-extension isolation
  - Assumption: No encryption needed beyond Chrome's built-in isolation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages already in project, patterns verified in codebase
- Architecture: HIGH - Following Phase 9 patterns and existing BackupApp structure
- Pitfalls: HIGH - Based on project conventions and Chrome Extension best practices
- Security: MEDIUM - Based on standard practices; official docs not fetched due to network restrictions

**Research date:** 2026-04-28
**Valid until:** 30 days (Chrome Extension APIs stable)