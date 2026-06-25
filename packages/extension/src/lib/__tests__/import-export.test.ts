import { describe, expect, it, vi } from 'vitest'
import { mergeImportData } from '../import-export'

describe('mergeImportData', () => {
  it('repairs imported prompts that reference missing categories', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('new-prompt-id')

    const result = mergeImportData(
      {
        prompts: [],
        categories: []
      },
      {
        prompts: [{ id: 'imported-prompt', name: 'Imported', content: 'Content', categoryId: 'missing-cat', order: 0 }],
        categories: []
      }
    )

    expect(result.prompts).toEqual([
      expect.objectContaining({
        id: 'new-prompt-id',
        categoryId: 'missing-cat'
      })
    ])
    expect(result.categories).toEqual([
      expect.objectContaining({
        id: 'missing-cat',
        name: '恢复分类'
      })
    ])
  })
})
