// packages/extension/src/lib/cloud-sync/auth-service.ts
import { getSupabaseClient, clearSupabaseClient } from './supabase-client'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

/**
 * Web app URL for OAuth callback and sync status API.
 *
 * For development: Set DEV_WEB_APP_URL in vite.config.ts define option.
 * For production: Defaults to https://ohmyprompt.com.
 *
 * Vite define example (vite.config.ts):
 *   define: { DEV_WEB_APP_URL: '"http://localhost:3000"' }
 */
declare const DEV_WEB_APP_URL: string | undefined

const WEB_APP_URL = DEV_WEB_APP_URL ?? 'https://ohmyprompt.com'

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
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return { status: 'not_logged_in' }
    }

    // Get subscription status from sync/status API
    const statusRes = await fetch(`${WEB_APP_URL}/api/sync/status`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${WEB_APP_URL}/auth/callback`,
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

  // Clear stored session from chrome.storage.local
  await chrome.storage.local.remove([
    'supabase.auth.token',
    'supabase.auth.expires_at'
  ])

  return { success: true }
}

/**
 * Poll for auth callback completion.
 *
 * Used after signInWithOAuth() to wait for user to complete OAuth
 * in the opened tab. Polls getAuthState() until logged_in or timeout.
 *
 * @param timeoutMs - Maximum time to wait (default 60 seconds)
 * @returns true if auth completed, false if timeout
 */
export async function waitForAuthCallback(timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const state = await getAuthState()
    if (state.status === 'logged_in') {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  return false
}