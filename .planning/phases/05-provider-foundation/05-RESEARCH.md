# Phase 5: Provider Foundation - Research

**Researched:** 2026-04-19
**Domain:** Chrome Extension (Manifest V3) / Network Data Source Integration
**Confidence:** HIGH

## Summary

Phase 5 establishes the foundation for network prompt data source integration. The core work involves creating a DataSourceProvider abstraction interface and implementing NanoBananaProvider to parse GitHub README.md content containing 900+ prompts across 17 categories.

**Primary recommendation:** Use TypeScript abstract interface pattern following existing StorageManager singleton pattern. Implement regex-based markdown parsing for Nano Banana's predictable structure. Service Worker handles network fetch with AbortController for timeout control.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Provider接口设计:**
- D-01: DataSourceProvider接口包含三个基础方法：fetch()、parse()、getCategories()
- D-02: 不包含错误回调、重试配置、健康检查等扩展方法，保持接口简洁
- D-03: parse()返回NetworkPrompt[]数组，getCategories()返回数据源分类列表

**网络请求策略:**
- D-04: 使用GitHub Raw URL直接请求（无需API密钥，无速率限制）
- D-05: Nano Banana数据源URL: `https://raw.githubusercontent.com/devanshug2307/Awesome-Nano-Banana-Prompts/main/README.md`
- D-06: 请求超时值10秒，失败返回错误响应
- D-07: 不设置额外请求头，使用浏览器默认行为

**网络提示词类型设计:**
- D-08: NetworkPrompt继承Prompt类型，增加可选字段
- D-09: 新增字段：`sourceProvider?: string`（数据源名称）、`sourceCategory?: string`（原始分类）、`previewImage?: string`（预览图片URL）
- D-10: previewImage字段仅存储URL，图片显示逻辑延后至Phase 7实现

### Claude's Discretion

- Markdown解析的具体正则规则
- Service Worker请求失败时的响应格式细节
- NetworkPrompt字段的命名风格（camelCase保持一致性）

### Deferred Ideas (OUT OF SCOPE)

