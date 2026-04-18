# Pitfalls Research: Network Prompt Data Source Integration

**Milestone:** v1.1.0 网络提示词数据源接入
**Domain:** Chrome Extension (Manifest V3) / Network Integration
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## 1. Chrome Extension Network Pitfalls

### 1.1 CSP Violation in Content Script

**Pitfall:** Content script cannot make cross-origin fetch directly.

**Warning signs:**
- `fetch()` calls in content script files
- Network-related imports in content components
- CORS errors in console

**Prevention:**
- All network requests through Service Worker
- Use `chrome.runtime.sendMessage` pattern
- Content script only handles UI, not network

**Phase:** Phase 6 (Service Worker handlers)

---

### 1.2 Service Worker Termination During Fetch

**Pitfall:** Service Worker can be terminated while fetch is in progress.

**Warning signs:**
- Long fetch operations (>30s)
- Large data files (Nano Banana README ~600KB)
- Silent failures without error messages

**Prevention:**
- Keep fetch operations short (~600KB is acceptable)
- Handle response errors gracefully
- Cache results immediately after fetch
- Use try-catch with meaningful error messages

**Phase:** Phase 6 (Service Worker handlers)

---

### 1.3 Missing host_permissions

**Pitfall:** Fetch to GitHub URLs fails without host_permissions.

**Warning signs:**
- Network errors in Service Worker
- CORS-like failures
- `net::ERR_BLOCKED_BY_CLIENT` errors

**Prevention:**
- Add `host_permissions` in manifest.json:
```json
"host_permissions": [
  "https://raw.githubusercontent.com/*"
]
```

**Phase:** Phase 5 (Provider setup)

---

## 2. Data Source Integration Pitfalls

### 2.1 Markdown Parsing Breaks on Format Changes

**Pitfall:** Nano Banana README structure may change upstream.

**Warning signs:**
- Parser returns empty or malformed data
- Regex patterns no longer match
- Missing prompts in output

**Prevention:**
- Use flexible regex patterns (allow variations)
- Add fallback parsing strategies
- Log parse errors for debugging
- Test parsing on actual README content

**Phase:** Phase 5 (NanoBananaProvider)

---

### 2.2 Large Dataset Performance (900+ Prompts)

**Pitfall:** 900+ prompts cause UI lag in dropdown.

**Warning signs:**
- Slow dropdown rendering (>500ms)
- High memory usage
- UI jank during scroll
- Search input lag

**Prevention:**
- Implement pagination (50 items per page)
- Use search as primary navigation
- Debounce search input (300ms)
- Use React.memo for NetworkPromptCard
- Pre-filter by category before rendering

**Phase:** Phase 8 (Online library UI)

---

### 2.3 Category Mapping Complexity

**Pitfall:** Source categories don't map cleanly to local categories.

**Warning signs:**
- User confusion about category names
- Duplicate categories after mapping
- Lost prompts in unmapped categories

**Prevention:**
- Show source category as badge on network prompt
- Allow user to select target category when collecting
- Don't auto-create categories from source
- Provide "Select category" dropdown in collect dialog

**Phase:** Phase 9 (Collect functionality)

---

## 3. UI Performance Pitfalls

### 3.1 Dropdown Performance with 900+ Items

**Pitfall:** Dropdown becomes unusable with large dataset.

**Warning signs:**
- Opening dropdown takes >500ms
- Scroll lag
- Search input lag
- Browser memory warnings

**Prevention:**
- Category filter as first-level navigation
- Search before showing full list
- Pagination (show 50, load more on scroll)
- Lazy render only visible items

**Phase:** Phase 8 (Online library UI)

---

### 3.2 Search Performance

**Pitfall:** Text search across 900+ prompts is slow.

**Warning signs:**
- Search input typing lag
- Results appear slowly (>200ms)

**Prevention:**
- Debounce search input (300ms delay)
- Pre-index prompts on fetch (array of searchable strings)
- Use simple substring match (no regex)
- Filter by category first, then search

**Phase:** Phase 9 (Search/filter UI)

---

## 4. Offline Handling Pitfalls

### 4.1 No Data on First Use (Offline)

**Pitfall:** User opens "在线库" offline, sees nothing.

**Warning signs:**
- Empty state on offline first visit
- No guidance on what to do

**Prevention:**
- Show clear offline message: "无法连接网络，请稍后重试"
- "Refresh" button disabled when offline
- Detect offline state via `navigator.onLine`

**Phase:** Phase 7 (Network cache)

---

### 4.2 Stale Cache Data

**Pitfall:** Cache never updates, user sees old prompts.

**Warning signs:**
- Cache timestamp > 24h
- User complaints about missing new prompts
- Data freshness unknown

**Prevention:**
- Show cache timestamp in UI ("上次更新: 2026-04-19 10:00")
- Auto-suggest refresh when stale (>24h)
- Allow manual refresh button
- Set reasonable TTL (24h default)

**Phase:** Phase 7 (Network cache)

---

## 5. Rate Limiting Pitfalls

### 5.1 GitHub Raw File Rate Limit

**Pitfall:** GitHub raw files have implicit rate limits.

**Warning signs:**
- 403 responses on repeated fetches
- Slow response times
- Connection timeouts

**Prevention:**
- Don't auto-refresh (user-triggered only)
- Cache aggressively (24h TTL)
- Handle 403 gracefully with "Rate limited, try later" message
- Use raw.githubusercontent.com (higher limits than API)

**Phase:** Phase 6 (Service Worker handlers)

---

## 6. Phase Mapping Summary

| Pitfall | Primary Phase | Prevention Action |
|---------|---------------|-------------------|
| CSP violation | Phase 6 | Service Worker fetch only |
| Service Worker termination | Phase 6 | Error handling, immediate cache |
| Missing permissions | Phase 5 | Add host_permissions |
| Markdown parsing breaks | Phase 5 | Flexible regex, logging |
| Large dataset performance | Phase 8 | Pagination, category filter |
| Category mapping | Phase 9 | User-select on collect |
| Dropdown performance | Phase 8 | Lazy render, pagination |
| Search performance | Phase 9 | Debounce, pre-index |
| No data offline | Phase 7 | Offline message, navigator.onLine |
| Stale cache | Phase 7 | Timestamp display, refresh button |
| Rate limiting | Phase 6 | User-triggered, cache, 403 handling |

---

## Sources

- Chrome Extension CSP documentation
- Service Worker lifecycle patterns
- GitHub rate limit documentation
- Large dataset UI performance research

---
*Pitfalls research for: Network Prompt Data Source Integration*
*Researched: 2026-04-19*