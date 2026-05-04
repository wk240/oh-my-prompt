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