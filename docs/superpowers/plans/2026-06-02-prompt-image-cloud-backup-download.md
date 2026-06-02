# Prompt Image Cloud Backup Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore missing local prompt image binaries from existing cloud image URLs while keeping prompt image sync local-first and metadata-only.

**Architecture:** Add a cloud download validator, then route all restore work through the extension service worker and existing offscreen-backed local image save path. Visible image calls enqueue visible-priority restore and return `cloudUrl` immediately, while cloud/local restore paths enqueue low-concurrency background healing after image metadata enters storage.

**Tech Stack:** Chrome Extension MV3, TypeScript, Vite, Vitest, File System Access API via offscreen document, Vercel Blob public URLs.

---

## File Structure

- Modify `packages/shared/messages.ts`: add typed message constants for restore enqueue, restore retry, and folder-required notification.
- Modify `packages/extension/src/lib/sync/image-cloud-client.ts`: add `downloadCloudImage()` and WebP/hash/size validation.
- Modify `packages/extension/src/lib/sync/image-asset-service.ts`: add restore queue, folder-required notification state, visible/background enqueue functions, and restore implementation.
- Modify `packages/extension/src/lib/sync/orchestrator.ts`: enqueue background image restore after cloud metadata merge is applied.
- Modify `packages/extension/src/lib/sync/sync-manager.ts`: enqueue background image restore after initial local restore and manual replace restore write image metadata into storage.
- Modify `packages/extension/src/background/service-worker.ts`: handle restore messages and route content-script visible requests to the restore queue.
- Modify `packages/extension/src/sidepanel/settings/BackupSection.tsx`: show a folder-required restore prompt and resume restore after folder setup or permission restore.
- Modify tests:
  - `packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts`
  - `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts`
  - `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`
  - `packages/extension/src/lib/sync/__tests__/sync-manager.test.ts`
  - `packages/extension/src/background/__tests__/service-worker.test.ts`

## Assumptions

- `ImageAsset.cloudUrl` remains a public Vercel Blob URL for this version.
- Restore may run for users who no longer have Pro or Team eligibility when metadata already contains `cloudUrl`; only new uploads remain gated by current upload logic.
- Restore state and backoff are in memory plus `chrome.storage.session` notification state; no new top-level persisted storage schema is added.
- Background restore must not call `requestFolderPermission()`. It checks folder/permission first and pauses when permission is `prompt` or `denied`.

## Success Criteria

- `getDisplayUrl(prompt)` returns `asset.cloudUrl` immediately when local load fails and enqueues visible-priority restore through `MessageType.ENQUEUE_IMAGE_RESTORE`.
- `restorePromptImageAsset()` writes `images/{imageId}.webp`, marks the asset `synced`, clears `lastError`, and keeps prompt compatibility fields intact.
- Folder missing or permission not granted pauses restore, marks affected assets `missing_local`, and emits one `IMAGE_RESTORE_FOLDER_REQUIRED` notification with a pending count.
- Background restore dedupes image IDs, runs at concurrency 2, lets visible enqueue move ahead of background work, and applies a short in-memory failure backoff.
- Cloud merge, initial restore, and manual replace restore enqueue background recovery after metadata enters storage.
- Pending cloud deletes prevent restoration for the same image ID.

---

### Task 1: Cloud Image Download Helper

**Files:**
- Modify: `packages/extension/src/lib/sync/image-cloud-client.ts`
- Modify: `packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts`

- [ ] **Step 1: Add failing tests for cloud image download validation**

Append these tests inside the existing `describe('image-cloud-client', () => { ... })` block in `packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts`:

