import type { ImageAsset, PendingImageDelete, Prompt, StorageSchema } from '@oh-my-prompt/shared/types'
import { STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { saveImage, deleteImageByPath, getCachedImageUrl } from './image-sync'
import { queueImageLoad } from './image-loader-queue'
import { deleteCloudImage, downloadCloudImage, uploadCloudImage } from './image-cloud-client'
import {
  HARD_IMAGE_SIZE_LIMIT,
  INITIAL_WEBP_QUALITY,
  MAX_IMAGE_SIDE,
  MIN_WEBP_QUALITY,
  TARGET_IMAGE_SIZE,
  computeBlobSha256
} from './image-processing'

export interface SavePromptImageAssetInput {
  promptId: string
  blob: Blob
  sourceUrl?: string
  canUseCloud: boolean
  width?: number
  height?: number
  size?: number
  hash?: string
}

type DeletePromptImageAssetResult = { success: boolean; error?: string }
type RestorePriority = 'visible' | 'background'
type RestoreQueueItem = { imageId: string; priority: RestorePriority }
export type PreparedImageAssetBlob = {
  blob: Blob
  width: number
  height: number
  size: number
  hash: string
}

const IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY = 'imageRestoreFolderRequiredPendingCount'
const RESTORE_CONCURRENCY = 2
const RESTORE_FAILURE_BACKOFF_MS = 60_000

const restoreQueue: RestoreQueueItem[] = []
const activeRestores = new Set<string>()
const restoreFailureBackoff = new Map<string, number>()
let activeRestoreCount = 0
let restoreQueuePausedForFolder = false
let lastFolderRequiredPendingCount = 0
let restoreQueueTimer: ReturnType<typeof setTimeout> | undefined
let pendingDeleteMutation: Promise<void> = Promise.resolve()

async function withPendingDeleteMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = pendingDeleteMutation.then(mutation, mutation)
  pendingDeleteMutation = run.then(() => undefined, () => undefined)
  return run
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

function findPrompt(data: StorageSchema, promptId: string): Prompt | undefined {
  return [...data.userData.prompts, ...(data.temporaryPrompts || [])].find(item => item.id === promptId)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR')
}

async function canvasToWebpBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality })
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('CANVAS_EXPORT_FAILED')),
      'image/webp',
      quality
    )
  })
}

async function normalizeImageBlob(blob: Blob): Promise<PreparedImageAssetBlob> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('NORMALIZE_UNAVAILABLE')
  }

  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null

    if (!context) {
      throw new Error('CANVAS_UNAVAILABLE')
    }

    context.drawImage(bitmap, 0, 0, width, height)

    let output = await canvasToWebpBlob(canvas, INITIAL_WEBP_QUALITY)
    if (output.size > TARGET_IMAGE_SIZE) {
      output = await canvasToWebpBlob(canvas, MIN_WEBP_QUALITY)
    }
    if (output.size > HARD_IMAGE_SIZE_LIMIT) {
      throw new Error('FILE_TOO_LARGE')
    }

    return {
      blob: output,
      width,
      height,
      size: output.size,
      hash: await computeBlobSha256(output)
    }
  } finally {
    bitmap.close()
  }
}

export async function normalizePromptImageBlob(blob: Blob): Promise<PreparedImageAssetBlob> {
  const arrayBuffer = await blob.arrayBuffer()
  const data = Array.from(new Uint8Array(arrayBuffer))

  if (typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function') {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.NORMALIZE_IMAGE,
      payload: {
        data,
        mimeType: blob.type
      }
    })

    if (response?.success && response.data) {
      const normalizedData = new Uint8Array(response.data.data)
      return {
        blob: new Blob([normalizedData], { type: response.data.mimeType || 'image/webp' }),
        width: response.data.width,
        height: response.data.height,
        size: response.data.size,
        hash: response.data.hash
      }
    }

    throw new Error(response?.error || 'NORMALIZE_FAILED')
  }

  return normalizeImageBlob(blob)
}

