import type { StorageSchema, Prompt } from '@oh-my-prompt/shared/types'

/**
 * Migration from 1.2 to 1.3: Move "临时" category prompts to temporaryPrompts
 * This separates the temporary library from the category system.
 */
export function migrateTemporaryCategory(data: unknown): StorageSchema {
  const schema = data as StorageSchema

  // Guard: Already has temporaryPrompts field
  if (schema.temporaryPrompts) {
    return schema
  }

  // Guard: No userData
  if (!schema.userData) {
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
    return {
      ...schema,
      temporaryPrompts: []
    }
  }

  // Find prompts in 临时 category
  const tempPrompts = prompts.filter(p => p.categoryId === tempCategory.id)

  if (tempPrompts.length === 0) {
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