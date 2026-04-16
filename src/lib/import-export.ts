/**
 * Import/Export utilities for prompt data
 * Provides JSON file download and validation for StorageSchema data.
 */

import type { StorageSchema } from '../shared/types'

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
 * Checks for required fields: prompts, categories, version
 */
export function validateImportData(json: unknown): ValidationResult {
  // Check if it's an object
  if (typeof json !== 'object' || json === null) {
    return { valid: false, error: 'JSON格式不正确' }
  }

  const data = json as Record<string, unknown>

  // Check required fields
  if (!Array.isArray(data.prompts)) {
    return { valid: false, error: '缺少 prompts 数组' }
  }
  if (!Array.isArray(data.categories)) {
    return { valid: false, error: '缺少 categories 数组' }
  }
  if (typeof data.version !== 'string') {
    return { valid: false, error: '缺少 version 字段' }
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

  // Validate default category exists
  const hasDefaultCategory = (data.categories as Array<{id: string}>).some(c => c.id === 'default')
  if (!hasDefaultCategory) {
    return { valid: false, error: '缺少默认分类，导入数据必须包含 id 为 "default" 的分类' }
  }

  // Validate prompts not empty when categories exist
  if (data.prompts.length === 0 && data.categories.length > 1) {
    return { valid: false, error: '提示词列表为空，请导入包含提示词的数据' }
  }

  return { valid: true, data: json as StorageSchema }
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