import { BaseSyncStrategy } from './base'
import { WEB_APP_URL, SUPABASE_PROJECT_REF } from '@/lib/config'
import { FullBackupData, SyncResult, StrategyStatus, SyncResultError } from '../types'

const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

/**
 * Cloud sync strategy implementation.
 * Uses Supabase/Web App API for cloud synchronization.
 *
 * Features:
 * - Auth token stored in chrome.storage.local (Supabase session)
 * - sync(): POST to /api/sync/upload with auth token
 * - restore(): GET from /api/sync/download
 * - isAvailable(): Check auth token + HEAD request to /api/sync/status
 * - getStatus(): GET from /api/sync/status
 * - Error mapping: 401 → NOT_LOGGED_IN, 403 → PERMISSION_DENIED, etc.
 */
export class CloudSyncStrategy extends BaseSyncStrategy {
  constructor() {
    super('cloud', 'Cloud Sync')
  }

  /**
   * Get stored auth session from chrome.storage.local.
   * Returns null if no session or session expired.
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(AUTH_STORAGE_KEY)
      const sessionData = result[AUTH_STORAGE_KEY]

      if (!sessionData) {
        return null
      }

      // Parse session JSON
      const session = JSON.parse(sessionData)

      // Check if token exists and not expired
      if (!session.access_token || !session.expires_at) {
        return null
      }

      // Check expiration (expires_at is Unix timestamp in seconds)
      const now = Math.floor(Date.now() / 1000)
      if (session.expires_at < now) {
        return null
      }

      return session.access_token
    } catch (error) {
      console.error('[Oh My Prompt] Failed to get auth token:', error)
      return null
    }
  }

  /**
   * Map HTTP status code to SyncResultError.
   */
  private mapError(status: number, fallbackError?: SyncResultError): SyncResultError {
    switch (status) {
      case 401:
        return 'NOT_LOGGED_IN'
      case 403:
        return 'PERMISSION_DENIED'
      case 400:
        return 'INVALID_DATA'
      default:
        return fallbackError ?? 'SYNC_FAILED'
    }
  }

  /**
   * Check if cloud sync is available.
   * Returns true only if:
   * 1. Auth token exists and not expired
   * 2. API endpoint is reachable
   */
  async isAvailable(): Promise<boolean> {
    const token = await this.getAuthToken()
    if (!token) {
      return false
    }

    try {
      // Check API availability with HEAD request or status endpoint
      const response = await fetch(`${WEB_APP_URL}/api/sync/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      return response.ok
    } catch (error) {
      console.error('[Oh My Prompt] Cloud sync availability check failed:', error)
      return false
    }
  }

  /**
   * Upload data to cloud.
   *
   * @param data - Full backup data to sync
   * @returns SyncResult with success status and counts
   */
  async sync(data: FullBackupData): Promise<SyncResult> {
    const token = await this.getAuthToken()
    if (!token) {
      return { success: false, error: 'NOT_LOGGED_IN' }
    }

    try {
      const response = await fetch(`${WEB_APP_URL}/api/sync/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompts: data.prompts,
          categories: data.categories,
          temporaryPrompts: data.temporaryPrompts,
          timestamp: data.timestamp
        })
      })

      if (!response.ok) {
        return {
          success: false,
          error: this.mapError(response.status)
        }
      }

      const result = await response.json()

      return {
        success: true,
        syncedAt: result.timestamp || data.timestamp,
        promptsCount: data.prompts.length,
        categoriesCount: data.categories.length,
        temporaryPromptsCount: data.temporaryPrompts.length
      }
    } catch (error) {
      console.error('[Oh My Prompt] Cloud sync failed:', error)
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  /**
   * Restore data from cloud.
   *
   * @returns FullBackupData from cloud, or null if not available
   */
  async restore(): Promise<FullBackupData | null> {
    const token = await this.getAuthToken()
    if (!token) {
      return null
    }

    try {
      const response = await fetch(`${WEB_APP_URL}/api/sync/download`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        console.error('[Oh My Prompt] Cloud restore failed:', response.status)
        return null
      }

      const result = await response.json()

      if (!result.success || !result.data) {
        return null
      }

      return {
        prompts: result.data.prompts || [],
        categories: result.data.categories || [],
        temporaryPrompts: result.data.temporaryPrompts || [],
        timestamp: result.data.timestamp || Date.now()
      }
    } catch (error) {
      console.error('[Oh My Prompt] Cloud restore failed:', error)
      return null
    }
  }

  /**
   * Get current sync status from cloud.
   *
   * @returns StrategyStatus with enabled state and last sync time
   */
  async getStatus(): Promise<StrategyStatus> {
    const token = await this.getAuthToken()
    if (!token) {
      return { enabled: false }
    }

    try {
      const response = await fetch(`${WEB_APP_URL}/api/sync/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        return {
          enabled: false,
          error: this.mapError(response.status)
        }
      }

      const statusData = await response.json()

      return {
        enabled: true,
        lastSyncTime: statusData.lastSyncedAt
      }
    } catch (error) {
      console.error('[Oh My Prompt] Cloud status check failed:', error)
      return {
        enabled: false,
        error: 'NETWORK_ERROR'
      }
    }
  }

  /**
   * Upload only specific items to cloud.
   * Used for syncing local-only data that wasn't previously uploaded.
   *
   * @param data - Partial data with items to upload
   * @returns SyncResult with success status
   */
  async uploadPartial(data: {
    prompts?: FullBackupData['prompts']
    categories?: FullBackupData['categories']
    temporaryPrompts?: FullBackupData['temporaryPrompts']
    timestamp: number
  }): Promise<SyncResult> {
    const token = await this.getAuthToken()
    if (!token) {
      return { success: false, error: 'NOT_LOGGED_IN' }
    }

    try {
      const response = await fetch(`${WEB_APP_URL}/api/sync/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        return {
          success: false,
          error: this.mapError(response.status)
        }
      }

      const result = await response.json()

      return {
        success: true,
        syncedAt: result.timestamp || data.timestamp,
        promptsCount: data.prompts?.length || 0,
        categoriesCount: data.categories?.length || 0,
        temporaryPromptsCount: data.temporaryPrompts?.length || 0
      }
    } catch (error) {
      console.error('[Oh My Prompt] Cloud partial upload failed:', error)
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }
}