```ts
  it('downloads and validates a WebP cloud image', async () => {
    const blob = new Blob([
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    ], { type: 'image/webp' })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(blob, {
      status: 200,
      headers: { 'Content-Type': 'image/webp' }
    }))

    const { downloadCloudImage } = await import('../image-cloud-client')
    const result = await downloadCloudImage('https://blob.test/image-1.webp', { size: blob.size })

    expect(result.success).toBe(true)
    expect(result.blob?.type).toBe('image/webp')
    expect(fetch).toHaveBeenCalledWith('https://blob.test/image-1.webp')
  })

  it('rejects a cloud download when the response is not WebP data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Blob(['png'], { type: 'image/png' }), {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    }))

    const { downloadCloudImage } = await import('../image-cloud-client')
    const result = await downloadCloudImage('https://blob.test/image-1.png')

    expect(result).toEqual({ success: false, error: 'INVALID_RESPONSE' })
  })

  it('rejects a cloud download when the expected size does not match', async () => {
    const blob = new Blob([
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    ], { type: 'image/webp' })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(blob, {
      status: 200,
      headers: { 'Content-Type': 'image/webp' }
    }))

    const { downloadCloudImage } = await import('../image-cloud-client')
    const result = await downloadCloudImage('https://blob.test/image-1.webp', { size: blob.size + 1 })

    expect(result).toEqual({ success: false, error: 'SIZE_MISMATCH' })
  })
```

- [ ] **Step 2: Run the focused cloud-client tests and verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- image-cloud-client.test.ts
```

Expected: FAIL with an error that `downloadCloudImage` is not exported.

- [ ] **Step 3: Implement `downloadCloudImage()`**

In `packages/extension/src/lib/sync/image-cloud-client.ts`, add this import at the top:

```ts
import { HARD_IMAGE_SIZE_LIMIT, computeBlobSha256 } from './image-processing'
```

Add these interfaces after `UploadCloudImageResult`:

```ts
export interface DownloadCloudImageExpected {
  size?: number
  hash?: string
}

export interface DownloadCloudImageResult {
  success: boolean
  blob?: Blob
  error?: 'DOWNLOAD_FAILED' | 'FILE_TOO_LARGE' | 'INVALID_RESPONSE' | 'SIZE_MISMATCH' | 'HASH_MISMATCH' | string
}
```

Add these helpers before `uploadCloudImage()`:

```ts
async function isWebpBlob(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  return header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
}

function normalizeDownloadedWebp(blob: Blob): Blob {
  return blob.type === 'image/webp' ? blob : new Blob([blob], { type: 'image/webp' })
}
```

Add this exported function before `uploadCloudImage()`:

```ts
export async function downloadCloudImage(
  url: string,
  expected: DownloadCloudImageExpected = {}
): Promise<DownloadCloudImageResult> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `HTTP_${response.status}` }
    }

    const blob = await response.blob()
    if (blob.size > HARD_IMAGE_SIZE_LIMIT) {
      return { success: false, error: 'FILE_TOO_LARGE' }
    }

    const contentType = response.headers.get('Content-Type') || ''
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return { success: false, error: 'INVALID_RESPONSE' }
    }

    if (!await isWebpBlob(blob)) {
      return { success: false, error: 'INVALID_RESPONSE' }
    }

    if (expected.size !== undefined && blob.size !== expected.size) {
      return { success: false, error: 'SIZE_MISMATCH' }
    }

    if (expected.hash) {
      const hash = await computeBlobSha256(blob)
      if (hash !== expected.hash) {
        return { success: false, error: 'HASH_MISMATCH' }
      }
    }

    return { success: true, blob: normalizeDownloadedWebp(blob) }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) || 'DOWNLOAD_FAILED' }
  }
}
```

- [ ] **Step 4: Run the focused cloud-client tests and verify they pass**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- image-cloud-client.test.ts
```

