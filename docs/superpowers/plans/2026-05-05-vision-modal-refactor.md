# VisionModal 左右布局重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 VisionModal 和 BatchProgressPanel 合并为统一的左右布局弹窗，左侧展示任务列表，右侧展示详细内容。

**Architecture:** VisionModal 订阅 useTaskQueueStore 获取任务列表，内部管理 selectedTaskId 状态用于切换右侧内容。删除 BatchProgressPanel 和 BatchPanelManager，统一入口为 VisionModalManager。

**Tech Stack:** React, Zustand, Shadow DOM, TypeScript

---

## File Structure

### 删除的文件
- `src/content/batch-panel-manager.tsx` — 删除，功能合并到 VisionModalManager
- `src/content/components/BatchProgressPanel.tsx` — 删除，功能合并到 VisionModal
- `src/content/components/TaskCard.tsx` — 删除，左侧列表项使用简化组件

### 修改的文件
- `src/content/vision-modal-manager.tsx` — 重构，订阅 store 而非传入 imageUrl
- `src/content/components/VisionModal.tsx` — 重构为左右布局
- `src/content/core/task-queue-store.ts` — 简化，移除 isPanelOpen
- `src/content/core/task-queue-manager.ts` — 移除 setPanelOpen 调用
- `src/content/image-hover-button-manager.tsx` — 改为调用 VisionModalManager
- `src/content/vision-only-script.ts` — 更新调用方式

### 新增的文件
- `src/content/components/TaskListItem.tsx` — 左侧列表项组件

---

### Task 1: 简化 task-queue-store.ts

**Files:**
- Modify: `src/content/core/task-queue-store.ts`

- [ ] **Step 1: 移除 isPanelOpen 和 setPanelOpen**

修改文件，移除以下内容：

```typescript
// 删除这些行：
isPanelOpen: boolean
setPanelOpen: (open: boolean) => void

// 删除初始值：
isPanelOpen: false,

// 删除 action：
setPanelOpen: (open) => set({ isPanelOpen: open }),
```

修改后的文件内容：

```typescript
/**
 * TaskQueueStore - Zustand store for queue state
 * Provides reactive state for React components
 */

import { create } from 'zustand'
import type { QueueTask, QueueStats } from './task-queue-manager'

interface TaskQueueState {
  tasks: QueueTask[]

  // Actions
  setTasks: (tasks: QueueTask[]) => void
  updateTask: (taskId: string, updates: Partial<QueueTask>) => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
  clearAll: () => void

  // Computed
  getStats: () => QueueStats
  getTask: (taskId: string) => QueueTask | undefined
}

export const useTaskQueueStore = create<TaskQueueState>((set, get) => ({
  tasks: [],

  setTasks: (tasks) => set({ tasks }),

  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
  })),

  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(t => t.id !== taskId)
  })),

  clearCompleted: () => set((state) => ({
    tasks: state.tasks.filter(t => t.status === 'pending' || t.status === 'running')
  })),

  clearAll: () => set({ tasks: [] }),

  getStats: () => {
    const tasks = get().tasks
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      success: tasks.filter(t => t.status === 'success').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      total: tasks.length
    }
  },

  getTask: (taskId) => get().tasks.find(t => t.id === taskId)
}))
```

- [ ] **Step 2: 验证修改无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/core/task-queue-store.ts
git commit -m "refactor: simplify TaskQueueStore, remove isPanelOpen state"
```

---

### Task 2: 更新 TaskQueueManager 移除 setPanelOpen 调用

**Files:**
- Modify: `src/content/core/task-queue-manager.ts`

- [ ] **Step 1: 移除 setPanelOpen 调用**

在 `addTask` 方法中，删除 `store.setPanelOpen(true)`：

```typescript
// 找到这行并删除：
store.setPanelOpen(true)
```

修改后的 addTask 方法：

```typescript
addTask(imageUrl: string): QueueTask | null {
  const store = useTaskQueueStore.getState()
  const currentTasks = store.tasks

  // Check queue size
  if (currentTasks.length >= MAX_QUEUE_SIZE) {
    console.log(LOG_PREFIX, 'Queue full, cannot add task')
    return null
  }

  // Create task
  const task: QueueTask = {
    id: crypto.randomUUID(),
    imageUrl,
    status: 'pending',
    createdAt: Date.now()
  }

  // Add to store
  store.setTasks([...currentTasks, task])

  console.log(LOG_PREFIX, 'Task added to queue:', task.id)

  // Generate thumbnail asynchronously (non-blocking)
  this.generateThumbnailAsync(task.id, imageUrl)

  // Try to start immediately
  this.tryStartNext()

  return task
}
```

- [ ] **Step 2: 验证修改无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/core/task-queue-manager.ts
git commit -m "refactor: TaskQueueManager remove setPanelOpen call"
```

