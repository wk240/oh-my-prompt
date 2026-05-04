# TaskCard UI 改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进 BatchProgressPanel 中 TaskCard 的 UI，添加自动保存到临时库功能

**Architecture:** 重构 TaskCard 组件移除折叠逻辑，成功任务直接展示完整 Prompt；在 task-queue-manager 中添加自动保存逻辑

**Tech Stack:** React, TypeScript, Zustand, Chrome Extension

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/content/core/task-queue-store.ts` | 修改 | 移除 expandedTaskId，添加 savedToTemporary/saveError 字段 |
| `src/content/core/task-queue-manager.ts` | 修改 | QueueTask 类型扩展，添加自动保存逻辑 |
| `src/content/components/TaskCard.tsx` | 重写 | 新布局：成功状态直接展示完整内容，文字按钮 |
| `src/content/components/BatchProgressPanel.tsx` | 修改 | 更新样式，移除 expandedTaskId 相关逻辑 |

---

### Task 1: 扩展 QueueTask 类型

**Files:**
- Modify: `src/content/core/task-queue-manager.ts:19-27`
- Modify: `src/content/core/task-queue-store.ts`

- [ ] **Step 1: 扩展 QueueTask 接口添加保存状态字段**

在 `src/content/core/task-queue-manager.ts` 中修改 QueueTask 接口：

```typescript
// Queue task interface
export interface QueueTask {
  id: string                  // crypto.randomUUID()
  imageUrl: string            // Image URL
  thumbnailUrl?: string       // Thumbnail (compressed base64 for display)
  status: TaskStatus
  createdAt: number           // Timestamp when added
  result?: VisionApiResultData // Result on success
  error?: string              // Error message on failure
  savedToTemporary?: boolean  // Auto-save status
  saveError?: string          // Save error message
}
```

- [ ] **Step 2: 移除 task-queue-store.ts 中的 expandedTaskId**

修改 `src/content/core/task-queue-store.ts`：

```typescript
/**
 * TaskQueueStore - Zustand store for queue state
 * Provides reactive state for React components
 */

import { create } from 'zustand'
import type { QueueTask, QueueStats } from './task-queue-manager'

interface TaskQueueState {
  tasks: QueueTask[]
  isPanelOpen: boolean

  // Actions
  setTasks: (tasks: QueueTask[]) => void
  updateTask: (taskId: string, updates: Partial<QueueTask>) => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
  clearAll: () => void
  setPanelOpen: (open: boolean) => void

  // Computed
  getStats: () => QueueStats
  getTask: (taskId: string) => QueueTask | undefined
}