Expected: PASS for `image-cloud-client`.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/image-cloud-client.ts packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts
git commit -m "feat: add cloud image download validation"
```

---

### Task 2: Restore Service And Queue

**Files:**
- Modify: `packages/extension/src/lib/sync/image-asset-service.ts`
- Modify: `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts`

- [ ] **Step 1: Add failing tests for restore success, skip, folder pause, invalid download, and pending delete**

Update imports in `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts`:

```ts
import {
  clearImageRestoreQueueForTests,
  deletePromptImageAsset,
  drainPendingImageDeletes,
  enqueueImageRestore,
  queuePendingImageDelete,
  restorePromptImageAsset,
  retryImageUpload,
  retryPendingImageUploads,
  savePromptImageAsset
} from '../image-asset-service'
import { deleteImageByPath, getCachedImageUrl, saveImage } from '../image-sync'
import { deleteCloudImage, downloadCloudImage, uploadCloudImage } from '../image-cloud-client'
```

Update the `vi.mock('../image-cloud-client'...)` block:

```ts
vi.mock('../image-cloud-client', () => ({
  uploadCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' })),
  downloadCloudImage: vi.fn(async () => ({ success: true, blob: new Blob(['restored'], { type: 'image/webp' }) })),
  deleteCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' }))
}))
```

Add this helper inside `describe('image-asset-service', () => { ... })` before `beforeEach`:

```ts
  function addCloudBackedMissingAsset(): void {
    storageData.userData.prompts[0] = {
      ...storageData.userData.prompts[0],
      imageId: 'image-1',
      localImage: 'images/image-1.webp',
      remoteImageUrl: 'https://source.test/image.png'
    }
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudUrl: 'https://blob.test/image-1.webp',
        cloudPath: 'users/u/images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 12,
        hash: 'hash-1',
        status: 'missing_local',
        updatedAt: 1
      }
    }
  }
```

Add these resets to `beforeEach()`:

```ts
    clearImageRestoreQueueForTests()
    vi.mocked(downloadCloudImage).mockReset().mockResolvedValue({
      success: true,
      blob: new Blob(['restored'], { type: 'image/webp' })
    })
```

Extend `global.chrome` in `beforeEach()` with runtime and storage session:

```ts
      runtime: {
        sendMessage: vi.fn(async () => ({ success: true })),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({ prompt_script_data: storageData })),
          set: vi.fn(async value => {
            storageData = value.prompt_script_data
          })
        },
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined)
        }
      }
```

Append these tests near the restore-related upload tests:

```ts
  it('restores a missing cloud-backed image and marks the asset synced', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(true)
    expect(downloadCloudImage).toHaveBeenCalledWith('https://blob.test/image-1.webp', {
      size: 12,
      hash: 'hash-1'
    })
    expect(saveImage).toHaveBeenCalledWith('image-1', expect.any(Blob), 'image-1.webp')
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      localPath: 'images/image-1.webp',
      status: 'synced',
      lastError: undefined
    })
  })

  it('skips restore for an asset without cloudUrl', async () => {
    addCloudBackedMissingAsset()
    delete storageData.imageAssets?.['image-1'].cloudUrl

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('pauses restore and notifies UI when folder permission is prompt', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'prompt' }
    })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'missing_local',
      lastError: 'PERMISSION_PROMPT'
    })
    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      imageRestoreFolderRequiredPendingCount: 1
    })
  })

  it('records missing_local when cloud download validation fails', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })
    vi.mocked(downloadCloudImage).mockResolvedValueOnce({ success: false, error: 'HASH_MISMATCH' })

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(true)
    expect(saveImage).not.toHaveBeenCalled()
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      status: 'missing_local',
      lastError: 'HASH_MISMATCH'
    })
  })

  it('skips restore while a pending cloud delete exists for the image', async () => {
    addCloudBackedMissingAsset()
    storageData.pendingImageDeletes = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1,
      updatedAt: 1
    }]

    const result = await restorePromptImageAsset('image-1')

    expect(result).toBe(false)
    expect(downloadCloudImage).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('prioritizes visible restore over queued background restore', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValue(null)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      data: { hasFolder: true, permission: 'granted' }
    })

    enqueueImageRestore('background-image', { priority: 'background' })
    enqueueImageRestore('image-1', { priority: 'visible' })

    await vi.waitFor(() => {
      expect(downloadCloudImage).toHaveBeenCalledWith('https://blob.test/image-1.webp', expect.any(Object))
    })
  })
