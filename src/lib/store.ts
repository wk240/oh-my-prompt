/**
 * Zustand Store for Prompt Management
 * Provides reactive state for prompts and categories with CRUD operations
 * and storage synchronization via chrome.runtime.sendMessage.
 */

import { create } from 'zustand'
import type { Prompt, Category, StorageSchema } from '../shared/types'
import { MessageType } from '../shared/messages'
import { sortPromptsByOrder } from '../shared/utils'

interface PromptStore {
  prompts: Prompt[]
  categories: Category[]
  selectedCategoryId: string | null
  isLoading: boolean

  // Actions
  loadFromStorage: () => Promise<{ success: boolean; error?: string }>
  saveToStorage: () => Promise<{ success: boolean; syncSuccess?: boolean; error?: string }>
  setSelectedCategory: (categoryId: string | null) => void

  // Prompt CRUD
  addPrompt: (prompt: Omit<Prompt, 'id'>) => Promise<{ syncSuccess?: boolean }>
  updatePrompt: (id: string, updates: Partial<Prompt>) => void
  deletePrompt: (id: string) => void

  // Category CRUD
  addCategory: (name: string) => void
  updateCategory: (id: string, name: string) => void
  deleteCategory: (id: string) => void

  // Reorder
  reorderCategories: (newOrder: string[]) => void
  reorderPrompts: (categoryId: string, newOrder: string[]) => void
  reorderAllPrompts: (newOrder: string[]) => void

  // Computed getters
  getPromptsByCategory: (categoryId: string) => Prompt[]
  getFilteredPrompts: () => Prompt[]

  // Flush pending debounced save (for beforeunload)
  flushSave: () => Promise<{ success: boolean; syncSuccess?: boolean; error?: string }>
}

/**
 * Debounce state for storage operations
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let pendingSaveResolve: ((value: { success: boolean; syncSuccess?: boolean; error?: string }) => void) | null = null

/**
 * Debounced save to storage - batches rapid state changes
 * @param getState - Function to get current state for building storage schema
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @returns Promise that resolves when the save completes
 */
function debouncedSaveToStorage(
  getState: () => { prompts: Prompt[]; categories: Category[] },
  delay: number = 300
): Promise<{ success: boolean; syncSuccess?: boolean; error?: string }> {
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }

  // Resolve previous pending promise if exists (will be superseded by new promise)
  // The data will still be saved by the new promise, so old caller gets success
  if (pendingSaveResolve) {
    pendingSaveResolve({ success: true })
    pendingSaveResolve = null
  }

  // Create new promise that resolves when save completes
  return new Promise((resolve) => {
    pendingSaveResolve = resolve
    saveTimeout = setTimeout(async () => {
      saveTimeout = null
      try {
        const { prompts, categories } = getState()
        const version = chrome.runtime.getManifest().version
        const response = await chrome.runtime.sendMessage({
          type: MessageType.SET_STORAGE,
          payload: {
            version,
            userData: { prompts, categories }
          } as StorageSchema
        })

        if (!response?.success) {
          throw new Error(response?.error || 'Storage operation failed')
        }

        const result = { success: true, syncSuccess: response.data?.syncSuccess }
        if (pendingSaveResolve) {
          pendingSaveResolve(result)
          pendingSaveResolve = null
        }
      } catch (error) {
        console.error('[Oh My Prompt] Debounced save failed:', error)
        const result = { success: false, error: '数据保存失败，请检查存储配额' }
        if (pendingSaveResolve) {
          pendingSaveResolve(result)
          pendingSaveResolve = null
        }
      }
    }, delay)
  })
}

/**
 * Flush pending debounced save immediately
 * Used before popup closes to ensure data is saved
 */
async function flushPendingSave(
  getState: () => { prompts: Prompt[]; categories: Category[] }
): Promise<{ success: boolean; syncSuccess?: boolean; error?: string }> {
  // Clear the timeout if there's a pending save
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }

  // If there's a pending promise, execute the save immediately
  if (pendingSaveResolve) {
    try {
      const { prompts, categories } = getState()
      const version = chrome.runtime.getManifest().version
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_STORAGE,
        payload: {
          version,
          userData: { prompts, categories }
        } as StorageSchema
      })

      if (!response?.success) {
        throw new Error(response?.error || 'Storage operation failed')
      }

      const result = { success: true, syncSuccess: response.data?.syncSuccess }
      pendingSaveResolve(result)
      pendingSaveResolve = null
      return result
    } catch (error) {
      console.error('[Oh My Prompt] Flush save failed:', error)
      const result = { success: false, error: '数据保存失败，请检查存储配额' }
      if (pendingSaveResolve) {
        pendingSaveResolve(result)
        pendingSaveResolve = null
      }
      return result
    }
  }

  // No pending save
  return { success: true }
}