- 图片预览实现（Phase 7 UI阶段处理）
- 重试逻辑/错误回调扩展（按需添加）
- 多Provider管理器（单一数据源优先，后续扩展时设计）
- 缓存逻辑（Phase 6）
- UI显示（Phase 7）
- 搜索/收藏功能（Phase 8）

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NET-05 | 提供可扩展的DataSourceProvider接口，便于接入更多数据源 | DataSourceProvider interface design with three methods (fetch/parse/getCategories), TypeScript abstract pattern following StorageManager singleton |
| NET-06 | 优先接入Nano Banana数据源（900+图像生成提示词） | NanoBananaProvider implementation, regex-based markdown parser for 17 categories, GitHub Raw URL fetch pattern |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Network fetch | Service Worker (background) | — | Chrome Extension CSP requires all cross-origin fetch from service worker |
| Data parsing | Service Worker / Lib layer | — | Parse logic is pure computation, can execute in service worker or separate lib module |
| Type definitions | Shared layer | — | Types used across service worker, content script, popup — central location |
| Message routing | Service Worker | — | Message handler pattern already established in service-worker.ts |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (npm: 6.0.3) | Type system for Provider interface | Project already uses TS throughout [VERIFIED: npm registry] |
| fetch API | Native | Network requests in Service Worker | Manifest V3 supports native fetch in service worker [CITED: Chrome Extension docs] |
| AbortController | Native | Request timeout control | Browser API for fetch timeout [CITED: MDN] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.runtime.sendMessage | Native | Content script → Service Worker communication | Required for CSP compliance [CITED: manifest.json] |
| chrome.storage.local | Native | Cache storage (Phase 6) | Network data caching [CITED: existing storage.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | axios | Unnecessary bundle size increase (project has no HTTP library) |
| Regex parsing | markdown-it library | Heavy dependency for simple parsing task |
| Service Worker fetch | Popup fetch | Popup not available to content script (rejected) |

**No installation required** — all dependencies are native browser APIs already available in Manifest V3.

## Architecture Patterns

### System Architecture Diagram

```
Content Script (Lovart page)
    │
    │ chrome.runtime.sendMessage({ type: FETCH_NETWORK_PROMPTS })
    │
    ▼
Service Worker (background)
    │
    ├─► DataSourceProvider.fetch()
    │       │
    │       ▼
    │   GitHub Raw URL (fetch with AbortController timeout=10s)
    │       │
    │       ▼
    │   Raw markdown content
    │       │
    │       ▼
    │   DataSourceProvider.parse(rawMarkdown)
    │       │
    │       ▼
    │   NetworkPrompt[] (parsed data)
    │       │
    │       ▼
    │   DataSourceProvider.getCategories()
    │       │
    │       ▼
    │   ProviderCategory[] (17 categories)
    │
    ▼
Response: { success: true, data: NetworkPrompt[] }
    │
    ▼
Content Script receives parsed prompts
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── providers/           # NEW: Provider abstraction
│   │   ├── base.ts          # DataSourceProvider interface
│   │   ├── nano-banana.ts   # NanoBananaProvider implementation
│   │   └── types.ts         # Provider-specific types (if needed)
│   ├── storage.ts           # Existing — pattern reference
│   └── import-export.ts     # Existing — pattern reference
│
├── shared/
│   ├── types.ts             # Extend with NetworkPrompt interface
│   ├── messages.ts          # Extend with FETCH_NETWORK_PROMPTS
│   └── constants.ts         # Add NETWORK_TIMEOUT constant
│
├── background/
│   └── service-worker.ts    # Add FETCH_NETWORK_PROMPTS handler
│
└── data/
    └── built-in-data.ts     # Existing — pattern reference
```

### Pattern 1: DataSourceProvider Abstract Interface

**What:** TypeScript interface defining contract for network data sources
**When to use:** All network data source implementations must follow this pattern
**Example:**

```typescript
// Source: [based on CONTEXT.md D-01, D-02, D-03]
// src/lib/providers/base.ts

import type { NetworkPrompt } from '@/shared/types'

export interface ProviderCategory {
  id: string          // e.g., '3d-miniatures'
  name: string        // e.g., '3D Miniatures & Dioramas'
  order: number       // Display order (1-17)
  count: number       // Number of prompts in category
}

export interface DataSourceProvider {
  readonly id: string
  readonly name: string
  readonly dataUrl: string

  // Fetch raw data from network
  fetch(): Promise<string>

  // Parse raw data into NetworkPrompt array
  parse(rawData: string): NetworkPrompt[]

  // Get available categories from this source
  getCategories(): ProviderCategory[]
}
```

### Pattern 2: NanoBananaProvider Implementation

**What:** Concrete implementation parsing GitHub README.md structure
**When to use:** Network prompt fetching from Nano Banana source
**Example:**

```typescript
// Source: [based on README analysis + regex patterns]
// src/lib/providers/nano-banana.ts

import type { NetworkPrompt, ProviderCategory } from '@/shared/types'
import { DataSourceProvider } from './base'

const NANO_BANANA_URL = 'https://raw.githubusercontent.com/devanshug2307/Awesome-Nano-Banana-Prompts/main/README.md'

export class NanoBananaProvider implements DataSourceProvider {
  readonly id = 'nano-banana'
  readonly name = 'Nano Banana Prompts'
  readonly dataUrl = NANO_BANANA_URL

  async fetch(): Promise<string> {
    const response = await fetch(this.dataUrl)
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }
    return response.text()
  }

  parse(rawData: string): NetworkPrompt[] {
    // Regex patterns for markdown structure
    // Category: ## {number}. {emoji} {name}
    // Prompt: ### {number}.{sub-number}. {title}
    // Image: ![title](url)
    // Prompt block: **Prompt:** followed by ``` code block
    // Source: **Source:** [name](url)

    const prompts: NetworkPrompt[] = []
    const categoryRegex = /^## (\d+)\. .+ (.+)$/
    const promptRegex = /^### (\d+)\.(\d+)\. (.+)$/
    const imageRegex = /^!\[.+?\]\((.+?)\)$/
    // ... implementation details
    return prompts
  }

  getCategories(): ProviderCategory[] {
    // Return 17 predefined categories
    return [
      { id: '3d-miniatures', name: '3D Miniatures & Dioramas', order: 1, count: 19 },
      { id: 'product-photography', name: 'Product Photography', order: 2, count: 25 },
      // ... 15 more categories
    ]
  }
}
```

### Pattern 3: Service Worker Network Handler

**What:** Message handler for FETCH_NETWORK_PROMPTS in service worker
**When to use:** Content script requests network prompts
**Example:**

```typescript
// Source: [based on existing service-worker.ts pattern + CONTEXT.md D-06]
// src/background/service-worker.ts (extension)

