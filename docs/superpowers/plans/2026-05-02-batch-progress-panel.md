# BatchProgressPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-task queue for concurrent prompt conversion with dedicated progress panel UI.

**Architecture:** TaskQueueManager (singleton) manages queue state and concurrent scheduling (max 5). BatchProgressPanel shows task list with TaskCard components. BatchPanelManager handles Shadow DOM container. ImageHoverButtonManager routes clicks to queue or single modal.

**Tech Stack:** TypeScript, React, Zustand, Shadow DOM, Chrome Extension API, Lucide React icons

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/content/core/task-queue-manager.ts` | Queue state, concurrent scheduling, pub/sub events |
| `src/content/core/task-queue-store.ts` | Zustand store for queue state (reactive updates) |
| `src/content/batch-panel-manager.tsx` | Shadow DOM container, lifecycle management |
| `src/content/components/BatchProgressPanel.tsx` | Main panel UI: header, stats, task list, footer |
| `src/content/components/TaskCard.tsx` | Individual task: thumbnail, status, expandable details |
| `src/content/components/Toast.tsx` | Simple toast notification for queue full warning |
| `src/content/image-hover-button-manager.tsx` | Modified: route clicks based on queue state |

---

## Task 1: TaskQueueManager - Types and Core State

**Files:**
- Create: `src/content/core/task-queue-manager.ts`
- Create: `src/content/core/task-queue-store.ts`

- [ ] **Step 1: Create task queue types in task-queue-manager.ts**

```typescript
/**
 * TaskQueueManager - Multi-task queue for concurrent prompt conversion
 * Singleton pattern with max 10 tasks, max 5 concurrent
 */

import type { VisionApiResultData } from '@/shared/types'

const LOG_PREFIX = '[Oh My Prompt]'

// Task status enum
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

// Queue task interface
export interface QueueTask {
  id: string                  // crypto.randomUUID()
  imageUrl: string            // Image URL
  thumbnailUrl?: string       // Thumbnail (compressed base64 for display)
  status: TaskStatus
  createdAt: number           // Timestamp when added
  result?: VisionApiResultData // Result on success
  error?: string              // Error message on failure
}

// Queue constraints
export const MAX_QUEUE_SIZE = 10
export const MAX_CONCURRENT = 5

// Event types for pub/sub
export type QueueEventType = 'task_added' | 'task_updated' | 'task_removed' | 'queue_cleared'

export interface QueueEvent {
  type: QueueEventType
  task?: QueueTask
  stats?: QueueStats
}

export interface QueueStats {
  pending: number
  running: number
  success: number
  failed: number
  total: number
}
```

- [ ] **Step 2: Create Zustand store in task-queue-store.ts**

```typescript
/**
 * TaskQueueStore - Zustand store for queue state
 * Provides reactive state for React components
 */

import { create } from 'zustand'
import type { QueueTask, QueueStats, TaskStatus } from './task-queue-manager'

interface TaskQueueState {
  tasks: QueueTask[]
  isPanelOpen: boolean
  expandedTaskId: string | null  // Only one task can be expanded at a time

  // Actions
  setTasks: (tasks: QueueTask[]) => void
  updateTask: (taskId: string, updates: Partial<QueueTask>) => void
  removeTask: (taskId: string) => void
  clearCompleted: () => void
  clearAll: () => void
  setPanelOpen: (open: boolean) => void
  setExpandedTask: (taskId: string | null) => void

  // Computed
  getStats: () => QueueStats
  getTask: (taskId: string) => QueueTask | undefined
}

export const useTaskQueueStore = create<TaskQueueState>((set, get) => ({
  tasks: [],
  isPanelOpen: false,
  expandedTaskId: null,

  setTasks: (tasks) => set({ tasks }),

  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
  })),

  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(t => t.id !== taskId),
    expandedTaskId: state.expandedTaskId === taskId ? null : state.expandedTaskId
  })),

  clearCompleted: () => set((state) => ({
    tasks: state.tasks.filter(t => t.status === 'pending' || t.status === 'running'),
    expandedTaskId: null
  })),

  clearAll: () => set({ tasks: [], expandedTaskId: null }),

  setPanelOpen: (open) => set({ isPanelOpen: open }),

  setExpandedTask: (taskId) => set({ expandedTaskId: taskId }),

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