async function prepareImageAssetBlob(input: SavePromptImageAssetInput): Promise<PreparedImageAssetBlob> {
  if (
    input.width &&
    input.height &&
    input.size &&
    input.hash
  ) {
    return {
      blob: input.blob,
      width: input.width,
      height: input.height,
      size: input.size,
      hash: input.hash
    }
  }

  return normalizePromptImageBlob(input.blob)
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

function buildRestoredLocalPath(imageId: string): string {
  return `images/${imageId}.webp`
}

function isAssetReferenced(data: StorageSchema, imageId: string): boolean {
  return [...data.userData.prompts, ...(data.temporaryPrompts || [])].some(prompt => prompt.imageId === imageId)
}

function hasPendingImageDelete(data: StorageSchema, imageId: string): boolean {
  return (data.pendingImageDeletes || []).some(item => item.imageId === imageId)
}

async function checkRestoreFolderAvailable(): Promise<{ available: boolean; error?: string }> {
  const response = await chrome.runtime.sendMessage({
    type: MessageType.OFFSCREEN_CHECK_PERMISSION
  }).catch(error => ({ success: false, error: getErrorMessage(error) }))

  if (!response?.success || !response.data?.hasFolder) {
    return { available: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  if (response.data.permission !== 'granted') {
    return {
      available: false,
      error: response.data.permission === 'prompt' ? 'PERMISSION_PROMPT' : 'PERMISSION_DENIED'
    }
  }

  return { available: true }
}

async function updateMissingLocal(imageId: string, error: string): Promise<void> {
  await markImageAssetStatus(imageId, 'missing_local', error)
}

async function notifyImageRestoreFolderRequired(pendingCount: number): Promise<void> {
  lastFolderRequiredPendingCount = pendingCount
  await chrome.storage.session?.set?.({
    [IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY]: pendingCount
  }).catch(() => undefined)
  chrome.runtime.sendMessage({
    type: MessageType.IMAGE_RESTORE_FOLDER_REQUIRED,
    payload: { pendingCount }
  }).catch(() => undefined)
}

function getPendingRestoreCount(currentImageId?: string): number {
  return new Set([
    ...restoreQueue.map(item => item.imageId),
    ...activeRestores,
    ...(currentImageId ? [currentImageId] : [])
  ]).size
}

function scheduleRestoreQueue(delayMs = 0): void {
  if (delayMs > 0) {
    if (!restoreQueueTimer) {
      restoreQueueTimer = setTimeout(() => {
        restoreQueueTimer = undefined
        void processRestoreQueue()
      }, delayMs)
    }
    return
  }

  void processRestoreQueue()
}

async function processRestoreQueue(): Promise<void> {
  if (restoreQueuePausedForFolder) return

  let checkedCount = 0
  const initialQueueLength = restoreQueue.length
  while (activeRestoreCount < RESTORE_CONCURRENCY && restoreQueue.length > 0 && checkedCount < initialQueueLength) {
    const item = restoreQueue.shift()
    checkedCount++
    if (!item || activeRestores.has(item.imageId)) continue

    const backoffUntil = restoreFailureBackoff.get(item.imageId)
    if (backoffUntil && Date.now() < backoffUntil) {
      restoreQueue.push(item)
      scheduleRestoreQueue(backoffUntil - Date.now())
      continue
    }

    activeRestores.add(item.imageId)
    activeRestoreCount++
    void restorePromptImageAsset(item.imageId, { priority: item.priority })
      .then(restored => {
        if (!restored) {
          restoreFailureBackoff.set(item.imageId, Date.now() + RESTORE_FAILURE_BACKOFF_MS)
        }
      })
      .finally(() => {
        activeRestores.delete(item.imageId)
        activeRestoreCount--
        scheduleRestoreQueue()
      })
  }
}

export async function queuePendingImageDelete(imageId: string, cloudPath: string, error?: string): Promise<void> {
  await withPendingDeleteMutation(async () => {
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
  })
}

export async function savePromptImageAsset(
  input: SavePromptImageAssetInput
): Promise<{ success: boolean; imageId?: string; localPath?: string; error?: string }> {
  let prepared: PreparedImageAssetBlob
  try {
    prepared = await prepareImageAssetBlob(input)
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }

  const imageId = crypto.randomUUID()
  const saveResult = await saveImage(imageId, prepared.blob, `${imageId}.webp`)
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
    width: prepared.width,
    height: prepared.height,
    size: prepared.size,
    hash: prepared.hash,
    status: input.canUseCloud ? 'pending_upload' : 'local_only',
    updatedAt: now
  }

  const data = await readStorage()
  const existingPrompt = findPrompt(data, input.promptId)
  const replacedImageId = existingPrompt?.imageId
  const replacedAsset = replacedImageId ? data.imageAssets?.[replacedImageId] : undefined

  if (replacedAsset?.localPath) {
    let localDelete: { success: boolean; error?: string }
    try {
      localDelete = await deleteImageByPath(replacedAsset.localPath)
    } catch (error) {
      localDelete = { success: false, error: getErrorMessage(error) }
    }
    if (!localDelete.success) {
      await markImageAssetStatus(replacedImageId!, replacedAsset.status, localDelete.error || 'DELETE_FAILED')
      await deleteImageByPath(saveResult.relativePath).catch(() => undefined)
      return { success: false, error: localDelete.error || 'DELETE_FAILED' }
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

export async function getDisplayUrl(prompt: Prompt): Promise<string | null> {
  if (prompt.imageId) {
    const data = await readStorage()
    const asset = data.imageAssets?.[prompt.imageId]
    if (asset?.localPath) {
      const localUrl = await queueImageLoad(asset.localPath)
      if (localUrl) return localUrl
      if (asset.cloudUrl) {
        chrome.runtime?.sendMessage?.({
          type: MessageType.ENQUEUE_IMAGE_RESTORE,
          payload: {
            imageId: asset.id,
            priority: 'visible'
          }
        }).catch(() => {
          enqueueImageRestore(asset.id, { priority: 'visible' })
        })
        return asset.cloudUrl
      }
    }
  }

  if (prompt.localImage) {
    const legacyUrl = await queueImageLoad(prompt.localImage)
    if (legacyUrl) return legacyUrl
  }

  return prompt.remoteImageUrl || null
}

export function enqueueImageRestore(
  imageId: string,
  options: { priority?: RestorePriority } = {}
): void {
  const priority = options.priority || 'background'
  const existingIndex = restoreQueue.findIndex(item => item.imageId === imageId)

  if (existingIndex >= 0) {
    const existing = restoreQueue[existingIndex]
    if (priority === 'visible' && existing.priority !== 'visible') {
      restoreQueue.splice(existingIndex, 1)
      restoreQueue.unshift({ imageId, priority })
    }
  } else if (!activeRestores.has(imageId)) {
    if (priority === 'visible') {
      restoreQueue.unshift({ imageId, priority })
    } else {
      restoreQueue.push({ imageId, priority })
    }
  }

  scheduleRestoreQueue()
}

export async function restorePromptImageAsset(
  imageId: string,
  _options: { priority?: RestorePriority } = {}
): Promise<boolean> {
  const data = await readStorage()
  const asset = data.imageAssets?.[imageId]
  if (!asset?.cloudUrl) return false
  if (hasPendingImageDelete(data, imageId)) return false
  if (!isAssetReferenced(data, imageId)) return false

  if (asset.localPath) {
    const localUrl = await getCachedImageUrl(asset.localPath)
    if (localUrl) {
      const latest = await readStorage()
      const latestAsset = latest.imageAssets?.[imageId]
      if (!latestAsset || hasPendingImageDelete(latest, imageId) || !isAssetReferenced(latest, imageId)) {
        return false
      }
      if (latestAsset.status === 'synced' && latestAsset.lastError === undefined) return false
      await writeStorage({
        ...latest,
        imageAssets: {
          ...(latest.imageAssets || {}),
          [imageId]: {
            ...latestAsset,
            status: 'synced',
            lastError: undefined,
            updatedAt: Date.now()
          }
        }
      })
      restoreFailureBackoff.delete(imageId)
      return true
    }
  }

  const folder = await checkRestoreFolderAvailable()
  if (!folder.available) {
    restoreQueuePausedForFolder = true
    await updateMissingLocal(imageId, folder.error || 'FOLDER_NOT_CONFIGURED')
    await notifyImageRestoreFolderRequired(getPendingRestoreCount(imageId))
    return false
  }

  const download = await downloadCloudImage(asset.cloudUrl, {
    size: asset.size,
    hash: asset.hash
  })

  if (!download.success || !download.blob) {
    await updateMissingLocal(imageId, download.error || 'DOWNLOAD_FAILED')
    return true
  }

  const latestBeforeSave = await readStorage()
  const latestAsset = latestBeforeSave.imageAssets?.[imageId]
  if (
    !latestAsset ||
    hasPendingImageDelete(latestBeforeSave, imageId) ||
    !isAssetReferenced(latestBeforeSave, imageId)
  ) {
    return false
  }

  const saveResult = await saveImage(imageId, download.blob, `${imageId}.webp`)
  if (!saveResult.success) {
    await updateMissingLocal(imageId, saveResult.error || 'WRITE_FAILED')
    return true
  }

  const latest = await readStorage()
  const assetAfterSave = latest.imageAssets?.[imageId]
  if (!assetAfterSave || hasPendingImageDelete(latest, imageId) || !isAssetReferenced(latest, imageId)) {
    await deleteImageByPath(saveResult.relativePath || buildRestoredLocalPath(imageId)).catch(() => undefined)
    return false
  }

  await writeStorage({
    ...latest,
    imageAssets: {
      ...(latest.imageAssets || {}),
      [imageId]: {
        ...assetAfterSave,
        localPath: saveResult.relativePath || buildRestoredLocalPath(imageId),
        status: assetAfterSave.cloudUrl ? 'synced' : assetAfterSave.status,
        lastError: undefined,
        updatedAt: Date.now()
      }
    }
  })

  restoreFailureBackoff.delete(imageId)
  return true
}

export async function restoreMissingCloudImages(
  options: { priority?: RestorePriority } = {}
): Promise<boolean> {
  restoreQueuePausedForFolder = false
  lastFolderRequiredPendingCount = 0
  await chrome.storage.session?.remove?.(IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY).catch(() => undefined)

  const data = await readStorage()
  let enqueued = false
  const referencedIds = new Set(
    [...data.userData.prompts, ...(data.temporaryPrompts || [])]
      .map(prompt => prompt.imageId)
      .filter((imageId): imageId is string => Boolean(imageId))
  )

  for (const asset of Object.values(data.imageAssets || {})) {
    if (!asset.cloudUrl) continue
    if (!referencedIds.has(asset.id)) continue
    if (hasPendingImageDelete(data, asset.id)) continue
    if (asset.status !== 'missing_local') {
      const localUrl = asset.localPath ? await getCachedImageUrl(asset.localPath) : null
      if (localUrl) continue
    }
    enqueueImageRestore(asset.id, { priority: options.priority || 'background' })
    enqueued = true
  }

  return enqueued
}

export async function getImageRestoreStatus(): Promise<{ folderRequired: boolean; pendingCount: number }> {
  const result = await chrome.storage.session?.get?.(IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY)
    .catch(() => ({})) as Record<string, unknown> | undefined
  const pendingCount = Number(result?.[IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY] || lastFolderRequiredPendingCount || 0)
  return {
    folderRequired: pendingCount > 0 || restoreQueuePausedForFolder,
    pendingCount
  }
}

export function clearImageRestoreQueueForTests(): void {
  restoreQueue.length = 0
  activeRestores.clear()
  restoreFailureBackoff.clear()
  if (restoreQueueTimer) {
    clearTimeout(restoreQueueTimer)
    restoreQueueTimer = undefined
  }
  activeRestoreCount = 0
  restoreQueuePausedForFolder = false
  lastFolderRequiredPendingCount = 0
}

export async function retryImageUpload(imageId: string): Promise<boolean> {
  const data = await readStorage()
  const asset = data.imageAssets?.[imageId]
  if (!asset || (asset.status !== 'pending_upload' && asset.status !== 'upload_failed' && asset.status !== 'local_only')) return false
  if (asset.lastUploadAttemptAt && Date.now() - asset.lastUploadAttemptAt < 60_000) return false

  let url: string | null
  try {
    url = await getCachedImageUrl(asset.localPath)
  } catch (error) {
    await markImageAssetStatus(imageId, 'upload_failed', getErrorMessage(error))
    return true
  }

  if (!url) {
    await markImageAssetStatus(imageId, 'missing_local', 'LOCAL_IMAGE_MISSING')
    return true
  }

  let result: Awaited<ReturnType<typeof uploadCloudImage>>
  try {
    const response = await fetch(url)
    if (!response.ok) {
      await markImageAssetStatus(imageId, 'upload_failed', `HTTP_${response.status}`)
      return true
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
    return true
  }

  const latest = await readStorage()
  const latestAsset = latest.imageAssets?.[imageId]
  if (!latestAsset) {
    if (result.success && result.cloudPath) {
      const deleteResult = await deleteCloudImage(imageId, result.cloudPath)
        .catch(error => ({ success: false, error: getErrorMessage(error) }))
      if (!deleteResult.success) {
        await queuePendingImageDelete(imageId, result.cloudPath, deleteResult.error)
      }
    }
    return true
  }

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
  return true
}

export async function retryPendingImageUploads(): Promise<boolean> {
  const data = await readStorage()
  if (!data) return false
  const imageIds = Object.values(data.imageAssets || {})
    .filter(asset => asset.status === 'local_only' || asset.status === 'pending_upload' || asset.status === 'upload_failed')
    .map(asset => asset.id)

  let changed = false
  for (const imageId of imageIds) {
    changed = await retryImageUpload(imageId) || changed
  }
  return changed
}

export async function drainPendingImageDeletes(): Promise<boolean> {
  return withPendingDeleteMutation(async () => {
    const data = await readStorage()
    if (!data) return false
    const pendingDeletes = data.pendingImageDeletes || []
    if (pendingDeletes.length === 0) return false

    const remaining: PendingImageDelete[] = []
    for (const item of pendingDeletes) {
      const result = await deleteCloudImage(item.imageId, item.cloudPath)
        .catch(error => ({ success: false, error: getErrorMessage(error) }))
      if (!result.success) {
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          lastError: result.error,
          updatedAt: Date.now()
        })
      }
    }

    const latest = await readStorage()
    await writeStorage({ ...latest, pendingImageDeletes: remaining })
    return true
  })
}

export async function deletePromptImageAsset(promptId: string): Promise<DeletePromptImageAssetResult> {
  const data = await readStorage()
  const prompt = findPrompt(data, promptId)
  const imageId = prompt?.imageId || data.imageAssets?.[promptId]?.id || Object.values(data.imageAssets || {}).find(asset => asset.promptId === promptId)?.id

  const asset = imageId ? data.imageAssets?.[imageId] : undefined
  const localPath = asset?.localPath || prompt?.localImage
  if (!imageId && !localPath) return { success: true }

  const copiedCloudPath = asset?.cloudPath

  if (localPath) {
    const localDelete = await deleteImageByPath(localPath)
      .catch(error => ({ success: false, error: getErrorMessage(error) }))
    if (!localDelete.success) {
      if (imageId && asset) {
        await markImageAssetStatus(imageId, asset.status, localDelete.error || 'DELETE_FAILED')
      }
      return { success: false, error: localDelete.error || 'DELETE_FAILED' }
    }
  }

  const nextAssets = { ...(data.imageAssets || {}) }
  if (imageId) {
    delete nextAssets[imageId]
  }
  const now = Date.now()
  const nextData = mapPrompt(data, promptId, item => ({
    ...item,
    imageId: undefined,
    localImage: undefined,
    remoteImageUrl: undefined,
    updatedAt: now
  }))
  await writeStorage({ ...nextData, imageAssets: nextAssets })

  if (imageId && copiedCloudPath) {
    const result = await deleteCloudImage(imageId, copiedCloudPath)
      .catch(error => ({ success: false, error: getErrorMessage(error) }))
    if (!result.success) {
      await queuePendingImageDelete(imageId, copiedCloudPath, result.error)
    }
  }

  return { success: true }
}
