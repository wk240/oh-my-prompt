# Project Research Summary — v1.1.0 网络提示词数据源接入

**Project:** Lovart Prompt Injector
**Milestone:** v1.1.0
**Domain:** Chrome Extension (Manifest V3) / Network Data Integration
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## Executive Summary

v1.1.0 milestone adds real-time network data source integration to Lovart Prompt Injector. Users will be able to browse, search, and collect prompts from GitHub-hosted prompt libraries (primarily Nano Banana Prompts with 900+ image generation prompts) directly from the dropdown UI. Selected prompts can be cached locally for offline use.

Core architecture extensions: Provider abstraction pattern for data sources, Service Worker network handlers (CSP compliant), Network cache layer with 24h TTL, Dropdown UI "在线库" section with search/filter.

Key risk: Large dataset performance (900+ prompts) — requires pagination, category filtering, and search optimization.

---

## Key Findings

### Stack Additions

**No new dependencies required.** Chrome Extension MV3 supports native `fetch()` in Service Worker and Popup. Network requests route through Service Worker (CSP compliant).

**Required permissions:**
```json
"host_permissions": [
  "https://raw.githubusercontent.com/*"
]
```

**Data source:** Nano Banana Prompts (Markdown in README.md, 900+ prompts, 16 categories, ~600KB file)

---

### Feature Analysis

**Nano Banana Prompts:**
- Format: Markdown embedded in README.md (not separate JSON)
- Categories: 17 categories (3D Miniatures, Portrait Photography, etc.)
- Lovart relevance: ~80% directly applicable to image generation
- Prompt formats: Plain text, structured JSON, template with placeholders

**prompts.chat:**
- Format: CSV with 157+ prompts
- Relevance: LOW (ChatGPT role-playing, not image generation)
- Recommendation: DEFER integration

**Table stakes features:**
1. Browse by category (source categories)
2. Search/filter across 900+ prompts
3. Preview prompt before collecting
4. Collect/favorite → save to local storage
5. Offline cache (24h TTL)

**Differentiators:**
1. Multi-source browsing (extensible provider pattern)
2. Smart category mapping (user-select on collect)
3. Sync status indicator (last refresh time)

---

### Architecture Approach

**New components:**
- `DataSourceProvider` (abstract interface)
- `NanoBananaProvider` (Markdown parser)
- `NetworkCacheManager` (cache lifecycle)
- `OnlineLibraryTab` (Dropdown UI section)
- `NetworkPromptCard` (single prompt display)

**Message protocol extensions:**
- `FETCH_NETWORK_PROMPTS`
- `GET_NETWORK_CACHE`
- `COLLECT_NETWORK_PROMPT`

**Data flow:**
User → Dropdown "在线库" → Service Worker fetch → Provider.parse → Cache → UI render → Collect → Local storage

---

### Critical Pitfalls

1. **CSP violation** — Content script cannot fetch directly → Route through Service Worker
2. **Large dataset performance** — 900+ prompts → Pagination (50/page), category filter first
3. **Markdown parsing changes** — Upstream README may change → Flexible regex, logging
4. **Offline handling** — No data on first offline visit → Show offline message, detect `navigator.onLine`
5. **Rate limiting** — GitHub raw files → User-triggered refresh, 24h cache, handle 403

---

## Implications for Roadmap

### Phase Structure (v1.1.0)

| Phase | Name | Goal | LOC |
|-------|------|------|-----|
| 5 | Provider Abstraction & Nano Banana | Implement data source provider interface and Nano Banana parser | ~180 |
| 6 | Service Worker Network Handlers | Add network fetch, cache, collect handlers to service worker | ~100 |
| 7 | Network Cache Layer | Implement cache management with TTL, offline detection | ~150 |
| 8 | Dropdown "在线库" UI | Add online library section with category filter, pagination | ~300 |
| 9 | Search & Collect Features | Implement search/filter and collect-to-local functionality | ~200 |

**Total:** 5 phases, ~930 LOC

**Phase ordering rationale:**
- Phase 5 before 6: Provider interface needed before handlers
- Phase 6 before 7: Network handlers needed before cache layer
- Phase 7 before 8: Cache needed for offline support in UI
- Phase 8 before 9: UI needed before search/collect features

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (Service Worker fetch) | HIGH | Standard Chrome Extension MV3 pattern |
| Features (browse/search/collect) | HIGH | Common UX patterns, clear requirements |
| Architecture (Provider pattern) | HIGH | Proven extensibility pattern |
| Pitfalls (CSP, performance) | HIGH | Documented in Chrome Extension docs |

**Overall confidence:** HIGH

---

## Sources

- Chrome Extension Manifest V3 CSP documentation
- GitHub raw file access via curl
- Nano Banana Prompts README analysis (actual content sampled)
- prompts.chat CSV structure analysis (actual content sampled)

---

*Research completed: 2026-04-19*
*Ready for requirements: yes*
*Ready for roadmap: yes*