# Prompt Image Cloud Backup And Download Design

## Goal

Complete the prompt image lifecycle so saved prompt images are backed up to cloud storage and can be restored automatically on another device or when the local image file is missing.

The target behavior is:

- Saved prompt images remain local-first.
- Pro and Team users automatically upload image binaries to Vercel Blob.
- Cloud sync continues to sync image metadata, not image bytes.
- Missing local images recover from `ImageAsset.cloudUrl`.
- Visible images recover first.
- A low-concurrency background queue fills in the rest.
- If no local sync folder is configured, the UI prompts the user to configure one before download recovery starts.
- Restore work runs through the extension service worker and offscreen file-system path, not directly from content scripts.

## Current State

The repository already has most of the upload-side foundation:

- `ImageAsset` and `PendingImageDelete` shared types exist.
- Cloud sync sends and restores `imageAssets` and `pendingImageDeletes`.
- `/api/images/upload` accepts normalized WebP image binaries and writes them to Vercel Blob.
- `/api/images/:imageId` deletes cloud images and metadata.
- `retryPendingImageUploads()` uploads `pending_upload`, `upload_failed`, and `local_only` assets before cloud sync.
- `getDisplayUrl(prompt)` can fall back to `asset.cloudUrl` for display when local loading fails.

The missing product loop is durable download recovery: cloud metadata can come back, and cloud URLs can display, but the extension still needs to write missing binaries back into the configured local image folder.

## Chosen Approach

Use a hybrid restore model.

1. **Visible-first restore:** When a prompt thumbnail, preview, or editor asks for a display URL, `getDisplayUrl(prompt)` checks the local file first. If the local file is missing and the asset has `cloudUrl`, it should trigger a single-image restore for that asset.
2. **Background restore:** After cloud restore or merge loads image metadata, the sync orchestrator should enqueue missing cloud-backed images for low-concurrency recovery.
3. **Folder-required restore:** If the local sync folder is missing or permission is unavailable, image recovery pauses and notifies UI to ask the user to configure or reauthorize the folder. Recovery resumes after the folder becomes available.

This keeps the app responsive, avoids a large download burst after sync, and restores the images the user sees first.

### Execution Context

Content scripts may request visible restore, but they must not perform file-system restore work directly. `FileSystemDirectoryHandle` access stays in the extension context and offscreen document path.

The restore flow should therefore be:

1. Content or sidepanel UI calls `getDisplayUrl(prompt)`.
2. If local load fails and `cloudUrl` exists, `getDisplayUrl` returns `cloudUrl` immediately.
3. `getDisplayUrl` sends an async runtime message to the service worker to enqueue restore.
4. The service worker owns restore queue execution.
5. Local file writes reuse the existing service-worker/offscreen image save path.

This avoids cross-origin handle issues and keeps visible restore safe when called from host-page content scripts.

## Data Model

No new persisted top-level shape is required.

Existing `ImageAsset` fields are enough:

- `id`: stable image ID and file name source.
- `promptId`: owning prompt.
- `localPath`: expected local path, normally `images/{imageId}.webp`.
- `cloudUrl`: public Vercel Blob URL used for recovery and temporary display.
- `cloudPath`: delete target.
- `hash`, `size`, `width`, `height`: metadata used for validation and sync hash.
- `status`: lifecycle state.
- `lastError`, `updatedAt`, `lastUploadAttemptAt`: retry and diagnostics metadata.

Recovery should use these status values:

- `synced`: local file and cloud backup are both expected to exist.
- `missing_local`: cloud metadata exists, but the local file is missing or folder access is not available.
- `upload_failed`: local file exists, but cloud upload failed.
- `local_only`: local file exists and is not yet cloud-backed.

When a cloud-backed asset is restored successfully, the service writes `images/{imageId}.webp` and updates:

```ts
{
  localPath: `images/${imageId}.webp`,
  status: asset.cloudUrl ? 'synced' : asset.status,
  lastError: undefined,
  updatedAt: Date.now()
}
```

No new persisted restore-attempt field is required for the first version. Restore throttling can be in memory because recovery is best-effort and can retry after extension restart. If restore retry state needs to survive restarts later, add explicit restore metadata instead of overloading `updatedAt` or `lastUploadAttemptAt`.

## Components

### `image-cloud-client`

