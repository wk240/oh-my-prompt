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

  it('keeps temporary prompt removed after background delete succeeds', async () => {
    const prompt: Prompt = {
      id: 'temp-1',
      name: 'Temp',
      content: 'Draft',
      categoryId: 'temporary',
      order: 0,
    }
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true })
    usePromptStore.setState({ temporaryPrompts: [prompt] })

    const result = await usePromptStore.getState().deleteTemporaryPrompt('temp-1')

    expect(result).toEqual({ success: true })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'DELETE_TEMPORARY_PROMPT',
      payload: { promptId: 'temp-1' },
    })
    expect(usePromptStore.getState().temporaryPrompts).toEqual([])
  })

  it('restores temporary prompt when background delete fails', async () => {
    const prompt: Prompt = {
      id: 'temp-1',
      name: 'Temp',
      content: 'Draft',
      categoryId: 'temporary',
      order: 0,
    }
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: false, error: 'Delete failed' })
    usePromptStore.setState({ temporaryPrompts: [prompt] })

    const result = await usePromptStore.getState().deleteTemporaryPrompt('temp-1')

    expect(result).toEqual({ success: false, error: 'Delete failed' })
    expect(usePromptStore.getState().temporaryPrompts).toEqual([prompt])
  })
})
