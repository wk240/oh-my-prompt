---
phase: 07-dropdown-online-library-ui
plan: 03
subsystem: content-script-dropdown
tags: [provider-category-item, cache-status-header, sidebar-integration, pagination-reset]
dependency_graph:
  requires: [07-01]  # isOnlineLibrary state, networkPrompts, providerCategories, cacheMetadata
  provides: [ProviderCategoryItem, CacheStatusHeader, sortProviderCategoriesByOrder]
  affects: [07-04, 07-05]  # LoadMoreButton uses setLoadedCount, Modal uses card onClick
tech_stack:
  added: []
  patterns: [inline styles, keyboard accessibility, Globe/AlertCircle/WifiOff icons]
key_files:
  created:
    - src/content/components/ProviderCategoryItem.tsx (51 lines)
    - src/content/components/CacheStatusHeader.tsx (60 lines)
  modified:
    - src/content/components/DropdownContainer.tsx (+109 lines: import, ProviderCategory sidebar, CacheStatusHeader, pagination reset)
    - src/shared/utils.ts (+9 lines: sortProviderCategoriesByOrder)
decisions:
  - D-13: "ProviderCategory sidebar replaces local categories when isOnlineLibrary=true"
  - D-14: "Category name + count format: {name} · {count}条"
  - D-15: "Clicking ProviderCategory sets selectedProviderCategoryId and filters prompts"
  - D-16: "CacheStatusHeader shows timestamp formatted as zh-CN locale"
  - D-17: "isExpired shows AlertCircle icon + warning text"
  - D-18: "isFromCache && !isExpired shows WifiOff + offline mode indicator"
metrics:
  duration: 266s
  tasks: 4
  files: 4
  completed_date: "2026-04-19"
commits:
  - a850538: feat(07-03): create ProviderCategoryItem component
  - bab61d4: feat(07-03): create CacheStatusHeader component
  - e67ace8: feat(07-03): integrate ProviderCategory sidebar in online mode
  - a061ad9: feat(07-03): integrate CacheStatusHeader and pagination reset
---

# Phase 7 Plan 03: ProviderCategoryItem Sidebar and CacheStatusHeader Summary

**One-liner:** Created ProviderCategoryItem sidebar component with Globe icon and count display, CacheStatusHeader with timestamp, expired warning and offline indicator, integrated both into DropdownContainer for online library navigation and cache status visualization.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Create ProviderCategoryItem component | Done |
| 2 | Create CacheStatusHeader component | Done |
| 3 | Integrate ProviderCategory sidebar | Done |
| 4 | Integrate CacheStatusHeader and pagination reset | Done |

## Implementation Details

### Task 1: ProviderCategoryItem Component
Created `src/content/components/ProviderCategoryItem.tsx`:
- Globe icon for online category visual indicator
- Name + count format: `{name} · {count}条` (D-14)
- Selected state: background #ffffff, borderLeft 2px solid #A16207
- Keyboard accessibility: Enter/Space keys trigger onSelect

### Task 2: CacheStatusHeader Component
Created `src/content/components/CacheStatusHeader.tsx`:
- Timestamp formatted as zh-CN locale string (D-16)
- `isExpired` shows AlertCircle icon + "数据已过期，建议稍后刷新" text (D-17)
- `isFromCache && !isExpired` shows WifiOff icon + "离线模式" indicator (D-18)
- Returns null when fetchTimestamp undefined

### Task 3: ProviderCategory Sidebar Integration
Modified `DropdownContainer.tsx`:
- Added `sortProviderCategoriesByOrder` utility to `src/shared/utils.ts`
- Sidebar conditionally renders ProviderCategory items when `isOnlineLibrary=true`
- "全部" entry shows total networkPrompts.length count
- ProviderCategory items sorted by order field using new utility

### Task 4: CacheStatusHeader and Pagination Reset
Modified `DropdownContainer.tsx`:
- CacheStatusHeader renders above dropdown-header when `isOnlineLibrary && !isNetworkLoading`
- Added useEffect to reset loadedCount to 50 on selectedProviderCategoryId change
- Removed @ts-expect-error directives (all state variables now in use)

## Deviations from Plan

None - plan executed exactly as written.

## Acceptance Criteria Verified

- ProviderCategoryItem component exists with Globe icon, name, count (D-13, D-14)
- Selected state shows borderLeft accent color
- Keyboard accessibility implemented (Enter/Space)
- CacheStatusHeader shows timestamp (D-16)
- Expired warning shows AlertCircle icon (D-17)
- Offline indicator shows WifiOff icon (D-18)
- ProviderCategory sidebar replaces local categories in online mode
- Pagination resets on ProviderCategory change
- TypeScript compiles with 0 errors

## Self-Check: PASSED

- [x] src/content/components/ProviderCategoryItem.tsx exists (51 lines)
- [x] src/content/components/CacheStatusHeader.tsx exists (60 lines)
- [x] Commit a850538 exists in git log
- [x] Commit bab61d4 exists in git log
- [x] Commit e67ace8 exists in git log
- [x] Commit a061ad9 exists in git log
- [x] DropdownContainer.tsx contains ProviderCategoryItem import
- [x] DropdownContainer.tsx contains CacheStatusHeader import
- [x] DropdownContainer.tsx contains pagination reset useEffect
- [x] utils.ts contains sortProviderCategoriesByOrder function

## Next Steps

Plan 07-04 will add LoadMoreButton component for pagination and "已加载 X/Y 条" count indicator.