import { NanoBananaProvider } from '@/lib/providers/nano-banana'

const nanoBananaProvider = new NanoBananaProvider()

case MessageType.FETCH_NETWORK_PROMPTS:
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // D-06: 10s timeout

  try {
    const rawData = await nanoBananaProvider.fetch()
    clearTimeout(timeoutId)
    const prompts = nanoBananaProvider.parse(rawData)
    const categories = nanoBananaProvider.getCategories()
    sendResponse({
      success: true,
      data: { prompts, categories }
    } as MessageResponse<NetworkDataResponse>)
  } catch (error) {
    clearTimeout(timeoutId)
    const errorMsg = error instanceof Error ? error.message : 'Network fetch failed'
    sendResponse({ success: false, error: errorMsg })
  }
  return true
```

### Pattern 4: NetworkPrompt Type Extension

**What:** Extend existing Prompt type for network-originated prompts
**When to use:** All network prompt data structures
**Example:**

```typescript
// Source: [based on existing types.ts + CONTEXT.md D-08, D-09]
// src/shared/types.ts (extension)

// Existing Prompt type (Phase 2)
export interface Prompt {
  id: string
  name: string
  content: string
  categoryId: string
  description?: string
  order: number
}

// NEW: NetworkPrompt extends Prompt (D-08)
export interface NetworkPrompt extends Prompt {
  sourceProvider?: string     // D-09: 'nano-banana'
  sourceCategory?: string     // D-09: Original category from source
  previewImage?: string       // D-09: Preview image URL
  sourceUrl?: string          // Source attribution link (from README)
}
```

### Anti-Patterns to Avoid

- **Direct fetch from content script:** CSP blocks cross-origin requests in content scripts — MUST go through service worker
- **Complex markdown parser library:** Nano Banana structure is predictable, regex is sufficient — avoid markdown-it/heavy dependencies
- **Singleton Provider instance:** Unlike StorageManager, Providers don't need singleton pattern — can instantiate on-demand
- **Global state for parsed data:** Service Worker lifecycle unpredictable — don't store parsed data in global variables

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request timeout | Manual setTimeout with Promise.race | AbortController + signal | Standard browser API, cleaner abort handling |
| Type definitions | Inline type annotations | Extend existing Prompt interface | Consistency with existing types.ts |
| Message response | Custom response object | MessageResponse<T> from messages.ts | Consistent with existing pattern |
| ID generation | Random UUID | Provider-specific ID scheme | 'nano-banana-{category}-{index}' format for traceability |

**Key insight:** The project has established patterns for storage (StorageManager singleton), messaging (MessageResponse<T>), and type definitions (types.ts central location). Follow these patterns for Provider implementation.

## Runtime State Inventory

> Phase is greenfield (new Provider abstraction) — no rename/refactor required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new functionality | None |
| Live service config | None — new functionality | None |
| OS-registered state | None — new functionality | None |
| Secrets/env vars | None — GitHub Raw URL requires no authentication | None |
| Build artifacts | None — new TypeScript files will be bundled by Vite | None |

## Common Pitfalls

### Pitfall 1: Service Worker Lifecycle Interruption

**What goes wrong:** Service Worker can be terminated during long fetch, causing response to never arrive
**Why it happens:** Chrome terminates idle service workers after ~30 seconds
**How to avoid:** Keep message handler async with `return true`, handle abort gracefully
**Warning signs:** Content script shows "timeout" or no response after 10+ seconds

### Pitfall 2: Regex Parsing Edge Cases

**What goes wrong:** Prompts with unusual formatting (JSON code blocks, multi-line descriptions) fail to parse
**Why it happens:** README structure has variations — some prompts use JSON format, others plain text
**How to avoid:** Test regex against multiple prompt formats, handle JSON code blocks specially
**Warning signs:** Parsed prompt count significantly less than expected (~900)

### Pitfall 3: Missing host_permissions

**What goes wrong:** Fetch fails with CORS/network error
**Why it happens:** manifest.json missing GitHub URL in host_permissions
**How to avoid:** Add `"https://raw.githubusercontent.com/*"` to host_permissions before testing
**Warning signs:** Fetch returns network error, CORS blocked message

### Pitfall 4: AbortController Timeout False Positive

**What goes wrong:** Valid fetch aborted prematurely due to aggressive timeout
**Why it happens:** GitHub Raw content is ~50KB+, may take >5s on slow connections
**How to avoid:** Set timeout at 10s (D-06), log timeout events for debugging
**Warning signs:** Consistent timeout errors even on working network

## Code Examples

### Fetch with Timeout (AbortController)

```typescript
// Source: [MDN AbortController documentation]
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.text()
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw error
  }
}
```

### Nano Banana Markdown Parsing Regex

```typescript
// Source: [README structure analysis 2026-04-19]

