/**
 * TaskQueueManager - Multi-task queue for concurrent prompt conversion
 * Singleton pattern with max 10 tasks, max 5 concurrent
 */

import type { VisionApiResultData, VisionApiErrorPayload } from '@/shared/types'
import { MessageType } from '@/shared/messages'
import { classifyApiError } from '@/lib/vision-api'
import { useTaskQueueStore } from './task-queue-store'
import { generateThumbnail } from '@/lib/image-utils'

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
  private abortControllers: Map<string, AbortController> = new Map()

  static getInstance(): TaskQueueManager {
    if (!TaskQueueManager.instance) {
      TaskQueueManager.instance = new TaskQueueManager()
    }
    return TaskQueueManager.instance
  }

  private constructor() {
    // No initialization needed - service worker handles API config
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

    // Generate thumbnail asynchronously (non-blocking)
    this.generateThumbnailAsync(task.id, imageUrl)

    // Try to start immediately
    this.tryStartNext()

    return task
  }

  /**
   * Generate thumbnail asynchronously and update task
   * Non-blocking - thumbnail appears when ready
   */
  private async generateThumbnailAsync(taskId: string, imageUrl: string): Promise<void> {
    try {
      const thumbnailUrl = await generateThumbnail(imageUrl)
      if (thumbnailUrl) {
        const store = useTaskQueueStore.getState()
        // Only update if task still exists
        const task = store.getTask(taskId)
        if (task) {
          store.updateTask(taskId, { thumbnailUrl })
          console.log(LOG_PREFIX, 'Thumbnail updated for task:', taskId)
        }
      }
    } catch (error) {
      // Thumbnail generation failed, task will show original image
      console.warn(LOG_PREFIX, 'Thumbnail generation failed for task:', taskId, error)
    }
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

        store.updateTask(task.id, {
          status: 'success',
          result: resultData
        })

        console.log(LOG_PREFIX, 'Task success:', task.id)
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

  }