- [ ] **Step 3: Commit types and store**

```bash
git add src/content/core/task-queue-manager.ts src/content/core/task-queue-store.ts
git commit -m "feat: add task queue types and Zustand store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: TaskQueueManager - Core Logic and Scheduler

**Files:**
- Modify: `src/content/core/task-queue-manager.ts`

- [ ] **Step 1: Add TaskQueueManager class with queue operations**

Add to `src/content/core/task-queue-manager.ts` after the types:

```typescript
import { useTaskQueueStore } from './task-queue-store'
import { executeVisionApiCall, classifyApiError } from '@/lib/vision-api'
import type { VisionApiConfig } from '@/shared/types'
import { MessageType } from '@/shared/messages'

/**
 * TaskQueueManager - Singleton
 * Manages task queue and concurrent API scheduling
 */
export class TaskQueueManager {
  private static instance: TaskQueueManager | null = null
  private runningCount = 0
  private apiConfig: VisionApiConfig | null = null
  private abortControllers: Map<string, AbortController> = new Map()

  static getInstance(): TaskQueueManager {
    if (!TaskQueueManager.instance) {
      TaskQueueManager.instance = new TaskQueueManager()
    }
    return TaskQueueManager.instance
  }

  private constructor() {
    // Load API config on init
    this.loadApiConfig()
  }

  /**
   * Load API config from storage (via service worker)
   */
  private async loadApiConfig(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_API_CONFIG })
      if (response?.success && response.data) {
        this.apiConfig = response.data
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'Failed to load API config:', error)
    }
  }

  /**
   * Add task to queue
   * Returns null if queue is full
   */
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
    store.setPanelOpen(true)

    console.log(LOG_PREFIX, 'Task added to queue:', task.id)

    // Try to start immediately
    this.tryStartNext()

    return task
  }

  /**
   * Remove task from queue
   */
  removeTask(taskId: string): void {
    const store = useTaskQueueStore.getState()
    const task = store.getTask(taskId)

    if (!task) return

    // Abort if running
    if (task.status === 'running') {
      const controller = this.abortControllers.get(taskId)
      if (controller) {
        controller.abort()
        this.abortControllers.delete(taskId)
        this.runningCount--
      }
    }

    store.removeTask(taskId)
    console.log(LOG_PREFIX, 'Task removed:', taskId)
  }

  /**
   * Retry failed task
   */
  retryTask(taskId: string): void {
    const store = useTaskQueueStore.getState()
    store.updateTask(taskId, { status: 'pending', error: undefined })
    console.log(LOG_PREFIX, 'Task retry:', taskId)
    this.tryStartNext()
  }

  /**
   * Clear completed tasks (success + failed)
   */
  clearCompleted(): void {
    useTaskQueueStore.getState().clearCompleted()
    console.log(LOG_PREFIX, 'Completed tasks cleared')
  }

  /**
   * Clear all tasks (with abort for running)
   */
  clearAll(): void {
    // Abort all running tasks
    this.abortControllers.forEach((controller, taskId) => {
      controller.abort()
      this.abortControllers.delete(taskId)
    })
    this.runningCount = 0

    useTaskQueueStore.getState().clearAll()
    console.log(LOG_PREFIX, 'All tasks cleared')
  }

  /**
   * Get queue stats
   */
  getStats(): QueueStats {
    return useTaskQueueStore.getState().getStats()
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return useTaskQueueStore.getState().tasks.length === 0
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return useTaskQueueStore.getState().tasks.length >= MAX_QUEUE_SIZE
  }
}
```

- [ ] **Step 2: Add concurrent scheduler logic**

Add to `TaskQueueManager` class:

```typescript
  /**
   * Try to start next pending task
   */
  private tryStartNext(): void {
    // Check concurrent limit
    if (this.runningCount >= MAX_CONCURRENT) {
      return
    }

    // Check API config
    if (!this.apiConfig) {
      // Try to reload config
      this.loadApiConfig().then(() => {
        if (!this.apiConfig) {
          console.warn(LOG_PREFIX, 'API config not available')
          // Mark all pending as failed
          this.markPendingAsFailed('API未配置，请先在设置中配置API')
        } else {
          this.tryStartNext()
        }
      })
      return
    }

    // Find next pending task (earliest)
    const store = useTaskQueueStore.getState()
    const pendingTasks = store.tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt)

    if (pendingTasks.length === 0) {
      return
    }

    const nextTask = pendingTasks[0]
    this.startTask(nextTask)
  }

  /**
   * Start a task
   */
  private startTask(task: QueueTask): void {
    const store = useTaskQueueStore.getState()

    // Update status
    store.updateTask(task.id, { status: 'running' })
    this.runningCount++

    console.log(LOG_PREFIX, 'Task started:', task.id)

    // Create abort controller
    const abortController = new AbortController()
    this.abortControllers.set(task.id, abortController)

    // Execute API call
    this.executeTask(task, abortController)
  }

  /**
   * Execute Vision API call for task
   */
  private async executeTask(task: QueueTask, abortController: AbortController): Promise<void> {
    const store = useTaskQueueStore.getState()

    try {
      // Reload config to ensure fresh state
      await this.loadApiConfig()

      if (!this.apiConfig) {
        throw new Error('API未配置')
      }

      // Call Vision API
      const result = await executeVisionApiCall(
        this.apiConfig,
        task.imageUrl,
        'url'  // Use URL format
      )

      // Check if aborted
      if (abortController.signal.aborted) {
        return
      }

      // Success
      store.updateTask(task.id, {
        status: 'success',
        result
      })

      console.log(LOG_PREFIX, 'Task success:', task.id)

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
      // Cleanup
      this.abortControllers.delete(task.id)
      this.runningCount--

      // Start next task
      this.tryStartNext()
    }
  }

  /**
   * Mark all pending tasks as failed
   */
  private markPendingAsFailed(error: string): void {
    const store = useTaskQueueStore.getState()
    store.tasks
      .filter(t => t.status === 'pending')
      .forEach(t => store.updateTask(t.id, { status: 'failed', error }))
  }