// Category header: ## 1. 🏙️ 3D Miniatures & Dioramas
const CATEGORY_REGEX = /^## (\d+)\. (.+?) (.+)$/

// Prompt header: ### 1.1. Title
const PROMPT_HEADER_REGEX = /^### (\d+)\.(\d+)\. (.+)$/

// Image: ![Title](url)
const IMAGE_REGEX = /^!\[.*?\]\((.+?)\)$/

// Source: **Source:** [Name](url)
const SOURCE_REGEX = /^\*\*Source:\*\*\s*\[.+?\]\((.+?)\)$/

// Category ID generation: '3d-miniatures' from '3D Miniatures & Dioramas'
function generateCategoryId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
```

### Message Type Extension

```typescript
// Source: [existing messages.ts pattern]
// src/shared/messages.ts (extension)

export enum MessageType {
  // Existing (Phase 2-4)
  PING = 'PING',
  GET_STORAGE = 'GET_STORAGE',
  SET_STORAGE = 'SET_STORAGE',
  INSERT_PROMPT = 'INSERT_PROMPT',
  OPEN_SETTINGS = 'OPEN_SETTINGS',

  // NEW (Phase 5)
  FETCH_NETWORK_PROMPTS = 'FETCH_NETWORK_PROMPTS',
}

// NEW: Payload type for network request
export interface FetchNetworkPromptsPayload {
  providerId?: string  // Optional: defaults to 'nano-banana'
}

