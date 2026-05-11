import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CloudSyncStrategy } from '../strategies/cloud'
import { FullBackupData } from '../types'

describe('CloudSyncStrategy', () => {
  let strategy: CloudSyncStrategy

  beforeEach(() => {
    strategy = new CloudSyncStrategy()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('should check availability with valid auth token', async () => {
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

    // Mock fetch to return ok status
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true })
    })

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/sync/status',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
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

  it('should return false when fetch fails', async () => {
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
    expect(available).toBe(false)
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

  it('should return PERMISSION_DENIED for 403 response', async () => {
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
    expect(result.error).toBe('PERMISSION_DENIED')
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

  it('should return status when authenticated', async () => {
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

    // Mock fetch for sync/status
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
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
})