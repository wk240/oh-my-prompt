# Content Script 团队共享功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 content script 下拉面板的个人库提示词项中添加"共享到团队"按钮，点击后打开 TeamShareDialog 选择目标团队进行共享。

**Architecture:** 新建 TeamShareDialog 组件和样式文件，使用 Portal 渲染到 document.body，通过 Shadow DOM 样式隔离。修改 DropdownContainer 添加状态管理，修改 SortableDropdownItem 添加 Share2 按钮。

**Tech Stack:** React Portal、Shadow DOM、Zustand store、sharePromptToTeam/getUserTeams API

---

## Task 1: 创建样式文件

**Files:**
- Create: `packages/extension/src/content/styles/team-share-dialog-styles.ts`

- [ ] **Step 1: 创建样式常量文件**

```typescript
/**
 * TeamShareDialog styles for Portal rendering
 * Shadow DOM isolated, matches Sidepanel TeamShareDialog visual design
 */

export const TEAM_SHARE_PORTAL_ID = 'omp-team-share-portal'
export const TEAM_SHARE_STYLE_ID = 'omp-team-share-styles'

export const TEAM_SHARE_DIALOG_STYLES = `
  /* Portal container */
  #${TEAM_SHARE_PORTAL_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Overlay */
  #${TEAM_SHARE_PORTAL_ID} .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }

  /* Content container */
  #${TEAM_SHARE_PORTAL_ID} .dialog-content {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% - 32px);
    max-width: 384px;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Header */
  #${TEAM_SHARE_PORTAL_ID} .dialog-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  #${TEAM_SHARE_PORTAL_ID} .dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: #171717;
    margin: 0;
  }

  #${TEAM_SHARE_PORTAL_ID} .dialog-description {
    font-size: 13px;
    color: #64748B;
    margin: 0;
  }

  /* Team list container */
  #${TEAM_SHARE_PORTAL_ID} .team-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 0;
  }

  /* Team option button */
  #${TEAM_SHARE_PORTAL_ID} .team-option {
    width: 100%;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.15s ease;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-option:hover {
    border-color: #D1D5DB;
    background: #F9FAFB;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-option.selected {
    border-color: #8b5cf6;
    background: #F3E8FF;
  }

  /* Radio indicator */
  #${TEAM_SHARE_PORTAL_ID} .team-radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid #D1D5DB;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-option.selected .team-radio {
    border-color: #8b5cf6;
    background: #8b5cf6;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-radio-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ffffff;
  }

  /* Team name */
  #${TEAM_SHARE_PORTAL_ID} .team-name {
    font-size: 14px;
    font-weight: 500;
    color: #171717;
    flex: 1;
  }

  /* Empty state */
  #${TEAM_SHARE_PORTAL_ID} .empty-state {
    padding: 24px;
    text-align: center;
    color: #64748B;
    font-size: 13px;
  }

  /* Loading state */
  #${TEAM_SHARE_PORTAL_ID} .loading-state {
    padding: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #${TEAM_SHARE_PORTAL_ID} .loading-spinner {
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    color: #8b5cf6;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Footer */
  #${TEAM_SHARE_PORTAL_ID} .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
  }

  /* Buttons */
  #${TEAM_SHARE_PORTAL_ID} .button {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-outline {
    background: #ffffff;
    border: 1px solid #E5E5E5;
    color: #374151;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-outline:hover {
    background: #F9FAFB;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-primary {
    background: #171717;
    color: #ffffff;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-primary:hover {
    background: #262626;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-primary:disabled {
    background: #9CA3AF;
    cursor: not-allowed;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-loading {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  #${TEAM_SHARE_PORTAL_ID} .button-spinner {
    width: 14px;
    height: 14px;
    animation: spin 1s linear infinite;
  }
