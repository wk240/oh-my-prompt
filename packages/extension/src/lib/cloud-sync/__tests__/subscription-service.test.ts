import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

vi.mock('../auth-service', () => ({
  getAuthState: vi.fn()
}))

import { checkSubscriptionFeature } from '../subscription-service'
import { getAuthState } from '../auth-service'

const mockedGetAuthState = vi.mocked(getAuthState)

function loggedInFreeState(remaining: number): CloudAuthState {
  return {
    status: 'logged_in',
    subscription: {
      planType: 'free',
      status: 'active',
      officialApiQuota: {
        kind: 'trial',
        used: 50 - remaining,
        remaining,
        limit: 50,
        resetsAt: null
      }
    }
  }
}

describe('checkSubscriptionFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows ai optimization for logged-in FREE users with trial remaining', async () => {
    mockedGetAuthState.mockResolvedValue(loggedInFreeState(8))

    await expect(checkSubscriptionFeature('ai_optimization')).resolves.toBe(true)
  })

  it('denies ai optimization for logged-in FREE users when trial is exhausted', async () => {
    mockedGetAuthState.mockResolvedValue(loggedInFreeState(0))

    await expect(checkSubscriptionFeature('ai_optimization')).resolves.toBe(false)
  })

  it('keeps cloud sync disabled for FREE trial users', async () => {
    mockedGetAuthState.mockResolvedValue(loggedInFreeState(8))

    await expect(checkSubscriptionFeature('cloud_sync')).resolves.toBe(false)
  })
})
