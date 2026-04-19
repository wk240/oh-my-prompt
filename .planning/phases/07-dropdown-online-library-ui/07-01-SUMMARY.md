---
phase: 07-dropdown-online-library-ui
plan: 01
subsystem: content-script-dropdown
tags: [state, sidebar, online-library, ui-toggle]
dependency_graph:
  requires: [05-01, 05-02, 05-03, 06-01, 06-04]  # NetworkPrompt type, GET_NETWORK_CACHE handler
  provides: [isOnlineLibrary state, network data fetch, sidebar toggle]
  affects: [07-02, 07-03, 07-04, 07-05]  # ProviderCategory sidebar, NetworkPromptCard, Modal
tech_stack:
  added: [lucide-react Globe icon]
  patterns: [useState, useEffect, chrome.runtime.sendMessage]
key_files:
  created: []
  modified:
    - src/content/components/DropdownContainer.tsx (+68 lines, -7 lines)
decisions:
  - D-01: "在线库" sidebar entry placed below "全部分类"
  - D-02: GET_NETWORK_CACHE message triggered on first toggle
  - D-03: Clicking local category restores local mode
metrics:
  duration: 238s
  tasks: 4
  files: 1
  completed_date: "2026-04-19"
commits:
  - e9f3d63: feat(07-01): add online library state and sidebar entry
---

# Phase 7 Plan 01: Online Library State & Sidebar Entry Summary

**One-liner:** Added isOnlineLibrary state and "在线库" sidebar entry with GET_NETWORK_CACHE fetch trigger to enable UI mode switching between local and network prompts.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Add isOnlineLibrary state and network data state | Done |
| 2 | Add network data fetch useEffect (GET_NETWORK_CACHE) | Done |
| 3 | Add "在线库" sidebar entry (Globe icon) | Done |
| 4 | Add sidebar mode switching logic | Done |

## Implementation Details

### Task 1: State Variables
Added to DropdownContainer function component:
- `isOnlineLibrary` (boolean) - toggles between local/network modes
- `networkPrompts` (NetworkPrompt[]) - stores fetched network prompts
- `providerCategories` (ProviderCategory[]) - stores provider categories (used in 07-02)
- `cacheMetadata` (object) - stores isFromCache, isExpired, fetchTimestamp (used in 07-02)
- `isNetworkLoading` (boolean) - tracks fetch loading state

### Task 2: Network Data Fetch useEffect
Added useEffect that triggers GET_NETWORK_CACHE when:
- `isOnlineLibrary === true`
- `networkPrompts.length === 0` (first toggle)
- `!isNetworkLoading` (not already fetching)

Response sets all network-related state variables.

### Task 3: Sidebar Entry
Added "在线库" button after "全部分类":
- Globe icon from lucide-react
- onClick sets `isOnlineLibrary(true)`
- selected state when `isOnlineLibrary === true`

### Task 4: Mode Switching Logic
- Modified "全部分类" to restore local mode on click
- Local categories hidden when `isOnlineLibrary === true`
- SortableCategoryItem onSelect restores local mode

## Deviations from Plan

None - plan executed exactly as written.

## Acceptance Criteria Verified

- Sidebar shows "在线库" entry (D-01)
- Clicking "在线库" fetches network data via GET_NETWORK_CACHE (D-02)
- Clicking local category restores local mode (D-03)
- TypeScript compiles with 0 errors
- All state variables properly typed

## Self-Check: PASSED

- [x] DropdownContainer.tsx exists with isOnlineLibrary state
- [x] Commit e9f3d63 exists in git log
- [x] Globe icon imported from lucide-react
- [x] GET_NETWORK_CACHE message in useEffect

## Next Steps

Plan 07-02 will add ProviderCategorySidebar to display provider categories when in online mode.