```

- [ ] **Step 2: Run the focused image-asset-service tests and verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- image-asset-service.test.ts
```

Expected: FAIL with missing exports for `restorePromptImageAsset`, `enqueueImageRestore`, and `clearImageRestoreQueueForTests`.

- [ ] **Step 3: Implement restore queue and restore functions**

In `packages/extension/src/lib/sync/image-asset-service.ts`, update imports:

```ts
import { saveImage, deleteImageByPath, getCachedImageUrl } from './image-sync'
import { deleteCloudImage, downloadCloudImage, uploadCloudImage } from './image-cloud-client'
```

Add these types and queue state after `type DeletePromptImageAssetResult`:

```ts
type RestorePriority = 'visible' | 'background'
type RestoreQueueItem = { imageId: string; priority: RestorePriority }

const IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY = 'imageRestoreFolderRequiredPendingCount'
const RESTORE_CONCURRENCY = 2
const RESTORE_FAILURE_BACKOFF_MS = 60_000

const restoreQueue: RestoreQueueItem[] = []
const activeRestores = new Set<string>()
const restoreFailureBackoff = new Map<string, number>()
let activeRestoreCount = 0
let restoreQueuePausedForFolder = false
let lastFolderRequiredPendingCount = 0
```

Add these helpers after `markImageAssetStatus()`:

```ts
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

function scheduleRestoreQueue(): void {
  void processRestoreQueue()
}

async function processRestoreQueue(): Promise<void> {
  if (restoreQueuePausedForFolder) return

  while (activeRestoreCount < RESTORE_CONCURRENCY && restoreQueue.length > 0) {
    const item = restoreQueue.shift()
    if (!item || activeRestores.has(item.imageId)) continue

    const backoffUntil = restoreFailureBackoff.get(item.imageId)
    if (backoffUntil && Date.now() < backoffUntil) continue

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
```

Add these exports before `retryImageUpload()`:

```ts
export function enqueueImageRestore(
  imageId: string,
  options: { priority?: RestorePriority } = {}
): void {
  const priority = options.priority || 'background'
  const existingIndex = restoreQueue.findIndex(item => item.imageId === imageId)

  if (existingIndex >= 0) {
    const existing = restoreQueue[existingIndex]
    restoreQueue.splice(existingIndex, 1)
    restoreQueue.unshift({
      imageId,
      priority: existing.priority === 'visible' || priority === 'visible' ? 'visible' : 'background'
    })
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
    if (localUrl) return false
  }

  const folder = await checkRestoreFolderAvailable()
  if (!folder.available) {
    restoreQueuePausedForFolder = true
    await updateMissingLocal(imageId, folder.error || 'FOLDER_NOT_CONFIGURED')
    await notifyImageRestoreFolderRequired(restoreQueue.length + activeRestores.size + 1)
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
  if (!latestAsset || hasPendingImageDelete(latestBeforeSave, imageId) || !isAssetReferenced(latestBeforeSave, imageId)) {
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
  const result = await chrome.storage.session?.get?.(IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY).catch(() => ({})) || {}
  const pendingCount = Number(result[IMAGE_RESTORE_FOLDER_REQUIRED_SESSION_KEY] || lastFolderRequiredPendingCount || 0)
  return {
    folderRequired: pendingCount > 0 || restoreQueuePausedForFolder,
    pendingCount
  }
}

export function clearImageRestoreQueueForTests(): void {
  restoreQueue.length = 0
  activeRestores.clear()
  restoreFailureBackoff.clear()
  activeRestoreCount = 0
  restoreQueuePausedForFolder = false
  lastFolderRequiredPendingCount = 0
}
```

- [ ] **Step 4: Run the focused image-asset-service tests and verify they pass**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- image-asset-service.test.ts
```

Expected: PASS for `image-asset-service`.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/image-asset-service.ts packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts
git commit -m "feat: restore missing cloud-backed images"
```

---

### Task 3: Visible Restore Message And Display Fallback

