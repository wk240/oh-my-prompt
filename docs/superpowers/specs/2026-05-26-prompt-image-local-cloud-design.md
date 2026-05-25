# Prompt Image Local-First Cloud Fallback Design

## Context

Oh My Prompt already supports prompt images through the local sync folder. Prompt records can store `localImage` and `remoteImageUrl`, image read/write routes through the service worker and offscreen document, and files are stored under the backup folder `images/` directory.

The current model does not separate image metadata from prompt text, does not have a first-party cloud image URL, and treats `remoteImageUrl` as the original source URL rather than a Vercel Blob recovery URL. This design adds local-first image assets with Vercel Blob as the Pro/Team cloud fallback.

## Goals

- Keep File System Access as the primary image storage path.
- Compress saved prompt images to WebP while preserving aspect ratio.
- Upload prompt images to Vercel Blob only for Pro/Team users with cloud sync access.
- Load images from the local folder first, using Vercel only to recover missing local files.
- Keep prompt save/delete flows usable when cloud upload/delete fails.
- Preserve compatibility with existing `localImage` and `remoteImageUrl` data.

## Non-Goals

- Multiple images per prompt.
- Image reuse or reference counting.
- Free-user cloud image quota.
- Vercel Image Optimization.
- Public sharing image access rules or hotlink protection.
- Manual orphan image cleanup UI.
- Preserving original image formats or transparent PNG special handling.

## Chosen Approach

Use an independent image asset index. Prompts keep a lightweight `imageId` reference while detailed image state lives in `imageAssets`.

This keeps prompt records focused on prompt content, avoids overloading `remoteImageUrl`, and gives upload retry, local recovery, delete retry, and future cleanup a clear home.

## Data Model

Extend prompts with a new optional reference:

```ts
interface Prompt {
  id: string
  imageId?: string

  // Existing fields kept for compatibility.
  localImage?: string
  remoteImageUrl?: string
}
```

Add image assets to the persisted storage schema:

```ts
interface ImageAsset {
  id: string
  promptId: string
  localPath: string
  cloudUrl?: string
  cloudPath?: string
  sourceUrl?: string
  mimeType: 'image/webp'
  width: number
  height: number
  size: number
  hash: string
  status: 'local_only' | 'synced' | 'pending_upload' | 'upload_failed' | 'missing_local'
  updatedAt: number
  lastUploadAttemptAt?: number
  lastError?: string
}
```

Storage shape:

```ts
prompt_script_data: {
  userData: { prompts, categories },
  temporaryPrompts,
  imageAssets?: Record<string, ImageAsset>,
  pendingImageDeletes?: Array<{
    imageId: string
    cloudPath: string
    attempts: number
    lastError?: string
    updatedAt: number
  }>
}
```

New writes should set `prompt.imageId`, `prompt.localImage`, and `imageAssets[imageId]`. `localImage` remains as a compatibility field so existing display code can be migrated incrementally. Existing legacy records without `imageId` continue to render through `localImage`; when a user replaces or re-saves the image, the prompt moves to the new asset model.

## Image Processing

All saved prompt images are normalized before local storage:

- Output format: `image/webp`.
- Aspect ratio is always preserved.
- Images with longest side `<= 2000px` keep their dimensions.
- Images with longest side `> 2000px` are resized proportionally to longest side `2000px`.
- Initial WebP quality is `0.82`.
- If output is above the target size, quality steps down toward `0.72`.
- Target size is `500KB`.
- Hard output limit is `1MB`; if compression cannot meet it, return a clear error.

The output file name is `images/{imageId}.webp`, where `imageId` is generated with `crypto.randomUUID()`.

## Save Flow

UI components should call a single image asset service rather than directly managing compression, file paths, and cloud state.

1. User uploads a local image or provides a URL.
2. The input Blob is converted to compressed WebP using the image processing rules.
3. The service creates `imageId` and computes width, height, size, and hash.
4. The compressed WebP is written to the selected File System Access folder at `images/{imageId}.webp`.
5. The prompt is saved with `imageId` and compatible `localImage`.
6. `imageAssets[imageId]` is saved:
   - Free, logged out, or cloud unavailable: `local_only`.
   - Pro/Team with cloud sync access: `pending_upload`.
7. Cloud upload runs asynchronously after local save.
8. On upload success, the asset is updated with `cloudUrl`, `cloudPath`, and `status: 'synced'`.
9. On upload failure, prompt save remains successful and the asset keeps `pending_upload` or `upload_failed` with error metadata.

## Cloud APIs

Image binary upload is separate from JSON sync. Existing `/api/sync/upload` should continue to sync prompt/category/temporary prompt JSON plus `imageAssets` metadata, not image bytes.

### `POST /api/images/upload`

Requirements:

- Authenticated user only.
- Pro/Team only.
- Accept compressed WebP and metadata: `imageId`, `promptId`, `hash`, `width`, `height`, `size`.
- Validate MIME type as `image/webp`.
- Enforce a `1MB` single-image hard limit.
- Validate `imageId` as UUID or a strict safe filename token.
- Store in Vercel Blob at `users/{userId}/images/{imageId}.webp`.
- Return `cloudUrl`, `cloudPath`, and stored `size`.

### `DELETE /api/images/:imageId`

Requirements:

- Authenticated user only.
- Delete only from the current user's namespace.
- Use stored `cloudPath` or reconstruct the safe user-scoped path.
- Delete failures should not block prompt deletion; the extension records a retry item.

## Load and Recovery Flow

UI components should call `ImageAssetService.getDisplayUrl(prompt)` and receive a displayable Blob URL.

1. If `prompt.imageId` exists, resolve `imageAssets[imageId]`.
2. Read `asset.localPath` from the local folder.
3. If local read succeeds, return a cached Blob URL.
4. If local read fails and the user is Pro/Team with cloud sync access and `cloudUrl` exists, download from Vercel Blob.
5. Validate the downloaded image and save it back to `images/{imageId}.webp`.
6. Verify hash when available.
7. Return the newly saved local Blob URL.
8. If recovery is not possible, fall back to legacy `remoteImageUrl` for display when available, otherwise show the missing image placeholder.

Recovery is lazy. A cloud restore should load image metadata but must not immediately download every image. This keeps first sync cheap and avoids unnecessary Vercel bandwidth.

## Delete Flow

Prompt deletion immediately deletes the associated image.

1. Read `prompt.imageId`.
2. Delete local `images/{imageId}.webp`.
3. If `imageAssets[imageId].cloudPath` exists, call `DELETE /api/images/:imageId` asynchronously.
4. Remove `imageAssets[imageId]`.
5. Delete and persist the prompt.
6. If cloud deletion fails, append a `pendingImageDeletes` item for retry during future cloud/manual sync.

The first version does not support shared image references, so prompt deletion owns image deletion.

## Retry Rules

Upload retries apply to `pending_upload` and `upload_failed` assets.

Retry triggers:

- Immediately after a new local save.
- Manual sync.
- Automatic cloud sync.

Retry behavior:

- Skip retry if the user is not Pro/Team or cloud sync is unavailable.
- Avoid rapid repeat attempts for the same image.
- Preserve `lastUploadAttemptAt` and `lastError`.
- Do not interrupt prompt editing or prompt insertion when retries fail.

Delete retries apply to `pendingImageDeletes`.

## Error Handling

- Local folder not configured: prompt image upload asks the user to configure the folder first.
- Local permission expired: ask the user to restore folder permission.
- Local save failure: image save fails; do not create an image asset.
- Cloud upload failure: prompt save succeeds and asset is retryable.
- Local image missing with cloud URL: recover automatically when displayed.
- Local image missing without cloud recovery: show missing-image UI while keeping prompt text usable.
- Free user: store local image only and do not call upload API.

## Sync Behavior

- `imageAssets` and `pendingImageDeletes` are included in local backup JSON and cloud JSON sync.
- Image binary data is never embedded in JSON sync payloads.
- Cloud restore returns image metadata only.
- The existing hash logic should include image metadata so cloud URL/status changes are preserved.
- Existing merge behavior should preserve image metadata when one side lacks it, similar to the current `localImage` and `remoteImageUrl` preservation.

## Testing

Unit coverage should include:

- JPEG and PNG input produce WebP output.
- Aspect ratio is preserved.
- Longest side above `2000px` is resized to `2000px`.
- Compression failure over `1MB` returns a clear error.
- Image asset save creates `imageId`, `localPath`, and `imageAssets` metadata.
- Legacy `localImage` prompts still display.
- Missing local image recovers from `cloudUrl` and writes back to local folder.
- Free users do not call image upload API.
- Pro/Team users call image upload API.
- Upload failure does not block prompt save.
- Prompt delete removes local image and calls cloud delete when available.
- Cloud delete failure creates a retry item.
- JSON sync includes image metadata but not image bytes.
- Cloud restore does not eagerly download image binaries.

## Implementation Notes

Suggested units:

- `image-processing`: Blob-to-WebP normalization, size limits, metadata, and hash.
- `image-asset-service`: prompt-facing save, display URL, recovery, upload retry, and delete orchestration.
- `image-cloud-client`: extension-side API client for upload/delete.
- Web app image routes: authenticated Vercel Blob upload/delete.

Existing `image-sync.ts`, offscreen message handlers, and `imageUrlCache` should be reused where possible. UI components should migrate from direct `saveImage` and `getCachedImageUrl` calls to the asset service over time.
