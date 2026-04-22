/**
 * Shared utility functions for text processing and array operations
 */

import type { Category, Prompt, ResourceCategory, ResourcePrompt } from './types'

/**
 * Truncate text to a maximum length with ellipsis suffix
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Sort categories by their order field (immutable - returns new array)
 */
export function sortCategoriesByOrder(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => a.order - b.order)
}

/**
 * Sort prompts by their order field within a category (immutable - returns new array)
 */
export function sortPromptsByOrder(prompts: Prompt[]): Prompt[] {
  return [...prompts].sort((a, b) => a.order - b.order)
}

/**
 * Sort ResourceCategories by their order field (immutable - returns new array)
 */
export function sortProviderCategoriesByOrder(categories: ResourceCategory[]): ResourceCategory[] {
  return [...categories].sort((a, b) => a.order - b.order)
}

/**
 * Sort ResourcePrompts by category order first, then by prompt order within category
 * Used for "全部" view to show prompts grouped by category order
 */
export function sortResourcePromptsByCategoryOrder(
  prompts: ResourcePrompt[],
  categories: ResourceCategory[]
): ResourcePrompt[] {
  // Build category order map
  const categoryOrderMap = new Map<string, number>()
  categories.forEach(cat => {
    categoryOrderMap.set(cat.id, cat.order)
    // Also map sourceCategory name to order for fallback matching
    categoryOrderMap.set(cat.name, cat.order)
  })

  return [...prompts].sort((a, b) => {
    const aCategoryOrder = categoryOrderMap.get(a.categoryId) ?? categoryOrderMap.get(a.sourceCategory ?? '') ?? FALLBACK_CATEGORY_ORDER
    const bCategoryOrder = categoryOrderMap.get(b.categoryId) ?? categoryOrderMap.get(b.sourceCategory ?? '') ?? FALLBACK_CATEGORY_ORDER

    // First sort by category order
    if (aCategoryOrder !== bCategoryOrder) {
      return aCategoryOrder - bCategoryOrder
    }

    // Then sort by prompt order within same category
    return a.order - b.order
  })
}

/**
 * Create an event handler that stops propagation and calls the callback
 */
export function stopPropagationHandler<T extends (...args: unknown[]) => void>(fn: T): (e: React.MouseEvent) => void {
  return (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }
}

/**
 * Fallback category order for unknown categories
 */
export const FALLBACK_CATEGORY_ORDER = 99

/**
 * Fallback prompt order for prompts without order field
 */
export const FALLBACK_PROMPT_ORDER = 99