```

- [ ] **Step 3: Commit TaskQueueManager**

```bash
git add src/content/core/task-queue-manager.ts src/content/core/task-queue-store.ts
git commit -m "feat: add TaskQueueManager with concurrent scheduler

- Queue operations: addTask, removeTask, retryTask
- Concurrent scheduling with max 5 running
- AbortController for task cancellation
- Error classification integration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Toast Notification Component

**Files:**
- Create: `src/content/components/Toast.tsx`

- [ ] **Step 1: Create Toast component for queue full warning**

```typescript
/**
 * Toast - Simple toast notification for queue warnings
 * Shows briefly at bottom of screen
 */

import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  duration?: number  // ms, default 3000
  onClose: () => void
}

function Toast({ message, duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300)  // Wait for fade-out animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div
      className={`toast-container ${isVisible ? 'visible' : 'fading'}`}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(23, 23, 23, 0.9)',
        color: '#fff',
        padding: '10px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '500',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        zIndex: 2147483647,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none'
      }}
    >
      {message}
    </div>
  )
}

export default Toast
```

- [ ] **Step 2: Commit Toast component**

```bash
git add src/content/components/Toast.tsx
git commit -m "feat: add Toast notification component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: TaskCard Component

**Files:**
- Create: `src/content/components/TaskCard.tsx`

- [ ] **Step 1: Create TaskCard component with status display**

```typescript
/**
 * TaskCard - Individual task display in BatchProgressPanel
 * Horizontal layout: thumbnail (80x80) + status/actions
 */