/**
 * Send message to service worker for storage operations
 */
async function sendStorageMessage(
  type: MessageType.GET_STORAGE | MessageType.SET_STORAGE,
  payload?: StorageSchema
): Promise<StorageSchema | undefined> {
  try {
    const response = await chrome.runtime.sendMessage({
      type,
      payload
    })

    if (!response?.success) {
      throw new Error(response?.error || 'Storage operation failed')
    }

    return response.data
  } catch (error) {
    console.error('[Oh My Prompt] Storage message error:', error)
    throw error
  }
}

/**
 * Generate unique ID using crypto.randomUUID()
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Get default initial state
 */
function getDefaultState(): { prompts: Prompt[]; categories: Category[]; selectedCategoryId: string | null } {
  return {
    prompts: [],
    categories: [],
    selectedCategoryId: 'all'
  }
}

/**
 * Migrate prompts without order field
 * Assigns order based on current array position within each category
 */
function migratePromptOrders(prompts: Prompt[]): Prompt[] {
  const needsMigration = prompts.some(p => p.order === undefined || p.order === null)
  if (!needsMigration) return prompts

  // Group by category and assign order
  const categoryMap = new Map<string, Prompt[]>()
  prompts.forEach(p => {
    const list = categoryMap.get(p.categoryId) || []
    list.push(p)
    categoryMap.set(p.categoryId, list)
  })

  // Assign order values
  const migrated: Prompt[] = []
  categoryMap.forEach((categoryPrompts) => {
    categoryPrompts.forEach((p, index) => {
      migrated.push({
        ...p,
        order: p.order ?? index
      })
    })
  })

  console.log('[Oh My Prompt] Migrated prompt order field for', migrated.length, 'prompts')
  return migrated
}

