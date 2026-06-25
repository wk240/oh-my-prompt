import { BaseSyncStrategy } from './base'
import { WEB_APP_URL, SUPABASE_PROJECT_REF } from '@/lib/config'
import { getAuthState, invalidateSyncStatusCache } from '../../cloud-sync/auth-service'
import { FullBackupData, SyncResult, StrategyStatus, SyncResultError } from '../types'

const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasDirectCloudSyncPlan(planType: string, subscriptionStatus?: string): boolean {
  return (planType === 'pro' || planType === 'team') && subscriptionStatus === 'active'
}

/**
 * Get auth token directly from storage (without cache).
 * Used by sync/restore operations that need raw token.
 */
async function getAuthTokenDirect(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(AUTH_STORAGE_KEY)
    const sessionData = result[AUTH_STORAGE_KEY]

    if (!sessionData) {
      return null
    }

    const session = JSON.parse(sessionData)

    if (!session.access_token || !session.expires_at) {
      return null
    }

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
 * Cloud sync strategy implementation.
 * Uses Supabase/Web App API for cloud synchronization.
 *
 * Features:
 * - Auth state shared with auth-service.ts (unified caching)
 * - sync(): POST to /api/sync/upload with auth token
 * - restore(): GET from /api/sync/download
 * - isAvailable(): Check via getAuthState() (shared cache)
 * - getStatus(): Use getAuthState() (shared cache)
 * - Error mapping: 401 → NOT_LOGGED_IN, 403 → PERMISSION_DENIED, etc.
 */
export class CloudSyncStrategy extends BaseSyncStrategy {
  constructor() {
    super('cloud', 'Cloud Sync')
  }

  /**
   * Map HTTP status code to SyncResultError.
   */
  private mapError(status: number, fallbackError?: SyncResultError): SyncResultError {
    switch (status) {
      case 401:
        return 'NOT_LOGGED_IN'
      case 403:
        return 'SUBSCRIPTION_REQUIRED'
      case 400:
        return 'INVALID_DATA'
      default:
        return fallbackError ?? 'SYNC_FAILED'
    }
  }

  /**
   * Check if cloud sync is available.
   * Uses unified auth cache from auth-service.ts.
   *
   * Returns true when the extension has a valid logged-in session.
   * Subscription and entitlement are enforced by the upload API so a failed
   * status preflight cannot silently prevent sync attempts.
   */
  async isAvailable(): Promise<boolean> {
    const authState = await getAuthState()

    return authState.status === 'logged_in'
  }

  /**
   * Upload data to cloud.
   *
   * @param data - Full backup data to sync
   * @returns SyncResult with success status and counts
   */
  async sync(data: FullBackupData): Promise<SyncResult> {
    const token = await getAuthTokenDirect()
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
          imageAssets: data.imageAssets || {},
          pendingImageDeletes: data.pendingImageDeletes || [],
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

      // Invalidate auth-service cache after successful sync (lastSyncTime changed)
      if (result.success) {
        invalidateSyncStatusCache()
      }

      return {
        success: true,
        skipped: result.skipped ?? false,
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
    const token = await getAuthTokenDirect()
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
        imageAssets: isPlainRecord(result.data.imageAssets) ? result.data.imageAssets : {},
        pendingImageDeletes: Array.isArray(result.data.pendingImageDeletes) ? result.data.pendingImageDeletes : [],
        imageMetadataFields: {
          imageAssets: Object.prototype.hasOwnProperty.call(result.data, 'imageAssets'),
          pendingImageDeletes: Object.prototype.hasOwnProperty.call(result.data, 'pendingImageDeletes')
        },
        timestamp: result.data.timestamp || Date.now()
      }
    } catch (error) {
      console.error('[Oh My Prompt] Cloud restore failed:', error)
      return null
    }
  }

  /**
   * Get current sync status from cloud.
   * Uses unified auth cache from auth-service.ts.
   *
   * @returns StrategyStatus with enabled state and last sync time
   */
  async getStatus(): Promise<StrategyStatus> {
    const authState = await getAuthState()

    if (authState.status !== 'logged_in') {
      return { enabled: false }
    }

    const planType = authState.subscription?.planType || 'free'
    const subscriptionStatus = authState.subscription?.status
    const enabled = authState.cloudSyncEnabled ?? hasDirectCloudSyncPlan(planType, subscriptionStatus)

    return enabled
      ? {
          enabled: true,
          lastSyncTime: authState.lastSyncAt
        }
      : {
          enabled: false,
          error: 'SUBSCRIPTION_REQUIRED'
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
    imageAssets?: FullBackupData['imageAssets']
    pendingImageDeletes?: FullBackupData['pendingImageDeletes']
    timestamp: number
  }): Promise<SyncResult> {
    const token = await getAuthTokenDirect()
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