**Files:**
- Modify: `packages/shared/messages.ts`
- Modify: `packages/extension/src/lib/sync/image-asset-service.ts`
- Modify: `packages/extension/src/background/service-worker.ts`
- Modify: `packages/extension/src/background/__tests__/service-worker.test.ts`
- Modify: `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts`

- [ ] **Step 1: Add failing tests for visible display enqueue and service worker message routing**

Update `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts` import list to include `getDisplayUrl`.

Append this test:

```ts
  it('returns cloudUrl and enqueues visible restore when local display loading fails', async () => {
    addCloudBackedMissingAsset()
    vi.mocked(getCachedImageUrl).mockResolvedValueOnce(null)

    const result = await getDisplayUrl(storageData.userData.prompts[0])

    expect(result).toBe('https://blob.test/image-1.webp')
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.ENQUEUE_IMAGE_RESTORE,
      payload: {
        imageId: 'image-1',
        priority: 'visible'
      }
    })
  })
```

In `packages/extension/src/background/__tests__/service-worker.test.ts`, add a mock for restore functions near existing sync mocks:

```ts
vi.mock('../../lib/sync/image-asset-service', () => ({
  enqueueImageRestore: vi.fn(),
  getImageRestoreStatus: vi.fn(async () => ({ folderRequired: false, pendingCount: 0 })),
  restoreMissingCloudImages: vi.fn(async () => true)
}))
```

Add this test near the runtime message tests:

```ts
  it('handles ENQUEUE_IMAGE_RESTORE from content callers', async () => {
    const { enqueueImageRestore } = await import('../../lib/sync/image-asset-service')
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({
      type: MessageType.ENQUEUE_IMAGE_RESTORE,
      payload: { imageId: 'image-1', priority: 'visible' }
    }, sendResponse)

    expect(enqueueImageRestore).toHaveBeenCalledWith('image-1', { priority: 'visible' })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- image-asset-service.test.ts service-worker.test.ts
```

Expected: FAIL because `MessageType.ENQUEUE_IMAGE_RESTORE` does not exist and service worker has no case for it.

- [ ] **Step 3: Add shared restore messages**

In `packages/shared/messages.ts`, add these enum values after `READ_IMAGE` / `DELETE_IMAGE`:

```ts
  ENQUEUE_IMAGE_RESTORE = 'ENQUEUE_IMAGE_RESTORE',  // Enqueue cloud-backed image restore through service worker
  RESTORE_MISSING_CLOUD_IMAGES = 'RESTORE_MISSING_CLOUD_IMAGES',  // Resume/enqueue all missing cloud-backed images
  GET_IMAGE_RESTORE_STATUS = 'GET_IMAGE_RESTORE_STATUS',  // Read paused restore notification state
  IMAGE_RESTORE_FOLDER_REQUIRED = 'IMAGE_RESTORE_FOLDER_REQUIRED',  // SW → UI: local folder needed for restore
```

- [ ] **Step 4: Update visible fallback to enqueue through runtime message**

In `packages/extension/src/lib/sync/image-asset-service.ts`, replace the `asset.cloudUrl` fallback inside `getDisplayUrl(prompt)` with:

```ts
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
```

- [ ] **Step 5: Add service worker message handling**

In `packages/extension/src/background/service-worker.ts`, add this import:

```ts
import { enqueueImageRestore, getImageRestoreStatus, restoreMissingCloudImages } from '../lib/sync/image-asset-service'
```

Add these cases before `case MessageType.SAVE_IMAGE:`:

```ts
      case MessageType.ENQUEUE_IMAGE_RESTORE: {
        const payload = message.payload as { imageId?: string; priority?: 'visible' | 'background' } | undefined
        if (!payload?.imageId) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        enqueueImageRestore(payload.imageId, { priority: payload.priority || 'background' })
        sendResponse({ success: true })
        return true
      }

      case MessageType.RESTORE_MISSING_CLOUD_IMAGES:
        restoreMissingCloudImages({ priority: 'background' })
          .then(enqueued => sendResponse({ success: true, data: { enqueued } } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] RESTORE_MISSING_CLOUD_IMAGES error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      case MessageType.GET_IMAGE_RESTORE_STATUS:
        getImageRestoreStatus()
          .then(status => sendResponse({ success: true, data: status } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] GET_IMAGE_RESTORE_STATUS error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- image-asset-service.test.ts service-worker.test.ts
```