`

---

## Task 2: 创建 TeamShareDialog 组件

**Files:**
- Create: `packages/extension/src/content/components/TeamShareDialog.tsx`

- [ ] **Step 1: 创建 TeamShareDialog 组件文件**

```typescript
/**
 * TeamShareDialog - Team sharing dialog for content script
 * Portal-rendered with Shadow DOM style isolation
 * Matches Sidepanel TeamShareDialog visual design
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { Prompt, TeamInfo } from '@oh-my-prompt/shared/types'
import { usePromptStore } from '@/lib/store'
import { sharePromptToTeam, syncTeamPrompts } from '@/lib/team-sync'
import { showToast } from './ToastNotification'
import { TEAM_SHARE_PORTAL_ID, TEAM_SHARE_STYLE_ID, TEAM_SHARE_DIALOG_STYLES } from '../styles/team-share-dialog-styles'

interface TeamShareDialogProps {
  prompt: Prompt
  isOpen: boolean
  onClose: () => void
}

export function TeamShareDialog({
  prompt,
  isOpen,
  onClose
}: TeamShareDialogProps) {
  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const getUserTeams = usePromptStore((state) => state.getUserTeams)
  const loadTeamPrompts = usePromptStore((state) => state.loadTeamPrompts)

  // Reset state and fetch teams when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTeamId(null)
      setLoading(true)
      getUserTeams().then((result) => {
        setLoading(false)
        if (result.success && result.teams) {
          setTeams(result.teams)
        } else {
          showToast(result.error === 'NOT_LOGGED_IN' ? '请先登录' : '获取团队列表失败')
        }
      })
    }
  }, [isOpen, getUserTeams])

  // Handle share
  const handleShare = useCallback(async () => {
    if (!selectedTeamId) return

    setSharing(true)
    const result = await sharePromptToTeam(prompt, selectedTeamId)

    if (result.success) {
      await syncTeamPrompts()
      await loadTeamPrompts()
      setSharing(false)

      const team = teams.find(t => t.id === selectedTeamId)
      showToast(`已共享到 ${team?.name || '团队'}`)
      onClose()
    } else {
      setSharing(false)
      const errorMessage = result.error === 'NOT_LOGGED_IN' 
        ? '请先登录' 
        : result.error === 'NOT_TEAM_MEMBER' 
          ? '您不是该团队成员' 
          : result.error === 'ALREADY_SHARED' 
            ? '该提示词已存在于团队库' 
            : result.error === 'TEAM_NOT_FOUND' 
              ? '团队不存在' 
              : '共享失败'
      showToast(errorMessage)
    }
  }, [selectedTeamId, prompt, teams, loadTeamPrompts, onClose])

  // Handle overlay click
  const handleOverlayClick = useCallback(() => {
    if (!sharing) onClose()
  }, [sharing, onClose])

  // Get or create portal container
  const getPortalContainer = useCallback(() => {
    let container = document.getElementById(TEAM_SHARE_PORTAL_ID)
    if (!container) {
      container = document.createElement('div')
      container.id = TEAM_SHARE_PORTAL_ID
      
      const style = document.createElement('style')
      style.id = TEAM_SHARE_STYLE_ID
      style.textContent = TEAM_SHARE_DIALOG_STYLES
      container.appendChild(style)
      
      document.body.appendChild(container)
    }
    return container
  }, [])

  if (!isOpen) return null

  return createPortal(
    <>
      <div className="dialog-overlay" onClick={handleOverlayClick} />
      <div className="dialog-content">
        <div className="dialog-header">
          <h2 className="dialog-title">选择目标团队</h2>
          <p className="dialog-description">将「{prompt.name}」共享到团队库，团队成员可查看和使用</p>
        </div>
        {loading ? (
          <div className="loading-state">
            <Loader2 className="loading-spinner" />
          </div>
        ) : teams.length === 0 ? (
          <div className="empty-state">您还未加入任何团队，请先创建或加入团队</div>
        ) : (
          <div className="team-list">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`team-option ${selectedTeamId === team.id ? 'selected' : ''}`}
              >
                <div className="team-radio">
                  {selectedTeamId === team.id && <div className="team-radio-dot" />}
                </div>
                <span className="team-name">{team.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="dialog-footer">
          <button className="button button-outline" onClick={onClose} disabled={sharing}>
            取消
          </button>
          <button 
            className="button button-primary" 
            onClick={handleShare}
            disabled={!selectedTeamId || sharing || teams.length === 0}
          >
            {sharing ? (
              <span className="button-loading">
                <Loader2 className="button-spinner" />
                共享中...
              </span>
            ) : '确认共享'}
          </button>
        </div>
      </div>
    </>,
    getPortalContainer()
  )
}
```

- [ ] **Step 2: 提交 Task 1 和 Task 2**

```bash
git add packages/extension/src/content/styles/team-share-dialog-styles.ts packages/extension/src/content/components/TeamShareDialog.tsx
git commit -m "feat(content): add TeamShareDialog component with Shadow DOM styles"
```

---

## Task 3: 修改 DropdownContainer 添加状态和 handlers

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: 添加 Share2 图标导入**

在文件顶部 import 区域，找到 `import { ... } from 'lucide-react'` 行，添加 Share2：

```typescript
// 第 14 行，修改 lucide-react 导入
import { Sparkles, Palette, Shapes, ArrowUpRight, FolderOpen, Layers, Sparkle, Brush, GripVertical, Database, ArrowLeft, Sun, Frame, Paintbrush, Image, ArrowUpCircle, Plus, Pencil, Trash2, ExternalLink, AlertTriangle, Settings, Clock, Copy, Users, Loader2, Share2 } from 'lucide-react'
```

- [ ] **Step 2: 导入 TeamShareDialog**

在 lazy load imports 区域后添加 TeamShareDialog 导入：

```typescript
// 第 39 行附近，在 import { PromptThumbnail } from './PromptThumbnail' 后添加
import { TeamShareDialog } from './TeamShareDialog'
```

- [ ] **Step 3: 添加 ModalStates 类型**

找到 `interface ModalStates` (约第 475 行)，添加 `isTeamShare`：

```typescript
interface ModalStates {
  isPreview: boolean           // Resource prompt preview modal
  isUserPreview: boolean       // User prompt preview modal (thumbnail click)
  isCategoryDialog: boolean    // Category select dialog
  isTeamCategoryDialog: boolean  // Team prompt category select dialog
  isTeamShare: boolean         // NEW: Team share dialog for personal prompts
  isCategoryAdd: boolean       // Category add modal
  isCategoryEdit: boolean      // Category edit modal
  isCategoryDelete: boolean    // Category delete modal
  isPromptAdd: boolean         // Prompt add modal
  isPromptEdit: boolean        // Prompt edit modal
  isPromptDelete: boolean      // Prompt delete modal
  isUpdateGuide: boolean       // Update guide modal
  showLatestTip: boolean       // "Already latest" tip
  showBackupReminder: boolean  // Backup reminder banner
  showFirstBackupWarning: boolean // First-time backup warning banner
}
```

- [ ] **Step 4: 添加 ModalStates 初始值**

找到 `useState<ModalStates>` 调用 (约第 492 行)，添加 `isTeamShare: false`：

```typescript
const [modalStates, setModalStates] = useState<ModalStates>({
  isPreview: false,
  isUserPreview: false,
  isCategoryDialog: false,
  isTeamCategoryDialog: false,
  isTeamShare: false,  // NEW
  isCategoryAdd: false,
  isCategoryEdit: false,
  isCategoryDelete: false,
  isPromptAdd: false,
  isPromptEdit: false,
  isPromptDelete: false,
  isUpdateGuide: false,
  showLatestTip: false,
  showBackupReminder: false,
  showFirstBackupWarning: false,
})
```

- [ ] **Step 5: 添加 EditingStates 类型**

找到 `interface EditingStates` (约第 516 行)，添加 `sharingPrompt`：

```typescript
interface EditingStates {
  resourcePrompt: ResourcePrompt | null  // Resource prompt for preview/collect
  teamPrompt: TeamPrompt | null          // Team prompt for save to personal library
  userPrompt: Prompt | null              // User prompt for preview
  sharingPrompt: Prompt | null           // NEW: Prompt being shared to team
  category: Category | null              // Category being edited
  prompt: Prompt | null                  // Prompt being edited
  deletingCategory: Category | null      // Category being deleted
  deletingPrompt: Prompt | null          // Prompt being deleted
}
```

- [ ] **Step 6: 添加 EditingStates 初始值**

找到 `useState<EditingStates>` 调用 (约第 526 行)，添加 `sharingPrompt: null`：

```typescript
const [editingStates, setEditingStates] = useState<EditingStates>({
  resourcePrompt: null,
  teamPrompt: null,
  userPrompt: null,
  sharingPrompt: null,  // NEW
  category: null,
  prompt: null,
  deletingCategory: null,
  deletingPrompt: null,
})
```

- [ ] **Step 7: 添加 handleShareToTeam handler**

在现有 handlers 区域 (约第 1200 行 handleCopyPrompt 附近) 添加：

```typescript
// Handle share prompt to team
const handleShareToTeam = useCallback((prompt: Prompt) => {
  if (!authState || authState.status !== 'logged_in') {
    showToast('请先登录后共享')
    return
  }
  setEditingItem('sharingPrompt', prompt)
  openModal('isTeamShare')
}, [authState, setEditingItem, openModal])
```

- [ ] **Step 8: 在 SortableDropdownItem 调用处添加 onShare prop**

找到 `<SortableDropdownItem` 调用 (约第 1870 行)，添加 onShare prop：

```typescript
<SortableDropdownItem
  key={prompt.id}
  prompt={prompt}
  isLast={index === filteredPrompts.length - 1}
  isSelected={selectedPromptId === prompt.id}
  onSelect={onSelect}
  showDragHandle={showDragHandles}
  onThumbnailClick={(p) => {
    setEditingItem('userPrompt', p)
    openModal('isUserPreview')
  }}
  onEdit={(p) => {
    const originalPrompt = localPrompts.find(lp => lp.id === p.id) || p
    setEditingItem('prompt', originalPrompt)
    openModal('isPromptEdit')
  }}
  onDelete={(p) => {
    setEditingItem('deletingPrompt', p)
    openModal('isPromptDelete')
  }}
  onCopy={handleCopyPrompt}
  onShare={handleShareToTeam}  // NEW
/>
```

- [ ] **Step 9: 在 Dialog 区域渲染 TeamShareDialog**

在文件末尾 Dialog modals 区域 (约第 2050 行附近，在 `<DeleteConfirmModal` 后) 添加：

```typescript
{/* Team share dialog */}
{editingStates.sharingPrompt && (
  <TeamShareDialog
    prompt={editingStates.sharingPrompt}
    isOpen={modalStates.isTeamShare}
    onClose={() => {
      closeModal('isTeamShare')
      clearEditingItem('sharingPrompt')
    }}
  />
)}
```

- [ ] **Step 10: 提交 Task 3**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "feat(content): add team share state and handlers to DropdownContainer"
```

