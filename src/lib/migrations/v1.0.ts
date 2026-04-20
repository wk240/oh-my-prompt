import type { StorageSchema, LegacyStorageSchema, Prompt, Category } from '../../shared/types'
import { isLegacyFormat } from './index'

/**
 * Migration from 1.0 legacy flat structure to new nested structure
 * Legacy: { prompts: [], categories: [], version: '1.0.0' }
 * New: { version, userData: { prompts, categories }, settings: {...} }
 */
export function migrateFromLegacy(oldData: unknown): StorageSchema {
  // Validate legacy format before casting
  if (!isLegacyFormat(oldData)) {
    console.warn('[Oh My Prompt Script] Data is not in legacy format, returning empty structure')
    return {
      version: '1.0.0',
      userData: { prompts: [], categories: [] },
      settings: { showBuiltin: true, syncEnabled: false },
      _migrationComplete: false
    }
  }

  const legacy = oldData as LegacyStorageSchema

  const prompts: Prompt[] = Array.isArray(legacy.prompts) ? legacy.prompts : []
  const categories: Category[] = Array.isArray(legacy.categories) ? legacy.categories : []

  return {
    version: legacy.version || '1.0.0',
    userData: { prompts, categories },
    settings: { showBuiltin: true, syncEnabled: false },
    _migrationComplete: false
  }
}

/**
 * Migration step definition for v1.0
 * Exported for explicit registration in register.ts
 */
export const v1_0Migration = {
  version: '1.0',
  handler: migrateFromLegacy
}