/**
 * TaskQueueManager - Multi-task queue for concurrent prompt conversion
 * Singleton pattern with max 10 tasks, max 5 concurrent
 */

import type { VisionApiResultData, VisionApiConfig } from '@/shared/types'
import { MessageType } from '@/shared/messages'
import { executeVisionApiCall, classifyApiError } from '@/lib/vision-api'
import { useTaskQueueStore } from './task-queue-store'

// Console log prefix
const LOG_PREFIX = '[Oh My Prompt TaskQueue]'

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
}