---

### Task 3: 创建 TaskListItem 组件

**Files:**
- Create: `src/content/components/TaskListItem.tsx`

- [ ] **Step 1: 创建 TaskListItem 组件**

```typescript
/**
 * TaskListItem - Left sidebar task list item
 * Displays thumbnail + status icon, clickable to select
 */

import { Check, X, Loader2 } from 'lucide-react'
import type { QueueTask } from '@/content/core/task-queue-manager'

interface TaskListItemProps {
  task: QueueTask
  isSelected: boolean
  onClick: () => void
}

function TaskListItem({ task, isSelected, onClick }: TaskListItemProps) {
  /**
   * Render status icon based on task status
   */
  const renderStatusIcon = () => {
    switch (task.status) {
      case 'pending':
        return <span className="status-dot pending" />
      case 'running':
        return <Loader2 className="status-icon spinning" size={14} />
      case 'success':
        return <Check className="status-icon success" size={14} />
      case 'failed':
        return <X className="status-icon failed" size={14} />
      default:
        return null
    }
  }

  return (
    <div
      className={`task-list-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="task-thumbnail">
        {task.thumbnailUrl ? (
          <img src={task.thumbnailUrl} alt="Task" loading="lazy" />
        ) : task.imageUrl ? (
          <img src={task.imageUrl} alt="Task" loading="lazy" />
        ) : (
          <div className="thumbnail-placeholder">无图片</div>
        )}
      </div>
      <div className="task-status-center">
        {renderStatusIcon()}
      </div>
    </div>
  )
}

export default TaskListItem
```

- [ ] **Step 2: 验证组件无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/components/TaskListItem.tsx
git commit -m "feat: add TaskListItem component for left sidebar"
```

---

### Task 4: 重构 VisionModal 为左右布局（样式部分）

**Files:**
- Modify: `src/content/vision-modal-manager.tsx`

- [ ] **Step 1: 更新 getStyles 方法添加左侧列表样式**

在 `getStyles()` 方法中添加左侧列表样式，并更新弹窗宽度为 600px：

