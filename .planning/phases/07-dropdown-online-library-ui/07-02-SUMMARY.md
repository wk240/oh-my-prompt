---
phase: 07-dropdown-online-library-ui
plan: 02
subsystem: content-script-dropdown
tags: [network-prompt-card, grid-layout, thumbnail, hover-effect, accessibility]
dependency_graph:
  requires: [07-01]  # isOnlineLibrary state, networkPrompts data
  provides: [NetworkPromptCard, network-prompt-cards-grid CSS, paginatedNetworkPrompts]
  affects: [07-03, 07-04, 07-05]  # ProviderCategorySidebar uses setSelectedProviderCategoryId, LoadMoreButton uses setLoadedCount, Modal uses card onClick
tech_stack:
  added: []
  patterns: [inline styles, keyboard accessibility, fallback image, pagination useMemo]
key_files:
  created:
    - src/content/components/NetworkPromptCard.tsx (79 lines)
  modified:
    - src/content/components/DropdownContainer.tsx (+63 lines: import, state, pagination logic, grid rendering)
decisions:
  - D-04: "NetworkPromptCard displays thumbnail, name, and category tag"
  - D-05: "Hover effect changes background and shadow"
  - D-06: "Fallback SVG placeholder on image load error"
  - D-11: "50 prompts per page pagination"
  - D-15: "ProviderCategory filter via selectedProviderCategoryId"
metrics:
  duration: 166s
  tasks: 3
  files: 2
  completed_date: "2026-04-19"
commits:
  - 645913d: feat(07-02): create NetworkPromptCard component
  - 117725c: feat(07-02): add grid CSS styles for network prompt cards
  - f777ddf: feat(07-02): integrate NetworkPromptCard grid in dropdown-content
---

# Phase 7 Plan 02: NetworkPromptCard Component Summary

**One-liner:** Created NetworkPromptCard component with thumbnail, name truncation, category tag, fallback image, and integrated 2-column grid layout in dropdown-content for network prompts display.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Create NetworkPromptCard component file | Done |
| 2 | Add grid CSS styles to getDropdownStyles | Done |
| 3 | Integrate NetworkPromptCard grid in dropdown-content | Done |

## Implementation Details

### Task 1: NetworkPromptCard Component
Created `src/content/components/NetworkPromptCard.tsx`:
- Thumbnail display with `previewImage` (80px height, 100% width, object-fit: cover)
- Name truncation to 30 chars using `truncateText` from shared/utils
- Category tag displaying `sourceCategory` with proper styling
- Fallback SVG placeholder (`FALLBACK_IMAGE_SVG`) on image load error (D-06)
- Keyboard accessibility: Enter/Space keys trigger onClick
- Inline styles for 2-column width (`calc(50% - 6px)`)

### Task 2: Grid CSS Styles
Extended `getDropdownStyles()` function:
- `.network-prompt-cards-grid`: flex layout with 12px gap, flex-wrap
- `.network-prompt-card:hover`: background #f8f8f8, enhanced shadow
- `.network-prompt-card:focus`: outline 2px solid #A16207 for accessibility

### Task 3: Dropdown Integration
Modified `DropdownContainer.tsx`:
- Imported `NetworkPromptCard` component
- Added state: `selectedProviderCategoryId` (default 'all'), `loadedCount` (default 50)
- Added `filteredNetworkPrompts` and `paginatedNetworkPrompts` useMemo
- Conditional rendering in `dropdown-content`:
  - `isOnlineLibrary === true`: shows network card grid or loading/empty states
  - `isOnlineLibrary === false`: shows local prompts list (existing behavior)
- Empty state messages: "加载网络数据...", "无法加载网络数据，请检查网络连接"

## Deviations from Plan

None - plan executed exactly as written.

## Acceptance Criteria Verified

- NetworkPromptCard component exists with thumbnail, name, tag (D-04)
- Cards display in 2-column grid layout (verified via CSS)
- Hover effect changes background and shadow (D-05)
- Fallback placeholder on image load error (D-06)
- TypeScript compiles with 0 errors
- Keyboard accessibility (Enter/Space keys)

## Self-Check: PASSED

- [x] src/content/components/NetworkPromptCard.tsx exists (79 lines)
- [x] Commit 645913d exists in git log
- [x] Commit 117725c exists in git log
- [x] Commit f777ddf exists in git log
- [x] DropdownContainer.tsx contains `network-prompt-cards-grid` class
- [x] DropdownContainer.tsx imports NetworkPromptCard
- [x] paginatedNetworkPrompts variable exists

## Next Steps

Plan 07-03 will add ProviderCategorySidebar to display provider categories when in online mode, using `setSelectedProviderCategoryId` for category selection.