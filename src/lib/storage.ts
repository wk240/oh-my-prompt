/**
 * Storage Manager
 * Handles all chrome.storage.local operations with proper TypeScript types,
 * error handling, and migration integration.
 */

import type { StorageSchema, UserData, SyncSettings } from '../shared/types'
import { STORAGE_KEY } from '../shared/constants'
import { BUILT_IN_CATEGORIES, BUILT_IN_PROMPTS } from '../data/built-in-data'
import { migrate, isLegacyFormat } from './migrations/index'
// Import register to ensure migrations are registered before any migrate() calls
import './migrations/register'

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
   * Get current extension version from manifest
   */
  getCurrentVersion(): string {
    return chrome.runtime.getManifest().version
  }

  /**
   * Returns default user data structure for first-time users
   * Includes built-in prompts and categories for immediate use
   */
  getDefaultUserData(): UserData {
    return {
      prompts: [...BUILT_IN_PROMPTS],
      categories: [...BUILT_IN_CATEGORIES]
    }
  }

  /**
   * Returns default settings structure
   */
  getDefaultSettings(): SyncSettings {
    return {
      showBuiltin: true,
      syncEnabled: false
    }
  }

  /**
   * Returns full default storage schema
   */
  getDefaultData(): StorageSchema {
    return {
      version: this.getCurrentVersion(),
      userData: this.getDefaultUserData(),
      settings: this.getDefaultSettings(),
      _migrationComplete: true
    }
  }

  /**
   * Initialize storage with default data (first install)
   */
  async initializeStorage(): Promise<StorageSchema> {
    const defaultData = this.getDefaultData()
    await this.saveData(defaultData)
    console.log('[Oh My Prompt Script] Initialized storage with default data')
    return defaultData
  }

  /**
   * Retrieves full storage data with migration handling
   * Handles: empty storage, legacy format, version mismatches
   *
   * Three mutually exclusive cases:
   * 1. No data → initialize (first install)
   * 2. Legacy format → migrate
   * 3. New format → validate and update version if needed
   */
  async getData(): Promise<StorageSchema> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      const data = result[STORAGE_KEY]

      // Case 1: No data - first install
      if (!data) {
        return await this.initializeStorage()
      }

      // Case 2: Legacy format - needs migration
      if (isLegacyFormat(data)) {
        console.log('[Oh My Prompt Script] Detected legacy format, migrating...')
        const migrated = await migrate(data, this.getCurrentVersion())
        await this.saveData(migrated)
        return migrated
      }

      // Case 3: New format - validate and handle version
      const schema = data as StorageSchema
      const currentVersion = this.getCurrentVersion()

      // Validate that schema has required fields
      if (!schema.userData || !schema.settings) {
        console.warn('[Oh My Prompt Script] Malformed storage data (missing fields), reinitializing...')
        return await this.initializeStorage()
      }

      // Update version if mismatch (no full migration needed for new format)
      if (schema.version !== currentVersion) {
        console.log('[Oh My Prompt Script] Version mismatch, updating version...')
        schema.version = currentVersion
        schema._migrationComplete = true
        await this.saveData(schema)
      }

      return schema
    } catch (error: unknown) {
      console.error('[Oh My Prompt Script] Failed to get storage data:', error)
      // CRITICAL: Return defaults WITHOUT persisting - data loss risk on transient error
      // This fallback ensures UI can render, but user's data may be lost
      // If error persists, user should check storage or reinstall extension
      console.warn('[Oh My Prompt Script] Returning default data without persisting - potential data loss')
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
   * Update settings with partial updates
   */
  async updateSettings(updates: Partial<SyncSettings>): Promise<void> {
    const data = await this.getData()
    data.settings = { ...data.settings, ...updates }
    await this.saveData(data)
  }

  /**
   * Update full userData (prompts and categories)
   */
  async updateUserData(userData: UserData): Promise<void> {
    const data = await this.getData()
    data.userData = userData
    await this.saveData(data)
  }

  /**
   * Get user data (prompts and categories)
   */
  async getUserData(): Promise<UserData> {
    const data = await this.getData()
    return data.userData
  }

  /**
   * Get settings
   */
  async getSettings(): Promise<SyncSettings> {
    const data = await this.getData()
    return data.settings
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