Add a small download helper:

```ts
downloadCloudImage(
  url: string,
  expected?: { size?: number; hash?: string }
): Promise<{ success: boolean; blob?: Blob; error?: string }>
```

Responsibilities:

- Fetch the `cloudUrl`.
- Require an image response or tolerate missing content type only if Blob data is valid enough for the existing local save path.
- Enforce the existing single-image size limit.
- Verify the downloaded blob is a WebP image before writing it locally.
- Compare the downloaded size with `expected.size` when available.
- Compute SHA-256 and compare it with `expected.hash` when available.
- Return structured errors such as `DOWNLOAD_FAILED`, `FILE_TOO_LARGE`, and `INVALID_RESPONSE`.

No new web API is required for the first version because `cloudUrl` is already public Vercel Blob storage. If Blob URLs later become private, this helper can switch to an authenticated image download endpoint without changing callers.

For users who later lose Pro or Team eligibility, already-synced image metadata may still contain public `cloudUrl` values. Restore should allow recovery from those existing URLs, but new uploads remain gated by the existing cloud sync subscription checks.

### `image-sync`

The existing `saveImage(imageId, blob, filename)` path should be reused to write restored images as `images/{imageId}.webp`.

Recovery depends on the existing folder helpers:

- `isFolderConfigured()`
- `getFolderHandle()`
- `checkFolderPermission()`
- `requestFolderPermission()`

If the folder is missing or permission cannot be restored, the recovery service should not attempt the download.

Background restore must not trigger a browser permission prompt by itself. If permission is `prompt` or `denied`, the service pauses restore, emits the folder-required notification, and lets the sidepanel perform configuration or reauthorization from a user gesture.

### `image-asset-service`

Add three prompt-facing recovery functions:

```ts
restorePromptImageAsset(imageId: string, options?: { priority?: 'visible' | 'background' }): Promise<boolean>
restoreMissingCloudImages(options?: { priority?: 'background' }): Promise<boolean>
notifyImageRestoreFolderRequired(): void
```

Content-script callers should reach these through a runtime message, for example:

```ts
MessageType.ENQUEUE_IMAGE_RESTORE
```

with payload:

```ts
{
  imageId: string,
  priority: 'visible' | 'background'
}
```

Responsibilities:

- Dedupe concurrent restore attempts by `imageId`.
- Skip assets without `cloudUrl`.
- Check local file first to avoid unnecessary downloads.
- Mark missing local assets as `missing_local`.
- Notify UI for folder configuration when needed.
- Download the cloud image.
- Validate downloaded size, WebP signature, and hash before saving.
- Save it back to `images/{imageId}.webp`.
- Update `imageAssets[imageId]` after success or failure.

`getDisplayUrl(prompt)` should keep returning `cloudUrl` immediately if local loading fails, but it should also start a visible-priority restore in the background. That gives the user a visible image while the local backup heals.

### Restore Queue

Add or extend a queue for cloud image restore. The existing image load queue is display-oriented, so recovery should be separate or clearly named if reused.

Queue rules:

- Visible-priority items go before background items.
- Background concurrency should be low, such as 2.
- Repeated failures should not immediately loop; keep an in-memory failure backoff keyed by `imageId`.
- The queue should dedupe by `imageId`.
- Folder-required state pauses the queue until the user configures or reauthorizes the folder.
- A visible-priority enqueue may move an existing background item ahead, but it should not create a duplicate active restore.

### Sync Orchestrator

After cloud download and merge bring in image metadata, enqueue background recovery for assets where:

- `cloudUrl` exists.
- `localPath` is missing locally, or status is `missing_local`.
- The asset is still referenced by a prompt or temporary prompt.
- No pending delete exists for the same `imageId`.

Cloud sync should still run metadata sync even when image download recovery fails. Image binary recovery is a follow-up healing step, not a blocker for text prompt restore.

Hook this enqueue step after every path that applies restored or merged image metadata to storage:

- cloud `downloadAndMerge()` after merged data is applied.
- initial restore when storage is empty and local or cloud backup data is applied.
- manual replace restore after backup data is saved.
- any future restore path that writes `imageAssets` from backup data.

Merge mode that keeps only current `imageAssets` does not need cloud-backed recovery unless the merge result actually includes new cloud image metadata.

### UI Notification

