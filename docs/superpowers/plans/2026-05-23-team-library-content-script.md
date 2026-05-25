# Team Library Content Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team library functionality to content script dropdown, providing browse, sync, inject, save, and copy features.

**Architecture:** Extend DropdownContainer with team library sidebar entry and content view, reuse Zustand teamPrompts state, create TeamPromptCard component for compact display.

**Tech Stack:** React, TypeScript, Zustand, Lucide icons, Chrome Extension APIs

---

## File Structure

**New Files:**
- `packages/extension/src/content/components/TeamPromptCard.tsx` - Team prompt card component

**Modified Files:**
- `packages/extension/src/content/components/DropdownContainer.tsx` - Sidebar entry, content view, handlers
- `packages/extension/src/content/styles/dropdown-styles.ts` - Team library CSS styles

---

## Task 1: Create TeamPromptCard Component

**Files:**
- Create: `packages/extension/src/content/components/TeamPromptCard.tsx`

- [ ] **Step 1: Create TeamPromptCard.tsx with component interface**

```typescript
/**
 * TeamPromptCard - Card component for displaying team library prompts
 * Compact layout similar to NetworkPromptCard, with save/copy/inject actions
 */

import { ArrowUpRight, Bookmark, Copy } from 'lucide-react'
import type { TeamPrompt } from '@oh-my-prompt/shared/types'
import { truncateText } from '@oh-my-prompt/shared/utils'
import { Tooltip } from './Tooltip'

interface TeamPromptCardProps {
  prompt: TeamPrompt
  onClick: () => void        // Preview in modal
  onInject?: () => void      // Insert to input
  onSave?: () => void        // Save to personal library
  onCopy?: () => void        // Copy to clipboard
  language?: 'zh' | 'en'
}

export function TeamPromptCard({
  prompt,
  onClick,
  onInject,
  onSave,
  onCopy,
  language = 'zh'
}: TeamPromptCardProps) {
  const displayName = language === 'en' && prompt.nameEn ? prompt.nameEn : prompt.name
  const displayDescription = language === 'en' && prompt.descriptionEn ? prompt.descriptionEn : prompt.description

  return (
    <div
      className="team-prompt-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        width: 'calc(50% - 6px)',
        padding: '12px',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'background 0.15s, box-shadow 0.15s',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Save button - bottom right */}
      <Tooltip content="保存到个人库">
        <button
          onClick={(e) => { e.stopPropagation(); onSave?.() }}
          aria-label="保存到个人库"
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '72px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '1px solid #E5E5E5',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          <Bookmark style={{ width: 12, height: 12, color: '#8b5cf6' }} />
        </button>
      </Tooltip>

      {/* Copy button */}
      <Tooltip content="复制">
        <button
          onClick={(e) => { e.stopPropagation(); onCopy?.() }}
          aria-label="复制"
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '40px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '1px solid #E5E5E5',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          <Copy style={{ width: 12, height: 12, color: '#171717' }} />
        </button>
      </Tooltip>

      {/* Inject button */}
      <Tooltip content="一键注入">
        <button
          onClick={(e) => { e.stopPropagation(); onInject?.() }}
          aria-label="一键注入"
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '1px solid #E5E5E5',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          <ArrowUpRight style={{ width: 12, height: 12, color: '#171717' }} />
        </button>
      </Tooltip>

      {/* Name */}
      <Tooltip content={displayName}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#171717', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncateText(displayName, 30)}
        </div>
      </Tooltip>

      {/* Description tag */}
      <Tooltip content={displayDescription || prompt.content}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: '#64748B',
            marginTop: '4px',
            padding: '4px 8px',
            background: '#f0f0f0',
            borderRadius: '4px',
            display: 'inline-block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {truncateText(displayDescription || prompt.content, 30)}
        </div>
      </Tooltip>

      {/* Team name source */}
      {prompt.teamName && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: '#8b5cf6',
            marginTop: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          来自: {prompt.teamName}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit TeamPromptCard component**

```bash
git add packages/extension/src/content/components/TeamPromptCard.tsx
git commit -m "feat(content): add TeamPromptCard component for team library display"
```

---

## Task 2: Add CSS Styles for Team Library

**Files:**
- Modify: `packages/extension/src/content/styles/dropdown-styles.ts`

- [ ] **Step 1: Add team library CSS styles to DROPDOWN_STYLES constant**

Append to the `DROPDOWN_STYLES` constant (after the ecommerce styles section):

```css
  /* Team Library Styles */
  #${PORTAL_ID} .team-prompt-card:hover {
    background: #f8f8f8;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }

  #${PORTAL_ID} .team-prompt-card:focus {
    outline: 2px solid #8b5cf6;
    outline-offset: 2px;
  }

  #${PORTAL_ID} .team-library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: #f8fafc;
    border-radius: 6px;
  }

  #${PORTAL_ID} .team-library-count {
    font-size: 12px;
    color: #64748b;
  }

  #${PORTAL_ID} .team-sync-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: #ffffff;
    border: 1px solid #E5E5E5;
    border-radius: 4px;
    font-size: 12px;
    color: #171717;
    cursor: pointer;
    transition: all 0.15s;
  }

  #${PORTAL_ID} .team-sync-btn:hover:not(:disabled) {
    background: #f8f8f8;
  }

  #${PORTAL_ID} .team-sync-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  #${PORTAL_ID} .team-sync-spinner {
    width: 12px;
    height: 12px;
    animation: spin 1s linear infinite;
  }

  #${PORTAL_ID} .team-library-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 16px;
    text-align: center;
  }

  #${PORTAL_ID} .team-library-empty-message {
    font-size: 12px;
    color: #64748B;
  }

  #${PORTAL_ID} .team-library-empty-btn {
    padding: 8px 16px;
    background: #8b5cf6;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s;
  }

  #${PORTAL_ID} .team-library-empty-btn:hover {
    background: #7c3aed;
  }

  #${PORTAL_ID} .team-cards-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