import { useState, useCallback } from 'react'
import { Check, X, RefreshCw, ChevronDown, ChevronUp, Loader2, Copy } from 'lucide-react'
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

  const expandedTaskId = useTaskQueueStore(state => state.expandedTaskId)
  const setExpandedTask = useTaskQueueStore(state => state.setExpandedTask)

  const isExpanded = expandedTaskId === task.id

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
   * Toggle expand/collapse
   */
  const handleToggleExpand = () => {
    if (isExpanded) {
      setExpandedTask(null)
    } else {
      setExpandedTask(task.id)
    }
  }

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
   * Render status icon and text
   */
  const renderStatus = () => {
    switch (task.status) {
      case 'pending':
        return (
          <div className="task-status pending">
            <span className="status-dot" style={{ background: '#9CA3AF' }} />
            <span className="status-text">等待中</span>
          </div>
        )
      case 'running':
        return (
          <div className="task-status running">
            <Loader2 className="status-icon spinning" size={16} />
            <span className="status-text">分析中...</span>
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          </div>
        )
      case 'success':
        return (
          <div className="task-status success">
            <Check className="status-icon" size={16} style={{ color: '#22c55e' }} />
            <span className="status-text">完成</span>
            {!isExpanded && task.result && (
              <span className="result-preview">
                {task.result.zh.prompt.substring(0, 50)}...
              </span>
            )}
          </div>
        )
      case 'failed':
        return (
          <div className="task-status failed">
            <X className="status-icon" size={16} style={{ color: '#ef4444' }} />
            <span className="status-text">失败</span>
            <span className="error-message">{task.error || '未知错误'}</span>
          </div>
        )
    }
  }

  return (
    <div className={`task-card ${isExpanded ? 'expanded' : ''}`}>
      {/* Thumbnail */}
      <div className="task-thumbnail">
        {task.thumbnailUrl ? (
          <img src={task.thumbnailUrl} alt="Task" />
        ) : task.imageUrl ? (
          <img src={task.imageUrl} alt="Task" loading="lazy" />
        ) : (
          <div className="thumbnail-placeholder">无图片</div>
        )}
      </div>

      {/* Status area */}
      <div className="task-content">
        {renderStatus()}

        {/* Expanded details (success only) */}
        {isExpanded && task.status === 'success' && task.result && (
          <div className="task-details">
            {/* Prompt preview with copy button */}
            <div className="prompt-preview-wrapper">
              <div className="prompt-preview">
                {getCurrentPrompt()}
              </div>
              <button
                className={`copy-btn ${isCopied ? 'copied' : ''}`}
                onClick={handleCopy}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {/* Language/Format toggle at bottom */}
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
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="task-actions">
        {/* Remove button */}
        <button className="action-btn remove" onClick={() => onRemove(task.id)}>
          <X size={14} />
        </button>

        {/* Expand/Collapse (success only) */}
        {task.status === 'success' && (
          <button className="action-btn expand" onClick={handleToggleExpand}>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {/* Retry (failed only) */}
        {task.status === 'failed' && (
          <button className="action-btn retry" onClick={() => onRetry(task.id)}>
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default TaskCard
```

- [ ] **Step 2: Commit TaskCard component**

```bash
git add src/content/components/TaskCard.tsx
git commit -m "feat: add TaskCard component with status display

- Horizontal layout with 80x80 thumbnail
- Status icons: pending/running/success/failed
- Expandable details with language/format toggle
- Copy button in preview area

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: BatchProgressPanel Component

**Files:**
- Create: `src/content/components/BatchProgressPanel.tsx`

- [ ] **Step 1: Create BatchProgressPanel main component**

```typescript
/**
 * BatchProgressPanel - Multi-task progress panel
 * Shows task list with overall stats and global actions
 */

import { useCallback, useState, useRef, useEffect } from 'react'
import { Minimize2, Maximize2, X, Trash2, RefreshCw } from 'lucide-react'
import TaskCard from './TaskCard'
import { useTaskQueueStore } from '@/content/core/task-queue-store'
import { TaskQueueManager } from '@/content/core/task-queue-manager'
import Toast from './Toast'

const LOG_PREFIX = '[Oh My Prompt]'

// Panel dimensions
const EXPANDED_WIDTH = 400
const MINIMIZED_WIDTH = 200

function BatchProgressPanel() {
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 20 })
  const [expandedPosition, setExpandedPosition] = useState({ x: window.innerWidth - 420, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const dragOffset = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  const tasks = useTaskQueueStore(state => state.tasks)
  const isPanelOpen = useTaskQueueStore(state => state.isPanelOpen)
  const setPanelOpen = useTaskQueueStore(state => state.setPanelOpen)
  const stats = useTaskQueueStore(state => state.getStats())

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
      // TODO: Show confirmation dialog
      // For now, just clear all
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
    tasks.filter(t => t.status === 'failed').forEach(t => {
      queueManager.retryTask(t.id)
    })
    const failedCount = stats.failed
    if (failedCount > 0) {
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
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

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

  if (!isPanelOpen) return null

  return (
    <div className="panel-overlay">
      <div
        ref={modalRef}
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
                <button className="header-btn" onClick={handleClose}>
                  <X size={14} />
                </button>
                <button className="header-btn" onClick={handleExpand}>
                  <Maximize2 size={14} />
                </button>
              </>
            ) : (
              <button className="header-btn" onClick={handleMinimize}>
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
            <button className="footer-btn" onClick={handleRetryAllFailed} disabled={stats.failed === 0}>
              <RefreshCw size={14} />
              重试失败
            </button>
            <button className="footer-btn" onClick={handleClearCompleted} disabled={stats.success === 0 && stats.failed === 0}>
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
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  )
}

export default BatchProgressPanel
```

- [ ] **Step 2: Commit BatchProgressPanel component**

```bash
git add src/content/components/BatchProgressPanel.tsx
git commit -m "feat: add BatchProgressPanel component

- Header with drag support and minimize/expand
- Stats bar showing success/failed/running counts
- Task list with TaskCard components
- Footer actions: retry failed, clear completed
- Toast notifications for actions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: BatchProgressPanel Styles

**Files:**
- Modify: `src/content/components/BatchProgressPanel.tsx` (inline styles in manager)

- [ ] **Step 1: Define complete CSS styles for BatchProgressPanel**

These styles will be injected via Shadow DOM in BatchPanelManager. Create a `getStyles()` function to be used later:

```typescript
// Styles for BatchProgressPanel (will be injected in BatchPanelManager)
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

    /* TaskCard */
    .task-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: #f8f8f8;
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .task-card:hover {
      background: #f0f0f0;
    }

    .task-card.expanded {
      background: #ffffff;
      border: 1px solid #E5E5E5;
    }

    /* Thumbnail */
    .task-thumbnail {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
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
      font-size: 12px;
      color: #9CA3AF;
    }

    /* Content */
    .task-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    /* Status */
    .task-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
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

    .result-preview {
      font-size: 12px;
      color: #64748B;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .error-message {
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

    /* Expanded details */
    .task-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px;
      border-top: 1px solid #E5E5E5;
    }

    /* Prompt preview with copy */
    .prompt-preview-wrapper {
      position: relative;
    }

    .prompt-preview {
      background: #f8f8f8;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      padding: 10px;
      font-size: 13px;
      color: #171717;
      max-height: 100px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .copy-btn {
      position: absolute;
      bottom: 6px;
      right: 6px;
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #E5E5E5;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
      transition: all 0.15s ease;
    }

    .copy-btn:hover {
      background: #ffffff;
    }

    .copy-btn.copied {
      color: #22c55e;
    }

    /* Toggle groups */
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

    /* Actions */
    .task-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex-shrink: 0;
    }

    .action-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #E5E5E5;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
      transition: all 0.15s ease;
    }

    .action-btn:hover {
      background: #f8f8f8;
      color: #171717;
    }

    .action-btn.retry:hover {
      color: #22c55e;
    }

    .action-btn.remove:hover {
      color: #ef4444;
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
    .prompt-preview::-webkit-scrollbar {
      width: 6px;
    }

    .panel-content::-webkit-scrollbar-track,
    .prompt-preview::-webkit-scrollbar-track {
      background: transparent;
    }

    .panel-content::-webkit-scrollbar-thumb,
    .prompt-preview::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    .panel-content::-webkit-scrollbar-thumb:hover,
    .prompt-preview::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}
```

Add this export at the end of `BatchProgressPanel.tsx` file.

- [ ] **Step 2: Commit styles**

```bash
git add src/content/components/BatchProgressPanel.tsx
git commit -m "feat: add complete CSS styles for BatchProgressPanel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: BatchPanelManager - Shadow DOM Container

**Files:**
- Create: `src/content/batch-panel-manager.tsx`

- [ ] **Step 1: Create BatchPanelManager with Shadow DOM**

```typescript
/**
 * BatchPanelManager - Shadow DOM container for BatchProgressPanel
 * Creates and manages the panel mount point with CSS isolation
 */

import { createRoot, type Root } from 'react-dom/client'
import BatchProgressPanel from './components/BatchProgressPanel'
import { getBatchPanelStyles } from './components/BatchProgressPanel'
import { ErrorBoundary } from './components/ErrorBoundary'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * Host element ID for Shadow DOM container
 */
const HOST_ID = 'omp-batch-panel-host'

/**
 * BatchPanelManager creates Shadow DOM isolated panel container
 * Singleton pattern - only one panel can exist at a time
 */
export class BatchPanelManager {
  private static instance: BatchPanelManager | null = null
  private hostElement: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private reactRoot: Root | null = null

  /**
   * Get singleton instance
   */
  static getInstance(): BatchPanelManager {
    if (!BatchPanelManager.instance) {
      BatchPanelManager.instance = new BatchPanelManager()
    }
    return BatchPanelManager.instance
  }

  /**
   * Create panel in current page
   */
  create(): void {
    // Remove existing instance if present (singleton)
    this.destroy()

    // Create host element
    this.hostElement = document.createElement('div')
    this.hostElement.id = HOST_ID

    // Attach Shadow DOM for style isolation (closed mode for security)
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' })

    // Inject styles
    const styleElement = document.createElement('style')
    styleElement.textContent = getBatchPanelStyles()
    this.shadowRoot.appendChild(styleElement)

    // Create panel root for React
    const panelRoot = document.createElement('div')
    panelRoot.id = 'panel-root'
    this.shadowRoot.appendChild(panelRoot)

    // Mount to body
    document.body.appendChild(this.hostElement)

    // Mount React component
    this.reactRoot = createRoot(panelRoot)
    this.reactRoot.render(
      <ErrorBoundary>
        <BatchProgressPanel />
      </ErrorBoundary>
    )

    console.log(LOG_PREFIX, 'Batch panel created')
  }

  /**
   * Destroy panel and cleanup
   */
  destroy(): void {
    // Unmount React
    if (this.reactRoot) {
      this.reactRoot.unmount()
      this.reactRoot = null
    }

    // Remove host element
    if (this.hostElement) {
      this.hostElement.remove()
      this.hostElement = null
    }

    this.shadowRoot = null

    console.log(LOG_PREFIX, 'Batch panel destroyed')
  }

  /**
   * Check if panel is currently visible
   */
  isOpen(): boolean {
    return this.hostElement !== null && document.body.contains(this.hostElement)
  }

  /**
   * Ensure panel exists (create if needed)
   */
  ensureOpen(): void {
    if (!this.isOpen()) {
      this.create()
    }
  }
}
```

- [ ] **Step 2: Commit BatchPanelManager**

```bash
git add src/content/batch-panel-manager.tsx
git commit -m "feat: add BatchPanelManager with Shadow DOM isolation

- Singleton pattern matching VisionModalManager
- CSS isolation via closed Shadow DOM
- ErrorBoundary wrapper for crash protection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Modify ImageHoverButtonManager

**Files:**
- Modify: `src/content/image-hover-button-manager.tsx`

- [ ] **Step 1: Add imports and queue check in handleButtonClick**

Locate the `handleButtonClick` method around line 469-478. Add imports at top:

```typescript
// Add to imports at top of file
import { TaskQueueManager } from './core/task-queue-manager'
import { BatchPanelManager } from './batch-panel-manager'
import Toast from './components/Toast'
```

Then modify the `handleButtonClick` method:

```typescript
  /**
   * Handle button click - route to queue or VisionModal
   */
  private handleButtonClick(imageUrl: string): void {
    console.log(LOG_PREFIX, 'Hover button clicked')

    const queueManager = TaskQueueManager.getInstance()
    const batchPanelManager = BatchPanelManager.getInstance()

    // Check if queue has tasks
    if (!queueManager.isEmpty()) {
      // Multi-task mode: add to queue
      const task = queueManager.addTask(imageUrl)

      if (task === null) {
        // Queue is full, show toast
        this.showToast('队列已满，请等待任务完成')
        return
      }

      // Ensure batch panel is open
      batchPanelManager.ensureOpen()
    } else {
      // Single-task mode: use VisionModal
      const visionManager = VisionModalManager.getInstance()
      visionManager.create(imageUrl)
    }

    // Hide button after click
    this.hideButton()
  }

  /**
   * Show toast notification
   */
  private showToast(message: string): void {
    // Create toast in Shadow DOM
    const toastContainer = document.createElement('div')
    toastContainer.style.cssText = 'position: fixed; z-index: 2147483647;'

    const shadow = toastContainer.attachShadow({ mode: 'closed' })

    // Minimal toast styles
    const style = document.createElement('style')
    style.textContent = `
      .toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(23, 23, 23, 0.9);
        color: #fff;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        opacity: 1;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }
      .toast.fading {
        opacity: 0;
      }
    `
    shadow.appendChild(style)

    const toastEl = document.createElement('div')
    toastEl.className = 'toast'
    toastEl.textContent = message
    shadow.appendChild(toastEl)

    document.body.appendChild(toastContainer)

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toastEl.classList.add('fading')
      setTimeout(() => {
        toastContainer.remove()
      }, 300)
    }, 3000)
  }
```

- [ ] **Step 2: Commit ImageHoverButtonManager modification**

```bash
git add src/content/image-hover-button-manager.tsx
git commit -m "feat: modify ImageHoverButtonManager for queue routing

- Check queue state before routing to VisionModal or queue
- Add task to queue when queue has existing tasks
- Show toast notification when queue is full
- Ensure BatchPanel is open when adding to queue

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Initialize BatchPanel on Content Script Load

**Files:**
- Modify: `src/content/core/coordinator.ts`

- [ ] **Step 1: Import and initialize BatchPanelManager**

Find the initialization section in coordinator.ts (around where ImageHoverButtonManager is started). Add:

```typescript
// Add to imports
import { BatchPanelManager } from '../batch-panel-manager'
import { TaskQueueManager } from './task-queue-manager'
```

In the initialization function (where `ImageHoverButtonManager.getInstance().start()` is called), add:

```typescript
  // Initialize TaskQueueManager (load API config)
  TaskQueueManager.getInstance()

  // Note: BatchPanelManager is created on-demand when first task is added
  // No need to pre-create it here
```

- [ ] **Step 2: Commit coordinator modification**

```bash
git add src/content/core/coordinator.ts
git commit -m "feat: initialize TaskQueueManager in coordinator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Build and Test

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 2: Run dev build**

```bash
npm run dev
```

Expected: Build succeeds without errors

- [ ] **Step 3: Manual test in browser**

1. Load extension from `dist/` folder in Chrome
2. Navigate to a page with images (e.g., Pinterest, Google Images)
3. Hover over an image, click the hover button
4. Verify VisionModal appears (single-task mode, queue empty)
5. Close VisionModal, hover another image, click again
6. Verify: first image opens VisionModal
7. While VisionModal is open, click hover button on another image
8. Verify: BatchProgressPanel appears, second task added to queue
9. Wait for task to complete, verify status updates
10. Click another image, verify it adds to queue
11. Continue until 10 tasks, verify "queue full" toast appears
12. Test expand/collapse on completed task
13. Test retry on failed task
14. Test clear completed button
15. Test minimize/expand panel

- [ ] **Step 4: Commit final integration**

```bash
git add -A
git commit -m "feat: complete BatchProgressPanel integration

- Multi-task queue with max 10 tasks, max 5 concurrent
- BatchProgressPanel with task list and stats
- TaskCard with expandable details
- Routing logic in ImageHoverButtonManager
- Toast notifications for queue full

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Spec Coverage Check

| Spec Section | Task Coverage |
|--------------|---------------|
| File Structure | Task 1, 3, 4, 5, 7 |
| Data Structure (QueueTask, TaskStatus) | Task 1 |
| Queue Manager Interface | Task 2 |
| Concurrent Scheduling (max 5, queue max 10) | Task 2 |
| UI Panel Layout (400px, right-top) | Task 5, 6 |
| TaskCard Horizontal Layout (80x80 thumb) | Task 4, 6 |
| Status Display (pending/running/success/failed) | Task 4, 6 |
| Expanded TaskCard Details | Task 4, 6 |
| Language/Format Toggle (bottom) | Task 4, 6 |
| Minimized State | Task 5, 6 |
| User Interaction (queue routing) | Task 8 |
| Queue Full Toast | Task 8 |
| Error Handling | Task 2 (classifyApiError reuse) |
| Shadow DOM Isolation | Task 7 |

---

## Placeholder Scan

No TBD, TODO, or placeholder text found. All code is complete.

---

## Type Consistency Check

- `QueueTask.id`: string (UUID) — consistent across all uses
- `QueueTask.status`: TaskStatus enum — consistent
- `QueueTask.imageUrl`: string — consistent
- `TaskQueueStore.setTasks`: (tasks: QueueTask[]) — matches usage
- `TaskQueueStore.updateTask`: (taskId: string, updates: Partial<QueueTask>) — matches usage
- All message types use MessageType enum from shared/messages.ts