Expected: PASS for visible fallback and service worker routing.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/messages.ts packages/extension/src/lib/sync/image-asset-service.ts packages/extension/src/background/service-worker.ts packages/extension/src/background/__tests__/service-worker.test.ts packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts
git commit -m "feat: enqueue visible image restore through service worker"
```

---

### Task 4: Background Restore Hooks After Metadata Restore

**Files:**
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`
- Modify: `packages/extension/src/lib/sync/sync-manager.ts`
- Modify: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`
- Modify: `packages/extension/src/lib/sync/__tests__/sync-manager.test.ts`

- [ ] **Step 1: Add failing orchestrator test for cloud merge restore enqueue**

In `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`, add this mock near other mocks:

```ts
vi.mock('../image-asset-service', () => ({
  drainPendingImageDeletes: vi.fn(async () => false),
  restoreMissingCloudImages: vi.fn(async () => true),
  retryPendingImageUploads: vi.fn(async () => false)
}))
```

Append this test inside `describe('SyncOrchestrator', () => { ... })`:

```ts
  it('enqueues background image restore after applying cloud metadata merge', async () => {
    const { restoreMissingCloudImages } = await import('../image-asset-service')
    const cloudData = makeBackupData({
      prompts: [{
        id: 'prompt-1',
        name: 'Prompt',
        content: 'Text',
        categoryId: 'cat-1',
        order: 0,
        imageId: 'image-1',
        localImage: 'images/image-1.webp',
        updatedAt: 2
      }],
      categories: [{ id: 'cat-1', name: 'Cat', order: 0, updatedAt: 2 }],
      temporaryPrompts: [],
      timestamp: 2
    })
    cloudData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudUrl: 'https://blob.test/image-1.webp',
        cloudPath: 'users/u/images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 12,
        hash: 'hash-1',
        status: 'missing_local',
        updatedAt: 2
      }
    }

    vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)

    await orchestrator.downloadAndMerge({ reason: 'manual' })

    expect(restoreMissingCloudImages).toHaveBeenCalledWith({ priority: 'background' })
  })
```

- [ ] **Step 2: Add failing sync-manager restore tests**

In `packages/extension/src/lib/sync/__tests__/sync-manager.test.ts`, add or extend the `image-asset-service` mock:

```ts
vi.mock('../image-asset-service', () => ({
  restoreMissingCloudImages: vi.fn(async () => true)
}))
```

Add this assertion to the existing replace restore success test, or create this focused test if no equivalent exists:

```ts
  it('enqueues background image restore after replace restore writes image metadata', async () => {
    const { restoreMissingCloudImages } = await import('../image-asset-service')

    await restoreFromBackup('omps-latest.json', false, 'replace')

    expect(restoreMissingCloudImages).toHaveBeenCalledWith({ priority: 'background' })
  })
```

- [ ] **Step 3: Run focused sync tests and verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts sync-manager.test.ts
```

Expected: FAIL because no restore hook is called after metadata restore.

- [ ] **Step 4: Hook `SyncOrchestrator.downloadAndMerge()`**

In `packages/extension/src/lib/sync/orchestrator.ts`, update the image asset service import:

```ts
import { drainPendingImageDeletes, restoreMissingCloudImages, retryPendingImageUploads } from './image-asset-service'
```

After `await this.applyData(result.data)` in `downloadAndMerge()`, add:

```ts
    await restoreMissingCloudImages({ priority: 'background' })
```

- [ ] **Step 5: Hook initial and manual replace restore in `sync-manager.ts`**

In `packages/extension/src/lib/sync/sync-manager.ts`, add this import:

```ts
import { restoreMissingCloudImages } from './image-asset-service'
```