When recovery needs a local folder, the extension should send a runtime message that existing UI surfaces can turn into a clear prompt.

Suggested message:

```ts
MessageType.IMAGE_RESTORE_FOLDER_REQUIRED
```

Payload:

```ts
{
  pendingCount: number
}
```

The sidepanel is the natural place to show the prompt because it already owns local sync folder setup flows. The prompt should ask the user to configure or reauthorize the local backup folder, then trigger background recovery again after success.

If the sidepanel is not open, the service worker may store the pending notification state and surface it the next time sidepanel status is requested. It should not repeatedly spam runtime broadcasts while the queue is paused.

## Flow Details

### Save And Upload

1. User saves a prompt image.
2. The extension normalizes the image to WebP.
3. The image is written locally as `images/{imageId}.webp`.
4. `imageAssets[imageId]` is saved with `status: 'pending_upload'` for cloud-eligible users.
5. Cloud sync calls `retryPendingImageUploads()`.
6. Upload success writes `cloudUrl`, `cloudPath`, and `status: 'synced'`.
7. Upload failure records `status: 'upload_failed'` and `lastError`, without blocking prompt save.

### Visible Restore

1. UI calls `getDisplayUrl(prompt)`.
2. The service tries `asset.localPath`.
3. If local load fails and `asset.cloudUrl` exists, the service returns `asset.cloudUrl` for immediate display.
4. It enqueues `restorePromptImageAsset(asset.id, { priority: 'visible' })`.
5. The service worker restore queue validates and writes the image to the configured local folder.
6. Restore updates metadata.

### Background Restore

1. Cloud restore downloads prompt and image metadata.
2. The orchestrator merges local and cloud state.
3. The orchestrator enqueues missing cloud-backed assets.
4. The recovery queue downloads and writes images at low concurrency.
5. Failures update `lastError` and keep metadata available for future retry.

### Folder Missing

1. Restore checks folder availability before downloading.
2. If no folder is configured or permission is unavailable, the service marks affected assets `missing_local`.
3. The service emits `IMAGE_RESTORE_FOLDER_REQUIRED`.
4. The sidepanel prompts the user to configure or reauthorize the folder.
5. After folder setup succeeds, background restore resumes.

## Error Handling

- Missing cloud URL: skip recovery.
- Missing local folder: pause recovery and prompt the user.
- Permission prompt or denied: pause recovery and prompt reauthorization from sidepanel.
- Download failure: keep `cloudUrl`, set `status: 'missing_local'`, and update `lastError`.
- Invalid WebP, size mismatch, or hash mismatch: keep `cloudUrl`, set `status: 'missing_local'`, and update `lastError`.
- Save failure: keep `cloudUrl`, set `status: 'missing_local'`, and update `lastError`.
- Asset deleted during restore: discard the downloaded blob and do not recreate metadata.
- Pending cloud delete exists for image: skip restore.
- Subscription no longer eligible: allow recovery from existing `cloudUrl`; do not attempt new uploads.

## Testing

Unit coverage should include:

- `getDisplayUrl` returns `cloudUrl` and enqueues visible restore when local load fails.
- `restorePromptImageAsset` writes `images/{imageId}.webp` and marks asset `synced`.
- Restore skips assets without `cloudUrl`.
- Restore pauses and emits folder-required notification when no local folder is configured.
- Restore pauses instead of requesting permission directly when folder permission is `prompt`.
- Restore rejects invalid WebP, size mismatch, and hash mismatch.
- Restore records `missing_local` and `lastError` on download failure.
- Background restore dedupes queued image IDs and prioritizes visible items.
- Sync orchestrator enqueues background restore after cloud metadata restore.
- Service worker handles `ENQUEUE_IMAGE_RESTORE` from content callers.
- Pending deletes prevent asset restoration.

Integration coverage should include:

- Save image, upload image, cloud restore metadata, delete local file, then recover binary from `cloudUrl`.
- New-device restore with no folder configured prompts for folder setup before image download.
- Visible thumbnail fallback returns `cloudUrl` immediately while restore is queued through the service worker.

## Non-Goals

- No image bytes in JSON sync payloads.
- No zip export or browser download feature.
- No new cloud download API unless public Blob URL recovery proves insufficient.
- No shared image reference model; prompt deletion still owns image deletion.
