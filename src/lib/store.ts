/**
 * Zustand Store for Prompt Management
 * Provides reactive state for prompts and categories with CRUD operations
 * and storage synchronization via chrome.runtime.sendMessage.
 */

import { create } from 'zustand'
import type { Prompt, Category, StorageSchema } from '../shared/types'
import { MessageType } from '../shared/messages'
import { sortPromptsByOrder } from '../shared/utils'
import { triggerSync } from './sync/sync-manager'

interface PromptStore {
  prompts: Prompt[]
  categories: Category[]
  selectedCategoryId: string | null
  isLoading: boolean

  // Actions
  loadFromStorage: () => Promise<{ success: boolean; error?: string }>
  saveToStorage: () => Promise<{ success: boolean; error?: string }>
  setSelectedCategory: (categoryId: string | null) => void

  // Prompt CRUD
  addPrompt: (prompt: Omit<Prompt, 'id'>) => void
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
      // Only send version and userData - service-worker merges with existing settings
      await sendStorageMessage(MessageType.SET_STORAGE, {
        version,
        userData: { prompts, categories }
      } as StorageSchema)

      // Trigger sync after save (non-blocking)
      triggerSync({ prompts, categories }).catch(err => {
        console.warn('[Oh My Prompt] Sync trigger failed:', err)
      })

      return { success: true }
    } catch (error) {
      console.error('[Oh My Prompt] Failed to save storage:', error)
      return { success: false, error: '数据保存失败，请检查存储配额' }
    }
  },

  setSelectedCategory: (categoryId: string | null) => {
    set({ selectedCategoryId: categoryId })
  },

  // Prompt CRUD
  addPrompt: (prompt: Omit<Prompt, 'id'>) => {
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
    get().saveToStorage()
  },

  updatePrompt: (id: string, updates: Partial<Prompt>) => {
    set((state) => ({
      prompts: state.prompts.map((prompt) =>
        prompt.id === id ? { ...prompt, ...updates } : prompt
      )
    }))
    get().saveToStorage()
  },

  deletePrompt: (id: string) => {
    set((state) => ({
      prompts: state.prompts.filter((prompt) => prompt.id !== id)
    }))
    get().saveToStorage()
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
    get().saveToStorage()
  },

  updateCategory: (id: string, name: string) => {
    set((state) => ({
      categories: state.categories.map((cat) =>
        cat.id === id ? { ...cat, name } : cat
      )
    }))
    get().saveToStorage()
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
    get().saveToStorage()
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
    // Immediate save (popup may close before debounced timer fires)
    get().saveToStorage()
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
    // Immediate save (popup may close before debounced timer fires)
    get().saveToStorage()
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
    // Immediate save (popup may close before debounced timer fires)
    get().saveToStorage()
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
  }
}))