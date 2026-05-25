import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageSchema } from '@oh-my-prompt/shared/types'

const { triggerSync } = vi.hoisted(() => ({
  triggerSync: vi.fn()
}))

vi.mock('../sync', () => ({
  createSyncOrchestrator: () => ({
    triggerSync
  })
}))

vi.mock('../data/built-in-data', () => ({
  BUILT_IN_CATEGORIES: [],
  BUILT_IN_PROMPTS: []
}))

vi.mock('../migrations/index', () => ({
  isLegacyFormat: vi.fn(() => false),
  migrate: vi.fn()
}))

vi.mock('../migrations/register', () => ({}))

import { StorageManager } from '../storage'

describe('StorageManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    triggerSync.mockResolvedValue(undefined)

    global.chrome = {
      runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '2.0.0' })
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          getBytesInUse: vi.fn().mockResolvedValue(0)
        }
      }
    } as any
  })

  it('includes image metadata when auto-syncing saved storage data', async () => {
    const manager = StorageManager.getInstance()
    const data: StorageSchema = {
      version: '2.0.0',
      userData: {
        prompts: [{ id: 'prompt-1', name: 'Prompt', content: 'Content', categoryId: 'cat-1', order: 0 }],
        categories: [{ id: 'cat-1', name: 'Category', order: 0 }]
      },
      settings: {
        showBuiltin: true,
        syncEnabled: true
      },
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
          updatedAt: 1700000000000
        }
      },
      pendingImageDeletes: [{
        imageId: 'image-2',
        cloudPath: 'users/u/images/image-2.webp',
        attempts: 1,
        updatedAt: 1700000000001
      }],
      _migrationComplete: true
    }

    await manager.saveData(data)

    expect(triggerSync).toHaveBeenCalledWith(expect.objectContaining({
      imageAssets: data.imageAssets,
      pendingImageDeletes: data.pendingImageDeletes
    }))
  })
})
