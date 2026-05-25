# Team Library in Content Script - Design Document

**Date:** 2026-05-23
**Status:** Draft
**Scope:** Content Script Dropdown

---

## Overview

Add team library functionality to content script dropdown, providing the same features as sidepanel implementation:

- Browse team prompts from sidebar entry
- Sync team prompts from cloud
- Inject team prompts into input field
- Save team prompts to personal library
- Copy team prompts to clipboard

---

## Architecture

### Integration Points

**Sidebar Entry (`DropdownContainer.tsx`):**
- Add "团队库" button after "临时库" entry (same order as sidepanel)
- Icon: `Users` from lucide-react
- Show count badge when `teamSyncStatus` exists
- Selected state: `selectedCategoryId === 'team'`

**Content View (`DropdownContainer.tsx`):**
- New content section for `selectedCategoryId === 'team'`
- Three states: Not logged in, Empty team library, Team prompts grid
- Sync button header with count display

**State Management:**
- Reuse existing Zustand store state: `teamPrompts`, `teamSyncStatus`
- Reuse existing actions: `syncTeamPrompts()`, `loadTeamPrompts()`
- No new state needed - all shared with sidepanel

**Communication:**
- Sync via `syncTeamPrompts()` action (calls `/api/teams/prompts`)
- Inject via existing `inserter.insert()` pattern
- Save to personal via `CategorySelectDialog` (reuse existing)

---

## Components

### New Component: TeamPromptCard

A simplified version of `SidePanelTeamCard` for dropdown context.

```typescript
interface TeamPromptCardProps {
  prompt: TeamPrompt
  onClick: () => void        // Preview in modal
  onInject: () => void       // Insert to input
  onSave: () => void         // Save to personal library
  onCopy: () => void         // Copy to clipboard
}
```

**Features:**
- Compact layout (similar to `NetworkPromptCard`)
- Action buttons: Bookmark (save), Copy, Inject
- Truncated name and description display
- No hover preview (dropdown context - keep it simple)

### Modified Components

**DropdownContainer.tsx:**
- Add sidebar entry button for "团队库"
- Add team library content view section
- Handle `selectedCategoryId === 'team'` filtering
- Add sync button and count header

**DropdownApp.tsx:**
- No changes needed (state already includes teamPrompts)

### Reused Components

- `CategorySelectDialog`: For saving team prompt to personal library
- `PromptPreviewModal`: For previewing team prompt (optional)
- `ToastNotification`: For success/error messages

---

## Data Flow

### Team Prompts Loading

```
DropdownContainer mount
    → usePromptStore.loadTeamPrompts()
    → chrome.storage.local.get('teamPrompts')
    → Zustand state update: teamPrompts
    → DropdownContainer re-render (reactive)
```

### Sync Flow

```
User clicks "同步" button
    → usePromptStore.syncTeamPrompts()
    → team-sync.ts → fetch('/api/teams/prompts')
    → chrome.storage.local.set({ teamPrompts, teamSyncStatus })
    → Zustand state update
    → DropdownContainer re-render with new team prompts
```

### Inject Flow

```
User clicks Inject button on team prompt card
    → DropdownContainer.handleInjectTeamPrompt()
    → inserter.insert(inputElement, teamPrompt.content)
    → Dropdown closes, prompt inserted
    → Toast: "已注入提示词"
```

### Save to Personal Flow

```
User clicks Bookmark icon
    → Open CategorySelectDialog
    → User selects category
    → handleConfirmCollect(teamPrompt)
    → usePromptStore.saveTeamPromptToPersonal()
    → Prompt saved to personal library
    → Toast: "已保存到 [分类名]"
```

---

## UI Layout

### Sidebar Entry

```
┌─────────────────────┐
│ Agent               │
│ 资源库              │
│ 团队库        (3)   │ ← Users icon + count badge
│ 临时库              │
│ 全部分类            │
│ ...categories...    │
└─────────────────────┘
```

### Team Library Content View

```
┌─────────────────────────────────┐
│ 共 3 条团队提示词     [同步按钮] │ ← Header with sync
├─────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐     │
│  │ 提示词1 │  │ 提示词2 │  │ 提示词3 │     │
│  │ 描述... │  │ 描述... │  │ 描述... │     │
│  │ [保存][复制][注入] │     │ ← Action buttons
│  └─────┘  └─────┘  └─────┘     │
│                                 │
│  (grid layout, 2-3 columns)    │
└─────────────────────────────────┘
```

### Empty State (Not logged in)

```
┌─────────────────────────────────┐
│                                 │
│    团队库需要登录后使用         │
│                                 │
│    [前往设置登录]               │ ← Button → Opens settings
│                                 │
└─────────────────────────────────┘
```

### Empty State (Logged in, no prompts)

```
┌─────────────────────────────────┐
│                                 │
│    暂无团队提示词               │
│                                 │
│    [同步团队库]                 │ ← Sync button
│                                 │
└─────────────────────────────────┘
```

### Styling

- Reuse existing `NetworkPromptCard` styles (`.network-card`)
- Purple theme for team library (same as sidepanel: `#8b5cf6`)
- Sync button with loading spinner animation
- No drag-and-drop (team prompts ordered by server)

---

## Error Handling

### Authentication Check

```typescript
// Check if teamSyncStatus exists (indicates user has synced before)
if (!teamSyncStatus) {
  // Show "需要登录后使用" state
  // Button: "前往设置登录" → Opens settings
}
```

### Sync Errors

| Error | Handling |
|-------|----------|
| `NOT_LOGGED_IN` | Toast: "请先登录" + Button to settings |
| `NETWORK_ERROR` | Toast: "网络错误，请稍后重试" |
| `SYNC_FAILED` | Toast: "同步失败" |

### Injection Fallback

```typescript
// If inject fails (input lost)
try {
  inserter.insert(inputElement, teamPrompt.content)
} catch {
  // Fallback: Copy to clipboard
  await navigator.clipboard.writeText(teamPrompt.content)
  showToast('已复制到剪贴板')
}
```

---

## Implementation Checklist

1. Add `teamPrompts` and `teamSyncStatus` state access in DropdownContainer
2. Add sidebar entry button for "团队库" with Users icon
3. Create `TeamPromptCard` component (compact version of SidePanelTeamCard)
4. Add team library content view section (three states)
5. Add sync button header with loading state
6. Implement `handleInjectTeamPrompt` handler
7. Implement `handleSaveTeamPrompt` handler (reuse CategorySelectDialog)
8. Add CSS styles for team library (`.team-card`, `.team-sync-btn`)
9. Add error handling for sync and inject operations

---

## Testing Checklist

1. Sidebar entry displays correctly with count badge
2. "需要登录后使用" state shown when not logged in
3. Sync button triggers team prompts fetch
4. Team prompts grid displays correctly
5. Inject button inserts prompt into input field
6. Copy button copies prompt to clipboard
7. Save button opens CategorySelectDialog and saves correctly
8. Toast messages show for all operations
9. Error states handled gracefully