// NEW: Response type for network data
export interface NetworkDataResponse {
  prompts: NetworkPrompt[]
  categories: ProviderCategory[]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| XMLHttpRequest | fetch() with AbortController | ~2020 (ES6) | Promise-based, cleaner timeout |
| Callback-based timeout | AbortController.signal | 2020+ | Standardized abort pattern |
| Content script fetch | Service Worker proxy | Manifest V3 (2022) | CSP compliance required |

**Deprecated/outdated:**
- XMLHttpRequest: Use native fetch() in service worker
- setTimeout + Promise.race for timeout: Use AbortController instead

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nano Banana README structure is stable and won't change format | Markdown Parsing | Parser would break, need to update regex |
| A2 | GitHub Raw URL has no rate limiting for anonymous access | Network Strategy | Could hit rate limits under heavy use |
| A3 | 50KB README downloads in <10s on typical connections | Timeout | Timeout value may need adjustment |

**Note:** All critical decisions (D-01 through D-10) are locked by user — no user confirmation needed for these. Only assumptions A1-A3 require validation during implementation.

## Open Questions

1. **JSON code block handling in prompts**
   - What we know: Some prompts use JSON format inside code blocks (see 1.3, 1.5 examples)
   - What's unclear: Should JSON be extracted as-is or flattened to plain text content
   - Recommendation: Store raw content as-is, JSON parsing is UI concern (Phase 7)

2. **ProviderCategory count field**
   - What we know: README shows "(19 prompts)" next to each category
   - What's unclear: Should count be static or computed from parsed data
   - Recommendation: Compute from parsed data for accuracy (categoryCounts map)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| fetch API | Service Worker network | ✓ | Native (Chrome) | — |
| AbortController | Timeout handling | ✓ | Native (Chrome) | — |
| chrome.runtime.sendMessage | Message routing | ✓ | Native (Chrome) | — |
| GitHub Raw URL | Nano Banana source | ✓ | Public access | — |
| TypeScript 5.x | Type system | ✓ | 6.0.3 [VERIFIED: npm registry] | — |

**Missing dependencies with no fallback:** None — all dependencies are native browser APIs or project tools already in place.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — requires setup |
| Config file | None — see Wave 0 Gaps |
| Quick run command | N/A |
| Full suite command | N/A |

**Note:** nyquist_validation is enabled in config.json but no test infrastructure exists in the project.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NET-05 | DataSourceProvider interface exists with fetch/parse/getCategories | unit | N/A | ❌ Wave 0 |
| NET-05 | NanoBananaProvider implements interface correctly | unit | N/A | ❌ Wave 0 |
| NET-06 | NanoBananaProvider.fetch returns markdown string | unit | N/A | ❌ Wave 0 |
| NET-06 | NanoBananaProvider.parse returns ~900 NetworkPrompt objects | unit | N/A | ❌ Wave 0 |
| NET-06 | Service Worker handles FETCH_NETWORK_PROMPTS message | integration | N/A | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `vitest.config.ts` — Configure test framework (recommended: Vitest for Vite projects)
- [ ] `src/lib/providers/__tests__/nano-banana.test.ts` — Unit tests for provider
- [ ] `src/background/__tests__/service-worker.test.ts` — Message handler tests
- [ ] Mock fetch for unit tests — `vi.fn()` for Vitest

**Alternative:** Manual validation via `npm run dev` + chrome://extensions testing + console inspection

### Manual Validation Checklist

1. Load extension in Chrome developer mode
2. Open service worker console in chrome://extensions
3. Send test message via content script console:
   ```javascript
   chrome.runtime.sendMessage({ type: 'FETCH_NETWORK_PROMPTS' }, console.log)
   ```
4. Verify response contains ~900 prompts and 17 categories
5. Check network tab for GitHub Raw URL request

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | GitHub Raw URL requires no auth |
| V3 Session Management | no | Stateless network fetch |
| V4 Access Control | no | Public data source |
| V5 Input Validation | yes | TypeScript type validation on parsed data |
| V6 Cryptography | no | HTTPS transport provided by GitHub |

### Known Threat Patterns for Chrome Extension + Network Fetch

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Man-in-the-middle on fetch | Tampering | HTTPS enforced (GitHub Raw URL) |
| Malicious markdown injection | Tampering | Type validation on parse output, no DOM rendering in Phase 5 |
| Service Worker termination denial | Denial of Service | Timeout handling, graceful error response |
| Excessive network requests | Denial of Service | Cache logic (Phase 6) prevents repeated fetches |

**Key security consideration:** parsed markdown content should NOT be rendered to DOM in this phase — only stored/returned as data. Phase 7 UI must sanitize before rendering.

## Sources

### Primary (HIGH confidence)

- `.planning/research/ARCHITECTURE.md` — Existing provider interface design [VERIFIED: file read]
- `.planning/research/STACK.md` — Chrome Extension network patterns [VERIFIED: file read]
- GitHub Raw URL fetch pattern — Native fetch() in Service Worker [CITED: Chrome Extension docs via Context7]
- Nano Banana README structure — Analyzed via curl fetch [VERIFIED: 2026-04-19]

### Secondary (MEDIUM confidence)

- AbortController timeout pattern — MDN documentation [CITED: MDN Web Docs]
- Service Worker lifecycle constraints — Chrome Extension docs [CITED: Context7]

### Tertiary (LOW confidence)

- Regex patterns for markdown — Based on README sample analysis [ASSUMED: needs validation against full README]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All dependencies are native browser APIs or existing project tools
- Architecture: HIGH — Existing research files (ARCHITECTURE.md, STACK.md) provide detailed patterns
- Pitfalls: MEDIUM — Service Worker lifecycle and regex edge cases need implementation validation

**Research date:** 2026-04-19
**Valid until:** 30 days (stable APIs, README structure may change)