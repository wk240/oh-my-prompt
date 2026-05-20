// packages/extension/src/lib/sync/__tests__/merge-data.test.ts
import { describe, it, expect } from 'vitest'
import { mergePromptData, mergeById } from '../merge-data'
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

describe('mergeById', () => {
  it('should add new items from backup', () => {
    const current = [{ id: '1', updatedAt: 1000 }]
    const backup = [{ id: '2', updatedAt: 2000 }]
    const result = mergeById(current, backup)
    expect(result.length).toBe(2)
    expect(result.find(i => i.id === '2')).toBeDefined()
  })

  it('should keep newer version when same ID', () => {
    const current = [{ id: '1', updatedAt: 1000 }]
    const backup = [{ id: '1', updatedAt: 2000 }]
    const result = mergeById(current, backup)
    expect(result.length).toBe(1)
    expect(result[0].updatedAt).toBe(2000)
  })

  it('should keep current version when current is newer', () => {
    const current = [{ id: '1', updatedAt: 3000 }]
    const backup = [{ id: '1', updatedAt: 1000 }]
    const result = mergeById(current, backup)
    expect(result.length).toBe(1)
    expect(result[0].updatedAt).toBe(3000)
  })

  it('should keep current when both have no updatedAt', () => {
    const current = [{ id: '1' }] as any
    const backup = [{ id: '1' }] as any
    const result = mergeById(current, backup)
    expect(result.length).toBe(1)
    // Current wins when no timestamps
    expect(result[0]).toEqual(current[0])
  })

  it('should prefer backup when backup has updatedAt but current does not', () => {
    const current = [{ id: '1' }] as any
    const backup = [{ id: '1', updatedAt: 1000 }]
    const result = mergeById(current, backup)
    expect(result[0].updatedAt).toBe(1000)
  })
})

describe('mergePromptData', () => {
  const createPrompt = (id: string, updatedAt: number, categoryId: string): Prompt => ({
    id,
    name: `Prompt ${id}`,
    content: `Content ${id}`,
    categoryId,
    updatedAt,
    order: 0
  })

  const createCategory = (id: string, updatedAt: number): Category => ({
    id,
    name: `Category ${id}`,
    updatedAt,
    order: 0
  })

  it('should count added prompts correctly', () => {
    const currentPrompts = [createPrompt('1', 1000, 'cat1')]
    const backupPrompts = [createPrompt('2', 2000, 'cat1')]
    const result = mergePromptData(currentPrompts, backupPrompts, [], [])
    expect(result.addedPrompts).toBe(1)
    expect(result.prompts.length).toBe(2)
  })

  it('should count updated prompts correctly', () => {
    const currentPrompts = [createPrompt('1', 1000, 'cat1')]
    const backupPrompts = [createPrompt('1', 2000, 'cat1')]
    const result = mergePromptData(currentPrompts, backupPrompts, [], [])
    expect(result.updatedPrompts).toBe(1)
    expect(result.prompts.length).toBe(1)
    expect(result.prompts[0].updatedAt).toBe(2000)
  })

  it('should count added categories correctly', () => {
    const currentCategories = [createCategory('cat1', 1000)]
    const backupCategories = [createCategory('cat2', 2000)]
    const result = mergePromptData([], [], currentCategories, backupCategories)
    expect(result.addedCategories).toBe(1)
    expect(result.categories.length).toBe(2)
  })

  it('should handle empty inputs', () => {
    const result = mergePromptData([], [], [], [])
    expect(result.prompts.length).toBe(0)
    expect(result.categories.length).toBe(0)
    expect(result.addedPrompts).toBe(0)
    expect(result.updatedPrompts).toBe(0)
    expect(result.addedCategories).toBe(0)
  })
})