```typescript
private getStyles(): string {
  return `
    /* Modal root container */
    #modal-root {
      all: initial;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-sizing: border-box;
    }

    /* Overlay - no backdrop (transparent), just positioning container */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      pointer-events: none;
      z-index: 2147483647; /* Maximum z-index */
    }

    /* Modal card - floating box with fixed positioning */
    .modal-card {
      position: fixed;
      width: 600px;
      height: 700px;
      max-width: 90vw;
      max-height: 700px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
    }

    /* Modal card minimized state */
    .modal-card.minimized {
      width: 200px;
      height: auto;
      max-width: 200px;
      max-height: none;
    }

    /* Modal header */
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #E5E5E5;
      cursor: grab;
      user-select: none;
    }

    .modal-title {
      font-size: 12px;
      font-weight: 600;
      color: #171717;
    }

    .modal-brand {
      font-size: 12px;
      font-weight: 600;
      color: #171717;
      margin-left: 6px;
    }

    .modal-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .modal-action-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .modal-action-btn:hover {
      background: #f8f8f8;
    }

    .modal-action-btn svg {
      width: 14px;
      height: 14px;
      color: #64748B;
    }

    .modal-logo-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    /* Main content area - left/right split */
    .modal-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Left sidebar - task list */
    .task-sidebar {
      width: 120px;
      background: #fafafa;
      border-right: 1px solid #E5E5E5;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .task-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Task list item */
    .task-list-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 2px solid transparent;
    }

    .task-list-item:hover {
      background: #f0f0f0;
    }

    .task-list-item.selected {
      border-color: #3b82f6;
      background: #f0f7ff;
    }

    .task-thumbnail {
      width: 60px;
      height: 60px;
      border-radius: 6px;
      overflow: hidden;
      background: #E5E5E5;
    }

    .task-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumbnail-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #9CA3AF;
    }

    .task-status-center {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 0;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.pending {
      background: #9CA3AF;
    }

    .status-icon {
      flex-shrink: 0;
    }

    .status-icon.spinning {
      animation: spin 1s linear infinite;
      color: #171717;
    }

    .status-icon.success {
      color: #22c55e;
    }

    .status-icon.failed {
      color: #ef4444;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Right content area */
    .task-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .task-content-inner {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }

    /* Loading view */
    .loading-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px 0;
    }

    .loading-spinner {
      width: 32px;
      height: 32px;
      animation: spin 1s linear infinite;
      color: #64748B;
    }

    .loading-text {
      font-size: 14px;
      color: #64748B;
    }

    /* Success view - prompt preview */
    .success-view {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .prompt-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .prompt-header {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .prompt-header-label {
      font-size: 13px;
      font-weight: 600;
      color: #171717;
    }

    .prompt-preview-wrapper {
      position: relative;
    }

    .prompt-copy-btn {
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .prompt-copy-btn:hover {
      background: #ffffff;
      border-color: #d0d0d0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
    }

    .prompt-copy-btn svg {
      width: 14px;
      height: 14px;
      color: #64748B;
    }

    .prompt-copy-btn.copied {
      background: #f0fdf4;
      border-color: #22c55e;
    }

    .prompt-copy-btn.copied svg {
      color: #22c55e;
    }

    .prompt-preview {
      background: #f8f8f8;
      border: 1px solid #E5E5E5;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      color: #171717;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
      line-height: 1.5;
    }

    .prompt-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748B;
      margin-bottom: 6px;
    }

    .prompt-title {
      font-size: 16px;
      font-weight: 600;
      color: #171717;
      margin-bottom: 8px;
    }

    /* Analysis section */
    .analysis-section {
      background: #fafafa;
      padding: 12px;
      border-radius: 6px;
    }

    .analysis-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748B;
      margin-bottom: 6px;
    }

    .analysis-text {
      font-size: 13px;
      color: #525252;
      line-height: 1.4;
    }

    /* Style tags - chips */
    .style-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .style-tag {
      padding: 4px 10px;
      background: #f0f0f0;
      border-radius: 12px;
      font-size: 12px;
      color: #171717;
      font-weight: 500;
    }

    /* JSON tab details */
    .json-tab {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .json-details {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .json-row {
      display: flex;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .json-row:last-child {
      border-bottom: none;
    }

    .json-key {
      font-size: 12px;
      font-weight: 600;
      color: #64748B;
      min-width: 140px;
      flex-shrink: 0;
    }

    .json-value {
      font-size: 13px;
      color: #171717;
      flex: 1;
      word-break: break-word;
    }

    /* Error view */
    .error-view {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .error-message {
      font-size: 14px;
      color: #ef4444;
    }

    /* Action buttons */
    .action-buttons {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .btn-primary {
      background: #171717;
      border: 1px solid #171717;
      color: #ffffff;
    }

    .btn-primary:hover {
      background: rgba(23, 23, 23, 0.9);
      border-color: rgba(23, 23, 23, 0.9);
    }

    .btn-outline {
      background: #ffffff;
      border: 1px solid #E5E5E5;
      color: #171717;
    }

    .btn-outline:hover {
      background: #f8f8f8;
      border-color: #d0d0d0;
    }

    .btn svg {
      width: 16px;
      height: 16px;
    }

    /* Feedback view */
    .feedback-view {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .feedback-success {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #22c55e;
    }

    .feedback-success svg {
      width: 16px;
      height: 16px;
    }

    .feedback-text {
      font-size: 14px;
    }

    .close-session-btn {
      padding: 0;
      border: none;
      background: transparent;
      font-size: 13px;
      color: #64748B;
      cursor: pointer;
      text-decoration: none;
      transition: color 0.15s ease;
      margin-top: 4px;
    }

    .close-session-btn:hover {
      color: #171717;
    }

    /* Modal footer */
    .modal-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid #E5E5E5;
      gap: 12px;
    }

    .toggle-groups {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .toggle-group {
      display: flex;
      gap: 2px;
      background: #f0f0f0;
      padding: 3px;
      border-radius: 6px;
    }

    .toggle-btn {
      padding: 5px 10px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      color: #64748B;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toggle-btn:hover {
      color: #171717;
    }

    .toggle-btn.active {
      background: #ffffff;
      color: #171717;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    /* Minimized content */
    .minimized-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      gap: 12px;
    }

    .minimized-status {
      font-size: 13px;
      color: #64748B;
      flex: 1;
    }

    /* Scrollbar styling */
    .prompt-preview::-webkit-scrollbar,
    .task-content-inner::-webkit-scrollbar,
    .task-list-container::-webkit-scrollbar {
      width: 6px;
    }

    .prompt-preview::-webkit-scrollbar-track,
    .task-content-inner::-webkit-scrollbar-track,
    .task-list-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .prompt-preview::-webkit-scrollbar-thumb,
    .task-content-inner::-webkit-scrollbar-thumb,
    .task-list-container::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    .prompt-preview::-webkit-scrollbar-thumb:hover,
    .task-content-inner::-webkit-scrollbar-thumb:hover,
    .task-list-container::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}
```

- [ ] **Step 2: 验证样式修改无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/vision-modal-manager.tsx
git commit -m "refactor: VisionModalManager update styles for left-right layout"
```

---

### Task 5: 重构 VisionModalManager 为订阅模式

**Files:**
- Modify: `src/content/vision-modal-manager.tsx`

- [ ] **Step 1: 修改 create 方法，移除 imageUrl 参数**

将 VisionModalManager 改为订阅 store，不再传入 imageUrl：

```typescript
/**
 * VisionModalManager - Shadow DOM container for Vision API modal
 * Creates and manages the modal mount point with CSS isolation
 * Works on all websites (not just Lovart)
 */

import { createRoot, type Root } from 'react-dom/client'
import VisionModal from './components/VisionModal'
import { ErrorBoundary } from './components/ErrorBoundary'

const LOG_PREFIX = '[Oh My Prompt]'

const HOST_ID = 'omp-vision-modal-host'

export class VisionModalManager {
  private static instance: VisionModalManager | null = null
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null

  static getInstance(): VisionModalManager {
    if (!VisionModalManager.instance) {
      VisionModalManager.instance = new VisionModalManager()
    }
    return VisionModalManager.instance
  }

  private constructor() {}

  /**
   * Create modal in current page
   * No imageUrl parameter - modal subscribes to task store
   */
  create(): void {
    this.destroy()

    this.hostElement = document.createElement('div')
    this.hostElement.id = HOST_ID

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' })

    const styleElement = document.createElement('style')
    styleElement.textContent = this.getStyles()
    this.shadowRoot.appendChild(styleElement)

    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    this.shadowRoot.appendChild(modalRoot)

    document.body.appendChild(this.hostElement)

    this.reactRoot = createRoot(modalRoot)
    this.reactRoot.render(
      <ErrorBoundary>
        <VisionModal onClose={this.destroy.bind(this)} />
      </ErrorBoundary>
    )

    console.log(LOG_PREFIX, 'Vision modal created')
  }

  destroy(): void {
    if (this.reactRoot) {
      this.reactRoot.unmount()
      this.reactRoot = null
    }

    if (this.hostElement) {
      this.hostElement.remove()
      this.hostElement = null
    }

    this.shadowRoot = null

    console.log(LOG_PREFIX, 'Vision modal destroyed')
  }

  isOpen(): boolean {
    return this.hostElement !== null && document.body.contains(this.hostElement)
  }

  ensureOpen(): void {
    if (!this.isOpen()) {
      this.create()
    }
  }

  private getStyles(): string {
    // Styles from Task 4
    // ... (keep the styles from previous task)
  }
}
```

- [ ] **Step 2: 验证修改无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/vision-modal-manager.tsx
git commit -m "refactor: VisionModalManager subscribe to store instead of passing imageUrl"
```

---

### Task 6: 重构 VisionModal 组件为左右布局

**Files:**
- Modify: `src/content/components/VisionModal.tsx`

- [ ] **Step 1: 重构 VisionModal 组件**

将 VisionModal 改为左右布局，订阅 useTaskQueueStore：

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Check, X, RefreshCw, Settings, Minimize2, Maximize2, Copy } from 'lucide-react'
import { MessageType } from '@/shared/messages'
import type { VisionApiErrorPayload, VisionApiResultData, InsertPromptPayload, SaveTemporaryPromptPayload } from '@/shared/types'
import { useTaskQueueStore } from '@/content/core/task-queue-store'
import { TaskQueueManager } from '@/content/core/task-queue-manager'
import TaskListItem from './TaskListItem'

type VisionModalState = 'loading' | 'success' | 'error' | 'confirming' | 'feedback'
type LanguageType = 'zh' | 'en'
type FormatType = 'natural' | 'json'

interface VisionModalProps {
  onClose: () => void
}

function generatePromptName(prompt: string, title?: string): string {
  if (title) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return `${title} (${timestamp})`
  }
  const firstLine = prompt.split('\n')[0] || prompt
  const truncated = firstLine.substring(0, 30).trim()
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${truncated}... (${timestamp})`
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Clipboard copy failed:', error)
    return false
  }
}

function getStoredLanguagePreference(): 'zh' | 'en' {
  try {
    const stored = localStorage.getItem('omps_language_preference')
    return stored === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

function VisionModal({ onClose }: VisionModalProps) {
  // Task queue state
  const tasks = useTaskQueueStore(state => state.tasks)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Selected task
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || tasks[0]

  // Content state (for success view)
  const [contentState, setContentState] = useState<VisionModalState>('loading')
  const [language, setLanguage] = useState<LanguageType>('zh')
  const [format, setFormat] = useState<FormatType>('natural')
  const [isLovartPage, setIsLovartPage] = useState(false)

  // Draggable & minimizable state
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 620, y: 20 })
  const [expandedPosition, setExpandedPosition] = useState({ x: window.innerWidth - 620, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  // Copy state
  const [isPromptCopied, setIsPromptCopied] = useState(false)

  // Modal dimensions
  const EXPANDED_WIDTH = 600
  const MINIMIZED_WIDTH = 200

  const queueManager = TaskQueueManager.getInstance()

  // Stats for minimized view
  const stats = {
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    success: tasks.filter(t => t.status === 'success').length,
    failed: tasks.filter(t => t.status === 'failed').length
  }

  // Auto-select first task or new task
  useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id)
    }
    if (tasks.length === 0 && selectedTaskId) {
      setSelectedTaskId(null)
    }
  }, [tasks, selectedTaskId])

  // Update content state based on selected task
  useEffect(() => {
    if (selectedTask) {
      if (selectedTask.status === 'pending') {
        setContentState('loading')
      } else if (selectedTask.status === 'running') {
        setContentState('loading')
      } else if (selectedTask.status === 'success') {
        setContentState('success')
      } else if (selectedTask.status === 'failed') {
        setContentState('error')
      }
    }
  }, [selectedTask])

  // Check Lovart page
  useEffect(() => {
    const lovartPattern = /^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/
    setIsLovartPage(lovartPattern.test(window.location.href))
    const pref = getStoredLanguagePreference()
    setLanguage(pref)
  }, [])

  // Get current prompt
  const getCurrentPrompt = useCallback(() => {
    if (!selectedTask?.result) return ''
    if (format === 'natural') {
      return language === 'zh' ? selectedTask.result.zh.prompt : selectedTask.result.en.prompt
    }
    if (language === 'zh' && selectedTask.result.zh_json) {
      return JSON.stringify(selectedTask.result.zh_json, null, 2)
    }
    if (language === 'en' && selectedTask.result.en_json) {
      return JSON.stringify(selectedTask.result.en_json, null, 2)
    }
    return JSON.stringify(selectedTask.result.json_prompt, null, 2)
  }, [selectedTask, language, format])

  // Handle task selection
  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId)
  }, [])

  // Handle remove task
  const handleRemoveTask = useCallback((taskId: string) => {
    queueManager.removeTask(taskId)
    if (taskId === selectedTaskId) {
      setSelectedTaskId(tasks.length > 1 ? tasks[0].id : null)
    }
  }, [queueManager, selectedTaskId, tasks])

  // Handle retry
  const handleRetry = useCallback(() => {
    if (selectedTaskId) {
      queueManager.retryTask(selectedTaskId)
    }
  }, [queueManager, selectedTaskId])

  // Handle confirm - save to temporary
  const handleConfirm = async () => {
    const currentPrompt = getCurrentPrompt()
    if (!currentPrompt || !selectedTask?.result) {
      return
    }

    setContentState('confirming')

    // Copy to clipboard
    const clipboardSuccess = await copyToClipboard(currentPrompt)

    // Save to temporary (already auto-saved by TaskQueueManager)
    setContentState('feedback')
  }

  // Handle minimize
  const handleMinimize = useCallback(() => {
    setExpandedPosition(position)
    const newLeft = position.x + (EXPANDED_WIDTH - MINIMIZED_WIDTH)
    setPosition({ x: newLeft, y: position.y })
    setIsMinimized(true)
  }, [position])

  // Handle expand
  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    setPosition(expandedPosition)
  }, [expandedPosition])

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        queueManager.clearAll()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, queueManager])

  // Handle close
  const handleClose = useCallback(() => {
    queueManager.clearAll()
    onClose()
  }, [queueManager, onClose])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      if (!isMinimized) {
        setExpandedPosition(position)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isMinimized, position])

  // Copy prompt
  const handleCopyPrompt = useCallback(async () => {
    const currentPrompt = getCurrentPrompt()
    if (!currentPrompt) return

    const success = await copyToClipboard(currentPrompt)
    if (success) {
      setIsPromptCopied(true)
      setTimeout(() => setIsPromptCopied(false), 1500)
    }
  }, [getCurrentPrompt])

  // Render JSON prompt
  const renderJsonPrompt = () => {
    if (!selectedTask?.result) return null

    const jsonPrompt = language === 'zh' && selectedTask.result.zh_json
      ? selectedTask.result.zh_json
      : language === 'en' && selectedTask.result.en_json
        ? selectedTask.result.en_json
        : selectedTask.result.json_prompt

    const zhBaselineKeys = ['主体', '动作姿态', '细节外观', '环境背景', '光影氛围', '风格镜头', '色彩', '材质', '宽高比']
    const enBaselineKeys = ['subject', 'action_pose', 'details_appearance', 'environment_background', 'lighting_atmosphere', 'style_camera', 'colors', 'materials', 'aspect_ratio']

    const hasZhKeys = Object.keys(jsonPrompt).some(k => zhBaselineKeys.includes(k))
    const baselineKeys = hasZhKeys ? zhBaselineKeys : enBaselineKeys

    return (
      <div className="json-details">
        {baselineKeys.map(key => {
          const value = jsonPrompt[key]
          if (!value) return null
          const displayValue = Array.isArray(value) ? value.join(', ') : String(value)
          return (
            <div className="json-row" key={key}>
              <span className="json-key">{key}:</span>
              <span className="json-value">{displayValue}</span>
            </div>
          )
        })}
        {Object.keys(jsonPrompt)
          .filter(key => !baselineKeys.includes(key))
          .map(key => {
            const value = jsonPrompt[key]
            if (!value) return null
            const displayValue = typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)
            return (
              <div className="json-row" key={key}>
                <span className="json-key">{key}:</span>
                <span className="json-value">{displayValue}</span>
              </div>
            )
          })}
      </div>
    )
  }

  // Render style tags
  const renderStyleTags = (tags: string[]) => {
    if (!tags || tags.length === 0) return null
    return (
      <div className="style-tags">
        {tags.map((tag, index) => (
          <span className="style-tag" key={index}>{tag}</span>
        ))}
      </div>
    )
  }

  // Render right content based on task status
  const renderRightContent = () => {
    if (!selectedTask) {
      return (
        <div className="loading-view">
          <p className="loading-text">暂无任务</p>
        </div>
      )
    }

    if (selectedTask.status === 'pending') {
      return (
        <div className="loading-view">
          <Loader2 className="loading-spinner" />
          <p className="loading-text">等待分析中...</p>
        </div>
      )
    }

    if (selectedTask.status === 'running') {
      return (
        <div className="loading-view">
          <Loader2 className="loading-spinner" />
          <p className="loading-text">正在分析图片...</p>
        </div>
      )
    }

    if (selectedTask.status === 'failed') {
      return (
        <div className="error-view">
          <p className="error-message" role="alert">{selectedTask.error || '分析失败'}</p>
          <div className="action-buttons">
            <button className="btn btn-primary" onClick={handleRetry}>
              <RefreshCw />
              重试
            </button>
            <button className="btn btn-outline" onClick={() => handleRemoveTask(selectedTask.id)}>
              <X />
              移除
            </button>
          </div>
        </div>
      )
    }

    if (selectedTask.status === 'success' && selectedTask.result) {
      const result = selectedTask.result

      return (
        <div className="success-view">
          {format === 'natural' && (
            <>
              {language === 'zh' && result.zh.title && (
                <div className="prompt-title">{result.zh.title}</div>
              )}
              {language === 'en' && result.en.title && (
                <div className="prompt-title">{result.en.title}</div>
              )}
              <div className="prompt-preview-wrapper">
                <div className="prompt-preview">
                  <p className="prompt-label">{language === 'zh' ? '提示词:' : 'Prompt:'}</p>
                  {language === 'zh' ? result.zh.prompt : result.en.prompt}
                </div>
                <button
                  className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                  onClick={handleCopyPrompt}
                >
                  {isPromptCopied ? <Check /> : <Copy />}
                </button>
              </div>
              {language === 'zh' && result.zh.analysis && (
                <div className="analysis-section">
                  <p className="analysis-label">分析说明:</p>
                  <p className="analysis-text">{result.zh.analysis}</p>
                </div>
              )}
              {language === 'en' && result.en.analysis && (
                <div className="analysis-section">
                  <p className="analysis-label">Analysis:</p>
                  <p className="analysis-text">{result.en.analysis}</p>
                </div>
              )}
              {language === 'zh' && renderStyleTags(result.zh_style_tags)}
              {language === 'en' && renderStyleTags(result.en_style_tags)}
            </>
          )}

          {format === 'json' && (
            <div className="json-tab">
              <div className="prompt-preview-wrapper">
                {renderJsonPrompt()}
                <button
                  className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                  onClick={handleCopyPrompt}
                >
                  {isPromptCopied ? <Check /> : <Copy />}
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className={`modal-card ${isMinimized ? 'minimized' : ''}`}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: 'grab' }}
        >
          <>
            <img className="modal-logo-icon" src={chrome.runtime.getURL('assets/icon-128.png')} alt="Oh My Prompt" />
            <span className="modal-brand">
              {isMinimized ? `${stats.success}✓ / ${stats.failed}✗ / ${stats.running}⟳` : 'Oh My Prompt'}
            </span>
          </>
          <div className="modal-header-actions">
            {isMinimized ? (
              <>
                <button className="modal-action-btn" onClick={handleClose} aria-label="关闭">
                  <X />
                </button>
                <button className="modal-action-btn" onClick={handleExpand} aria-label="放大">
                  <Maximize2 />
                </button>
              </>
            ) : (
              <button className="modal-action-btn" onClick={handleMinimize} aria-label="缩小">
                <Minimize2 />
              </button>
            )}
          </div>
        </div>

        {/* Main content - left/right split */}
        {!isMinimized && (
          <div className="modal-body">
            {/* Left sidebar - task list */}
            <div className="task-sidebar">
              <div className="task-list-container">
                {tasks.map(task => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    onClick={() => handleSelectTask(task.id)}
                  />
                ))}
              </div>
            </div>

            {/* Right content area */}
            <div className="task-content">
              <div className="task-content-inner">
                {renderRightContent()}
              </div>

              {/* Footer - only show in success state */}
              {selectedTask?.status === 'success' && selectedTask?.result && (
                <div className="modal-footer">
                  <div className="toggle-groups">
                    <div className="toggle-group">
                      <button
                        className={`toggle-btn ${language === 'zh' ? 'active' : ''}`}
                        onClick={() => setLanguage('zh')}
                      >
                        中
                      </button>
                      <button
                        className={`toggle-btn ${language === 'en' ? 'active' : ''}`}
                        onClick={() => setLanguage('en')}
                      >
                        EN
                      </button>
                    </div>
                    <div className="toggle-group">
                      <button
                        className={`toggle-btn ${format === 'natural' ? 'active' : ''}`}
                        onClick={() => setFormat('natural')}
                      >
                        自然语言
                      </button>
                      <button
                        className={`toggle-btn ${format === 'json' ? 'active' : ''}`}
                        onClick={() => setFormat('json')}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={handleConfirm}>
                    已保存
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisionModal
```

- [ ] **Step 2: 验证组件无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/components/VisionModal.tsx
git commit -m "refactor: VisionModal left-right layout with task list"
```

---

### Task 7: 更新 image-hover-button-manager 调用 VisionModalManager

**Files:**
- Modify: `src/content/image-hover-button-manager.tsx`

- [ ] **Step 1: 更新 imports 和 handleButtonClick**

移除 BatchPanelManager 引用，改用 VisionModalManager：

```typescript
// 修改 imports
import { VisionModalManager } from './vision-modal-manager'

// 删除这行
import { BatchPanelManager } from './batch-panel-manager'

// 修改 handleButtonClick 方法
private handleButtonClick(imageUrl: string): void {
  console.log(LOG_PREFIX, 'Hover button clicked')

  try {
    const queueManager = TaskQueueManager.getInstance()
    const visionModalManager = VisionModalManager.getInstance()

    // Add to queue
    const task = queueManager.addTask(imageUrl)

    if (task === null) {
      this.showToast('队列已满，请等待任务完成')
      return
    }

    // Ensure vision modal is open
    visionModalManager.ensureOpen()
  } catch (error) {
    console.error(LOG_PREFIX, 'Queue operation failed:', error)
  }

  this.hideButton()
}
```

- [ ] **Step 2: 验证修改无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/image-hover-button-manager.tsx
git commit -m "refactor: ImageHoverButtonManager use VisionModalManager"
```

---

### Task 8: 删除 BatchProgressPanel 和 BatchPanelManager

**Files:**
- Delete: `src/content/components/BatchProgressPanel.tsx`
- Delete: `src/content/components/TaskCard.tsx`
- Delete: `src/content/batch-panel-manager.tsx`

- [ ] **Step 1: 删除文件**

```bash
rm src/content/components/BatchProgressPanel.tsx
rm src/content/components/TaskCard.tsx
rm src/content/batch-panel-manager.tsx
```

- [ ] **Step 2: 搜索并清理残留引用**

检查是否有其他文件引用这些删除的组件：

```bash
grep -rn "BatchProgressPanel\|BatchPanelManager\|TaskCard" src/
```

Expected: 无引用（如果有，需要清理）

- [ ] **Step 3: 验证无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove BatchProgressPanel and BatchPanelManager"
```

---

### Task 9: 更新 vision-only-script 调用方式

**Files:**
- Modify: `src/content/vision-only-script.ts`

- [ ] **Step 1: 更新 VisionModalManager 调用**

找到 OPEN_VISION_MODAL 处理，改为使用 ensureOpen：

```typescript
// 搜索 VisionModalManager.getInstance().create 调用
// 替换为 ensureOpen()

// 原来的代码：
manager.create(imageUrl, tabId)

// 改为：
// 先添加任务到队列
const queueManager = TaskQueueManager.getInstance()
const task = queueManager.addTask(imageUrl)
// 然后打开弹窗
manager.ensureOpen()
```

- [ ] **Step 2: 验证修改无语法错误**

Run: `npx tsc --noEmit`

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/content/vision-only-script.ts
git commit -m "refactor: vision-only-script use ensureOpen"
```

---

### Task 10: 构建测试

**Files:**
- None

- [ ] **Step 1: 运行构建**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 2: 加载扩展测试**

1. 在 Chrome 中打开 `chrome://extensions`
2. 启用开发者模式
3. 加载 `dist/` 目录
4. 检查扩展是否正常加载

- [ ] **Step 3: 功能测试**

测试场景：
1. 打开任意网页，鼠标悬停在图片上
2. 点击 HoverButton
3. VisionModal 弹窗显示
4. 左侧显示任务列表，右侧显示加载状态
5. 等待任务完成，右侧显示成功内容
6. 点击左侧其他任务，右侧切换内容
7. 最小化弹窗，显示统计数字
8. 展开弹窗，恢复左右布局
9. ESC 关闭弹窗，清空所有任务

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: verify VisionModal left-right layout works"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|------------------|------|
| 删除 BatchProgressPanel | Task 8 |
| 简化 task-queue-store | Task 1 |
| VisionModalManager 订阅 store | Task 5 |
| VisionModal 左右布局 | Task 6 |
| 左侧列表 120px，右侧 480px | Task 4 |
| 列表项缩略图 60x60 | Task 3 |
| 四种状态图标 | Task 3 |
| 点击切换右侧内容 | Task 6 |
| 选中高亮蓝色边框 | Task 4 样式 |
| Header 拖拽 | Task 6 |
| 最小化状态统计 | Task 6 |
| ESC 关闭清空 | Task 6 |
| 语言/格式切换 | Task 6 |
| 复制/保存功能 | Task 6 |

---

## Self-Review

1. **Placeholder scan:** 无 TBD/TODO 占位符
2. **Type consistency:** useTaskQueueStore、QueueTask 类型在各任务中一致
3. **Scope check:** 范围适中，单一 spec 完全覆盖

---

Plan complete and saved to `docs/superpowers/plans/2026-05-05-vision-modal-refactor.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**