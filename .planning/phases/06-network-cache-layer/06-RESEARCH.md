# Phase 6: Network Cache Layer - Research

**Researched:** 2026-04-19
**Domain:** Chrome Extension (Manifest V3) / Storage Caching / Offline Support
**Confidence:** HIGH

## Summary

Phase 6 implements automatic caching for network prompt data with 24-hour TTL expiration and offline access fallback. The core work involves creating a NetworkCacheManager class that handles cache storage, TTL validation, and integrates with the existing FETCH_NETWORK_PROMPTS handler to provide seamless network-first with cache fallback behavior.

**Primary recommendation:** Create NetworkCacheManager following the existing StorageManager singleton pattern. Implement TTL check on read (not proactive cleanup). Modify FETCH_NETWORK_PROMPTS handler to auto-populate cache on success and fallback to cache on network failure. Use ISO timestamp string for human-readable display in Phase 7 UI.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**缓存数据结构:**
- D-01: 缓存存储键命名为`network_cache_data`，与现有`prompt_script_data`分离
- D-02: 缓存数据包含完整结构：NetworkPrompt[]数组、ProviderCategory[]分类、fetchTimestamp（ISO 8601格式）
- D-03: fetchTimestamp使用ISO字符串格式（如`2026-04-19T12:00:00Z`），便于显示和比较

**TTL过期逻辑:**
- D-04: TTL值为24小时（86,400,000毫秒），符合NET-04需求
- D-05: 过期检查时机：读取缓存时验证（on read），过期返回空数据触发重新fetch
- D-06: 过期判断逻辑：当前时间 - fetchTimestamp > TTL → 过期

**离线场景处理:**
- D-07: 网络请求策略：Network-first，失败后fallback到缓存
- D-08: 不使用navigator.onLine检测（不可靠），依赖fetch失败判断离线状态
- D-09: 缓存为空且网络失败时返回错误响应，UI显示相应提示

### Claude's Discretion

- NetworkCacheManager类实现细节（singleton或普通类）
- 缓存消息类型命名（GET_NETWORK_CACHE、SET_NETWORK_CACHE等）
- 过期缓存的清理策略（立即删除或保留等待网络恢复）

### Deferred Ideas (OUT OF SCOPE)

