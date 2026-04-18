# Architecture Research: Network Prompt Data Source Integration

**Milestone:** v1.1.0 网络提示词数据源接入
**Domain:** Chrome Extension (Manifest V3) / Network Integration
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## 1. New Components Required

### 1.1 Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `DataSourceProvider` | `src/lib/providers/base.ts` | Abstract interface for data sources |
| `NanoBananaProvider` | `src/lib/providers/nano-banana.ts` | Nano Banana README parser |
| `ProviderRegistry` | `src/lib/providers/registry.ts` | Provider lookup and management |
| `NetworkCacheManager` | `src/lib/network-cache.ts` | Cache lifecycle management |

### 1.2 UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `OnlineLibraryTab` | `src/content/components/OnlineLibraryTab.tsx` | Dropdown "在线库" section |
| `NetworkPromptCard` | `src/content/components/NetworkPromptCard.tsx` | Single network prompt display |
| `SearchFilterBar` | `src/content/components/SearchFilterBar.tsx` | Search input for network prompts |
| `ProviderSelector` | `src/content/components/ProviderSelector.tsx` | Data source switcher |

---

## 2. Data Source Provider Abstraction

### 2.1 Interface Design

```typescript
// src/lib/providers/base.ts

interface ParsedPrompt {
  id: string // Generated: providerId + index
  title: string
  content: string
  sourceCategory: string
  description?: string
  imageUrl?: string
  sourceUrl?: string
}

interface DataSourceProvider {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly dataUrl: string
  
  // Lifecycle
  fetch(): Promise<string>
  parse(rawData: string): ParsedPrompt[]
  
  // Metadata
  getSourceCategories(): string[]
  getCategoryDescription(category: string): string
}
```

### 2.2 Provider Implementations

```typescript
// NanoBananaProvider (src/lib/providers/nano-banana.ts)
class NanoBananaProvider implements DataSourceProvider {
  id = 'nano-banana'
  name = 'Nano Banana Prompts'
  dataUrl = 'https://raw.githubusercontent.com/devanshug2307/Awesome-Nano-Banana-Prompts/main/README.md'
  
  parse(markdown: string): ParsedPrompt[] {
    // Regex-based markdown parsing
    // Extract: ### Title, **Prompt:** blocks, Source links
  }
}
```

---

## 3. Integration with Existing Components

### 3.1 Dropdown Container Extension

Current: `DropdownContainer.tsx` shows local prompts only.

New structure:
```
DropdownContainer
├── TabSelector (Local | 在线库)
├── LocalPromptsList (existing)
│   ├── CategoryFilter
│   └── PromptCard[]
└── OnlineLibraryTab (NEW)
    ├── ProviderSelector (Nano Banana only initially)
    ├── SearchFilterBar
    ├── CategoryFilter (source categories)
    └── NetworkPromptCard[]
        ├── PreviewButton → Show full prompt
        ├── CollectButton → Save to local storage
        └── InsertButton → Direct insert (optional)
```

### 3.2 Service Worker Extension

Current handlers: `PING`, `GET_STORAGE`, `SET_STORAGE`, `INSERT_PROMPT`

New handlers:
```typescript
// src/background/service-worker.ts

case MessageType.FETCH_NETWORK_PROMPTS:
  const providerId = message.payload.providerId
  const provider = ProviderRegistry.get(providerId)
  const rawData = await provider.fetch()
  const prompts = provider.parse(rawData)
  // Cache the result
  await NetworkCacheManager.store(providerId, prompts)
  sendResponse({ success: true, data: prompts })
  return true

case MessageType.GET_NETWORK_CACHE:
  const cache = await NetworkCacheManager.get(providerId)
  sendResponse({ success: true, data: cache })
  return true

case MessageType.COLLECT_NETWORK_PROMPT:
  // Convert network prompt to local Prompt format
  // Save to storage
  sendResponse({ success: true })
  return true
```

---

## 4. Message Protocol Extensions