export const usePromptStore = create<PromptStore>((set, get) => ({
  // Initial state
  prompts: [],
  categories: [],
  selectedCategoryId: 'all',
  isLoading: true,

  // Actions
  loadFromStorage: async () => {
    set({ isLoading: true })
    try {
      const data = await sendStorageMessage(MessageType.GET_STORAGE)
      if (data && data.userData) {
        // Warn for large datasets
        if (data.userData.prompts.length > 500) {
          console.warn('[Oh My Prompt] Large dataset loaded:', data.userData.prompts.length, 'prompts')
        }

        // Migrate prompts without order field
        const migratedPrompts = migratePromptOrders(data.userData.prompts)

        set({
          prompts: migratedPrompts,
          categories: data.userData.categories,
          selectedCategoryId: 'all',
          isLoading: false
        })

        // Save migrated data if migration happened
        if (migratedPrompts !== data.userData.prompts) {
          get().saveToStorage()
        }

        return { success: true }
      } else {
        // Use default state if no data or missing userData
        const defaultState = getDefaultState()
        set({
          prompts: defaultState.prompts,
          categories: defaultState.categories,
          selectedCategoryId: 'all',
          isLoading: false
        })
        return { success: true }
      }
    } catch (error) {
      console.error('[Oh My Prompt] Failed to load storage:', error)
      const defaultState = getDefaultState()
      set({
        prompts: defaultState.prompts,
        categories: defaultState.categories,
        selectedCategoryId: 'all',
        isLoading: false
      })
      return { success: false, error: '数据加载失败，请检查存储权限' }
    }
  },

  saveToStorage: async () => {
    const { prompts, categories } = get()
    try {
      const version = chrome.runtime.getManifest().version
      // Send data to service worker - sync is handled by service worker
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_STORAGE,
        payload: {
          version,
          userData: { prompts, categories }
        } as StorageSchema
      })

      if (!response?.success) {
        throw new Error(response?.error || 'Storage operation failed')
      }

      // Return sync status from service worker response
      return { success: true, syncSuccess: response.data?.syncSuccess }
    } catch (error) {
      console.error('[Oh My Prompt] Failed to save storage:', error)
      return { success: false, error: '数据保存失败，请检查存储配额' }
    }
  },

  setSelectedCategory: (categoryId: string | null) => {
    set({ selectedCategoryId: categoryId })
  },

  // Prompt CRUD
  addPrompt: async (prompt: Omit<Prompt, 'id'>) => {
    const { prompts } = get()
    // Find max order in the same category
    const categoryPrompts = prompts.filter(p => p.categoryId === prompt.categoryId)
    const maxOrder = categoryPrompts.length > 0
      ? Math.max(...categoryPrompts.map(p => p.order))
      : -1

    const newPrompt: Prompt = {
      ...prompt,
      id: generateId(),
      order: maxOrder + 1
    }
    set((state) => ({
      prompts: [...state.prompts, newPrompt]
    }))
    // Wait for save to complete and return sync status
    const result = await get().saveToStorage()
    return { syncSuccess: result.syncSuccess }
  },

  updatePrompt: (id: string, updates: Partial<Prompt>) => {
    set((state) => ({
      prompts: state.prompts.map((prompt) =>
        prompt.id === id ? { ...prompt, ...updates } : prompt
      )
    }))
    // Debounced save - batches rapid updates
    debouncedSaveToStorage(get)
  },

  deletePrompt: (id: string) => {
    set((state) => ({
      prompts: state.prompts.filter((prompt) => prompt.id !== id)
    }))
    // Debounced save - batches rapid deletions
    debouncedSaveToStorage(get)
  },

  // Category CRUD
  addCategory: (name: string) => {
    const { categories } = get()
    const newCategory: Category = {
      id: generateId(),
      name,
      order: categories.length
    }
    set((state) => ({
      categories: [...state.categories, newCategory]
    }))
    // Immediate save - user explicitly adding new category
    get().saveToStorage()
  },

  updateCategory: (id: string, name: string) => {
    set((state) => ({
      categories: state.categories.map((cat) =>
        cat.id === id ? { ...cat, name } : cat
      )
    }))
    // Debounced save - batches rapid updates
    debouncedSaveToStorage(get)
  },

  deleteCategory: (id: string) => {
    set((state) => {
      // Remove category from list
      const updatedCategories = state.categories.filter((cat) => cat.id !== id)

      // Delete prompts that belong to this category
      const updatedPrompts = state.prompts.filter((prompt) => prompt.categoryId !== id)

      return {
        categories: updatedCategories,
        prompts: updatedPrompts,
        // If deleted category was selected, switch to 'all'
        selectedCategoryId: state.selectedCategoryId === id ? 'all' : state.selectedCategoryId
      }
    })
    // Debounced save - batches rapid deletions
    debouncedSaveToStorage(get)
  },

  // Reorder categories
  reorderCategories: (newOrder: string[]) => {
    set((state) => {
      const updatedCategories = state.categories.map((cat) => ({
        ...cat,
        order: newOrder.indexOf(cat.id)
      }))
      return { categories: updatedCategories }
    })
    // Debounced save - batches rapid reorder during drag
    debouncedSaveToStorage(get)
  },

  // Reorder prompts within a category
  reorderPrompts: (categoryId: string, newOrder: string[]) => {
    set((state) => {
      const updatedPrompts = state.prompts.map((prompt) => {
        if (prompt.categoryId === categoryId) {
          return {
            ...prompt,
            order: newOrder.indexOf(prompt.id)
          }
        }
        return prompt
      })
      return { prompts: updatedPrompts }
    })
    // Debounced save - batches rapid reorder during drag
    debouncedSaveToStorage(get)
  },

  // Reorder all prompts globally
  reorderAllPrompts: (newOrder: string[]) => {
    set((state) => {
      const updatedPrompts = state.prompts.map((prompt) => {
        const newIndex = newOrder.indexOf(prompt.id)
        if (newIndex !== -1) {
          return {
            ...prompt,
            order: newIndex
          }
        }
        return prompt
      })
      return { prompts: updatedPrompts }
    })
    // Debounced save - batches rapid reorder during drag
    debouncedSaveToStorage(get)
  },

  // Computed getters
  getPromptsByCategory: (categoryId: string) => {
    const { prompts } = get()
    const categoryPrompts = prompts.filter((prompt) => prompt.categoryId === categoryId)
    return sortPromptsByOrder(categoryPrompts)
  },

  getFilteredPrompts: () => {
    const { prompts, selectedCategoryId } = get()
    if (selectedCategoryId === 'all' || selectedCategoryId === null) {
      return prompts
    }
    const categoryPrompts = prompts.filter((prompt) => prompt.categoryId === selectedCategoryId)
    return sortPromptsByOrder(categoryPrompts)
  },

  // Flush pending debounced save (for beforeunload)
  flushSave: async () => {
    return flushPendingSave(get)
  }
}))

// Setup beforeunload handler to flush pending saves when popup closes
// Guard against duplicate listener registration
let beforeUnloadHandlerRegistered = false
if (typeof window !== 'undefined' && !beforeUnloadHandlerRegistered) {
  beforeUnloadHandlerRegistered = true
  window.addEventListener('beforeunload', () => {
    // Clear any pending timeout and send message immediately
    // beforeunload doesn't wait for async operations, so send synchronously
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    const state = usePromptStore.getState()
    const version = chrome.runtime.getManifest().version
    // Send message without awaiting - will be queued even if popup closes
    chrome.runtime.sendMessage({
      type: MessageType.SET_STORAGE,
      payload: {
        version,
        userData: { prompts: state.prompts, categories: state.categories }
      }
    })
  })
}