- 用户手动刷新缓存按钮（Phase 7+ UI增强）
- 缓存状态UI显示（Phase 7实现）
- 多数据源缓存管理（单一数据源优先）
- 缓存自动后台同步（用户手动触发）

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NET-04 | 网络提示词自动缓存24小时，离线状态下可访问已缓存数据 | NetworkCacheManager class with TTL support, chrome.storage.local pattern from existing StorageManager, ISO timestamp for expiry check, network-first with cache fallback strategy |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cache storage | Service Worker (background) | — | chrome.storage.local operations require service worker context, consistent with existing StorageManager pattern |
| TTL validation | Service Worker / Lib layer | — | Pure computation, can execute in NetworkCacheManager class |
| Network fetch fallback | Service Worker | — | FETCH_NETWORK_PROMPTS handler already exists in service worker, cache integration extends this handler |
| Message routing | Service Worker | — | GET_NETWORK_CACHE / SET_NETWORK_CACHE message handlers follow existing pattern |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrome.storage.local | Native | Cache persistence | Manifest V3 standard for service worker data storage [CITED: Chrome Extension docs via Context7] |
| TypeScript | 5.x (npm: 6.0.3) | Type system for NetworkCacheManager | Project already uses TS throughout [VERIFIED: npm registry] |
| Date / ISO string | Native | Timestamp handling | D-03 specifies ISO 8601 format for human-readable display |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortController | Native | Network timeout control | Already used in FETCH_NETWORK_PROMPTS [VERIFIED: service-worker.ts] |
| MessageResponse<T> | Existing pattern | Cache response format | Consistent with existing message pattern [VERIFIED: messages.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ISO string timestamp | Unix epoch number | Epoch is faster for comparison but not human-readable (D-03 requires ISO) |
| Singleton NetworkCacheManager | Plain class with instance | Singleton ensures single storage key access, prevents race conditions |
| TTL check on read | TTL check on write + cleanup | Proactive cleanup adds complexity; lazy check is simpler and sufficient |

**No installation required** — all dependencies are native browser APIs or existing project patterns.

## Architecture Patterns

### System Architecture Diagram

```
Content Script / Popup
    │
    │ chrome.runtime.sendMessage({ type: FETCH_NETWORK_PROMPTS })
    │
    ▼
Service Worker (background)
    │
    ├─► NetworkCacheManager.getCache()
    │       │
    │       ▼
    │   Check TTL (currentTime - fetchTimestamp > 86400000?)
    │       │
    │       ├─► Expired → Return { valid: false }
    │       │
    │       └─► Valid → Return { valid: true, data: NetworkCacheData }
    │
    ├─► If cache expired or empty:
    │       │
    │       ▼
    │   NanoBananaProvider.fetch() (with AbortController timeout=10s)
    │       │
    │       ├─► SUCCESS → parse() → saveCache(data + timestamp)
    │       │               │
    │       │               ▼
    │       │           Return { success: true, data: NetworkDataResponse }
    │       │
    │       └─► FAIL → Check cache fallback
    │               │
    │               ├─► Cache exists → Return cached data (stale but usable)
    │               │
    │               └─► Cache empty → Return { success: false, error: 'Offline, no cached data' }
    │
    ▼
Response: { success: boolean, data?: NetworkDataResponse, error?: string }
    │
    ▼
Content Script / Popup receives prompts
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── cache/                  # NEW: Cache management
│   │   ├── network-cache.ts    # NetworkCacheManager singleton
│   │   └── types.ts            # NetworkCacheData interface (if needed)
│   ├── storage.ts              # Existing — pattern reference
│   └── providers/              # Existing — NanoBananaProvider
│
├── shared/
│   ├── types.ts                # Extend with NetworkCacheData if needed
│   ├── messages.ts             # Extend with GET_NETWORK_CACHE (optional)
│   └── constants.ts            # Add NETWORK_CACHE_KEY and CACHE_TTL_MS
│
├── background/
│   └── service-worker.ts       # Modify FETCH_NETWORK_PROMPTS handler
│
└── data/
    └── built-in-data.ts        # Existing — pattern reference
```

### Pattern 1: NetworkCacheData Interface

**What:** TypeScript interface for cached network data structure
**When to use:** All cache storage and retrieval operations
**Example:**

```typescript
// Source: [CONTEXT.md D-02, D-03]
// src/shared/types.ts (extension) or src/lib/cache/types.ts

import type { NetworkPrompt, ProviderCategory } from './types'

// D-02: Cache data structure
export interface NetworkCacheData {
  prompts: NetworkPrompt[]
  categories: ProviderCategory[]
  fetchTimestamp: string // D-03: ISO 8601 format (e.g., '2026-04-19T12:00:00Z')
}

// Cache response with validity flag
export interface CacheResult {
  valid: boolean
  data?: NetworkCacheData
  isExpired?: boolean // For UI indication (Phase 7)
}
```

### Pattern 2: NetworkCacheManager Singleton

**What:** Singleton class managing cache storage, TTL validation, and fallback
**When to use:** All cache operations in service worker
**Example:**

```typescript
// Source: [based on existing StorageManager pattern + CONTEXT.md decisions]
// src/lib/cache/network-cache.ts

import type { NetworkCacheData, CacheResult } from '@/shared/types'
import { NETWORK_CACHE_KEY, CACHE_TTL_MS } from '@/shared/constants'

export class NetworkCacheManager {
  private static instance: NetworkCacheManager

  static getInstance(): NetworkCacheManager {
    if (!NetworkCacheManager.instance) {
      NetworkCacheManager.instance = new NetworkCacheManager()
    }
    return NetworkCacheManager.instance
  }

  // D-05: Get cache with TTL validation on read
  async getCache(): Promise<CacheResult> {
    try {
      const result = await chrome.storage.local.get(NETWORK_CACHE_KEY)
      const cacheData = result[NETWORK_CACHE_KEY] as NetworkCacheData | undefined

      if (!cacheData) {
        return { valid: false } // No cache exists
      }

      // D-06: Check expiry
      if (this.isExpired(cacheData.fetchTimestamp)) {
        return { valid: false, data: cacheData, isExpired: true } // Expired but available for fallback
      }

      return { valid: true, data: cacheData }
    } catch (error) {
      console.error('[Prompt-Script] Cache read error:', error)
      return { valid: false }
    }
  }

  // D-04: TTL check - 24 hours = 86,400,000 ms
  private isExpired(fetchTimestamp: string): boolean {
    const fetchTime = new Date(fetchTimestamp).getTime()
    const currentTime = Date.now()
    return (currentTime - fetchTime) > CACHE_TTL_MS
  }

  // Save cache with current timestamp
  async saveCache(prompts: NetworkPrompt[], categories: ProviderCategory[]): Promise<void> {
    const cacheData: NetworkCacheData = {
      prompts,
      categories,
      fetchTimestamp: new Date().toISOString() // D-03: ISO format
    }

    try {
      await chrome.storage.local.set({ [NETWORK_CACHE_KEY]: cacheData })
      console.log('[Prompt-Script] Cache saved:', prompts.length, 'prompts')
    } catch (error) {
      console.error('[Prompt-Script] Cache save error:', error)
      throw error
    }
  }

  // Clear cache (optional, for manual refresh in Phase 7+)
  async clearCache(): Promise<void> {
    try {
      await chrome.storage.local.remove(NETWORK_CACHE_KEY)
      console.log('[Prompt-Script] Cache cleared')
    } catch (error) {
      console.error('[Prompt-Script] Cache clear error:', error)
    }
  }
}

export const networkCacheManager = NetworkCacheManager.getInstance()
```

### Pattern 3: Constants Extension

**What:** Add cache constants to existing constants.ts
**When to use:** All cache-related configuration
**Example:**

```typescript
// Source: [CONTEXT.md D-01, D-04]
// src/shared/constants.ts (extension)

// Existing constants...
export const STORAGE_KEY = 'prompt_script_data'

// D-01: Network cache storage key
export const NETWORK_CACHE_KEY = 'network_cache_data'

// D-04: TTL = 24 hours in milliseconds
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 86,400,000 ms
```

### Pattern 4: Modified FETCH_NETWORK_PROMPTS Handler

**What:** Network-first with cache fallback integration
**When to use:** Content script / popup requests network prompts
**Example:**

```typescript
// Source: [existing service-worker.ts + CONTEXT.md D-07, D-08, D-09]
// src/background/service-worker.ts (modification)

import { NetworkCacheManager } from '@/lib/cache/network-cache'

const networkCacheManager = NetworkCacheManager.getInstance()

case MessageType.FETCH_NETWORK_PROMPTS:
  // D-07: Network-first strategy
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT)

  // Try network fetch first
  nanoBananaProvider.fetch(controller.signal)
    .then(rawData => {
      clearTimeout(timeoutId)
      const prompts = nanoBananaProvider.parse(rawData)
      const categories = nanoBananaProvider.getCategories()

      // Save to cache on success
      networkCacheManager.saveCache(prompts, categories)

      console.log('[Prompt-Script] Network fetch success:', prompts.length, 'prompts')

      sendResponse({
        success: true,
        data: { prompts, categories, isFromCache: false }
      })
    })
    .catch(async (error) => {
      clearTimeout(timeoutId)
      const errorMsg = error instanceof Error
        ? (error.name === 'AbortError' ? 'Request timeout' : error.message)
        : 'Network fetch failed'

      console.warn('[Prompt-Script] Network fetch failed:', errorMsg, '- checking cache')

      // D-08: Don't use navigator.onLine, rely on fetch failure
      // D-07: Fallback to cache
      const cacheResult = await networkCacheManager.getCache()

      if (cacheResult.data) {
        // Cache available (may be expired or valid)
        console.log('[Prompt-Script] Using cached data:', cacheResult.data.prompts.length, 'prompts',
          cacheResult.isExpired ? '(expired)' : '(valid)')

        sendResponse({
          success: true,
          data: {
            prompts: cacheResult.data.prompts,
            categories: cacheResult.data.categories,
            isFromCache: true,
            isExpired: cacheResult.isExpired || false
          }
        })
      } else {
        // D-09: Cache empty and network failed - return error
        console.error('[Prompt-Script] No cache available, offline mode')
        sendResponse({
          success: false,
          error: 'Network unavailable and no cached data. Please try again when online.'
        })
      }
    })
  return true // Required for async response
```

### Pattern 5: NetworkDataResponse Extension

**What:** Extend response type to include cache metadata
**When to use:** All network prompt responses
**Example:**

```typescript
// Source: [existing messages.ts + cache metadata]
// src/shared/messages.ts (extension)

// Extended response with cache indicators
export interface NetworkDataResponse {
  prompts: NetworkPrompt[]
  categories: ProviderCategory[]
  isFromCache?: boolean     // UI can show "cached" indicator
  isExpired?: boolean       // UI can show "stale data" warning
}
```

### Anti-Patterns to Avoid

- **navigator.onLine check:** D-08 explicitly prohibits this - it's unreliable, especially in Chrome Extensions where service worker context differs
- **Proactive TTL cleanup:** Don't scan storage for expired entries on startup - lazy check on read is sufficient
- **Separate timestamp storage:** Don't store timestamp in a different key - keep it with the data for atomic read
- **Cache without fallback:** Network-first must always attempt cache fallback, not just return error on network fail
- **Global variable caching:** Service worker lifecycle is ephemeral - must persist in chrome.storage.local

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Storage key management | String literal throughout code | NETWORK_CACHE_KEY constant | D-01 specifies exact key, prevents typos |
| TTL calculation | Manual math in multiple places | isExpired() method in NetworkCacheManager | D-06 logic centralized, reusable |
| Timestamp format | Unix epoch number | ISO string via Date.toISOString() | D-03 requires ISO for human-readable display |
| Cache save pattern | Custom storage.set call | NetworkCacheManager.saveCache() | Atomic save with timestamp, error handling |
| Offline detection | navigator.onLine check | Fetch failure + cache fallback | D-08: navigator.onLine unreliable |

**Key insight:** The existing StorageManager pattern provides a proven singleton approach. NetworkCacheManager should mirror this pattern for consistency and maintainability.

## Runtime State Inventory

> Phase is greenfield (new cache layer) — no rename/refactor required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new functionality | None (will add `network_cache_data` key) |
| Live service config | None — new functionality | None |
| OS-registered state | None — new functionality | None |
| Secrets/env vars | None — GitHub Raw URL requires no authentication | None |
| Build artifacts | None — new TypeScript files will be bundled by Vite | None |

## Common Pitfalls

### Pitfall 1: Service Worker Storage Race Conditions

**What goes wrong:** Multiple concurrent FETCH_NETWORK_PROMPTS requests cause cache write conflicts
**Why it happens:** Service worker handles messages asynchronously; two requests may try to saveCache() simultaneously
**How to avoid:** Singleton pattern with async locking not needed for this use case — last write wins is acceptable for cache data
**Warning signs:** Cache timestamp shows unexpected values, prompt count varies unexpectedly

### Pitfall 2: Timestamp Comparison Edge Cases

**What goes wrong:** ISO string comparison fails due to timezone differences
**Why it happens:** `new Date(isoString).getTime()` converts to UTC epoch, but local timezone can cause confusion
**How to avoid:** Always use `.getTime()` for comparison, not direct string comparison. ISO format is for display only (D-03)
**Warning signs:** Cache shows "expired" immediately after save, or TTL seems incorrect

### Pitfall 3: Cache Fallback Without Expiry Check

**What goes wrong:** Expired cache returned without indication, user sees stale data
**Why it happens:** Network-first fallback ignores TTL check result
**How to avoid:** Include `isExpired` flag in response so UI (Phase 7) can show warning indicator
**Warning signs:** User sees prompts that are days old without any indication

### Pitfall 4: Storage Quota Exceeded

**What goes wrong:** Cache save fails silently when storage quota exceeded
**Why it happens:** Nano Banana ~900 prompts with full content may approach storage limit
**How to avoid:** Use existing `checkStorageQuota()` utility from storage.ts to monitor usage. Log warning at 80% threshold
**Warning signs:** Cache save throws error, subsequent reads return empty

### Pitfall 5: AbortController Timeout After Cache Save

**What goes wrong:** Timeout clears after successful parse but before cache save completes
**Why it happens:** clearTimeout() happens before async cache save
**How to avoid:** Move clearTimeout() before parse(), not after. Cache save is async but timeout no longer needed
**Warning signs:** Cache appears empty despite successful network response

## Code Examples

### TTL Expiration Check Function

```typescript
// Source: [CONTEXT.md D-04, D-06]
// Core TTL logic

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 86,400,000 ms = 24 hours

function isCacheExpired(fetchTimestamp: string): boolean {
  const fetchTime = new Date(fetchTimestamp).getTime()
  const currentTime = Date.now()
  const elapsed = currentTime - fetchTime

  // D-06: expired if elapsed > TTL
  return elapsed > CACHE_TTL_MS
}

// Usage example
const timestamp = '2026-04-19T12:00:00Z'
if (isCacheExpired(timestamp)) {
  console.log('Cache expired, need fresh fetch')
}
```

### Network-First with Cache Fallback Flow

```typescript
// Source: [CONTEXT.md D-07, D-08, D-09]
// Complete handler flow

async function handleNetworkPromptsRequest(): Promise<MessageResponse<NetworkDataResponse>> {
  // Step 1: Attempt network fetch
  try {
    const rawData = await nanoBananaProvider.fetch()
    const prompts = nanoBananaProvider.parse(rawData)
    const categories = nanoBananaProvider.getCategories()

    // Step 2: Save to cache on success
    await networkCacheManager.saveCache(prompts, categories)

    return {
      success: true,
      data: { prompts, categories, isFromCache: false }
    }
  } catch (networkError) {
    // D-08: Don't check navigator.onLine, rely on fetch failure

    // Step 3: Fallback to cache
    const cacheResult = await networkCacheManager.getCache()

    if (cacheResult.data) {
      // Return cached data (expired or valid)
      return {
        success: true,
        data: {
          prompts: cacheResult.data.prompts,
          categories: cacheResult.data.categories,
          isFromCache: true,
          isExpired: cacheResult.isExpired || false
        }
      }
    }

    // D-09: No cache, network failed
    return {
      success: false,
      error: 'Offline and no cached data available'
    }
  }
}
```

### ISO Timestamp Generation and Display

```typescript
// Source: [CONTEXT.md D-03]
// Timestamp handling

// Save timestamp (ISO format)
const cacheData = {
  prompts,
  categories,
  fetchTimestamp: new Date().toISOString() // '2026-04-19T12:00:00.000Z'
}

// Display for UI (Phase 7)
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString() // '4/19/2026, 12:00 PM'
}

// Calculate age for UI
function getCacheAge(fetchTimestamp: string): string {
  const hours = Math.floor((Date.now() - new Date(fetchTimestamp).getTime()) / (60 * 60 * 1000))
  if (hours < 1) return 'Less than 1 hour ago'
  if (hours >= 24) return 'Over 24 hours ago (stale)'
  return `${hours} hours ago`
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage in service worker | chrome.storage.local | Manifest V3 (2022) | CSP compliance, async API |
| navigator.onLine for offline | Fetch failure + cache | Best practice 2024+ | More reliable offline detection |
| Unix epoch timestamp | ISO 8601 string | D-03 (2026-04-19) | Human-readable, timezone-safe |
| Proactive cache cleanup | Lazy TTL check on read | D-05 (2026-04-19) | Simpler implementation, no background timer |

**Deprecated/outdated:**
- localStorage: Blocked in service worker context (CSP)
- navigator.onLine: D-08 explicitly prohibits — unreliable in extension context
- setInterval cleanup timer: Service worker lifecycle unpredictable, lazy check sufficient

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nano Banana data size (~900 prompts) fits within storage quota | Storage Quota | May need to trim content or implement quota check before save |
| A2 | Service Worker singleton race conditions acceptable (last write wins) | Pitfall 1 | Concurrent requests could cause inconsistent cache state |
| A3 | ISO timestamp comparison via getTime() handles all timezone cases | Timestamp | Edge cases with DST or unusual timezone settings |

**Note:** All critical decisions (D-01 through D-09) are locked by user — no user confirmation needed for these. Assumptions A1-A3 should be validated during implementation.

## Open Questions

1. **Storage quota for 900+ prompts**
   - What we know: Storage quota is 10MB, Nano Banana README is ~50KB raw
   - What's unclear: Parsed NetworkPrompt[] with full content may exceed quota estimate
   - Recommendation: Implement quota check before save, log warning at 80% usage, consider content truncation if needed

2. **Expired cache handling strategy**
   - What we know: D-05 says return empty on expiry, D-09 says return error if cache empty
   - What's unclear: Should expired cache be deleted immediately or kept for fallback?
   - Recommendation: Claude's discretion — keep expired cache for fallback (D-07 allows stale data fallback). Add clearCache() method for Phase 7 manual refresh.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| chrome.storage.local | Cache persistence | ✓ | Native (Chrome) | — |
| Date / ISO methods | Timestamp handling | ✓ | Native (JavaScript) | — |
| TypeScript | NetworkCacheManager types | ✓ | 6.0.3 [VERIFIED: npm registry] | — |
| AbortController | Network timeout | ✓ | Native (Chrome) | — |
| npm | Build tooling | ✓ | 11.6.2 | — |
| node | Runtime | ✓ | 25.2.1 | — |

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
| NET-04 | NetworkCacheManager.getCache returns valid data when TTL not expired | unit | N/A | ❌ Wave 0 |
| NET-04 | NetworkCacheManager.getCache returns expired flag when TTL exceeded | unit | N/A | ❌ Wave 0 |
| NET-04 | NetworkCacheManager.saveCache stores data with ISO timestamp | unit | N/A | ❌ Wave 0 |
| NET-04 | FETCH_NETWORK_PROMPTS saves cache on network success | integration | N/A | ❌ Wave 0 |
| NET-04 | FETCH_NETWORK_PROMPTS returns cached data when network fails | integration | N/A | ❌ Wave 0 |
| NET-04 | FETCH_NETWORK_PROMPTS returns error when network fails and cache empty | integration | N/A | ❌ Wave 0 |
| NET-04 | TTL calculation correctly identifies 24-hour expiry | unit | N/A | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `vitest.config.ts` — Configure test framework (Vitest 4.1.4 recommended for Vite projects)
- [ ] `src/lib/cache/__tests__/network-cache.test.ts` — Unit tests for NetworkCacheManager
- [ ] `src/background/__tests__/service-worker.test.ts` — Integration tests for cache handler
- [ ] Mock chrome.storage.local — `vi.fn()` for Vitest mock storage API
- [ ] Mock fetch for network tests — `vi.fn()` for provider fetch mock

**Alternative:** Manual validation via `npm run dev` + chrome://extensions testing + service worker console

### Manual Validation Checklist

1. Load extension in Chrome developer mode
2. Open service worker console in chrome://extensions
3. Trigger FETCH_NETWORK_PROMPTS and verify cache saved:
   ```javascript
   chrome.storage.local.get('network_cache_data', console.log)
   ```
4. Verify timestamp is ISO format: `'2026-04-19T12:00:00.000Z'`
5. Simulate network failure (disable network in DevTools):
   - Verify cached data returned
   - Verify `isFromCache: true` in response
6. Delete cache and simulate offline:
   ```javascript
   chrome.storage.local.remove('network_cache_data')
   ```
   - Verify error response returned
7. Set cache with expired timestamp (>24h old):
   - Verify `isExpired: true` in response

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | GitHub Raw URL requires no auth |
| V3 Session Management | no | Stateless cache operations |
| V4 Access Control | no | Public cached data, no user-specific access |
| V5 Input Validation | yes | TypeScript type validation on cache data, ISO timestamp parsing |
| V6 Cryptography | no | HTTPS transport provided by GitHub, no encryption needed for local cache |

### Known Threat Patterns for Chrome Extension + Storage Cache

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Storage quota exhaustion | Denial of Service | checkStorageQuota() warning at 80%, error handling on save |
| Malicious cached data injection | Tampering | Data only comes from trusted GitHub source, TypeScript validation |
| Timestamp manipulation | Tampering | Timestamp generated by extension, not from external source |
| Cache poisoning via race condition | Tampering | Last-write-wins acceptable for public data, no user-specific cache |

**Key security consideration:** Cached data originates from trusted GitHub Raw URL (HTTPS). No user input affects cache content. Timestamp is extension-generated, not from external source.

## Sources

### Primary (HIGH confidence)

- Chrome Extension storage.local patterns — Context7 docs [CITED: developer.chrome.com via Context7]
- Existing StorageManager singleton pattern — `src/lib/storage.ts` [VERIFIED: file read]
- Existing FETCH_NETWORK_PROMPTS handler — `src/background/service-worker.ts` [VERIFIED: file read]
- CONTEXT.md decisions D-01 through D-09 — User locked [VERIFIED: file read]

### Secondary (MEDIUM confidence)

- Service Worker lifecycle constraints — Chrome Extension docs via Context7 [CITED]
- TTL timestamp patterns — JavaScript Date API documentation [CITED: MDN]

### Tertiary (LOW confidence)

- Storage quota estimation for 900 prompts — Assumed based on README size [ASSUMED: needs validation]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All dependencies are native browser APIs or existing project patterns
- Architecture: HIGH — Context7 docs and existing StorageManager provide proven patterns
- Pitfalls: MEDIUM — Service worker race conditions and storage quota need implementation validation

**Research date:** 2026-04-19
**Valid until:** 30 days (stable APIs, Chrome Extension patterns are well-established)