```

- [ ] **Step 2: Commit CSS styles**

```bash
git add packages/extension/src/content/styles/dropdown-styles.ts
git commit -m "style(content): add team library CSS styles for dropdown"
```

---

## Task 3: Add State and Handlers in DropdownContainer

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: Import team types and icons**

Add imports at the top of the file (around line 10-20):

```typescript
import type { TeamPrompt, TeamSyncStatus } from '@oh-my-prompt/shared/types'
import { Users, Loader2 } from 'lucide-react'
import { TeamPromptCard } from './TeamPromptCard'
```

- [ ] **Step 2: Add team state access from Zustand store**

Add after existing store access (around line 270-290):

```typescript
// Team library state
const teamPrompts = usePromptStore((state) => state.teamPrompts)
const teamSyncStatus = usePromptStore((state) => state.teamSyncStatus)
const syncTeamPrompts = usePromptStore((state) => state.syncTeamPrompts)
const loadTeamPrompts = usePromptStore((state) => state.loadTeamPrompts)

// Team syncing state
const [teamSyncing, setTeamSyncing] = useState(false)

// Load team prompts on mount
useEffect(() => {
  if (isOpen) {
    loadTeamPrompts()
  }
}, [isOpen, loadTeamPrompts])
```

- [ ] **Step 3: Add editing state for team prompts**

Extend the EditingStates interface and initial state (around line 500):

```typescript
interface EditingStates {
  resourcePrompt: null | ResourcePrompt
  teamPrompt: null | TeamPrompt  // Add this
  userPrompt: null | Prompt
  category: null | Category
  prompt: null | Prompt
  deletingCategory: null | Category
  deletingPrompt: null | Prompt
}

