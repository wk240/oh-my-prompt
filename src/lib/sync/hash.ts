import type { UserData } from '../../shared/types'

/**
 * Compute SHA-256 hash of userData for deduplication
 * Sorts arrays by ID to ensure consistent hash regardless of order
 */
export async function computeUserDataHash(userData: UserData): Promise<string> {
  // Sort arrays by ID for consistent hash
  const sorted = {
    categories: [...userData.categories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        order: c.order
      })),
    prompts: [...userData.prompts]
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