// packages/extension/src/lib/cloud-sync/auth-service.ts
import { getSupabaseClient, clearSupabaseClient } from './supabase-client'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

/**
 * Web app URL for OAuth callback and sync status API.
 *
 * For development: Set DEV_WEB_APP_URL in vite.config.ts define option.
 * For production: Defaults to https://oh-my-prompt.com.
 *
 * Vite define example (vite.config.ts):
 *   define: { DEV_WEB_APP_URL: '"http://localhost:3000"' }
 */
declare const DEV_WEB_APP_URL: string | undefined

const WEB_APP_URL = DEV_WEB_APP_URL ?? 'https://oh-my-prompt.com'

// Supabase project reference (extracted from URL)
const SUPABASE_PROJECT_REF = 'futfxudabvjfldlismun'

/**
 * Get the current authentication state with subscription info.
 *
 * Flow:
 * 1. Check Supabase session (stored in chrome.storage.local)
 * 2. If session exists, fetch subscription status from web-app API
 * 3. Return full auth state including user, subscription, and lastSyncAt
 *
 * @returns CloudAuthState with status and optional user/subscription info
 */
export async function getAuthState(): Promise<CloudAuthState> {
  const supabase = getSupabaseClient()

  try {
    // Debug: Check storage directly
    const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`
    const storageResult = await chrome.storage.local.get(storageKey)
    console.log('[Oh My Prompt] Storage raw data:', storageResult[storageKey] ? 'exists' : 'missing')

    const { data: { session: initialSession }, error } = await supabase.auth.getSession()
    console.log('[Oh My Prompt] getSession result:', { session: initialSession ? 'exists' : 'missing', error })

    if (error || !initialSession) {
      console.log('[Oh My Prompt] Returning not_logged_in')
      return { status: 'not_logged_in' }
    }

    // Check if token is expired
    let session = initialSession
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = session.expires_at || 0
    const isExpired = expiresAt < now
    console.log('[Oh My Prompt] Token expiry: expiresAt=' + expiresAt + ', now=' + now + ', isExpired=' + isExpired)
    console.log('[Oh My Prompt] Token preview:', session.access_token ? session.access_token.substring(0, 20) + '...' : 'missing')

    if (isExpired) {
      console.log('[Oh My Prompt] Token expired, attempting refresh...')
      const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError || !newSession) {
        console.log('[Oh My Prompt] Refresh failed, clearing session')
        await chrome.storage.local.remove(storageKey)
        clearSupabaseClient()
        return { status: 'not_logged_in' }
      }
      console.log('[Oh My Prompt] Token refreshed successfully')
      session = newSession
    }

    // Get subscription status from sync/status API
    console.log('[Oh My Prompt] Calling sync/status API with token...')
    const statusRes = await fetch(`${WEB_APP_URL}/api/sync/status`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    console.log('[Oh My Prompt] sync/status response:', statusRes.status, statusRes.ok)

    if (!statusRes.ok) {
      // API unavailable, return basic logged_in state
      return {
        status: 'logged_in',
        user: { id: session.user.id, email: session.user.email }
      }
    }

    const statusData = await statusRes.json()

    return {
      status: 'logged_in',
      user: statusData.user,
      subscription: statusData.subscription,
      lastSyncAt: statusData.lastSyncAt
    }
  } catch (error) {
    console.error('[Oh My Prompt] Auth state check failed:', error)
    return { status: 'not_logged_in' }
  }
}

/**
 * Initiate OAuth sign-in with Google or GitHub.
 *
 * Flow:
 * 1. Supabase generates OAuth URL with redirect to web-app callback
 * 2. Extension opens URL in new tab (chrome.tabs.create)
 * 3. User completes OAuth on provider site
 * 4. Provider redirects to web-app callback
 * 5. Web-app exchanges code for session
 * 6. Extension polls waitForAuthCallback() until session detected
 *
 * @param provider - 'google' or 'github'
 * @returns Success status and optional error message
 */
export async function signInWithOAuth(provider: 'google' | 'github'): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    // Use dedicated extension callback path to avoid query param matching issues
    // Supabase's redirect URL matching is exact - query params must match exactly
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${WEB_APP_URL}/auth/extension/callback`,
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

const SUPABASE_AUTH_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

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

  // Clear stored session from chrome.storage.local with correct key format
  await chrome.storage.local.remove([SUPABASE_AUTH_KEY])

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
          console.log('[Oh My Prompt] Auth detected in storage, user:', session.user.id)

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

  console.log('[Oh My Prompt] Auth wait timeout')
  return false
}