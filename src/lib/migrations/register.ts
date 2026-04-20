/**
 * Migration Registration Module
 * Explicitly registers all migration steps to avoid circular dependency issues.
 * This module is imported from storage.ts to ensure migrations are registered
 * before any migration operations occur.
 */

import { registerMigration } from './index'
import { v1_0Migration } from './v1.0'

/**
 * Register all migration steps
 * Called once at module initialization
 */
export function registerAllMigrations(): void {
  registerMigration(v1_0Migration)
}

// Auto-register when this module is imported
registerAllMigrations()