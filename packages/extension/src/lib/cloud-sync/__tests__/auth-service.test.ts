import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase-client', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithOAuth: vi.fn(),
      signOut: vi.fn()
    }
  })),
  clearSupabaseClient: vi.fn()
}))

import {
  getAuthState,
  getCachedAuthState,
  invalidateSyncStatusCache
} from '../auth-service'
import { clearSupabaseClient } from '../supabase-client'

const AUTH_KEY = 'sb-futfxudabvjfldlismun-auth-token'

function createSessionPayload(overrides?: Partial<{ access_token: string; expires_at: number; user: { id: string; email?: string } }>) {
  return {
    access_token: overrides?.access_token ?? 'token-123',
    expires_at: overrides?.expires_at ?? (Math.floor(Date.now() / 1000) + 3600),
    user: overrides?.user ?? { id: 'user-1', email: 'test@example.com' }
  }
}

describe('auth-service quick auth hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateSyncStatusCache()

    global.fetch = vi.fn()
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      },
      tabs: {
        create: vi.fn()
      },
      runtime: {
        sendMessage: vi.fn()
      }
    } as any
  })

  it('returns logged_in immediately from local session without network', async () => {
    const session = createSessionPayload()
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [AUTH_KEY]: JSON.stringify(session)
    })

    const result = await getCachedAuthState()

    expect(result).toEqual({
      status: 'logged_in',
      user: {
        id: 'user-1',
        email: 'test@example.com'
      }
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reuses cached subscription details and avoids duplicate fetch', async () => {
    const session = createSessionPayload()
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [AUTH_KEY]: JSON.stringify(session)
    })

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
        subscription: { planType: 'pro', status: 'active', currentPeriodEnd: 1234567890 },
        optimizationQuota: { used: 10, remaining: 40, limit: 50 },
        lastSyncedAt: 1716543210000
      })
    } as any)

    const first = await getAuthState()
    const second = await getCachedAuthState()

    expect(first.status).toBe('logged_in')
    expect(first.subscription?.planType).toBe('pro')
    expect(second.status).toBe('logged_in')
    expect(second.subscription?.optimizationQuota?.remaining).toBe(40)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('clears local session and returns not_logged_in on 401', async () => {
    const session = createSessionPayload()
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [AUTH_KEY]: JSON.stringify(session)
    })

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401
    } as any)

    const result = await getAuthState()

    expect(result).toEqual({ status: 'not_logged_in' })
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(AUTH_KEY)
    expect(clearSupabaseClient).toHaveBeenCalledTimes(1)
  })
})