### 4.1 New MessageType Values

```typescript
// src/shared/messages.ts

export enum MessageType {
  // Existing
  PING = 'PING',
  GET_STORAGE = 'GET_STORAGE',
  SET_STORAGE = 'SET_STORAGE',
  INSERT_PROMPT = 'INSERT_PROMPT',
  OPEN_SETTINGS = 'OPEN_SETTINGS',
  
  // NEW for v1.1.0
  FETCH_NETWORK_PROMPTS = 'FETCH_NETWORK_PROMPTS',
  GET_NETWORK_CACHE = 'GET_NETWORK_CACHE',
  REFRESH_NETWORK_CACHE = 'REFRESH_NETWORK_CACHE',
  COLLECT_NETWORK_PROMPT = 'COLLECT_NETWORK_PROMPT',
}
```

### 4.2 Message Payload Types

```typescript
interface FetchNetworkPromptsPayload {
  providerId: string
  forceRefresh?: boolean // Skip cache if true
}

interface NetworkCachePayload {
  providerId: string
  fetchedAt: string
  prompts: ParsedPrompt[]
}

interface CollectNetworkPromptPayload {
  prompt: ParsedPrompt
  targetCategoryId?: string // User-selected category
}
```

---

## 5. Data Flow Diagram

```
User clicks "在线库"
    │
    ▼
DropdownContainer sends message
FETCH_NETWORK_PROMPTS { providerId }
    │
    ▼
Service Worker receives message
    │
    ├─► Check NetworkCacheManager
    │       │
    │       ├─► Cache valid (< 24h) → Return cached data
    │       │
    │       └─► Cache stale → Fetch from network
    │               │
    │               ▼
    │           fetch(provider.dataUrl)
    │               │
    │               ▼
    │           provider.parse(rawData)
    │               │
    │               ▼
    │           NetworkCacheManager.store(data)
    │               │
    │               ▼
    │           Return parsed prompts
    │
    ▼
Content script receives response
    │
    ▼
OnlineLibraryTab renders NetworkPromptCard[]
    │
    ├─► User clicks "Collect"
    │       │
    │       ▼
    │   COLLECT_NETWORK_PROMPT { prompt, categoryId }
    │       │
    │       ▼
    │   Service Worker converts to Prompt format
    │       │
    │       ▼
    │   Store to chrome.storage.local
    │       │
    │       ▼
    │   Prompt now available in "Local" tab
    │
    └─► User clicks "Insert"
            │
            ▼
        INSERT_PROMPT { content }
            │
            ▼
        Insert handler (existing)
```

---

## 6. Suggested Build Order

| Phase | Components | Dependencies | LOC |
|-------|------------|--------------|-----|
| **Phase 5** | Provider abstraction + NanoBananaProvider | None | ~180 |
| **Phase 6** | Service Worker network handlers | Phase 5 | ~100 |
| **Phase 7** | Network cache layer | Phase 5, 6 | ~150 |
| **Phase 8** | Dropdown UI "在线库" section | Phase 6, 7 | ~300 |
| **Phase 9** | Search/filter UI + Collect functionality | Phase 8 | ~200 |

**Total phases:** 5 new phases for v1.1.0 milestone
**Starting phase:** Phase 5 (continues from v1.0's Phase 4)

---

## 7. Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Provider pattern | Extensible for future data sources without core changes |
| Cache in service worker | Centralized, survives content script reload, CSP compliant |
| Regex markdown parsing | No heavy dependencies, Nano Banana structure predictable |
| Message-based network | Respects Chrome Extension CSP restrictions |
| Collect vs Insert separate | User can preview before committing to local storage |
| 24h cache TTL | Balance between data freshness and offline usability |

---

## Sources

- Chrome Extension Manifest V3 CSP documentation
- Existing architecture from v1.0
- Nano Banana README structure analysis

---
*Architecture research for: Network Prompt Data Source Integration*
*Researched: 2026-04-19*