After the `storageManager.saveData(...)` call in the `initialSync()` branch that restores `localData` into empty storage, add:

```ts
      await restoreMissingCloudImages({ priority: 'background' })
```

After the `storageManager.saveData(...)` call in `restoreFromBackup(..., mode: 'replace')`, add:

```ts
    await restoreMissingCloudImages({ priority: 'background' })
```

Do not add a hook to the current `mode === 'merge'` branch because that branch keeps `currentData.imageAssets` and does not apply backup image metadata.

- [ ] **Step 6: Run focused sync tests and verify they pass**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts sync-manager.test.ts
```

Expected: PASS for restore enqueue hooks.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts packages/extension/src/lib/sync/sync-manager.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts packages/extension/src/lib/sync/__tests__/sync-manager.test.ts
git commit -m "feat: enqueue image restore after metadata sync"
```

---

### Task 5: Sidepanel Folder-Required Prompt And Resume

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/BackupSection.tsx`

- [ ] **Step 1: Add restore notification state and status loader**

In `packages/extension/src/sidepanel/settings/BackupSection.tsx`, add this state near other `useState` declarations:

```tsx
  const [imageRestorePendingCount, setImageRestorePendingCount] = useState(0)
```

Add this callback near `loadBackupStatus`:

```tsx
  const loadImageRestoreStatus = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_IMAGE_RESTORE_STATUS })
      if (response?.success && response.data?.folderRequired) {
        setImageRestorePendingCount(response.data.pendingCount || 0)
      } else {
        setImageRestorePendingCount(0)
      }
    } catch {
      setImageRestorePendingCount(0)
    }
  }, [])
```

Call it where backup status is loaded on mount:

```tsx
    loadImageRestoreStatus()
```

- [ ] **Step 2: Listen for folder-required restore notifications**

Add this effect near the existing runtime message listeners:

```tsx
  useEffect(() => {
    const handleImageRestoreMessage = (message: { type?: MessageType; payload?: { pendingCount?: number } }) => {
      if (message.type === MessageType.IMAGE_RESTORE_FOLDER_REQUIRED) {
        setImageRestorePendingCount(message.payload?.pendingCount || 1)
      }
    }

    chrome.runtime.onMessage.addListener(handleImageRestoreMessage)
    return () => chrome.runtime.onMessage.removeListener(handleImageRestoreMessage)
  }, [])
```

- [ ] **Step 3: Resume restore after folder setup or permission restore**

In `handleRestorePermission()`, after the existing `chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC })` line, add:

```tsx
        chrome.runtime.sendMessage({ type: MessageType.RESTORE_MISSING_CLOUD_IMAGES }).catch(() => { /* Ignore restore retry errors */ })
        setImageRestorePendingCount(0)
```

In `handleChangeFolder()`, inside `if (result.success) { ... }` after `await loadBackupStatus()`, add:

```tsx
        chrome.runtime.sendMessage({ type: MessageType.RESTORE_MISSING_CLOUD_IMAGES }).catch(() => { /* Ignore restore retry errors */ })
        setImageRestorePendingCount(0)
```

In `handleEnableFolder()`, inside `if (result.success) { ... }` after `await loadBackupStatus()`, add:

```tsx
        chrome.runtime.sendMessage({ type: MessageType.RESTORE_MISSING_CLOUD_IMAGES }).catch(() => { /* Ignore restore retry errors */ })
        setImageRestorePendingCount(0)
