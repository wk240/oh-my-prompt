/**
 * Storage Manager
 * Handles all chrome.storage.local operations with proper TypeScript types,
 * error handling, and default data initialization.
 */

import type { Prompt, Category, StorageSchema } from '../shared/types'
import { STORAGE_KEY, DEFAULT_CATEGORY_NAME } from '../shared/constants'

/**
 * StorageManager class for managing extension data persistence
 */
export class StorageManager {
  private static instance: StorageManager

  /**
   * Get singleton instance of StorageManager
   */
  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  /**
   * Returns default data structure for first-time users
   */
  getDefaultData(): StorageSchema {
    return {
      version: '1.0.0',
      categories: [
        {
          id: 'default',
          name: DEFAULT_CATEGORY_NAME,
          order: 0,
        },
      ],
      prompts: [],
    }
  }

  /**
   * Retrieves full storage data
   * Returns default data if storage is empty or on error
   */
  async getData(): Promise<StorageSchema> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      const data = result[STORAGE_KEY] as StorageSchema | undefined

      if (!data) {
        // Initialize with default data if storage is empty
        const defaultData = this.getDefaultData()
        await this.saveData(defaultData)
        return defaultData
      }

      return data
    } catch (error: unknown) {
      console.error('[Lovart Injector] Failed to get storage data:', error)
      return this.getDefaultData()
    }
  }

  /**
   * Saves full storage data
   */
  async saveData(data: StorageSchema): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: data })
    } catch (error: unknown) {
      console.error('[Lovart Injector] Failed to save storage data:', error)
      throw error
    }
  }

  /**
   * Retrieves prompts array
   */
  async getPrompts(): Promise<Prompt[]> {
    const data = await this.getData()
    return data.prompts
  }

  /**
   * Retrieves categories array
   */
  async getCategories(): Promise<Category[]> {
    const data = await this.getData()
    return data.categories
  }
}

// Export singleton instance for convenience
export const storageManager = StorageManager.getInstance()