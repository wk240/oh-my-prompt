import type { StorageSchema, Prompt } from '../../shared/types'

/**
 * Migration from 1.2 to 1.3: Move "临时" category prompts to temporaryPrompts
 * This separates the temporary library from the category system.
 */
export function migrateTemporaryCategory(data: unknown): StorageSchema {
  const schema = data as StorageSchema

  // Guard: Already has temporaryPrompts field
  if (schema.temporaryPrompts) {
    console.log('[Oh My Prompt] Migration v1.3: temporaryPrompts already exists, skipping')
    return schema
  }

  // Guard: No userData
  if (!schema.userData) {
    console.log('[Oh My Prompt] Migration v1.3: No userData, creating empty temporaryPrompts')
    return {
      ...schema,
      temporaryPrompts: []
    }
  }

  const categories = schema.userData.categories || []
  const prompts = schema.userData.prompts || []

  // Find "临时" category
  const tempCategory = categories.find(c => c.name === '临时' || c.name === '临时分类')

  if (!tempCategory) {
    console.log('[Oh My Prompt] Migration v1.3: No 临时 category found, creating empty temporaryPrompts')
    return {
      ...schema,
      temporaryPrompts: []
    }
  }

  // Find prompts in 临时 category
  const tempPrompts = prompts.filter(p => p.categoryId === tempCategory.id)

  if (tempPrompts.length === 0) {
    console.log('[Oh My Prompt] Migration v1.3: 临时 category has no prompts, removing category')
    // Remove the empty 临时 category
    const updatedCategories = categories.filter(c => c.id !== tempCategory.id)
    return {
      ...schema,
      userData: {
        ...schema.userData,
        categories: updatedCategories
      },
      temporaryPrompts: []
    }
  }

  // Move prompts to temporaryPrompts
  const temporaryPrompts: Prompt[] = tempPrompts.map(p => ({
    ...p,
    categoryId: 'temporary'  // Mark as temporary library item
  }))

  // Remove 临时 category and its prompts from userData
  const updatedCategories = categories.filter(c => c.id !== tempCategory.id)
  const updatedPrompts = prompts.filter(p => p.categoryId !== tempCategory.id)

  console.log('[Oh My Prompt] Migration v1.3: Moved', tempPrompts.length, 'prompts from 临时 category to temporaryPrompts')

  return {
    ...schema,
    userData: {
      prompts: updatedPrompts,
      categories: updatedCategories
    },
    temporaryPrompts
  }
}

/**
 * Migration step definition for v1.3
 * Exported for explicit registration in register.ts
 */
export const v1_3Migration = {
  version: '1.3',
  handler: migrateTemporaryCategory
}