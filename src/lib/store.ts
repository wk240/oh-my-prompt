/**
 * Zustand Store for Prompt Management
 * Provides reactive state for prompts and categories with CRUD operations
 * and storage synchronization via chrome.runtime.sendMessage.
 */

import { create } from 'zustand'
import type { Prompt, Category, StorageSchema } from '../shared/types'
import { MessageType } from '../shared/messages'

interface PromptStore {
  prompts: Prompt[]
  categories: Category[]
  selectedCategoryId: string | null
  isLoading: boolean

  // Actions
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<void>
  setSelectedCategory: (categoryId: string | null) => void

  // Prompt CRUD
  addPrompt: (prompt: Omit<Prompt, 'id'>) => void
  updatePrompt: (id: string, updates: Partial<Prompt>) => void
  deletePrompt: (id: string) => void

  // Category CRUD
  addCategory: (name: string) => void
  deleteCategory: (id: string) => void

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
    console.error('[Lovart Injector] Storage message error:', error)
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
      if (data) {
        set({
          prompts: data.prompts,
          categories: data.categories,
          selectedCategoryId: 'all',
          isLoading: false
        })
      } else {
        // Use default state if no data
        const defaultState = getDefaultState()
        set({
          prompts: defaultState.prompts,
          categories: defaultState.categories,
          selectedCategoryId: 'all',
          isLoading: false
        })
      }
    } catch (error) {
      console.error('[Lovart Injector] Failed to load storage:', error)
      const defaultState = getDefaultState()
      set({
        prompts: defaultState.prompts,
        categories: defaultState.categories,
        selectedCategoryId: 'all',
        isLoading: false
      })
    }
  },

  saveToStorage: async () => {
    const { prompts, categories } = get()
    try {
      await sendStorageMessage(MessageType.SET_STORAGE, {
        prompts,
        categories,
        version: '1.0.0'
      })
    } catch (error) {
      console.error('[Lovart Injector] Failed to save storage:', error)
    }
  },

  setSelectedCategory: (categoryId: string | null) => {
    set({ selectedCategoryId: categoryId })
  },

  // Prompt CRUD
  addPrompt: (prompt: Omit<Prompt, 'id'>) => {
    const newPrompt: Prompt = {
      ...prompt,
      id: generateId()
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

  // Computed getters
  getPromptsByCategory: (categoryId: string) => {
    const { prompts } = get()
    return prompts.filter((prompt) => prompt.categoryId === categoryId)
  },

  getFilteredPrompts: () => {
    const { prompts, selectedCategoryId } = get()
    if (selectedCategoryId === 'all' || selectedCategoryId === null) {
      return prompts
    }
    return prompts.filter((prompt) => prompt.categoryId === selectedCategoryId)
  }
}))