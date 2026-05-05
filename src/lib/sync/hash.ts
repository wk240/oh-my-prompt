import type { UserData, Prompt } from '../../shared/types'

// Extended data structure for hash computation (includes temporary library)
export interface BackupData extends UserData {
  temporaryPrompts?: Prompt[]
}

/**
 * Compute SHA-256 hash of backup data (including temporary prompts) for deduplication
 * Sorts arrays by ID to ensure consistent hash regardless of order
 */
export async function computeBackupDataHash(backupData: BackupData): Promise<string> {
  // Sort arrays by ID for consistent hash
  const sorted = {
    categories: [...backupData.categories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        order: c.order
      })),
    prompts: [...backupData.prompts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        content: p.content,
        contentEn: p.contentEn,
        categoryId: p.categoryId,
        description: p.description,
        descriptionEn: p.descriptionEn,
        order: p.order,
        localImage: p.localImage,
        remoteImageUrl: p.remoteImageUrl
      })),
    temporaryPrompts: [...(backupData.temporaryPrompts || [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        content: p.content,
        contentEn: p.contentEn,
        categoryId: p.categoryId,
        description: p.description,
        descriptionEn: p.descriptionEn,
        order: p.order,
        localImage: p.localImage,
        remoteImageUrl: p.remoteImageUrl
      }))
  }

  const content = JSON.stringify(sorted)
  const buffer = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compute SHA-256 hash of userData for deduplication (legacy, for backward compatibility)
 * @deprecated Use computeBackupDataHash instead
 */
export async function computeUserDataHash(userData: UserData): Promise<string> {
  return computeBackupDataHash(userData)
}

/**
 * Extract hash from backup file content
 */
export function extractBackupHash(content: string): string | null {
  try {
    const parsed = JSON.parse(content)
    return parsed.contentHash || null
  } catch {
    return null
  }
}