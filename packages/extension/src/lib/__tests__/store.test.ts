import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Prompt, StorageSchema } from '@oh-my-prompt/shared/types'
import { usePromptStore } from '../store'

describe('usePromptStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    global.chrome = {
      runtime: {
        id: 'extension-id',
        getManifest: vi.fn().mockReturnValue({ version: '2.0.0' }),
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
    } as any

    usePromptStore.setState({
      prompts: [],
      categories: [],
      temporaryPrompts: [],
      teamPrompts: [],
      teamSyncStatus: null,
      authState: null,
      selectedCategoryId: 'all',
      isLoading: false,
    })
  })

  it('keeps existing prompt arrays when storage refresh contains the same data', async () => {
    const prompt: Prompt = {
      id: 'prompt-1',
      name: 'Prompt',
      content: 'Content',
      categoryId: 'cat-1',
      order: 0,
      updatedAt: 1700000000000,
    }
    const category: Category = {
      id: 'cat-1',
      name: 'Category',
      order: 0,
      updatedAt: 1700000000000,
    }
    const storageData: StorageSchema = {
      version: '2.0.0',
      userData: {
        prompts: [{ ...prompt }],
        categories: [{ ...category }],
      },
      settings: {
        showBuiltin: true,
        syncEnabled: false,
      },
      temporaryPrompts: [],
      _migrationComplete: true,
    }

    usePromptStore.setState({
      prompts: [prompt],
      categories: [category],
      temporaryPrompts: [],
      isLoading: false,
    })
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      data: storageData,
    })

    const beforePrompts = usePromptStore.getState().prompts
    const beforeCategories = usePromptStore.getState().categories
    const beforeTemporaryPrompts = usePromptStore.getState().temporaryPrompts

    await usePromptStore.getState().loadFromStorage({ showLoading: false })

    expect(usePromptStore.getState().prompts).toBe(beforePrompts)
    expect(usePromptStore.getState().categories).toBe(beforeCategories)
    expect(usePromptStore.getState().temporaryPrompts).toBe(beforeTemporaryPrompts)
  })
})
