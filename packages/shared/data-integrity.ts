import type { Category, UserData } from './types'

export const RECOVERY_CATEGORY_NAME = '恢复分类'

export interface RepairPromptCategoryRefsResult {
  userData: UserData
  addedCategories: Category[]
}

function nextCategoryOrder(categories: Category[]): number {
  if (categories.length === 0) return 0
  return Math.max(...categories.map(category => category.order)) + 1
}

/**
 * Ensure every persisted prompt references an existing category.
 *
 * The repair keeps prompt.categoryId stable and creates recovery categories for
 * missing IDs, preserving user data and satisfying cloud foreign-key constraints.
 */
export function repairPromptCategoryRefs(userData: UserData): RepairPromptCategoryRefsResult {
  const knownCategoryIds = new Set(userData.categories.map(category => category.id))
  const missingCategoryIds: string[] = []

  for (const prompt of userData.prompts) {
    if (!knownCategoryIds.has(prompt.categoryId)) {
      knownCategoryIds.add(prompt.categoryId)
      missingCategoryIds.push(prompt.categoryId)
    }
  }

  if (missingCategoryIds.length === 0) {
    return {
      userData,
      addedCategories: []
    }
  }

  const firstOrder = nextCategoryOrder(userData.categories)
  const addedCategories = missingCategoryIds.map((id, index) => ({
    id,
    name: RECOVERY_CATEGORY_NAME,
    order: firstOrder + index
  }))

  return {
    userData: {
      prompts: userData.prompts,
      categories: [...userData.categories, ...addedCategories]
    },
    addedCategories
  }
}
