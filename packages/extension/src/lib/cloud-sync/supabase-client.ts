// packages/extension/src/lib/cloud-sync/supabase-client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase project configuration for cloud sync.
 *
 * Using publishable key (sb_publishable_*) which is safe for client-side use.
 * This key is designed to be distributed with client applications and only
 * allows operations permitted by Row Level Security policies.
 *
 * Note: For Chrome extensions, credentials must be bundled at build time.
 * The publishable key can be safely included in open-source code since it
 * only works with authenticated users and respects RLS policies.
 */
const SUPABASE_URL = 'https://futfxudabvjfldlismun.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_s2b-9rHPAhA0wP2ZlSsHsw_G3ZP4b93'

/**
 * Custom storage adapter that bridges Supabase auth to Chrome storage.
 * Uses chrome.storage.local for session persistence, which:
 * - Persists across browser restarts
 * - Has higher storage limits than chrome.storage.sync
 * - Is accessible to all extension contexts (content, background, popup)
 */
const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key)
    return result[key] ?? null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value })
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key)
  }
}

/** Singleton Supabase client instance */
let clientInstance: SupabaseClient | null = null

/**
 * Get the Supabase client instance for the extension.
 *
 * Creates a singleton client with:
 * - chrome.storage.local for session persistence
 * - Auto token refresh enabled
 * - Session persistence enabled
 * - URL detection disabled (OAuth handled by web-app dashboard)
 *
 * @returns Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false // OAuth callback handled by web-app, not extension
      }
    })
  }
  return clientInstance
}

/**
 * Clear the Supabase client instance.
 *
 * Called during logout to reset the singleton and ensure
 * a fresh client is created for the next session.
 */
export function clearSupabaseClient(): void {
  clientInstance = null
}