const [editingStates, setEditingStates] = useState<EditingStates>({
  resourcePrompt: null,
  teamPrompt: null,  // Add this
  userPrompt: null,
  category: null,
  prompt: null,
  deletingCategory: null,
  deletingPrompt: null,
})
```

- [ ] **Step 4: Add team prompt handlers**

Add handlers after existing resource handlers (around line 650):

```typescript
// Handle team prompt injection
const handleInjectTeamPrompt = useCallback((teamPrompt: TeamPrompt) => {
  if (onInjectResource) {
    const promptToInject = resourceLanguage === 'en' && teamPrompt.contentEn
      ? { ...teamPrompt, content: teamPrompt.contentEn, name: teamPrompt.nameEn || teamPrompt.name }
      : teamPrompt
    onInjectResource(promptToInject as ResourcePrompt)
    showToast('已注入提示词')
  }
}, [onInjectResource, resourceLanguage])

// Handle team prompt copy
const handleCopyTeamPrompt = useCallback(async (teamPrompt: TeamPrompt) => {
  const contentToCopy = resourceLanguage === 'en' && teamPrompt.contentEn ? teamPrompt.contentEn : teamPrompt.content
  try {
    await navigator.clipboard.writeText(contentToCopy)
    showToast('已复制到剪贴板')
  } catch {
    showToast('复制失败')
  }
}, [resourceLanguage])

// Handle save team prompt to personal library
const handleSaveTeamPrompt = useCallback((teamPrompt: TeamPrompt) => {
  setEditingItem('teamPrompt', teamPrompt)
  openModal('isTeamCategoryDialog')
}, [setEditingItem, openModal])

// Handle team sync
const handleTeamSync = useCallback(async () => {
  setTeamSyncing(true)
  const result = await syncTeamPrompts()
  setTeamSyncing(false)
  if (result.success) {
    showToast(`已同步 ${result.promptsCount || 0} 条团队提示词`)
  } else {
    showToast(result.error === 'NOT_LOGGED_IN' ? '请先登录' : '同步失败')
  }
}, [syncTeamPrompts])
```

- [ ] **Step 5: Add team prompt confirm handler**

Extend handleConfirmCollect to handle team prompts (around line 660):

```typescript
// Handle collect confirmation - support both resource and team prompts
const handleConfirmCollect = useCallback(async (categoryId: string, newCategoryName?: string) => {
  // Handle team prompt
  if (editingStates.teamPrompt) {
    const teamPrompt = editingStates.teamPrompt

    let targetCategoryId = categoryId

    if (newCategoryName && newCategoryName.trim()) {
      usePromptStore.getState().addCategory(newCategoryName.trim())
      const storeCategories = usePromptStore.getState().categories
      const newCategory = storeCategories.find(c => c.name === newCategoryName.trim())
      if (newCategory) {
        targetCategoryId = newCategory.id
      }
    }

    usePromptStore.getState().addPrompt({
      name: teamPrompt.name,
      nameEn: teamPrompt.nameEn,
      content: teamPrompt.content,
      contentEn: teamPrompt.contentEn,
      categoryId: targetCategoryId,
      description: teamPrompt.description,
      descriptionEn: teamPrompt.descriptionEn,
      order: 0,
    })

    const categoryName = usePromptStore.getState().categories.find(c => c.id === targetCategoryId)?.name || '未知分类'
    showToast(`已保存到 ${categoryName}`)

    closeModal('isTeamCategoryDialog')
    clearEditingItem('teamPrompt')
    return
  }

  // Handle resource prompt (existing code continues...)
  if (!editingStates.resourcePrompt) return
  // ... rest of existing resource prompt handling
}, [editingStates.teamPrompt, editingStates.resourcePrompt])
```

- [ ] **Step 6: Add team category dialog modal state**

Extend modalStates (around line 340):

```typescript
const [modalStates, setModalStates] = useState({
  isPreview: false,
  isCategoryDialog: false,
  isTeamCategoryDialog: false,  // Add this
  isCategoryAdd: false,
  isCategoryEdit: false,
  isCategoryDelete: false,
  isPromptAdd: false,
  isPromptEdit: false,
  isPromptDelete: false,
  isUserPreview: false,  // Add this if missing
  isUpdateGuide: false,
  showLatestTip: false,
  showBackupReminder: false,
  showFirstBackupWarning: false,
})
```

- [ ] **Step 7: Commit state and handlers**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "feat(content): add team library state and handlers to DropdownContainer"
```

