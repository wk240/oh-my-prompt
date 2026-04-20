import type { StorageSchema, LegacyStorageSchema, Prompt, Category } from '../../shared/types'
import { registerMigration } from './index'

/**
 * Migration from 1.0 legacy flat structure to new nested structure
 * Legacy: { prompts: [], categories: [], version: '1.0.0' }
 * New: { version, userData: { prompts, categories }, settings: {...} }
 */
function migrateFromLegacy(oldData: unknown): StorageSchema {
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

// Register this migration
registerMigration({
  version: '1.0',
  handler: migrateFromLegacy
})