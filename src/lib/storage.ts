/**
 * Storage Manager
 * Handles all chrome.storage.local operations with proper TypeScript types,
 * error handling, and default data initialization.
 */

import type { Prompt, Category, StorageSchema } from '../shared/types'
import { STORAGE_KEY } from '../shared/constants'
import { BUILT_IN_CATEGORIES, BUILT_IN_PROMPTS } from '../data/built-in-data'

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
   * Includes built-in prompts and categories for immediate use
   */
  getDefaultData(): StorageSchema {
    return {
      version: '1.0.0',
      categories: [...BUILT_IN_CATEGORIES],
      prompts: [...BUILT_IN_PROMPTS],
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
      console.error('[Oh My Prompt Script] Failed to get storage data:', error)
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
      console.error('[Oh My Prompt Script] Failed to save storage data:', error)
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

/**
 * Chrome storage.local quota constants
 */
const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 // 10MB = 10,485,760 bytes

/**
 * Check current storage usage and quota status
 * Returns usage statistics with percentage calculation
 */
export async function checkStorageQuota(): Promise<{
  usedBytes: number
  quotaBytes: number
  percentage: number
}> {
  try {
    const usedBytes = await chrome.storage.local.getBytesInUse(STORAGE_KEY)
    const percentage = Math.round((usedBytes / STORAGE_QUOTA_BYTES) * 100)

    // Log warning if usage exceeds 80%
    if (percentage > 80) {
      console.warn(`[Oh My Prompt Script] Storage usage warning: ${percentage}%`)
    }

    return {
      usedBytes,
      quotaBytes: STORAGE_QUOTA_BYTES,
      percentage
    }
  } catch (error: unknown) {
    console.error('[Oh My Prompt Script] Failed to check storage quota:', error)
    return {
      usedBytes: 0,
      quotaBytes: STORAGE_QUOTA_BYTES,
      percentage: 0
    }
  }
}