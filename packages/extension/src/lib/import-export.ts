/**
 * Import/Export utilities for prompt data
 * Provides JSON file download and validation for StorageSchema data.
 */

import type { StorageSchema, Prompt, Category } from '../shared/types'

interface ValidationResult {
  valid: boolean
  data?: StorageSchema
  error?: string
}

/**
 * Generate export filename with date
 * Format: lovart-prompts-{YYYY-MM-DD}.json
 */
function generateExportFilename(): string {
  const date = new Date().toISOString().slice(0, 10)
  return `lovart-prompts-${date}.json`
}

/**
 * Export data as JSON file download using chrome.downloads API
 */
export async function exportData(data: StorageSchema): Promise<void> {
  const filename = generateExportFilename()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  // Use chrome.downloads API for extension context
  await chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true // Prompt user for save location
  })

  // Clean up blob URL after download starts
  URL.revokeObjectURL(url)
}

/**
 * Validate imported JSON structure
 * Supports both legacy format (prompts/categories directly) and new format (userData nested)
 */
export function validateImportData(json: unknown): ValidationResult {
  // Check if it's an object
  if (typeof json !== 'object' || json === null) {
    return { valid: false, error: 'JSON格式不正确' }
  }

  const data = json as Record<string, unknown>

  // Check for new format (userData nested structure)
  if (data.userData && typeof data.userData === 'object') {
    const userData = data.userData as Record<string, unknown>
    if (!Array.isArray(userData.prompts)) {
      return { valid: false, error: 'userData 缺少 prompts 数组' }
    }
    if (!Array.isArray(userData.categories)) {
      return { valid: false, error: 'userData 缺少 categories 数组' }
    }

    // Validate prompts in userData
    for (const prompt of userData.prompts as unknown[]) {
      if (typeof prompt !== 'object' || prompt === null) {
        return { valid: false, error: '提示词数据格式错误：每项需包含 id、name、content、categoryId' }
      }
      const p = prompt as Record<string, unknown>
      if (typeof p.id !== 'string' || typeof p.name !== 'string' ||
          typeof p.content !== 'string' || typeof p.categoryId !== 'string') {
        return { valid: false, error: '提示词缺少必要字段：id、name、content、categoryId' }
      }
      if (p.description !== undefined && typeof p.description !== 'string') {
        return { valid: false, error: 'description 字段必须为字符串类型' }
      }
    }

    // Validate categories in userData
    for (const category of userData.categories as unknown[]) {
      if (typeof category !== 'object' || category === null) {
        return { valid: false, error: '分类数据格式错误：每项需包含 id、name、order' }
      }
      const c = category as Record<string, unknown>
      if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.order !== 'number') {
        return { valid: false, error: '分类缺少必要字段：id、name、order' }
      }
    }

    return { valid: true, data: json as StorageSchema }
  }

  // Check for legacy format (prompts/categories directly on object)
  if (!Array.isArray(data.prompts)) {
    return { valid: false, error: '缺少 prompts 数组' }
  }
  if (!Array.isArray(data.categories)) {
    return { valid: false, error: '缺少 categories 数组' }
  }

  // Validate prompt structure
  for (const prompt of data.prompts as unknown[]) {
    if (typeof prompt !== 'object' || prompt === null) {
      return { valid: false, error: '提示词数据格式错误：每项需包含 id、name、content、categoryId' }
    }
    const p = prompt as Record<string, unknown>
    if (typeof p.id !== 'string' || typeof p.name !== 'string' ||
        typeof p.content !== 'string' || typeof p.categoryId !== 'string') {
      return { valid: false, error: '提示词缺少必要字段：id、name、content、categoryId' }
    }
    // description is optional, validate if present
    if (p.description !== undefined && typeof p.description !== 'string') {
      return { valid: false, error: 'description 字段必须为字符串类型' }
    }
  }

  // Validate category structure
  for (const category of data.categories as unknown[]) {
    if (typeof category !== 'object' || category === null) {
      return { valid: false, error: '分类数据格式错误：每项需包含 id、name、order' }
    }
    const c = category as Record<string, unknown>
    if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.order !== 'number') {
      return { valid: false, error: '分类缺少必要字段：id、name、order' }
    }
  }

  // Convert legacy format to new StorageSchema format
  const converted: StorageSchema = {
    version: typeof data.version === 'string' ? data.version : '1.0.0',
    userData: {
      prompts: data.prompts as unknown as import('../shared/types').Prompt[],
      categories: data.categories as unknown as import('../shared/types').Category[]
    },
    settings: {
      showBuiltin: true,
      syncEnabled: false
    },
    _migrationComplete: true
  }

  return { valid: true, data: converted }
}

/**
 * Read and parse file from input
 * Returns validation result with parsed data or error message
 */
export async function readImportFile(file: File): Promise<ValidationResult> {
  try {
    const text = await file.text()
    const json = JSON.parse(text)
    return validateImportData(json)
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { valid: false, error: 'JSON解析失败' }
    }
    return { valid: false, error: '文件读取失败' }
  }
}

/**
 * Merge imported data with existing data
 * Strategy: Keep existing, add new items with unique IDs
 * - Categories: If ID exists, keep existing; otherwise add new
 * - Prompts: If ID exists, keep existing; otherwise add new
 */
export function mergeImportData(
  existing: { prompts: Prompt[]; categories: Category[] },
  imported: { prompts: Prompt[]; categories: Category[] }
): { prompts: Prompt[]; categories: Category[]; addedCount: number; skippedCount: number } {
  const existingCategoryIds = new Set(existing.categories.map(c => c.id))
  const existingPromptIds = new Set(existing.prompts.map(p => p.id))

  // Merge categories: keep existing + add new with unique IDs
  const mergedCategories: Category[] = [...existing.categories]
  const newCategoryMap = new Map<string, string>() // oldId -> newId mapping

  for (const category of imported.categories) {
    if (existingCategoryIds.has(category.id)) {
      // Category exists, keep existing - but record mapping for prompts
      newCategoryMap.set(category.id, category.id)
    } else {
      // New category, add it
      const newId = crypto.randomUUID()
      mergedCategories.push({ ...category, id: newId })
      newCategoryMap.set(category.id, newId)
    }
  }

  // Merge prompts: keep existing + add new with unique IDs and mapped categoryIds
  const mergedPrompts: Prompt[] = [...existing.prompts]
  let addedCount = 0
  let skippedCount = 0

  for (const prompt of imported.prompts) {
    if (existingPromptIds.has(prompt.id)) {
      // Prompt exists, keep existing
      skippedCount++
    } else {
      // New prompt, add with new ID and mapped categoryId
      const mappedCategoryId = newCategoryMap.get(prompt.categoryId) || prompt.categoryId
      mergedPrompts.push({
        ...prompt,
        id: crypto.randomUUID(),
        categoryId: mappedCategoryId
      })
      addedCount++
    }
  }

  return {
    prompts: mergedPrompts,
    categories: mergedCategories,
    addedCount,
    skippedCount
  }
}