---

## Task 4: Add Team Library Sidebar Entry

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: Add team library sidebar entry button**

Find the sidebar section (around line 1360-1385) and add team library entry after 资源库 and before 临时库:

```typescript
{/* "团队库" entry - between 资源库 and 临时库 */}
<button
  className={`sidebar-category-item ${selectedCategoryId === 'team' ? 'selected' : ''}`}
  onClick={() => setSelectedCategoryId('team')}
  aria-label="团队库"
>
  <div className="sidebar-category-icon-wrapper">
    <Users className="sidebar-category-icon" style={{ color: selectedCategoryId === 'team' ? '#8b5cf6' : '#64748B' }} />
  </div>
  <span style={{ color: selectedCategoryId === 'team' ? '#8b5cf6' : undefined }}>团队库</span>
  {teamSyncStatus && (
    <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>
      {teamPrompts.length}
    </span>
  )}
</button>
```

- [ ] **Step 2: Commit sidebar entry**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "feat(content): add team library sidebar entry to dropdown"
```

---

## Task 5: Add Team Library Content View

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: Add team library content view section**

Find the content area (around line 1630-1660) and add team library view after isResourceLibrary check:

```typescript
// Add after isResourceLibrary section (before filteredPrompts.length === 0 check)
: selectedCategoryId === 'team' ? (
  // Team library content view
  !teamSyncStatus ? (
    // Not logged in state
    <div className="team-library-empty">
      <div className="team-library-empty-message">
        团队库需要登录后使用
      </div>
      <button
        className="team-library-empty-btn"
        onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })}
      >
        前往设置登录
      </button>
    </div>
  ) : teamPrompts.length === 0 ? (
    // Empty team library state
    <div className="team-library-empty">
      <div className="team-library-empty-message">
        暂无团队提示词
      </div>
      <button
        className="team-library-empty-btn"
        onClick={handleTeamSync}
        disabled={teamSyncing}
      >
        {teamSyncing ? (
          <>
            <Loader2 className="team-sync-spinner" style={{ width: 12, height: 12 }} />
            同步中...
          </>
        ) : '同步团队库'}
      </button>
    </div>
  ) : (
    // Team prompts grid
    <>
      {/* Team sync header */}
      <div className="team-library-header">
        <span className="team-library-count">共 {teamPrompts.length} 条团队提示词</span>
        <button
          className="team-sync-btn"
          onClick={handleTeamSync}
          disabled={teamSyncing}
        >
          {teamSyncing ? (
            <>
              <Loader2 className="team-sync-spinner" style={{ width: 12, height: 12 }} />
              同步中...
            </>
          ) : '同步'}
        </button>
      </div>
      {/* Team prompts grid */}
      <div className="team-cards-grid">
        {teamPrompts.map((prompt) => (
          <TeamPromptCard
            key={prompt.id}
            prompt={prompt}
            language={resourceLanguage}
            onClick={() => {
              setEditingItem('teamPrompt', prompt)
              openModal('isPreview')
            }}
            onInject={() => handleInjectTeamPrompt(prompt)}
            onSave={() => handleSaveTeamPrompt(prompt)}
            onCopy={() => handleCopyTeamPrompt(prompt)}
          />
        ))}
      </div>
    </>
  )
)
```

- [ ] **Step 2: Update empty state message**

Update the empty state message (around line 1663) to include team:

```typescript
{selectedCategoryId === 'all' 
  ? '暂无提示词，点击下方按钮添加' 
  : selectedCategoryId === 'temporary' 
    ? '暂无临时提示词' 
    : selectedCategoryId === 'team'
      ? '暂无团队提示词'
      : '该分类暂无提示词'}
```

- [ ] **Step 3: Commit content view**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "feat(content): add team library content view with sync and empty states"
```

