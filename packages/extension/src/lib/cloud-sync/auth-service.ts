// packages/extension/src/lib/cloud-sync/auth-service.ts
import { getSupabaseClient, clearSupabaseClient } from './supabase-client'
import { WEB_APP_URL, SUPABASE_PROJECT_REF } from '@/lib/config'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

/**
 * Check if user has logged in via Web App (cookie session).
 *
 * Used for bi-directional login state sync:
 * - Extension calls this API without Authorization header
 * - If Web App has cookie session, returns user info
 * - Extension shows "Sync from Web App" prompt
 *
 * @returns Web App session status and user info (without tokens)
 */
export async function checkWebAppSession(): Promise<{
  hasSession: boolean
  user?: { id: string; email?: string }
}> {
  try {
    const res = await fetch(`${WEB_APP_URL}/api/auth/check`, {
      // No Authorization header - uses cookie auth
      credentials: 'include' // Include cookies for cross-origin request
    })

    if (!res.ok) {
      return { hasSession: false }
    }

    const data = await res.json()
    return data
  } catch (error) {
    console.error('[Oh My Prompt] checkWebAppSession failed:', error)
    return { hasSession: false }
  }
}

/**
 * Open Web App callback page to transfer session to Extension.
 *
 * Flow:
 * 1. Extension opens this URL in new tab (foreground or background)
 * 2. Web App detects existing session, returns tokens in hash
 * 3. Extension content script extracts tokens and saves to chrome.storage
 * 4. Tab auto-closes after success (via hashchange listener)
 *
 * @param options.background - If true, open tab in background (active: false)
 * @returns Success status
 */
export async function syncFromWebApp(options?: { background?: boolean }): Promise<{ success: boolean }> {
  try {
    // Open callback page with source=extension in new tab
    chrome.tabs.create({
      url: `${WEB_APP_URL}/auth/callback?source=extension`,
      active: !options?.background
    })
    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] syncFromWebApp failed:', error)
    return { success: false }
  }
}

/**
 * Cached sync status to reduce API calls.
 * Shared with CloudSyncStrategy for unified caching.
 */
let cachedSyncStatus: {
  user?: { id: string; email?: string }
  subscription?: {
    planType: 'free' | 'pro' | 'team'
    status: 'active' | 'inactive' | 'expired' | 'canceled'
    currentPeriodEnd?: number
    optimizationQuota?: { used: number; remaining: number; limit: number }
  }
  cloudSyncEnabled?: boolean
  lastSyncAt?: number
  timestamp: number
} | null = null
const STATUS_CACHE_DURATION_MS = 60 * 1000 // 60 seconds

const SUPABASE_AUTH_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

function getAuthStateFromCache(): CloudAuthState | null {
  const nowMs = Date.now()
  if (!cachedSyncStatus || nowMs - cachedSyncStatus.timestamp >= STATUS_CACHE_DURATION_MS) {
    return null
  }

  return {
    status: 'logged_in',
    user: cachedSyncStatus.user,
    subscription: cachedSyncStatus.subscription,
    cloudSyncEnabled: cachedSyncStatus.cloudSyncEnabled,
    lastSyncAt: cachedSyncStatus.lastSyncAt
  }
}

/**
 * Get session directly from chrome.storage.local (bypassing Supabase client).
 *
 * This is more reliable in content script context where Supabase client's
 * getSession() may not properly read from storage adapter due to async initialization.
 *
 * @returns Session object or null if not found/invalid
 */
export async function getSessionFromStorage(): Promise<{
  access_token: string
  user: { id: string; email?: string }
  expires_at?: number
} | null> {
  try {
    const result = await chrome.storage.local.get(SUPABASE_AUTH_KEY)
    const sessionData = result[SUPABASE_AUTH_KEY]

    if (!sessionData) return null

    const session = JSON.parse(sessionData)

    // Validate session has required fields
    if (!session.access_token || !session.user?.id) return null

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = session.expires_at || 0
    if (expiresAt < now) return null

    return {
      access_token: session.access_token,
      user: {
        id: session.user.id,
        email: session.user.email
      },
      expires_at: session.expires_at
    }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to read session from storage:', error)
    return null
  }
}

/**
 * Get auth state quickly from local storage/cache only (no network request).
 * Useful for instant UI hydration before fetching subscription details.
 */
export async function getCachedAuthState(): Promise<CloudAuthState> {
  try {
    const directSession = await getSessionFromStorage()
    if (!directSession) {
      return { status: 'not_logged_in' }
    }

    const cachedState = getAuthStateFromCache()
    if (cachedState) {
      return cachedState
    }

    return {
      status: 'logged_in',
      user: directSession.user
    }
  } catch (error) {
    console.error('[Oh My Prompt] Cached auth state check failed:', error)
    return { status: 'not_logged_in' }
  }
}

/**
 * Get the current authentication state with subscription info.
 *
 * Flow:
 * 1. Check Supabase session (stored in chrome.storage.local)
 * 2. If session exists, fetch subscription status from web-app API (cached)
 * 3. Return full auth state including user, subscription, and lastSyncAt
 *
 * @returns CloudAuthState with status and optional user/subscription info
 */