---

## Task 4: 修改 SortableDropdownItem 添加 Share2 按钮

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx` (SortableDropdownItem 函数)

- [ ] **Step 1: 添加 onShare prop 到 SortableDropdownItem**

找到 `function SortableDropdownItem` (约第 210 行)，添加 onShare prop：

```typescript
function SortableDropdownItem({
  prompt,
  isLast,
  isSelected,
  onSelect,
  showDragHandle,
  onEdit,
  onDelete,
  onCopy,
  onThumbnailClick,
  onShare,  // NEW
}: {
  prompt: Prompt
  isLast: boolean
  isSelected: boolean
  onSelect: (prompt: Prompt) => void
  showDragHandle: boolean
  onEdit: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  onCopy: (prompt: Prompt) => void
  onThumbnailClick?: (prompt: Prompt) => void
  onShare?: (prompt: Prompt) => void  // NEW
}) {
```

- [ ] **Step 2: 在 prompt-action-buttons 区域添加 Share2 按钮**

找到 `<div className="prompt-action-buttons">` (约第 292 行)，在 Copy 按钮前添加 Share2 按钮：

```typescript
{/* Edit/Delete buttons */}
<div className="prompt-action-buttons">
  <button
    className="prompt-action-btn share"
    onClick={(e) => {
      e.stopPropagation()
      onShare?.(prompt)
    }}
    aria-label="共享到团队"
    title="共享到团队"
  >
    <Share2 style={{ width: 14, height: 14 }} />
  </button>
  <button
    className="prompt-action-btn"
    onClick={(e) => {
      e.stopPropagation()
      onCopy(prompt)
    }}
    aria-label="复制提示词"
  >
    <Copy style={{ width: 14, height: 14 }} />
  </button>
  <button
    className="prompt-action-btn"
    onClick={(e) => {
      e.stopPropagation()
      onEdit(prompt)
    }}
    aria-label="编辑提示词"
  >
    <Pencil style={{ width: 14, height: 14 }} />
  </button>
  <button
    className="prompt-action-btn delete"
    onClick={(e) => {
      e.stopPropagation()
      onDelete(prompt)
    }}
    aria-label="删除提示词"
  >
    <Trash2 style={{ width: 14, height: 14 }} />
  </button>
</div>
```

- [ ] **Step 3: 在 dropdown-styles.ts 添加 share 按钮样式**

找到 `packages/extension/src/content/styles/dropdown-styles.ts`，在 `.prompt-action-btn.delete` 样式后添加：

```typescript
#${PORTAL_ID} .prompt-action-btn.share:hover {
  color: #8b5cf6;
}
```

- [ ] **Step 4: 提交 Task 4**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx packages/extension/src/content/styles/dropdown-styles.ts
git commit -m "feat(content): add Share2 button to SortableDropdownItem with purple hover"
```

---

## Task 5: 测试与验证

**Files:**
- 无新增，验证功能

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
cd packages/extension && npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 2: 运行 dev 构建**

```bash
npm run dev
```

Expected: 构建成功，无编译错误

- [ ] **Step 3: 手动测试**

在 Chrome 中加载 extension：
1. 打开任意平台页面（如 Lovart）
2. 打开下拉面板，查看个人提示词项
3. 验证 Share2 按钮显示在操作按钮区域（Copy 按钮前）
4. 验证 hover 时按钮变为紫色
5. 点击 Share2 按钮
6. 未登录状态：验证 toast 显示「请先登录后共享」
7. 登录状态：验证 TeamShareDialog 打开
8. 选择团队，点击「确认共享」
9. 验证成功 toast 显示「已共享到 {团队名}」
10. 验证团队库数量徽章更新

- [ ] **Step 4: 最终提交**

```bash
git add docs/superpowers/plans/2026-05-24-content-script-team-share.md
git commit -m "docs: add content script team share implementation plan"
```