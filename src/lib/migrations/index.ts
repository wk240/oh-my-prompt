import type { StorageSchema } from '../../shared/types'

export interface MigrationStep {
  version: string
  handler: (data: unknown) => StorageSchema
}

/**
 * Simple semver comparison: returns negative if a < b, positive if a > b, 0 if equal
 * Only compares major.minor (ignores patch for simplicity)
 */
function semverCompare(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const parts = v.split('.').map(Number)
    return { major: parts[0] || 0, minor: parts[1] || 0 }
  }

  const va = parseVersion(a)
  const vb = parseVersion(b)

  if (va.major !== vb.major) return va.major - vb.major
  return va.minor - vb.minor
}

// Migration steps registry - initialized empty, populated by register.ts
const migrations: MigrationStep[] = []

/**
 * Register a migration step
 */
export function registerMigration(step: MigrationStep): void {
  migrations.push(step)
  migrations.sort((a, b) => semverCompare(a.version, b.version))
}

/**
 * Check if data is legacy format (flat prompts/categories)
 */
export function isLegacyFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return Array.isArray(obj.prompts) && Array.isArray(obj.categories) && !obj.userData
}

/**
 * Execute migration from old version to target version
 */
export async function migrate(
  oldData: unknown,
  targetVersion: string
): Promise<StorageSchema> {
  // Guard: Already migrated?
  if (oldData && typeof oldData === 'object') {
    const obj = oldData as Record<string, unknown>
    if (obj._migrationComplete === true) {
      return oldData as unknown as StorageSchema
    }
  }

  // Determine start version
  let startVersion = '1.0'
  if (oldData && typeof oldData === 'object') {
    const obj = oldData as Record<string, unknown>
    if (typeof obj.version === 'string') {
      startVersion = obj.version
    }
  }

  // Find migration steps to execute
  const steps = migrations.filter(m =>
    semverCompare(m.version, startVersion) >= 0 &&
    semverCompare(m.version, targetVersion) < 0
  )

  // Execute each step with error handling
  let data = oldData
  for (const step of steps) {
    try {
      console.log(`[Oh My Prompt Script] Executing migration ${step.version}`)
      data = step.handler(data)
    } catch (error) {
      console.error(`[Oh My Prompt Script] Migration ${step.version} failed:`, error)
      throw new Error(`Migration to ${targetVersion} failed at step ${step.version}`)
    }
  }

  // Ensure final structure
  const result = data as StorageSchema
  result.version = targetVersion
  result._migrationComplete = true

  return result
}