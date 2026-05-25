import type { ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'

function preferLatestAsset(a: ImageAsset, b: ImageAsset): ImageAsset {
  const preferred = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a
  const fallback = preferred === a ? b : a

  return {
    ...preferred,
    cloudUrl: preferred.cloudUrl || fallback.cloudUrl,
    cloudPath: preferred.cloudPath || fallback.cloudPath,
    sourceUrl: preferred.sourceUrl || fallback.sourceUrl,
    lastUploadAttemptAt: preferred.lastUploadAttemptAt || fallback.lastUploadAttemptAt,
    lastError: preferred.lastError
  }
}

export function mergeImageAssets(
  cloud: Record<string, ImageAsset> = {},
  local: Record<string, ImageAsset> = {}
): Record<string, ImageAsset> {
  const merged: Record<string, ImageAsset> = {}
  const ids = new Set([...Object.keys(cloud), ...Object.keys(local)])

  for (const id of ids) {
    const cloudAsset = cloud[id]
    const localAsset = local[id]
    if (cloudAsset && localAsset) {
      merged[id] = preferLatestAsset(cloudAsset, localAsset)
    } else {
      merged[id] = cloudAsset || localAsset
    }
  }

  return merged
}

function deleteKey(item: PendingImageDelete): string {
  return `${item.imageId}\n${item.cloudPath}`
}

export function mergePendingImageDeletes(
  cloud: PendingImageDelete[] = [],
  local: PendingImageDelete[] = []
): PendingImageDelete[] {
  const byKey = new Map<string, PendingImageDelete>()

  for (const item of [...cloud, ...local]) {
    const key = deleteKey(item)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, item)
      continue
    }

    const latest = item.updatedAt >= existing.updatedAt ? item : existing

    byKey.set(key, {
      imageId: item.imageId,
      cloudPath: item.cloudPath,
      attempts: Math.max(existing.attempts, item.attempts),
      lastError: latest.lastError,
      updatedAt: Math.max(existing.updatedAt, item.updatedAt)
    })
  }

  return Array.from(byKey.values()).sort((a, b) => deleteKey(a).localeCompare(deleteKey(b)))
}
