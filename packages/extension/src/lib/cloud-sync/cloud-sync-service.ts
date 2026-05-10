// packages/extension/src/lib/cloud-sync/cloud-sync-service.ts
import { getSupabaseClient } from './supabase-client'
import { getAuthState } from './auth-service'
import type { SyncPayload, SyncResult } from '@oh-my-prompt/shared/types/sync'
import type { Prompt, Category } from '@oh-my-prompt/shared/types/prompt'
import type { StorageSchema } from '@oh-my-prompt/shared/types/storage'

/**
 * Web app URL for sync API endpoints.
 *
 * For development: Set DEV_WEB_APP_URL in vite.config.ts define option.
 * For production: Defaults to https://oh-my-prompt.com.
 */
declare const DEV_WEB_APP_URL: string | undefined

const WEB_APP_URL = DEV_WEB_APP_URL ?? 'https://oh-my-prompt.com'

/**
 * Upload local prompts and categories to cloud.
 *
 * Flow:
 * 1. Check authentication state
 * 2. Get Supabase session for access token
 * 3. Read local data from chrome.storage.local
 * 4. Send to web-app sync API
 *
 * @returns SyncResult with success status and counts
 */
export async function uploadToCloud(): Promise<SyncResult> {
  console.log('[Oh My Prompt] uploadToCloud: starting...')
  const authState = await getAuthState()
  console.log('[Oh My Prompt] uploadToCloud: authState =', authState)

  if (authState.status !== 'logged_in') {
    console.log('[Oh My Prompt] uploadToCloud: authState.status !== logged_in, returning NOT_LOGGED_IN')
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  console.log('[Oh My Prompt] uploadToCloud: session =', session ? 'exists' : 'missing')

  if (!session) {
    console.log('[Oh My Prompt] uploadToCloud: session missing, returning NOT_LOGGED_IN')
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  // Read local data from chrome.storage.local
  const storageData = await chrome.storage.local.get('prompt_script_data')
  const localData: StorageSchema = storageData.prompt_script_data

  if (!localData?.userData) {
    return { success: false, error: 'INVALID_DATA' }
  }

  const payload: SyncPayload = {
    prompts: localData.userData.prompts,
    categories: localData.userData.categories,
    timestamp: Date.now()
  }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/sync/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || 'SYNC_FAILED'
      }
    }

    const result = await response.json()
    return {
      success: true,
      promptsCount: result.promptsCount,
      categoriesCount: result.categoriesCount,
      syncedAt: result.syncedAt
    }
  } catch (error) {
    console.error('[Oh My Prompt] Upload failed:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}

/**
 * Download prompts and categories from cloud.
 *
 * Flow:
 * 1. Check authentication state
 * 2. Get Supabase session for access token
 * 3. Fetch from web-app sync API
 *
 * @returns SyncResult with success status and downloaded data
 */
export async function downloadFromCloud(): Promise<SyncResult & { data?: { prompts: Prompt[], categories: Category[] } }> {
  const authState = await getAuthState()

  if (authState.status !== 'logged_in') {
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/sync/download`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || 'SYNC_FAILED'
      }
    }

    const result = await response.json()

    if (!result.success) {
      return { success: false, error: result.error || 'SYNC_FAILED' }
    }

    return {
      success: true,
      data: result.data,
      syncedAt: result.data.timestamp
    }
  } catch (error) {
    console.error('[Oh My Prompt] Download failed:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}

/**
 * Apply downloaded data to local storage.
 *
 * Merges downloaded prompts/categories with existing settings,
 * preserving version and other configuration.
 *
 * @param data - Downloaded prompts and categories
 * @returns Success status
 */
export async function applyDownloadedData(data: { prompts: Prompt[], categories: Category[] }): Promise<{ success: boolean }> {
  const storageData = await chrome.storage.local.get('prompt_script_data')
  const existingData: StorageSchema = storageData.prompt_script_data

  // Merge with existing settings and version
  const newData: StorageSchema = {
    ...existingData,
    userData: {
      prompts: data.prompts,
      categories: data.categories
    },
    settings: {
      ...existingData.settings,
      lastSyncTime: Date.now(),
      hasUnsyncedChanges: false
    }
  }

  await chrome.storage.local.set({ prompt_script_data: newData })

  return { success: true }
}