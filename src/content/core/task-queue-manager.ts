/**
 * TaskQueueManager - Multi-task queue for concurrent prompt conversion
 * Singleton pattern with max 10 tasks, max 5 concurrent
 */

import type { VisionApiResultData } from '@/shared/types'

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