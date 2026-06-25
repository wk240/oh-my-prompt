import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CloudSyncStrategy } from '../strategies/cloud'
import { FullBackupData } from '../types'
import { invalidateSyncStatusCache } from '../../cloud-sync/auth-service'

describe('CloudSyncStrategy', () => {
  let strategy: CloudSyncStrategy

  beforeEach(() => {
    strategy = new CloudSyncStrategy()
    vi.clearAllMocks()
    invalidateSyncStatusCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    invalidateSyncStatusCache()
  })

  it('should have correct id and name', () => {
    expect(strategy.id).toBe('cloud')
    expect(strategy.name).toBe('Cloud Sync')
  })

  it('should return false when no auth token', async () => {
    // Mock chrome.storage.local.get to return empty (no auth token)
    const mockGet = vi.fn().mockResolvedValue({})
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch to not be called
    global.fetch = vi.fn()

    const available = await strategy.isAvailable()
    expect(available).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should check availability for active Pro users', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600 // Token expires in 1 hour
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch to return active pro subscription
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
        subscription: { planType: 'pro', status: 'active' }
      })
    })

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
  })

  it('should be available for logged-in free users so upload can report subscription errors', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
        subscription: { planType: 'free', status: 'active' }
      })
    })

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
  })

  it('should be available for free users with team cloud sync entitlement', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
        subscription: { planType: 'free', status: 'active' },
        cloudSyncEnabled: true
      })
    })

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
  })

  it('should still be available when sync status API is unreachable but session is valid', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn().mockRejectedValue(new Error('status api unavailable'))

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
  })

  it('should return false when auth token is expired', async () => {
    // Mock chrome.storage.local.get to return expired auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) - 3600 // Token expired 1 hour ago
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    const available = await strategy.isAvailable()
    expect(available).toBe(false)
  })

  it('should be available when status fetch fails but session is valid', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch to throw error
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
  })

  it('should upload data via API', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch for sync/upload
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        timestamp: Date.now(),
        promptsCount: 1,
        categoriesCount: 0
      })
    })

    const data: FullBackupData = {
      prompts: [{ id: '1', name: 'Test', content: 'test', categoryId: 'c1', order: 0 }],
      categories: [],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    const result = await strategy.sync(data)
    expect(result.success).toBe(true)
    expect(result.promptsCount).toBe(1)
    expect(result.categoriesCount).toBe(0)
    expect(result.syncedAt).toBeDefined()
  })

  it('should return NOT_LOGGED_IN error when no token for sync', async () => {
    // Mock chrome.storage.local.get to return empty (no auth token)
    const mockGet = vi.fn().mockResolvedValue({})
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    const data: FullBackupData = {
      prompts: [],
      categories: [],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    const result = await strategy.sync(data)
    expect(result.success).toBe(false)
    expect(result.error).toBe('NOT_LOGGED_IN')
  })

  it('should return NETWORK_ERROR when fetch fails during sync', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch to throw network error
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const data: FullBackupData = {
      prompts: [],
      categories: [],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    const result = await strategy.sync(data)
    expect(result.success).toBe(false)
    expect(result.error).toBe('NETWORK_ERROR')
  })

  it('should return SUBSCRIPTION_REQUIRED for 403 response', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch to return 403
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: 'Forbidden' })
    })

    const data: FullBackupData = {
      prompts: [],
      categories: [],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    const result = await strategy.sync(data)
    expect(result.success).toBe(false)
    expect(result.error).toBe('SUBSCRIPTION_REQUIRED')
  })

  it('should restore data from cloud', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    // Mock fetch for sync/download
    const cloudData = {
      prompts: [{ id: 'cloud-1', name: 'Cloud Prompt', content: 'cloud', categoryId: 'c1', order: 0 }],
      categories: [{ id: 'c1', name: 'Category', order: 0 }],
      temporaryPrompts: [],
      timestamp: 1234567890
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: cloudData
      })
    })

    const result = await strategy.restore()
    expect(result).not.toBeNull()
    expect(result?.prompts).toHaveLength(1)
    expect(result?.prompts[0].id).toBe('cloud-1')
    expect(result?.categories).toHaveLength(1)
    expect(result?.timestamp).toBe(1234567890)
  })

  it('should return null when no auth token for restore', async () => {
    // Mock chrome.storage.local.get to return empty
    const mockGet = vi.fn().mockResolvedValue({})
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    const result = await strategy.restore()
    expect(result).toBeNull()
  })

  it('should return enabled status for active paid users', async () => {
    // Mock chrome.storage.local.get to return auth token
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
        subscription: { planType: 'team', status: 'active' },
        lastSyncedAt: 1234567890
      })
    })

    const status = await strategy.getStatus()
    expect(status.enabled).toBe(true)
    expect(status.lastSyncTime).toBe(1234567890)
  })

  it('should return subscription-required status for free users', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
        subscription: { planType: 'free', status: 'active' }
      })
    })

    const status = await strategy.getStatus()
    expect(status.enabled).toBe(false)
    expect(status.error).toBe('SUBSCRIPTION_REQUIRED')
  })

  it('should return enabled status for free users with team cloud sync entitlement', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: { id: 'user-123' },
        subscription: { planType: 'free', status: 'active' },
        cloudSyncEnabled: true,
        lastSyncedAt: 1234567890
      })
    })

    const status = await strategy.getStatus()
    expect(status.enabled).toBe(true)
    expect(status.lastSyncTime).toBe(1234567890)
  })

  it('should return disabled status when not authenticated', async () => {
    // Mock chrome.storage.local.get to return empty
    const mockGet = vi.fn().mockResolvedValue({})
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    const status = await strategy.getStatus()
    expect(status.enabled).toBe(false)
  })

  it('uploads and restores image metadata through cloud sync payloads', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any
    global.fetch = vi.fn()

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, timestamp: 1700000000001 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          prompts: [],
          categories: [],
          temporaryPrompts: [],
          imageAssets: {
            'image-1': {
              id: 'image-1',
              promptId: 'prompt-1',
              localPath: 'images/image-1.webp',
              mimeType: 'image/webp',
              width: 100,
              height: 80,
              size: 1000,
              hash: 'hash-1',
              status: 'synced',
              updatedAt: 1,
              cloudUrl: 'https://blob/img.webp',
              cloudPath: 'users/u/images/image-1.webp'
            }
          },
          pendingImageDeletes: [],
          timestamp: 1700000000002
        }
      }), { status: 200 }))

    await strategy.sync({
      prompts: [],
      categories: [],
      temporaryPrompts: [],
      imageAssets: {
        'image-1': {
          id: 'image-1',
          promptId: 'prompt-1',
          localPath: 'images/image-1.webp',
          mimeType: 'image/webp',
          width: 100,
          height: 80,
          size: 1000,
          hash: 'hash-1',
          status: 'pending_upload',
          updatedAt: 1
        }
      },
      pendingImageDeletes: [],
      timestamp: 1700000000000
    })
    const uploadedBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    const restored = await strategy.restore()

    expect(uploadedBody.imageAssets['image-1'].localPath).toBe('images/image-1.webp')
    expect(restored?.imageAssets?.['image-1'].cloudUrl).toBe('https://blob/img.webp')
  })

  it('normalizes malformed image metadata from cloud restore', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      'sb-futfxudabvjfldlismun-auth-token': JSON.stringify({
        access_token: 'test-token',
        user: { id: 'user-123' },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    })
    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        imageAssets: [],
        pendingImageDeletes: {},
        timestamp: 1700000000002
      }
    }), { status: 200 }))

    const restored = await strategy.restore()

    expect(restored?.imageAssets).toEqual({})
    expect(restored?.pendingImageDeletes).toEqual([])
  })
})