```

- [ ] **Step 4: Render a concise restore prompt**

Find the existing backup status section where local folder permission warnings are rendered. Add this block above the normal local backup controls:

```tsx
      {imageRestorePendingCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium">需要本地备份文件夹来恢复图片</div>
          <div className="mt-1">
            有 {imageRestorePendingCount} 张云端图片等待下载到本地。请配置或恢复备份文件夹权限。
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={handleEnableFolder} disabled={loading}>
              配置文件夹
            </Button>
            <Button size="sm" variant="outline" onClick={handleRestorePermission} disabled={loading}>
              恢复权限
            </Button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run typecheck to catch JSX/import issues**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/sidepanel/settings/BackupSection.tsx
git commit -m "feat: prompt for folder before image restore"
```

---

### Task 6: Service Worker Restore Status Tests

**Files:**
- Modify: `packages/extension/src/background/__tests__/service-worker.test.ts`

- [ ] **Step 1: Add tests for restore status and resume messages**

Append these tests near the `ENQUEUE_IMAGE_RESTORE` test added in Task 3:

```ts
  it('handles GET_IMAGE_RESTORE_STATUS', async () => {
    const { getImageRestoreStatus } = await import('../../lib/sync/image-asset-service')
    vi.mocked(getImageRestoreStatus).mockResolvedValueOnce({ folderRequired: true, pendingCount: 2 })
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({ type: MessageType.GET_IMAGE_RESTORE_STATUS }, sendResponse)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { folderRequired: true, pendingCount: 2 }
      })
    })
  })

  it('handles RESTORE_MISSING_CLOUD_IMAGES', async () => {
    const { restoreMissingCloudImages } = await import('../../lib/sync/image-asset-service')
    vi.mocked(restoreMissingCloudImages).mockResolvedValueOnce(true)
    const sendResponse = vi.fn()

    dispatchRuntimeMessage({ type: MessageType.RESTORE_MISSING_CLOUD_IMAGES }, sendResponse)

    await vi.waitFor(() => {
      expect(restoreMissingCloudImages).toHaveBeenCalledWith({ priority: 'background' })
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { enqueued: true }
      })
    })
  })
```

- [ ] **Step 2: Run focused service worker tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- service-worker.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/background/__tests__/service-worker.test.ts
git commit -m "test: cover image restore worker messages"
```

---

### Task 7: Final Verification

**Files:**
- No source edits expected unless verification exposes a failure.

- [ ] **Step 1: Run all extension unit tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 2: Run extension typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 3: Run extension build**

Run:

```bash
npm run build --workspace=@oh-my-prompt/extension
```

Expected: PASS and `packages/extension/dist/` updates successfully.

- [ ] **Step 4: Manual MV3 smoke test**

Run:

```bash
npm run dev
```

Expected: extension dev build stays running without compile errors.

Manual checks:

1. Load `packages/extension/dist/` in `chrome://extensions`.
2. Configure a local backup folder in the sidepanel.
3. Use a storage fixture with a prompt whose `imageAssets[imageId]` has `cloudUrl` and `status: 'missing_local'`.
4. Delete or omit `images/{imageId}.webp` from the folder.
5. Open a prompt list surface that calls `getDisplayUrl(prompt)`.
6. Confirm the image displays from `cloudUrl` immediately.
7. Confirm `images/{imageId}.webp` appears in the configured folder.
8. Confirm `chrome.storage.local.prompt_script_data.imageAssets[imageId].status` becomes `synced`.
9. Remove folder permission and repeat; confirm the sidepanel shows the folder-required prompt and no browser permission prompt opens automatically.

- [ ] **Step 5: Commit any verification fixes**

If verification required code fixes, commit only those changed files:

```bash
git add <changed-files>
git commit -m "fix: stabilize image restore verification"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

**Spec coverage:** Covered upload-side non-changes, visible-first restore, background restore, folder-required pause, service-worker routing, offscreen-backed local save reuse, validation, pending delete skip, sync orchestrator hooks, sidepanel notification, and tests.

**Placeholder scan:** No prohibited placeholder wording is present in implementation steps. Each code-changing step includes exact snippets and paths.

**Type consistency:** Restore priority is consistently `'visible' | 'background'`; message names are `ENQUEUE_IMAGE_RESTORE`, `RESTORE_MISSING_CLOUD_IMAGES`, `GET_IMAGE_RESTORE_STATUS`, and `IMAGE_RESTORE_FOLDER_REQUIRED`; asset status remains the existing `ImageAsset['status']` union.