export const useTaskQueueStore = create<TaskQueueState>((set, get) => ({
  tasks: [],
  isPanelOpen: false,

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

  setPanelOpen: (open) => set({ isPanelOpen: open }),

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

- [ ] **Step 3: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/content/core/task-queue-manager.ts src/content/core/task-queue-store.ts
git commit -m "refactor: extend QueueTask with save status, remove expandedTaskId"
```

---

### Task 2: 添加自动保存逻辑

**Files:**
- Modify: `src/content/core/task-queue-manager.ts:252-321`

- [ ] **Step 1: 导入 SaveTemporaryPromptPayload 类型**

在 `src/content/core/task-queue-manager.ts` 顶部添加导入：

```typescript
import type { VisionApiResultData, VisionApiErrorPayload, SaveTemporaryPromptPayload } from '@/shared/types'
```

- [ ] **Step 2: 添加 generatePromptName 辅助函数**

在 task-queue-manager.ts 中添加函数（在 LOG_PREFIX 定义后）：

```typescript
/**
 * Generate prompt name from content or title
 */
function generatePromptName(content: string, title?: string): string {
  if (title) return title
  // Use first 30 chars of content as name
  return content.substring(0, 30).replace(/\n/g, ' ').trim() + '...'
}
```

- [ ] **Step 2: 在 executeTask 成功分支添加自动保存逻辑**

修改 `executeTask` 方法，在成功后添加自动保存：

```typescript
/**
 * Execute Vision API call for task via service worker (CORS bypass)
 */
private async executeTask(task: QueueTask, abortController: AbortController): Promise<void> {
  const store = useTaskQueueStore.getState()

  try {
    // Call Vision API via service worker (handles image compression and CORS bypass)
    const response = await chrome.runtime.sendMessage({
      type: MessageType.VISION_API_CALL,
      payload: {
        imageUrl: task.imageUrl,
        retryCount: 0
      }
    })

    // Check if aborted during the call
    if (abortController.signal.aborted) {
      return
    }

    if (!response) {
      throw new Error('服务响应异常')
    }

    if (response.success) {
      // Success - extract fullData from response
      const resultData = response.data?.fullData as VisionApiResultData | undefined
      if (!resultData) {
        throw new Error('API 返回数据格式异常')
      }

      // Update task with success status
      store.updateTask(task.id, {
        status: 'success',
        result: resultData
      })

      console.log(LOG_PREFIX, 'Task success:', task.id)

      // Auto-save to temporary library
      await this.autoSaveToTemporary(task.id, resultData, task.imageUrl)

    } else {
      // API returned error
      const errorPayload = response.error as VisionApiErrorPayload | undefined
      throw new Error(errorPayload?.message || 'API 调用失败')
    }

  } catch (error) {
    // Check if aborted
    if (abortController.signal.aborted) {
      return
    }

    // Classify error
    const errorPayload = classifyApiError(error, 0)
    store.updateTask(task.id, {
      status: 'failed',
      error: errorPayload.message
    })

    console.error(LOG_PREFIX, 'Task failed:', task.id, errorPayload.message)

  } finally {
    // Cleanup - only decrement if not aborted (aborted tasks already decremented in removeTask)
    if (abortController.signal.aborted) {
      // Task was aborted via removeTask, just clean up the controller entry
      this.abortControllers.delete(task.id)
    } else {
      // Normal completion - full cleanup
      this.abortControllers.delete(task.id)
      this.runningCount--
    }

    // Start next task
    this.tryStartNext()
  }
}

/**
 * Auto-save successful task to temporary library
 */
private async autoSaveToTemporary(taskId: string, result: VisionApiResultData, imageUrl: string): Promise<void> {
  const store = useTaskQueueStore.getState()

  try {
    const promptName = generatePromptName(result.zh.prompt, result.zh.title)
    const promptNameEn = generatePromptName(result.en.prompt, result.en.title)

    const savePayload: SaveTemporaryPromptPayload = {
      name: promptName,
      nameEn: promptNameEn,
      content: result.zh.prompt,
      contentEn: result.en.prompt,
      description: result.zh.analysis,
      descriptionEn: result.en.analysis,
      imageUrl: imageUrl,
      styleTags: result.zh_style_tags
    }

    const saveResponse = await chrome.runtime.sendMessage({
      type: MessageType.SAVE_TEMPORARY_PROMPT,
      payload: savePayload
    })

    if (saveResponse?.success) {
      store.updateTask(taskId, { savedToTemporary: true })
      console.log(LOG_PREFIX, 'Auto-saved to temporary library:', taskId)
    } else {
      const saveError = saveResponse?.error || '保存失败'
      store.updateTask(taskId, { savedToTemporary: false, saveError })
      console.warn(LOG_PREFIX, 'Auto-save failed:', taskId, saveError)
    }
  } catch (error) {
    const saveError = error instanceof Error ? error.message : '保存异常'
    store.updateTask(taskId, { savedToTemporary: false, saveError })
    console.error(LOG_PREFIX, 'Auto-save error:', taskId, error)
  }
}
```

- [ ] **Step 3: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/content/core/task-queue-manager.ts
git commit -m "feat: add auto-save to temporary library on task success"
```

---

### Task 3: 重构 TaskCard 组件

**Files:**
- Rewrite: `src/content/components/TaskCard.tsx`

- [ ] **Step 1: 重写 TaskCard.tsx 完整内容**

```typescript
/**
 * TaskCard - Individual task display in BatchProgressPanel
 * Success: Full prompt display with copy button at bottom
 * Failed/Running: Compact single-row layout
 */

import { useState, useCallback } from 'react'
import { Check, X, RefreshCw, Loader2 } from 'lucide-react'
import type { QueueTask } from '@/content/core/task-queue-manager'
import { useTaskQueueStore } from '@/content/core/task-queue-store'

type LanguageType = 'zh' | 'en'
type FormatType = 'natural' | 'json'

interface TaskCardProps {
  task: QueueTask
  onRemove: (taskId: string) => void
  onRetry: (taskId: string) => void
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Clipboard copy failed:', error)
    return false
  }
}

function TaskCard({ task, onRemove, onRetry }: TaskCardProps) {
  const [isCopied, setIsCopied] = useState(false)
  const [language, setLanguage] = useState<LanguageType>('zh')
  const [format, setFormat] = useState<FormatType>('natural')

  /**
   * Get current prompt based on language and format
   */
  const getCurrentPrompt = useCallback(() => {
    if (!task.result) return ''
    if (format === 'natural') {
      return language === 'zh' ? task.result.zh.prompt : task.result.en.prompt
    }
    // JSON format
    if (language === 'zh' && task.result.zh_json) {
      return JSON.stringify(task.result.zh_json, null, 2)
    }
    if (language === 'en' && task.result.en_json) {
      return JSON.stringify(task.result.en_json, null, 2)
    }
    return JSON.stringify(task.result.json_prompt, null, 2)
  }, [task.result, language, format])

  /**
   * Copy prompt to clipboard
   */
  const handleCopy = useCallback(async () => {
    const prompt = getCurrentPrompt()
    if (!prompt) return
    const success = await copyToClipboard(prompt)
    if (success) {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    }
  }, [getCurrentPrompt])

  /**
   * Render success state - full prompt display
   */
  const renderSuccessCard = () => (
    <div className="task-card-success">
      {/* Top row: thumbnail + status + remove button */}
      <div className="task-header-row">
        <div className="task-thumbnail-small">
          {task.thumbnailUrl ? (
            <img src={task.thumbnailUrl} alt="Task" loading="lazy" />
          ) : task.imageUrl ? (
            <img src={task.imageUrl} alt="Task" loading="lazy" />
          ) : (
            <div className="thumbnail-placeholder">无图片</div>
          )}
        </div>
        <div className="task-status-row">
          <Check className="status-icon" size={16} style={{ color: '#22c55e' }} />
          <span className="status-text">完成</span>
          {task.savedToTemporary ? (
            <span className="save-status success">已保存到临时库</span>
          ) : task.saveError ? (
            <span className="save-status error">{task.saveError}</span>
          ) : (
            <span className="save-status pending">保存中...</span>
          )}
        </div>
        <div className="task-header-actions">
          <button className="text-btn remove-btn" onClick={() => onRemove(task.id)}>
            移除
          </button>
        </div>
      </div>

      {/* Prompt area - full width */}
      <div className="prompt-display">
        {getCurrentPrompt()}
      </div>

      {/* Bottom row: language/format toggle + copy button */}
      <div className="task-footer-row">
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
              自然
            </button>
            <button
              className={`toggle-btn ${format === 'json' ? 'active' : ''}`}
              onClick={() => setFormat('json')}
            >
              JSON
            </button>
          </div>
        </div>
        <button
          className={`copy-btn-main ${isCopied ? 'copied' : ''}`}
          onClick={handleCopy}
        >
          {isCopied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  )

  /**
   * Render compact state - pending/running/failed
   */
  const renderCompactCard = () => (
    <div className="task-card-compact">
      <div className="task-thumbnail-small">
        {task.thumbnailUrl ? (
          <img src={task.thumbnailUrl} alt="Task" loading="lazy" />
        ) : task.imageUrl ? (
          <img src={task.imageUrl} alt="Task" loading="lazy" />
        ) : (
          <div className="thumbnail-placeholder">无图片</div>
        )}
      </div>
      <div className="task-status-row">
        {renderStatusIcon()}
      </div>
      <div className="task-compact-actions">
        {task.status === 'failed' && (
          <button className="text-btn retry-btn" onClick={() => onRetry(task.id)}>
            重试
          </button>
        )}
        <button className="text-btn remove-btn" onClick={() => onRemove(task.id)}>
          移除
        </button>
      </div>
    </div>
  )

  /**
   * Render status icon for compact view
   */
  const renderStatusIcon = () => {
    switch (task.status) {
      case 'pending':
        return (
          <>
            <span className="status-dot pending" />
            <span className="status-text">等待中</span>
          </>
        )
      case 'running':
        return (
          <>
            <Loader2 className="status-icon spinning" size={16} />
            <span className="status-text">分析中...</span>
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          </>
        )
      case 'failed':
        return (
          <>
            <X className="status-icon" size={16} style={{ color: '#ef4444' }} />
            <span className="status-text">失败</span>
            <span className="error-text">{task.error || '未知错误'}</span>
          </>
        )
      default:
        return null
    }
  }

  // Render based on status
  if (task.status === 'success') {
    return renderSuccessCard()
  }
  return renderCompactCard()
}

export default TaskCard
```

- [ ] **Step 2: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/content/components/TaskCard.tsx
git commit -m "refactor: TaskCard new layout - full prompt display, text buttons"
```

---

### Task 4: 更新 BatchProgressPanel 样式

**Files:**
- Modify: `src/content/components/BatchProgressPanel.tsx:290-707`

- [ ] **Step 1: 替换 getBatchPanelStyles 函数**

在 `src/content/components/BatchProgressPanel.tsx` 中替换样式函数：

```typescript
/**
 * Get CSS styles for BatchProgressPanel
 * These styles are injected via Shadow DOM in BatchPanelManager
 */
export function getBatchPanelStyles(): string {
  return `
    /* Panel overlay */
    .panel-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      pointer-events: none;
      z-index: 2147483647;
    }

    /* Panel card */
    .panel-card {
      position: fixed;
      width: 400px;
      max-height: 500px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .panel-card.minimized {
      width: 200px;
      max-height: 60px;
    }

    /* Header */
    .panel-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #E5E5E5;
      gap: 8px;
      user-select: none;
    }

    .panel-card.minimized .panel-header {
      border-bottom: none;
    }

    .panel-logo {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .panel-brand {
      font-size: 12px;
      font-weight: 600;
      color: #171717;
      flex: 1;
    }

    .panel-header-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .header-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
      transition: background 0.15s ease;
    }

    .header-btn:hover {
      background: #f8f8f8;
    }

    /* Stats bar */
    .panel-stats {
      padding: 10px 16px;
      font-size: 13px;
      color: #64748B;
      background: #f8f8f8;
    }

    /* Content area */
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .empty-state {
      text-align: center;
      padding: 32px;
      color: #9CA3AF;
      font-size: 14px;
    }

    /* Task list */
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* === Success Card (Full Display) === */
    .task-card-success {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 8px;
    }

    .task-header-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .task-thumbnail-small {
      width: 60px;
      height: 60px;
      flex-shrink: 0;
      border-radius: 6px;
      overflow: hidden;
      background: #E5E5E5;
    }

    .task-thumbnail-small img {
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

    .task-status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .status-icon {
      flex-shrink: 0;
    }

    .status-icon.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .status-text {
      font-size: 13px;
      font-weight: 500;
      color: #171717;
    }

    .save-status {
      font-size: 12px;
      color: #22c55e;
    }

    .save-status.error {
      color: #ef4444;
    }

    .save-status.pending {
      color: #9CA3AF;
    }

    .task-header-actions {
      display: flex;
      gap: 8px;
    }

    /* Prompt display area */
    .prompt-display {
      background: #f8f8f8;
      border: 1px solid #E5E5E5;
      border-radius: 8px;
      padding: 14px;
      font-size: 14px;
      color: #333;
      line-height: 1.5;
      min-height: 100px;
      white-space: pre-wrap;
      overflow-y: auto;
      max-height: 150px;
    }

    /* Footer row */
    .task-footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .toggle-groups {
      display: flex;
      gap: 8px;
    }

    .toggle-group {
      display: flex;
      gap: 2px;
      background: #f0f0f0;
      padding: 3px;
      border-radius: 6px;
    }

    .toggle-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
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

    /* === Compact Card (Pending/Running/Failed) === */
    .task-card-compact {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f8f8f8;
      border-radius: 8px;
    }

    .task-card-compact:hover {
      background: #f0f0f0;
    }

    .task-compact-actions {
      display: flex;
      gap: 8px;
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

    .error-text {
      font-size: 12px;
      color: #ef4444;
    }

    /* Progress bar */
    .progress-bar {
      width: 60px;
      height: 4px;
      background: #E5E5E5;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #171717;
      animation: progress-pulse 1.5s ease-in-out infinite;
    }

    @keyframes progress-pulse {
      0% { width: 20%; }
      50% { width: 80%; }
      100% { width: 20%; }
    }

    /* === Text Buttons === */
    .text-btn {
      padding: 6px 10px;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      background: transparent;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .text-btn:hover {
      background: #f8f8f8;
      color: #171717;
    }

    .remove-btn:hover {
      color: #ef4444;
      border-color: #ef4444;
    }

    .retry-btn {
      border: 1px solid #22c55e;
      color: #22c55e;
    }

    .retry-btn:hover {
      background: #f0fdf4;
    }

    /* Copy button (main action) */
    .copy-btn-main {
      padding: 8px 16px;
      border: 1px solid #171717;
      border-radius: 6px;
      background: #ffffff;
      font-size: 13px;
      font-weight: 500;
      color: #171717;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .copy-btn-main:hover {
      background: #f8f8f8;
    }

    .copy-btn-main.copied {
      background: #22c55e;
      border-color: #22c55e;
      color: #fff;
    }

    /* Footer */
    .panel-footer {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      border-top: 1px solid #E5E5E5;
      gap: 8px;
    }

    .footer-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #171717;
      background: #ffffff;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .footer-btn:hover {
      background: #f8f8f8;
    }

    .footer-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Scrollbar */
    .panel-content::-webkit-scrollbar,
    .prompt-display::-webkit-scrollbar {
      width: 6px;
    }

    .panel-content::-webkit-scrollbar-track,
    .prompt-display::-webkit-scrollbar-track {
      background: transparent;
    }

    .panel-content::-webkit-scrollbar-thumb,
    .prompt-display::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    .panel-content::-webkit-scrollbar-thumb:hover,
    .prompt-display::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}
```

- [ ] **Step 2: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/content/components/BatchProgressPanel.tsx
git commit -m "style: update BatchProgressPanel styles for new TaskCard layout"
```

---

### Task 5: 更新 BatchProgressPanel 组件逻辑

**Files:**
- Modify: `src/content/components/BatchProgressPanel.tsx:1-284`

- [ ] **Step 1: 移除 expandedTaskId 相关逻辑**

修改 BatchProgressPanel 组件，移除 expandedTaskId 相关代码：

```typescript
/**
 * BatchProgressPanel - Multi-task progress panel
 * Shows task list with overall stats and global actions
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { Minimize2, Maximize2, X, Trash2, RefreshCw } from 'lucide-react'
import TaskCard from './TaskCard'
import { useTaskQueueStore } from '@/content/core/task-queue-store'
import { TaskQueueManager } from '@/content/core/task-queue-manager'
import Toast from './Toast'

// Panel dimensions
const EXPANDED_WIDTH = 400
const MINIMIZED_WIDTH = 200

function BatchProgressPanel() {
  const [isMinimized, setIsMinimized] = useState(false)
  // Lazy initialize position to avoid accessing window during SSR/hydration
  const [position, setPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0,
    y: 20
  }))
  const [expandedPosition, setExpandedPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0,
    y: 20
  }))
  const [isDragging, setIsDragging] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const dragOffset = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(position)

  const tasks = useTaskQueueStore(state => state.tasks)
  const isPanelOpen = useTaskQueueStore(state => state.isPanelOpen)
  const setPanelOpen = useTaskQueueStore(state => state.setPanelOpen)
  // Compute stats from tasks using useMemo - only recalculates when tasks array changes
  const stats = useMemo(() => ({
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    success: tasks.filter(t => t.status === 'success').length,
    failed: tasks.filter(t => t.status === 'failed').length
  }), [tasks])

  const queueManager = TaskQueueManager.getInstance()

  /**
   * Handle minimize - adjust position to keep right edge fixed
   */
  const handleMinimize = useCallback(() => {
    setExpandedPosition(position)
    const newLeft = position.x + (EXPANDED_WIDTH - MINIMIZED_WIDTH)
    setPosition({ x: newLeft, y: position.y })
    setIsMinimized(true)
  }, [position])

  /**
   * Handle expand - restore position
   */
  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    setPosition(expandedPosition)
  }, [expandedPosition])

  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    const runningCount = stats.running
    if (runningCount > 0) {
      // Abort all running tasks and clear
      queueManager.clearAll()
    }
    setPanelOpen(false)
  }, [stats.running, queueManager, setPanelOpen])

  /**
   * Handle task removal
   */
  const handleRemoveTask = useCallback((taskId: string) => {
    queueManager.removeTask(taskId)
  }, [queueManager])

  /**
   * Handle task retry
   */
  const handleRetryTask = useCallback((taskId: string) => {
    queueManager.retryTask(taskId)
  }, [queueManager])

  /**
   * Clear all completed tasks
   */
  const handleClearCompleted = useCallback(() => {
    queueManager.clearCompleted()
  }, [queueManager])

  /**
   * Retry all failed tasks
   */
  const handleRetryAllFailed = useCallback(() => {
    const failedCount = stats.failed
    if (failedCount > 0) {
      tasks.filter(t => t.status === 'failed').forEach(t => {
        queueManager.retryTask(t.id)
      })
      setToastMessage(`正在重试 ${failedCount} 个失败任务`)
      setShowToast(true)
    }
  }, [tasks, stats.failed, queueManager])

  /**
   * Drag handlers
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }, [position])

  useEffect(() => {
    // Keep positionRef in sync with position state (for minimize/expand operations)
    positionRef.current = position
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newPosition = {
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      }
      // Update position ref for use in handleMouseUp
      positionRef.current = newPosition
      // Directly update DOM style for smooth drag (avoids React re-render on every mousemove)
      if (panelRef.current) {
        panelRef.current.style.left = `${newPosition.x}px`
        panelRef.current.style.top = `${newPosition.y}px`
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Sync state with final position
      setPosition(positionRef.current)
      // Save expanded position when dragging ends in expanded state
      if (!isMinimized) {
        setExpandedPosition(positionRef.current)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isMinimized])

  /**
   * Handle ESC key to close
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  /**
   * Close toast handler
   */
  const handleCloseToast = useCallback(() => {
    setShowToast(false)
  }, [])

  if (!isPanelOpen) return null

  return (
    <div className="panel-overlay">
      <div
        ref={panelRef}
        className={`panel-card ${isMinimized ? 'minimized' : ''}`}
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
          className="panel-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: 'grab' }}
        >
          <img
            className="panel-logo"
            src={chrome.runtime.getURL('assets/icon-128.png')}
            alt="Oh My Prompt"
          />
          <span className="panel-brand">
            {isMinimized ? `${stats.success}✓ / ${stats.failed}✗ / ${stats.running}⟳` : 'Oh My Prompt'}
          </span>
          <div className="panel-header-actions">
            {isMinimized ? (
              <>
                <button className="header-btn" onClick={handleClose} aria-label="关闭">
                  <X size={14} />
                </button>
                <button className="header-btn" onClick={handleExpand} aria-label="展开">
                  <Maximize2 size={14} />
                </button>
              </>
            ) : (
              <button className="header-btn" onClick={handleMinimize} aria-label="最小化">
                <Minimize2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Stats bar (only when not minimized) */}
        {!isMinimized && (
          <div className="panel-stats">
            <span>进度: {stats.success}成功 / {stats.failed}失败 / {stats.running}进行中</span>
          </div>
        )}

        {/* Task list (only when not minimized) */}
        {!isMinimized && (
          <div className="panel-content">
            {tasks.length === 0 ? (
              <div className="empty-state">暂无任务</div>
            ) : (
              <div className="task-list">
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onRemove={handleRemoveTask}
                    onRetry={handleRetryTask}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer actions (only when not minimized) */}
        {!isMinimized && tasks.length > 0 && (
          <div className="panel-footer">
            <button className="footer-btn" onClick={handleRetryAllFailed} disabled={stats.failed === 0} aria-label="重试所有失败任务">
              <RefreshCw size={14} />
              重试失败
            </button>
            <button className="footer-btn" onClick={handleClearCompleted} disabled={stats.success === 0 && stats.failed === 0} aria-label="清除所有已完成任务">
              <Trash2 size={14} />
              清除已完成
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {showToast && (
        <Toast
          message={toastMessage}
          onClose={handleCloseToast}
        />
      )}
    </div>
  )
}

export default BatchProgressPanel
```

- [ ] **Step 2: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/content/components/BatchProgressPanel.tsx
git commit -m "refactor: remove expandedTaskId logic from BatchProgressPanel"
```

---

### Task 6: 构建验证

**Files:**
- None (verification only)

- [ ] **Step 1: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 2: 构建生产版本**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 3: 本地测试**

1. 运行 `npm run dev`
2. 在 Chrome 中加载扩展 `dist/` 目录
3. 打开 Lovart 网站，点击图片悬浮按钮
4. 验证：
   - 成功任务直接显示完整 Prompt
   - 显示"已保存到临时库"状态
   - 复制按钮在底部，可正常复制
   - 语言/格式切换正常工作
   - 文字按钮样式正确

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: TaskCard UI improvement complete - full prompt display, auto-save, text buttons"
```

---

## 自检清单

**Spec Coverage:**
- ✓ 移除折叠/展开逻辑
- ✓ 成功任务直接展示完整 Prompt
- ✓ 自动保存到临时库
- ✓ 显示"已保存到临时库"状态
- ✓ 复制按钮在底部右对齐
- ✓ 文字按钮替代图标按钮
- ✓ 缩略图 60x60

**Placeholder Scan:** 无 TBD/TODO

**Type Consistency:** 
- QueueTask.savedToTemporary 在 manager 和 store 中一致
- SaveTemporaryPromptPayload 类型已导入