/**
 * Shared utility functions for text processing and array operations
 */

import type { Category, Prompt, ProviderCategory } from './types'

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
 * Sort ProviderCategories by their order field (immutable - returns new array)
 * Phase 7: Used for ProviderCategory sidebar display (D-13)
 */
export function sortProviderCategoriesByOrder(categories: ProviderCategory[]): ProviderCategory[] {
  return [...categories].sort((a, b) => a.order - b.order)
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