export async function getAuthState(): Promise<CloudAuthState> {
  try {
    // First, try to read session directly from chrome.storage.local
    // This is more reliable in content script context where Supabase client's
    // getSession() may not properly read from storage adapter due to async initialization
    const directSession = await getSessionFromStorage()

    if (!directSession) {
      cachedSyncStatus = null // Clear cache on auth change
      return { status: 'not_logged_in' }
    }

    // Check if cached status is valid (for subscription info)
    const cachedState = getAuthStateFromCache()
    if (cachedState) {
      return cachedState
    }

    // Get subscription status from sync/status API
    try {
      const statusRes = await fetch(`${WEB_APP_URL}/api/sync/status`, {
        headers: {
          Authorization: `Bearer ${directSession.access_token}`
        }
      })

      // Handle 401 Unauthorized - session invalid (user logged out from Web App)
      if (statusRes.status === 401) {
        await chrome.storage.local.remove(SUPABASE_AUTH_KEY)
        clearSupabaseClient()
        cachedSyncStatus = null
        return { status: 'not_logged_in' }
      }

      if (!statusRes.ok) {
        // Other API errors - return basic logged_in state
        return {
          status: 'logged_in',
          user: directSession.user
        }
      }

      const statusData = await statusRes.json() as {
        user: { id: string; email?: string }
        subscription?: {
          planType: 'free' | 'pro' | 'team'
          status: 'active' | 'inactive' | 'expired' | 'canceled'
          currentPeriodEnd?: number
        }
        optimizationQuota?: { used: number; remaining: number; limit: number }
        cloudSyncEnabled?: boolean
        lastSyncedAt?: number
      }

      // Cache the result
      cachedSyncStatus = {
        user: statusData.user,
        subscription: statusData.subscription ? {
          ...statusData.subscription,
          optimizationQuota: statusData.optimizationQuota
        } : undefined,
        cloudSyncEnabled: statusData.cloudSyncEnabled,
        lastSyncAt: statusData.lastSyncedAt,
        timestamp: Date.now()
      }

      return {
        status: 'logged_in',
        user: cachedSyncStatus.user,
        subscription: cachedSyncStatus.subscription,
        cloudSyncEnabled: cachedSyncStatus.cloudSyncEnabled,
        lastSyncAt: cachedSyncStatus.lastSyncAt
      }
    } catch (apiError) {
      // API unavailable - return basic logged_in state with session from storage
      console.warn('[Oh My Prompt] Sync status API unavailable:', apiError)
      return {
        status: 'logged_in',
        user: directSession.user
      }
    }
  } catch (error) {
    console.error('[Oh My Prompt] Auth state check failed:', error)
    return { status: 'not_logged_in' }
  }
}

/**
 * Invalidate cached sync status (called after sync operations).
 */
export function invalidateSyncStatusCache(): void {
  cachedSyncStatus = null
}

/**
 * Initiate OAuth sign-in with Google or GitHub.
 *
 * @deprecated Not used in new login flow. Extension now opens Web App directly.
 * Kept for backward compatibility and potential future use.
 *
 * Flow:
 * 1. Supabase generates OAuth URL with redirect to web-app callback
 * 2. Extension opens URL in new tab (chrome.tabs.create)
 * 3. User completes OAuth on provider site
 * 4. Provider redirects to web-app callback
 * 5. Web-app exchanges code for session and returns HTML with tokens (for extension)
 * 6. Extension polls waitForAuthCallback() until session detected
 *
 * @param provider - 'google' or 'github'
 * @returns Success status and optional error message
 */
export async function signInWithOAuth(provider: 'google' | 'github'): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    // Use unified callback path with source=extension query param
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${WEB_APP_URL}/auth/callback?source=extension`,
        skipBrowserRedirect: true // We open in new tab manually
      }
    })

    if (error) {
      return { success: false, error: error.message }
    }

    // Open OAuth URL in new tab
    if (data.url) {
      chrome.tabs.create({ url: data.url })
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'OAuth initiation failed' }
  }
}

/**
 * Sign out and clear all session data.
 *
 * Clears:
 * - Supabase session
 * - Singleton client instance
 * - Stored tokens in chrome.storage.local
 *
 * @returns Success status (always true, even if Supabase fails)
 */
export async function signOut(): Promise<{ success: boolean }> {
  const supabase = getSupabaseClient()

  try {
    await supabase.auth.signOut()
  } catch (error) {
    // Ignore signOut errors, still clear client and storage
    console.error('[Oh My Prompt] Supabase signOut error:', error)
  }

  clearSupabaseClient()
  invalidateSyncStatusCache() // Clear auth state cache

  // Clear stored session from chrome.storage.local with correct key format
  await chrome.storage.local.remove([SUPABASE_AUTH_KEY])

  // Broadcast logout to service worker, which will rebroadcast to all extension contexts (sidepanel, popup)
  // This ensures VisionSection and other UI components update their auth state
  chrome.runtime.sendMessage({
    type: MessageType.AUTH_STATUS_UPDATE,
    payload: { success: true, logout: true }
  }).catch(() => {
    // Service worker may not be running or other contexts not open, ignore error
  })

  return { success: true }
}

/**
 * Poll for auth callback completion.
 *
 * Used after signInWithOAuth() to wait for user to complete OAuth
 * in the opened tab. Polls chrome.storage.local directly until session detected.
 *
 * @param timeoutMs - Maximum time to wait (default 60 seconds)
 * @returns true if auth completed, false if timeout
 */
export async function waitForAuthCallback(timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now()
  const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`

  while (Date.now() - startTime < timeoutMs) {
    // Check storage directly instead of relying on Supabase client cache
    const result = await chrome.storage.local.get(storageKey)
    const sessionData = result[storageKey]

    if (sessionData) {
      try {
        // Parse and validate session
        const session = JSON.parse(sessionData)
        if (session.access_token && session.user?.id) {
          // Clear the singleton client so it re-initializes with new session
          clearSupabaseClient()
          return true
        }
      } catch (e) {
        console.warn('[Oh My Prompt] Failed to parse session data:', e)
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  return false
}
