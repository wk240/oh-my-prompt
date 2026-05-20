
/**
 * TaskQueueManager - Multi-task queue for concurrent prompt conversion
 * Singleton pattern with max 10 tasks, max 5 concurrent
 */

import type { VisionApiResultData, VisionApiErrorPayload, SaveTemporaryPromptPayload } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { classifyApiError } from '@/lib/vision-api'
import { useTaskQueueStore } from './task-queue-store'
import { generateThumbnail } from '@/lib/image-utils'

// Console log prefix
const LOG_PREFIX = '[Oh My Prompt TaskQueue]'

/**
 * Generate prompt name from content or title
 */
function generatePromptName(content: string, title?: string): string {
  if (title) return title
  // Use first 30 chars of content as name
  return content.substring(0, 30).replace(/\n/g, ' ').trim() + '...'
}

// Task status enum
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

// Queue task interface
export interface QueueTask {
  id: string                  // crypto.randomUUID()
  imageUrl: string            // Image URL (empty if base64Data provided)
  base64Data?: string         // Base64 data URL (for file:// images that cannot be fetched by service worker)
  thumbnailUrl?: string       // Thumbnail (compressed base64 for display)
  status: TaskStatus
  createdAt: number           // Timestamp when added
  modelName?: string          // Model name being used for analysis (e.g., 'claude-3-5-sonnet-20241022')
  result?: VisionApiResultData // Result on success
  error?: string              // Error message on failure
  errorAction?: 'settings' | 'retry' | 'close' // Error action for UI guidance
  savedToTemporary?: boolean  // Auto-save status
  savedFormat?: 'natural' | 'json' // Format used when saving
  saveError?: string          // Save error message
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
   * @param imageUrl - HTTP URL of the image (empty string if base64Data provided)
   * @param base64Data - Base64 data URL (for file:// images converted by content script)
   */
  addTask(imageUrl: string, base64Data?: string): QueueTask | null {
    const store = useTaskQueueStore.getState()
    const currentTasks = store.tasks

    // Check queue size
    if (currentTasks.length >= MAX_QUEUE_SIZE) {
      return null
    }

    // Create task
    const task: QueueTask = {
      id: crypto.randomUUID(),
      imageUrl,
      base64Data,
      status: 'pending',
      createdAt: Date.now()
    }

    // Add to store
    store.setTasks([...currentTasks, task])


    // Generate thumbnail asynchronously (non-blocking)
    // For base64 data, use it directly as thumbnail
    if (base64Data) {
      store.updateTask(task.id, { thumbnailUrl: base64Data })
    } else {
      this.generateThumbnailAsync(task.id, imageUrl)
    }

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
  }

  /**
   * Retry failed task
   */
  retryTask(taskId: string): void {
    const store = useTaskQueueStore.getState()
    store.updateTask(taskId, { status: 'pending', error: undefined, errorAction: undefined })
    this.tryStartNext()
  }

  /**
   * Clear completed tasks (success + failed)
   */
  clearCompleted(): void {
    useTaskQueueStore.getState().clearCompleted()
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
   * Fetches active config to display model name during analysis
   */
  private async startTask(task: QueueTask): Promise<void> {
    const store = useTaskQueueStore.getState()

    // Fetch active config to get model name (async, non-blocking)
    let modelName: string | undefined
    try {
      const configResponse = await chrome.runtime.sendMessage({ type: MessageType.GET_ACTIVE_CONFIG })
      if (configResponse?.success && configResponse?.data) {
        modelName = configResponse.data.selectedModel
      }
    } catch {
      // Ignore - model name is optional for display
    }

    // Update status and model name
    store.updateTask(task.id, { status: 'running', modelName })
    this.runningCount++

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
      // Call Vision API via service worker
      // Service worker handles image compression and CORS bypass
      // For file:// images, we pass base64Data directly (skip URL validation)
      const response = await chrome.runtime.sendMessage({
        type: MessageType.VISION_API_CALL,
        payload: {
          imageUrl: task.imageUrl,
          base64Data: task.base64Data, // Pass base64 data for file:// images
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


        // Auto-save to temporary library
        await this.autoSaveToTemporary(task.id, resultData, task.imageUrl)
      } else {
        // API returned error - use pre-classified error payload from service worker
        const errorPayload = response.error as VisionApiErrorPayload | undefined
        const errorMessage = errorPayload?.message || 'API 调用失败'
        const errorAction = errorPayload?.action || 'retry'

        store.updateTask(task.id, {
          status: 'failed',
          error: errorMessage,
          errorAction
        })

        console.error(LOG_PREFIX, 'Task failed:', task.id, errorMessage, 'action:', errorAction)
        return // Exit early, no need to go through catch block
      }

    } catch (error) {
      // Check if aborted
      if (abortController.signal.aborted) {
        return
      }

      // Classify error (fallback for network exceptions not handled by service worker)
      const errorPayload = classifyApiError(error, 0)
      store.updateTask(task.id, {
        status: 'failed',
        error: errorPayload.message,
        errorAction: errorPayload.action
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
    const task = store.tasks.find(t => t.id === taskId)

    try {
      // Get current format setting (default: natural)
      const settingsResponse = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
      const format = settingsResponse?.data?.settings?.visionDefaultFormat || 'natural'

      const promptName = generatePromptName(result.zh.prompt, result.zh.title)
      const promptNameEn = generatePromptName(result.en.prompt, result.en.title)

      // Build content based on format
      const content = format === 'json'
        ? JSON.stringify(result.zh_json || result.json_prompt)
        : result.zh.prompt

      const contentEn = format === 'json'
        ? JSON.stringify(result.en_json || result.json_prompt)
        : result.en.prompt

      const savePayload: SaveTemporaryPromptPayload = {
        name: promptName,
        nameEn: promptNameEn,
        content,
        contentEn,
        description: result.zh.analysis,
        descriptionEn: result.en.analysis,
        imageUrl: imageUrl,
        base64Data: task?.base64Data, // Pass base64 data for file:// images (optional)
        styleTags: result.zh_style_tags,
        format // Save format marker
      }

      const saveResponse = await chrome.runtime.sendMessage({
        type: MessageType.SAVE_TEMPORARY_PROMPT,
        payload: savePayload
      })

      if (saveResponse?.success) {
        store.updateTask(taskId, { savedToTemporary: true, savedFormat: format })
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

}
