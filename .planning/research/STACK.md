# Stack Research: Network Prompt Data Source Integration

**Milestone:** v1.1.0 网络提示词数据源接入
**Domain:** Chrome Extension (Manifest V3) / Network Integration
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## 1. Stack Additions Required

### 1.1 No New Dependencies Required

Chrome Extension Manifest V3 already supports `fetch()` API natively in:
- **Service Worker** (background) — Primary network request location
- **Popup/Options pages** — Can also make direct network requests

No external HTTP libraries needed (axios, etc. would add unnecessary bundle size).

### 1.2 Data Source Access

| Data Source | Format | URL | Fetch Method |
|-------------|--------|-----|--------------|
| Nano Banana Prompts | Markdown (embedded in README) | `https://raw.githubusercontent.com/devanshug2307/Awesome-Nano-Banana-Prompts/main/README.md` | Parse markdown structure |
| prompts.chat | CSV | `https://raw.githubusercontent.com/f/prompts.chat/main/prompts.csv` | Parse CSV to JSON |

---

## 2. Chrome Extension Network Patterns (Manifest V3)

### 2.1 CSP Constraints

**Key rule:** Content scripts cannot make direct cross-origin fetch requests.

**Solution:** All network requests must go through:
1. **Service Worker** (background) — Recommended for all network operations
2. **chrome.runtime.sendMessage** — Content script → Service Worker → Network → Response

### 2.2 Required Permissions

```json
// manifest.json
{
  "host_permissions": [
    "https://raw.githubusercontent.com/*",
    "https://api.github.com/*"
  ]
}
```

### 2.3 Service Worker Lifecycle

**Critical:** Service Worker can be terminated by Chrome at any time.

Implications:
- Global variables unreliable — use `chrome.storage.local` for state
- Long-running requests may be interrupted — handle gracefully
- Network requests must be fully async (Promise-based)

### 2.4 Request Pattern

```typescript
// Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_NETWORK_DATA') {
    fetch(message.url)
      .then(res => res.text())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true // Keep channel open for async response
  }
})
```

---

## 3. Data Source Abstraction

### 3.1 Provider Interface Design

```typescript
interface DataSourceProvider {
  id: string
  name: string
  fetch(): Promise<RawPromptData>
  parse(raw: string): ParsedPrompt[]
  getCategoryMapping(): Map<string, string> // Source category → Local category
}
```

### 3.2 Provider Implementations

| Provider | Fetch Method | Parse Method | Category Count |
|----------|--------------|--------------|----------------|
| NanoBananaProvider | fetch README.md | Markdown parser (regex-based) | 16 categories |
| PromptsChatProvider | fetch CSV | CSV parser | No categories (flat) |

### 3.3 Extensibility Pattern

```typescript
// Provider registry
const providers: DataSourceProvider[] = [
  new NanoBananaProvider(),
  new PromptsChatProvider(),
  // Future: new CustomProvider()
]

function getProvider(id: string): DataSourceProvider | undefined
```

---

## 4. Caching Strategy

### 4.1 Storage Schema Extension

```typescript
interface CachedNetworkData {
  providerId: string
  fetchedAt: string // ISO timestamp
  data: ParsedPrompt[]
  ttl: number // Cache expiry in hours (default: 24)
}
```

### 4.2 Cache Flow

1. User clicks "在线库" → Check cache timestamp
2. If cache expired (>24h) or empty → Fetch from network
3. On fetch success → Store to `chrome.storage.local`
4. Display cached data (fast UI)

### 4.3 Cache Key

```typescript
const CACHE_KEY = 'prompt_script_network_cache'
```

---

## 5. Integration Points with Existing Code

### 5.1 Message Protocol Extension

Add new `MessageType` values:
```typescript
enum MessageType {
  // ... existing
  FETCH_NETWORK_PROMPTS = 'FETCH_NETWORK_PROMPTS',
  GET_NETWORK_CACHE = 'GET_NETWORK_CACHE',
  COLLECT_NETWORK_PROMPT = 'COLLECT_NETWORK_PROMPT' // Add to local storage
}
```

### 5.2 Storage Extension

Extend `StorageSchema`:
```typescript
interface StorageSchema {
  prompts: Prompt[]
  categories: Category[]
  version: string
  networkCache?: CachedNetworkData[] // NEW
  collectedPrompts?: string[] // IDs of prompts collected from network
}
```

### 5.3 UI Integration

- Dropdown: Add "在线库" tab/section
- Popup: Add "网络数据源" settings panel
- Both use same message pattern to fetch data

---

## 6. Alternatives Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Service Worker fetch | CSP compliant, centralized | Service Worker lifecycle | ✓ Selected |
| Popup fetch | Simpler implementation | Not available to content script | ✗ Rejected |
| External API proxy | More control | Requires backend | ✗ Out of scope |

---

## Confidence Levels

| Recommendation | Confidence | Rationale |
|----------------|------------|-----------|
| Service Worker network proxy | HIGH | Chrome Extension MV3 standard |
| Markdown parsing for Nano Banana | HIGH | Structure is predictable, regex-based |
| Provider abstraction pattern | HIGH | Proven extensibility pattern |
| 24h cache TTL | MEDIUM | Trade-off: freshness vs latency |

---

## Sources

- Chrome Extension Manifest V3 CSP documentation
- GitHub raw file access patterns
- Nano Banana Prompts README analysis
- prompts.chat CSV structure analysis

---
*Stack research for: Network Prompt Data Source Integration*
*Researched: 2026-04-19*