---

## Task 6: Add Team Category Select Dialog

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: Add team category dialog modal**

Add after existing CategorySelectDialog (around line 1785):

```typescript
{/* Team prompt category select dialog */}
<CategorySelectDialog
  categories={sortableCategories}
  isOpen={modalStates.isTeamCategoryDialog}
  onClose={() => closeModal('isTeamCategoryDialog')}
  onConfirm={handleConfirmCollect}
/>
```

- [ ] **Step 2: Add team prompt preview modal handling**

Update the existing PromptPreviewModal to handle team prompts (find the resource prompt modal section and update the conditional):

```typescript
{/* Prompt preview modal - handles both resource and team prompts */}
{(editingStates.resourcePrompt || editingStates.teamPrompt) && (
  <Suspense fallback={null}>
    <PromptPreviewModal
      prompt={editingStates.resourcePrompt || editingStates.teamPrompt}
      isOpen={modalStates.isPreview}
      onClose={() => {
        closeModal('isPreview')
        clearEditingItem('resourcePrompt')
        clearEditingItem('teamPrompt')
      }}
      onCollect={() => {
        if (editingStates.teamPrompt) {
          openModal('isTeamCategoryDialog')
        } else {
          openModal('isCategoryDialog')
        }
      }}
      onInject={(language) => {
        if (editingStates.teamPrompt) {
          handleInjectTeamPrompt(
            language === 'en' && editingStates.teamPrompt.contentEn
              ? { ...editingStates.teamPrompt, content: editingStates.teamPrompt.contentEn }
              : editingStates.teamPrompt
          )
        } else if (editingStates.resourcePrompt && onInjectResource) {
          // ... existing resource inject code
        }
      }}
      onCopy={() => {
        if (editingStates.teamPrompt) {
          handleCopyTeamPrompt(editingStates.teamPrompt)
        } else if (editingStates.resourcePrompt) {
          handleCopyResourcePrompt(editingStates.resourcePrompt)
        }
      }}
      globalLanguage={resourceLanguage}
    />
  </Suspense>
)}
```

- [ ] **Step 3: Commit category dialog**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "feat(content): add team prompt category select dialog and preview modal handling"
```

---

## Task 7: Hide FAB Button in Team Library

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: Update FAB button condition**

Find the FAB button (around line 1704) and add team library exclusion:

```typescript
{!isResourceLibrary && selectedCategoryId !== 'temporary' && selectedCategoryId !== 'team' && agentViewMode !== 'agent' && (
  <button
    className="fab-add-prompt"
    onClick={() => openModal('isPromptAdd')}
    aria-label="添加提示词"
  >
    <Plus style={{ width: 18, height: 18 }} />
  </button>
)}
```

- [ ] **Step 2: Commit FAB update**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "fix(content): hide FAB add button in team library view"
```

---

## Task 8: Manual Testing

- [ ] **Step 1: Run dev build**

```bash
npm run dev
```

- [ ] **Step 2: Test in browser**

1. Load extension from `packages/extension/dist/`
2. Navigate to a supported platform (e.g., ChatGPT, Claude.ai)
3. Open dropdown by clicking trigger button
4. Verify team library sidebar entry shows with Users icon
5. Click team library entry - verify empty state shows if not logged in
6. Click "前往设置登录" - verify sidepanel opens
7. After login and sync, verify team prompts grid displays
8. Test sync button - verify loading spinner and toast
9. Test inject button - verify prompt inserts into input
10. Test copy button - verify clipboard toast
11. Test save button - verify category dialog opens
12. Test preview by clicking card - verify modal opens

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(content): team library dropdown fixes after testing"
```

---

## Summary

This implementation adds team library to content script dropdown with:
- Sidebar entry with count badge
- Three content states (not logged in, empty, prompts grid)
- Sync button with loading state
- TeamPromptCard component with save/copy/inject actions
- CategorySelectDialog for saving to personal library
- Preview modal integration
- CSS styles for purple theme