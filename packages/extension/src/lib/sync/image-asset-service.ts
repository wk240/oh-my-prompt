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

type DeletePromptImageAssetResult = { success: boolean; error?: string }

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

function findPrompt(data: StorageSchema, promptId: string): Prompt | undefined {
  return [...data.userData.prompts, ...(data.temporaryPrompts || [])].find(item => item.id === promptId)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR')
}

async function markImageAssetStatus(
  imageId: string,
  status: ImageAsset['status'],
  error?: string
): Promise<void> {
  const latest = await readStorage()
  const latestAsset = latest.imageAssets?.[imageId]
  if (!latestAsset) return

  await writeStorage({
    ...latest,
    imageAssets: {
      ...(latest.imageAssets || {}),
      [imageId]: {
        ...latestAsset,
        status,
        lastError: error,
        updatedAt: Date.now()
      }
    }
  })
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
  const existingPrompt = findPrompt(data, input.promptId)
  const replacedImageId = existingPrompt?.imageId
  const replacedAsset = replacedImageId ? data.imageAssets?.[replacedImageId] : undefined

  if (replacedAsset?.localPath) {
    try {
      await deleteImageByPath(replacedAsset.localPath)
    } catch {
      // Replacement should still move metadata forward; local cleanup can be retried manually from the old path if needed.
    }
  }

  const nextData = mapPrompt(data, input.promptId, prompt => ({
    ...prompt,
    imageId,
    localImage: saveResult.relativePath,
    remoteImageUrl: input.sourceUrl,
    updatedAt: now
  }))
  const nextAssets = { ...(nextData.imageAssets || {}) }
  if (replacedImageId) {
    delete nextAssets[replacedImageId]
  }
  nextAssets[imageId] = asset

  await writeStorage({
    ...nextData,
    imageAssets: nextAssets
  })

  if (replacedImageId && replacedAsset?.cloudPath) {
    const result = await deleteCloudImage(replacedImageId, replacedAsset.cloudPath)
      .catch(error => ({ success: false, error: getErrorMessage(error) }))
    if (!result.success) {
      await queuePendingImageDelete(replacedImageId, replacedAsset.cloudPath, result.error)
    }
  }

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

  let url: string | null
  try {
    url = await getCachedImageUrl(asset.localPath)
  } catch (error) {
    await markImageAssetStatus(imageId, 'upload_failed', getErrorMessage(error))
    return
  }

  if (!url) {
    await markImageAssetStatus(imageId, 'missing_local', 'LOCAL_IMAGE_MISSING')
    return
  }

  let result: Awaited<ReturnType<typeof uploadCloudImage>>
  try {
    const response = await fetch(url)
    if (!response.ok) {
      await markImageAssetStatus(imageId, 'upload_failed', `HTTP_${response.status}`)
      return
    }
    const blob = await response.blob()
    result = await uploadCloudImage({
      imageId,
      promptId: asset.promptId,
      blob,
      hash: asset.hash,
      width: asset.width,
      height: asset.height,
      size: asset.size
    })
  } catch (error) {
    await markImageAssetStatus(imageId, 'upload_failed', getErrorMessage(error))
    return
  }

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

export async function deletePromptImageAsset(promptId: string): Promise<DeletePromptImageAssetResult> {
  const data = await readStorage()
  const prompt = findPrompt(data, promptId)
  const imageId = prompt?.imageId
  if (!imageId) return { success: true }

  const asset = data.imageAssets?.[imageId]
  const copiedCloudPath = asset?.cloudPath

  if (asset?.localPath) {
    const localDelete = await deleteImageByPath(asset.localPath)
      .catch(error => ({ success: false, error: getErrorMessage(error) }))
    if (!localDelete.success) {
      await markImageAssetStatus(imageId, asset.status, localDelete.error || 'DELETE_FAILED')
      return { success: false, error: localDelete.error || 'DELETE_FAILED' }
    }
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
      .catch(error => ({ success: false, error: getErrorMessage(error) }))
    if (!result.success) {
      await queuePendingImageDelete(imageId, copiedCloudPath, result.error)
    }
  }

  return { success: true }
}
