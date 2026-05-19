// packages/extension/src/lib/sync/merge-data.ts
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

interface MergeableItem {
  id: string
  updatedAt?: number
}

/**
 * 按 ID 合并两个列表，保留 updatedAt 最新的版本
 */
export function mergeById<T extends MergeableItem>(currentList: T[], backupList: T[]): T[] {
  const map = new Map<string, T>()

  // 先添加当前数据
  currentList.forEach(item => map.set(item.id, item))

  // 合并备份数据
  backupList.forEach(backupItem => {
    const currentItem = map.get(backupItem.id)
    if (!currentItem) {
      // 新数据，直接添加
      map.set(backupItem.id, backupItem)
    } else if (backupItem.updatedAt && currentItem.updatedAt) {
      // 都有 updatedAt，比较时间戳数值
      if (backupItem.updatedAt > currentItem.updatedAt) {
        map.set(backupItem.id, backupItem)
      }
    } else if (backupItem.updatedAt && !currentItem.updatedAt) {
      // 备份有 updatedAt，当前没有，优先备份
      map.set(backupItem.id, backupItem)
    }
    // else: 当前版本更新或无时间戳，保留当前
  })

  return Array.from(map.values())
}

/**
 * 合并提示词和分类数据
 */
export function mergePromptData(
  currentPrompts: Prompt[],
  backupPrompts: Prompt[],
  currentCategories: Category[],
  backupCategories: Category[]
): {
  prompts: Prompt[]
  categories: Category[]
  addedPrompts: number
  updatedPrompts: number
  addedCategories: number
} {
  const mergedPrompts = mergeById(currentPrompts, backupPrompts)
  const mergedCategories = mergeById(currentCategories, backupCategories)

  // 统计新增和更新数量
  const currentPromptIds = new Set(currentPrompts.map(p => p.id))
  const addedPrompts = mergedPrompts.filter(p => !currentPromptIds.has(p.id)).length

  // 统计更新数量：merged版本不同于current版本（updatedAt不同）
  const updatedPrompts = mergedPrompts.filter(p => {
    const currentPrompt = currentPrompts.find(c => c.id === p.id)
    if (!currentPrompt) return false // 不在current中 = 新增
    // 比较updatedAt判断是否更新
    return p.updatedAt !== currentPrompt.updatedAt
  }).length

  const currentCategoryIds = new Set(currentCategories.map(c => c.id))
  const addedCategories = mergedCategories.filter(c => !currentCategoryIds.has(c.id)).length

  return {
    prompts: mergedPrompts,
    categories: mergedCategories,
    addedPrompts,
    updatedPrompts,
    addedCategories,
  }
}