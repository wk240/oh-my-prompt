import type { ImageAsset, PendingImageDelete, Prompt, StorageSchema } from '@oh-my-prompt/shared/types'
import { STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import { saveImage, deleteImageByPath, getCachedImageUrl } from './image-sync'
import { deleteCloudImage, uploadCloudImage } from './image-cloud-client'

export interface SavePromptImageAssetInput {
  promptId: string
  blob: Blob
  sourceUrl?: string
  canUseCloud: boolean
  width: number
  height: number
  size: number
  hash: string
}

async function readStorage(): Promise<StorageSchema> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] as StorageSchema
}

async function writeStorage(data: StorageSchema): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data })
}

function mapPrompt(data: StorageSchema, promptId: string, mapper: (prompt: Prompt) => Prompt): StorageSchema {
  return {
    ...data,
    userData: {
      ...data.userData,
      prompts: data.userData.prompts.map(prompt => prompt.id === promptId ? mapper(prompt) : prompt)
    },
    temporaryPrompts: data.temporaryPrompts?.map(prompt => prompt.id === promptId ? mapper(prompt) : prompt)
  }
}

export async function queuePendingImageDelete(imageId: string, cloudPath: string, error?: string): Promise<void> {
  const data = await readStorage()
  const existing = data.pendingImageDeletes || []
  const index = existing.findIndex(item => item.imageId === imageId && item.cloudPath === cloudPath)
  const nextItem: PendingImageDelete = index >= 0
    ? {
        ...existing[index],
        attempts: existing[index].attempts + 1,
        lastError: error,
        updatedAt: Date.now()
      }
    : {
        imageId,
        cloudPath,
        attempts: 1,
        lastError: error,
        updatedAt: Date.now()
      }
  const next = index >= 0
    ? existing.map((item, itemIndex) => itemIndex === index ? nextItem : item)
    : [...existing, nextItem]

  await writeStorage({ ...data, pendingImageDeletes: next })
}

export async function savePromptImageAsset(
  input: SavePromptImageAssetInput
): Promise<{ success: boolean; imageId?: string; localPath?: string; error?: string }> {
  const imageId = crypto.randomUUID()
  const saveResult = await saveImage(imageId, input.blob, `${imageId}.webp`)
  if (!saveResult.success || !saveResult.relativePath) {
    return { success: false, error: saveResult.error || 'WRITE_FAILED' }
  }

  const now = Date.now()
  const asset: ImageAsset = {
    id: imageId,
    promptId: input.promptId,
    localPath: saveResult.relativePath,
    sourceUrl: input.sourceUrl,
    mimeType: 'image/webp',
    width: input.width,
    height: input.height,
    size: input.size,
    hash: input.hash,
    status: input.canUseCloud ? 'pending_upload' : 'local_only',
    updatedAt: now
  }

  const data = await readStorage()
  const nextData = mapPrompt(data, input.promptId, prompt => ({
    ...prompt,
    imageId,
    localImage: saveResult.relativePath,
    remoteImageUrl: input.sourceUrl || prompt.remoteImageUrl,
    updatedAt: now
  }))

  await writeStorage({
    ...nextData,
    imageAssets: {
      ...(nextData.imageAssets || {}),
      [imageId]: asset
    }
  })

  if (input.canUseCloud) {
    void retryImageUpload(imageId)
  }

  return { success: true, imageId, localPath: saveResult.relativePath }
}

export async function retryImageUpload(imageId: string): Promise<void> {
  const data = await readStorage()
  const asset = data.imageAssets?.[imageId]
  if (!asset || (asset.status !== 'pending_upload' && asset.status !== 'upload_failed')) return
  if (asset.lastUploadAttemptAt && Date.now() - asset.lastUploadAttemptAt < 60_000) return

  await writeStorage({
    ...data,
    imageAssets: {
      ...(data.imageAssets || {}),
      [imageId]: {
        ...asset,
        lastUploadAttemptAt: Date.now()
      }
    }
  })

  const url = await getCachedImageUrl(asset.localPath)
  if (!url) {
    const latest = await readStorage()
    const latestAsset = latest.imageAssets?.[imageId]
    if (!latestAsset) return
    await writeStorage({
      ...latest,
      imageAssets: {
        ...(latest.imageAssets || {}),
        [imageId]: {
          ...latestAsset,
          status: 'missing_local',
          updatedAt: Date.now()
        }
      }
    })
    return
  }

  const blob = await fetch(url).then(response => response.blob())
  const result = await uploadCloudImage({
    imageId,
    promptId: asset.promptId,
    blob,
    hash: asset.hash,
    width: asset.width,
    height: asset.height,
    size: asset.size
  })
  const latest = await readStorage()
  const latestAsset = latest.imageAssets?.[imageId]
  if (!latestAsset) return

  await writeStorage({
    ...latest,
    imageAssets: {
      ...(latest.imageAssets || {}),
      [imageId]: result.success
        ? {
            ...latestAsset,
            cloudUrl: result.cloudUrl,
            cloudPath: result.cloudPath,
            size: result.size || latestAsset.size,
            status: 'synced',
            lastError: undefined,
            updatedAt: Date.now()
          }
        : {
            ...latestAsset,
            status: 'upload_failed',
            lastError: result.error,
            updatedAt: Date.now()
          }
    }
  })
}

export async function deletePromptImageAsset(promptId: string): Promise<void> {
  const data = await readStorage()
  const prompt = [...data.userData.prompts, ...(data.temporaryPrompts || [])].find(item => item.id === promptId)
  const imageId = prompt?.imageId
  if (!imageId) return

  const asset = data.imageAssets?.[imageId]
  const copiedCloudPath = asset?.cloudPath

  if (asset?.localPath) {
    await deleteImageByPath(asset.localPath)
  }

  const nextAssets = { ...(data.imageAssets || {}) }
  delete nextAssets[imageId]
  const now = Date.now()
  const nextData = mapPrompt(data, promptId, item => ({
    ...item,
    imageId: undefined,
    localImage: undefined,
    remoteImageUrl: undefined,
    updatedAt: now
  }))
  await writeStorage({ ...nextData, imageAssets: nextAssets })

  if (copiedCloudPath) {
    const result = await deleteCloudImage(imageId, copiedCloudPath)
    if (!result.success) {
      await queuePendingImageDelete(imageId, copiedCloudPath, result.error)
    }
  }
}
