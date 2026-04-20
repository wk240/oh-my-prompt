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

// Migration steps registry
const migrations: MigrationStep[] = [
  // 1.0 legacy → new structure (registered in v1.0.ts)
]

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

  // Execute each step
  let data = oldData
  for (const step of steps) {
    console.log(`[Oh My Prompt Script] Executing migration ${step.version}`)
    data = step.handler(data)
  }

  // Ensure final structure
  const result = data as StorageSchema
  result.version = targetVersion
  result._migrationComplete = true

  return result
}

// Import and register v1.0 migration
import './v1.0'