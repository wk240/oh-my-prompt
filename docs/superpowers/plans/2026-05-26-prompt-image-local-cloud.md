# Prompt Image Local-First Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first prompt image assets with WebP normalization, Pro/Team Vercel Blob fallback, lazy recovery, retryable deletion, and metadata sync.

**Architecture:** Keep image bytes out of JSON sync. Store prompt text and image metadata in `prompt_script_data`, sync metadata through existing cloud/local sync flows, and store image bytes locally first with optional Vercel Blob upload. Put image normalization in the offscreen document, orchestration in extension services, and server-side metadata in Supabase tables.

**Tech Stack:** Chrome extension Manifest V3, TypeScript, React, Vitest, File System Access API, offscreen documents, Next.js API routes, Supabase, Vercel Blob.

---

## File Structure

- `packages/shared/types/prompt.ts`: add `Prompt.imageId`.
- `packages/shared/types/storage.ts`: add `ImageAsset`, `PendingImageDelete`, and storage fields.
- `packages/shared/types/sync.ts`: add image metadata to cloud sync payload/result data.
- `packages/shared/messages.ts`: add offscreen normalization message.
- `packages/extension/src/lib/sync/types.ts`: extend `FullBackupData`, merge result, and local-only tracking for image metadata.
- `packages/extension/src/lib/sync/hash.ts`: include normalized image metadata in extension backup hashes.
- `packages/web-app/lib/sync/upload-data-hash.ts`: include normalized image metadata in web upload comparison hashes.
- `packages/extension/src/lib/sync/image-processing.ts`: pure helpers for image IDs, paths, SHA-256 hash, metadata extraction types, and offscreen request contracts.
- `packages/extension/src/offscreen/offscreen.ts`: normalize images to WebP and write `images/{imageId}.webp`.
- `packages/extension/src/lib/sync/image-sync.ts`: support saving pre-normalized image assets by `imageId`, reading paths, deleting exact relative paths, and legacy delete by prompt ID.
- `packages/extension/src/lib/sync/image-cloud-client.ts`: upload/delete image bytes to web app APIs.
- `packages/extension/src/lib/sync/image-asset-service.ts`: prompt-facing save, replace, display, recovery, upload retry, delete, and pending delete retry orchestration.
- `packages/extension/src/lib/sync/image-metadata-merge.ts`: deterministic merge helpers for `imageAssets` and `pendingImageDeletes`.
- `packages/extension/src/lib/sync/file-sync.ts`: include image metadata in local backup JSON and restore.
- `packages/extension/src/lib/sync/strategies/cloud.ts`: include image metadata in upload/download payloads.
- `packages/extension/src/lib/sync/orchestrator.ts`: merge image metadata and preserve `imageId` across prompt conflicts.
- `packages/web-app/supabase/migrations/020_prompt_image_assets.sql`: image metadata and pending delete tables with RLS.
- `packages/web-app/app/api/sync/upload/route.ts`: upsert image metadata and pending delete rows.
- `packages/web-app/app/api/sync/download/route.ts`: return image metadata and pending deletes.
- `packages/web-app/app/api/images/upload/route.ts`: authenticated Pro/Team WebP upload to Vercel Blob.
- `packages/web-app/app/api/images/[imageId]/route.ts`: authenticated image delete.
- UI callers in `packages/extension/src/content/components/PromptEditModal.tsx`, `DropdownContainer.tsx`, `PromptPreviewModal.tsx`, `PromptThumbnail.tsx`, and `packages/extension/src/sidepanel/views/PromptListView.tsx`: migrate from direct `saveImage` / `getCachedImageUrl` to `ImageAssetService`.

## Task 1: Shared Types And Sync Contracts

**Files:**
- Modify: `packages/shared/types/prompt.ts`
- Modify: `packages/shared/types/storage.ts`
- Modify: `packages/shared/types/sync.ts`
- Modify: `packages/web-app/src/shared/types/prompt.ts`
- Modify: `packages/web-app/src/shared/types/storage.ts`
- Modify: `packages/web-app/src/shared/types/sync.ts`
- Test: `packages/extension/src/lib/sync/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing type contract test**

Add this test to `packages/extension/src/lib/sync/__tests__/types.test.ts`:

```ts
import type { ImageAsset, PendingImageDelete, StorageSchema, SyncPayload } from '@oh-my-prompt/shared/types'

describe('image metadata shared contracts', () => {
  it('allows image metadata in storage and sync payloads', () => {
    const asset: ImageAsset = {
      id: '11111111-1111-4111-8111-111111111111',
      promptId: 'prompt-1',
      localPath: 'images/11111111-1111-4111-8111-111111111111.webp',
      cloudUrl: 'https://blob.vercel-storage.com/u.webp',
      cloudPath: 'users/user-1/images/11111111-1111-4111-8111-111111111111.webp',
      sourceUrl: 'https://example.com/source.png',
      mimeType: 'image/webp',
      width: 800,
      height: 600,
      size: 12345,
      hash: 'abc123',
      status: 'synced',
      updatedAt: 1700000000000
    }
    const pendingDelete: PendingImageDelete = {
      imageId: asset.id,
      cloudPath: asset.cloudPath!,
      attempts: 1,
      updatedAt: 1700000000001
    }
    const storage: StorageSchema = {
      version: '1.0.0',
      userData: {
        prompts: [{
          id: 'prompt-1',
          name: 'Prompt',
          content: 'Text',
          categoryId: 'cat-1',
          order: 0,
          imageId: asset.id,
          localImage: asset.localPath,
          remoteImageUrl: asset.sourceUrl
        }],
        categories: [{ id: 'cat-1', name: 'Cat', order: 0 }]
      },
      settings: {
        showBuiltin: true,
        syncEnabled: true
      },
      temporaryPrompts: [],
      imageAssets: { [asset.id]: asset },
      pendingImageDeletes: [pendingDelete]
    }
    const payload: SyncPayload = {
      prompts: storage.userData.prompts,
      categories: storage.userData.categories,
      temporaryPrompts: [],
      imageAssets: storage.imageAssets,
      pendingImageDeletes: storage.pendingImageDeletes,
      timestamp: 1700000000002
    }

    expect(payload.imageAssets?.[asset.id].cloudPath).toBe(asset.cloudPath)
    expect(payload.pendingImageDeletes?.[0].attempts).toBe(1)
  })
})
```

- [ ] **Step 2: Run the type test to verify it fails**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/types.test.ts
```

Expected: FAIL with TypeScript errors for missing `ImageAsset`, `PendingImageDelete`, `Prompt.imageId`, and sync payload fields.

- [ ] **Step 3: Add shared types**

In both `packages/shared/types/prompt.ts` and `packages/web-app/src/shared/types/prompt.ts`, update `Prompt`:

```ts
export interface Prompt {
  id: string
  name: string
  nameEn?: string
  content: string
  contentEn?: string
  categoryId: string
  description?: string
  descriptionEn?: string
  order: number
  updatedAt?: number
  imageId?: string
  localImage?: string
  remoteImageUrl?: string
}
```

In both `packages/shared/types/storage.ts` and `packages/web-app/src/shared/types/storage.ts`, add exports before `StorageSchema` and extend `StorageSchema`:

```ts
export interface ImageAsset {
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

export interface PendingImageDelete {
  imageId: string
  cloudPath: string
  attempts: number
  lastError?: string
  updatedAt: number
}

export interface StorageSchema {
  version: string
  userData: UserData
  settings: SyncSettings
  temporaryPrompts?: Prompt[]
  teamPrompts?: TeamPrompt[]
  teamSyncStatus?: TeamSyncStatus
  imageAssets?: Record<string, ImageAsset>
  pendingImageDeletes?: PendingImageDelete[]
  _migrationComplete?: boolean
}
```

In both `packages/shared/types/sync.ts` and `packages/web-app/src/shared/types/sync.ts`, update imports and payload:

```ts
import type { Prompt, Category } from './prompt'
import type { ImageAsset, PendingImageDelete } from './storage'

export interface SyncPayload {
  prompts: Prompt[]
  categories: Category[]
  temporaryPrompts?: Prompt[]
  imageAssets?: Record<string, ImageAsset>
  pendingImageDeletes?: PendingImageDelete[]
  timestamp: number
}
```

- [ ] **Step 4: Run the type test to verify it passes**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run shared sync check**

Run:

```bash
npm run check-shared
```

Expected: PASS, shared and web-app copies match.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/types/prompt.ts packages/shared/types/storage.ts packages/shared/types/sync.ts packages/web-app/src/shared/types/prompt.ts packages/web-app/src/shared/types/storage.ts packages/web-app/src/shared/types/sync.ts packages/extension/src/lib/sync/__tests__/types.test.ts
git commit -m "feat: add prompt image metadata contracts"
```

## Task 2: Hash And Merge Helpers For Image Metadata

**Files:**
- Create: `packages/extension/src/lib/sync/image-metadata-merge.ts`
- Modify: `packages/extension/src/lib/sync/hash.ts`
- Modify: `packages/web-app/lib/sync/upload-data-hash.ts`
- Test: `packages/extension/src/lib/sync/__tests__/image-metadata-merge.test.ts`
- Test: `packages/extension/src/lib/sync/__tests__/hash.test.ts`
- Test: `packages/web-app/lib/sync/upload-data-hash.test.ts`

- [ ] **Step 1: Write failing merge tests**

Create `packages/extension/src/lib/sync/__tests__/image-metadata-merge.test.ts`:

```ts
import type { ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'
import { mergeImageAssets, mergePendingImageDeletes } from '../image-metadata-merge'

function asset(overrides: Partial<ImageAsset>): ImageAsset {
  return {
    id: 'image-1',
    promptId: 'prompt-1',
    localPath: 'images/image-1.webp',
    mimeType: 'image/webp',
    width: 100,
    height: 80,
    size: 1000,
    hash: 'hash-1',
    status: 'local_only',
    updatedAt: 1,
    ...overrides
  }
}

describe('image metadata merge', () => {
  it('preserves cloud fields from older asset when newer local asset lacks them', () => {
    const merged = mergeImageAssets(
      { 'image-1': asset({ cloudUrl: 'https://blob/img.webp', cloudPath: 'users/u/images/image-1.webp', status: 'synced', updatedAt: 1 }) },
      { 'image-1': asset({ status: 'pending_upload', updatedAt: 2 }) }
    )

    expect(merged['image-1']).toMatchObject({
      status: 'pending_upload',
      cloudUrl: 'https://blob/img.webp',
      cloudPath: 'users/u/images/image-1.webp',
      updatedAt: 2
    })
  })

  it('dedupes pending deletes and keeps highest attempts with latest error', () => {
    const cloud: PendingImageDelete[] = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1,
      lastError: 'first',
      updatedAt: 10
    }]
    const local: PendingImageDelete[] = [{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 3,
      lastError: 'latest',
      updatedAt: 20
    }]

    expect(mergePendingImageDeletes(cloud, local)).toEqual([{
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 3,
      lastError: 'latest',
      updatedAt: 20
    }])
  })
})
```

- [ ] **Step 2: Write failing extension hash tests**

Create `packages/extension/src/lib/sync/__tests__/hash.test.ts` if it does not exist, or append:

```ts
import { computeBackupDataHash } from '../hash'

describe('computeBackupDataHash image metadata', () => {
  const base = {
    prompts: [],
    categories: [],
    temporaryPrompts: [],
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp' as const,
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'pending_upload' as const,
        updatedAt: 1
      }
    },
    pendingImageDeletes: []
  }

  it('changes when durable image metadata changes', async () => {
    const first = await computeBackupDataHash(base)
    const second = await computeBackupDataHash({
      ...base,
      imageAssets: {
        'image-1': {
          ...base.imageAssets['image-1'],
          cloudUrl: 'https://blob/img.webp',
          cloudPath: 'users/u/images/image-1.webp',
          status: 'synced',
          updatedAt: 2
        }
      }
    })

    expect(second).not.toBe(first)
  })

  it('ignores lastError to avoid retry noise hash churn', async () => {
    const first = await computeBackupDataHash(base)
    const second = await computeBackupDataHash({
      ...base,
      imageAssets: {
        'image-1': {
          ...base.imageAssets['image-1'],
          lastError: 'network failed'
        }
      }
    })

    expect(second).toBe(first)
  })
})
```

- [ ] **Step 3: Write failing web hash test**

Append to `packages/web-app/lib/sync/upload-data-hash.test.ts`:

```ts
import { computeDataHash, normalizeForHash } from './upload-data-hash'

it('includes durable image metadata in upload comparison hash', async () => {
  const first = await computeDataHash(normalizeForHash([], [], [], {
    'image-1': {
      id: 'image-1',
      promptId: 'prompt-1',
      localPath: 'images/image-1.webp',
      mimeType: 'image/webp',
      width: 100,
      height: 80,
      size: 1000,
      hash: 'hash-1',
      status: 'pending_upload',
      updatedAt: 1
    }
  }, []))
  const second = await computeDataHash(normalizeForHash([], [], [], {
    'image-1': {
      id: 'image-1',
      promptId: 'prompt-1',
      localPath: 'images/image-1.webp',
      cloudUrl: 'https://blob/img.webp',
      cloudPath: 'users/u/images/image-1.webp',
      mimeType: 'image/webp',
      width: 100,
      height: 80,
      size: 1000,
      hash: 'hash-1',
      status: 'synced',
      updatedAt: 2
    }
  }, []))

  expect(second).not.toBe(first)
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-metadata-merge.test.ts packages/extension/src/lib/sync/__tests__/hash.test.ts
npm run test --workspace=@oh-my-prompt/web-app -- packages/web-app/lib/sync/upload-data-hash.test.ts
```

Expected: FAIL because merge helper does not exist and hash helpers do not accept image metadata.

- [ ] **Step 5: Implement merge helpers**

Create `packages/extension/src/lib/sync/image-metadata-merge.ts`:

```ts
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
    lastError: preferred.lastError || fallback.lastError
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

    byKey.set(key, {
      imageId: item.imageId,
      cloudPath: item.cloudPath,
      attempts: Math.max(existing.attempts, item.attempts),
      lastError: item.updatedAt >= existing.updatedAt ? item.lastError || existing.lastError : existing.lastError || item.lastError,
      updatedAt: Math.max(existing.updatedAt, item.updatedAt)
    })
  }

  return Array.from(byKey.values()).sort((a, b) => deleteKey(a).localeCompare(deleteKey(b)))
}
```

- [ ] **Step 6: Extend extension hash**

Update `packages/extension/src/lib/sync/hash.ts`:

```ts
import type { UserData, Prompt, ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'

export interface BackupData extends UserData {
  temporaryPrompts?: Prompt[]
  imageAssets?: Record<string, ImageAsset>
  pendingImageDeletes?: PendingImageDelete[]
}

function normalizeImageAssets(imageAssets: Record<string, ImageAsset> = {}): object[] {
  return Object.values(imageAssets)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(asset => ({
      id: asset.id,
      promptId: asset.promptId,
      localPath: asset.localPath,
      cloudUrl: asset.cloudUrl,
      cloudPath: asset.cloudPath,
      sourceUrl: asset.sourceUrl,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      size: asset.size,
      hash: asset.hash,
      status: asset.status,
      updatedAt: asset.updatedAt,
      lastUploadAttemptAt: asset.lastUploadAttemptAt
    }))
}

function normalizePendingImageDeletes(items: PendingImageDelete[] = []): object[] {
  return [...items]
    .sort((a, b) => `${a.imageId}\n${a.cloudPath}`.localeCompare(`${b.imageId}\n${b.cloudPath}`))
    .map(item => ({
      imageId: item.imageId,
      cloudPath: item.cloudPath,
      attempts: item.attempts,
      updatedAt: item.updatedAt
    }))
}
```

Then add these properties to the `sorted` object inside `computeBackupDataHash`:

```ts
imageAssets: normalizeImageAssets(backupData.imageAssets),
pendingImageDeletes: normalizePendingImageDeletes(backupData.pendingImageDeletes)
```

Also add `imageId: p.imageId` to both prompt and temporary prompt mappings.

- [ ] **Step 7: Extend web hash**

Update `packages/web-app/lib/sync/upload-data-hash.ts` imports and function signature:

```ts
import type { ImageAsset, PendingImageDelete } from '@/src/shared/types'

export interface HashPromptInput {
  id: string
  categoryId?: string
  name?: string
  content?: string
  order?: number
  imageId?: string
  localImage?: string
  remoteImageUrl?: string
}

export function normalizeForHash(
  prompts: HashPromptInput[],
  categories: HashCategoryInput[],
  temporaryPrompts: HashPromptInput[] = [],
  imageAssets: Record<string, ImageAsset> = {},
  pendingImageDeletes: PendingImageDelete[] = []
): {
  prompts: object
  categories: object
  temporaryPrompts: object
  imageAssets: object
  pendingImageDeletes: object
} {
  const sortById = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
  const normalizeImageAssets = Object.values(imageAssets)
    .sort(sortById)
    .map(asset => ({
      id: asset.id,
      promptId: asset.promptId,
      localPath: asset.localPath,
      cloudUrl: asset.cloudUrl,
      cloudPath: asset.cloudPath,
      sourceUrl: asset.sourceUrl,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      size: asset.size,
      hash: asset.hash,
      status: asset.status,
      updatedAt: asset.updatedAt,
      lastUploadAttemptAt: asset.lastUploadAttemptAt
    }))
  const normalizeDeletes = [...pendingImageDeletes]
    .sort((a, b) => `${a.imageId}\n${a.cloudPath}`.localeCompare(`${b.imageId}\n${b.cloudPath}`))
    .map(item => ({
      imageId: item.imageId,
      cloudPath: item.cloudPath,
      attempts: item.attempts,
      updatedAt: item.updatedAt
    }))

  return {
    prompts: prompts.sort(sortById).map(p => ({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      content: p.content,
      order: p.order,
      imageId: p.imageId,
      localImage: p.localImage,
      remoteImageUrl: p.remoteImageUrl
    })),
    categories: categories.sort(sortById).map(c => ({
      id: c.id,
      name: c.name,
      order: c.order
    })),
    temporaryPrompts: temporaryPrompts.sort(sortById).map(p => ({
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      content: p.content,
      order: p.order,
      imageId: p.imageId,
      localImage: p.localImage,
      remoteImageUrl: p.remoteImageUrl
    })),
    imageAssets: normalizeImageAssets,
    pendingImageDeletes: normalizeDeletes
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-metadata-merge.test.ts packages/extension/src/lib/sync/__tests__/hash.test.ts
npm run test --workspace=@oh-my-prompt/web-app -- packages/web-app/lib/sync/upload-data-hash.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/lib/sync/image-metadata-merge.ts packages/extension/src/lib/sync/hash.ts packages/web-app/lib/sync/upload-data-hash.ts packages/extension/src/lib/sync/__tests__/image-metadata-merge.test.ts packages/extension/src/lib/sync/__tests__/hash.test.ts packages/web-app/lib/sync/upload-data-hash.test.ts
git commit -m "feat: hash and merge image metadata"
```

## Task 3: Local Backup JSON Carries Image Metadata

**Files:**
- Modify: `packages/extension/src/lib/sync/file-sync.ts`
- Modify: `packages/extension/src/lib/sync/types.ts`
- Test: `packages/extension/src/lib/sync/__tests__/local-strategy.test.ts`
- Test: `packages/extension/src/lib/sync/__tests__/integration.test.ts`

- [ ] **Step 1: Write failing local backup test**

Add to `packages/extension/src/lib/sync/__tests__/local-strategy.test.ts`:

```ts
it('writes and reads image metadata in backup JSON', async () => {
  const data = {
    prompts: [],
    categories: [],
    temporaryPrompts: [],
    timestamp: 1700000000000,
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp' as const,
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'synced' as const,
        updatedAt: 1,
        cloudUrl: 'https://blob/img.webp',
        cloudPath: 'users/u/images/image-1.webp'
      }
    },
    pendingImageDeletes: [{
      imageId: 'image-2',
      cloudPath: 'users/u/images/image-2.webp',
      attempts: 2,
      updatedAt: 2
    }]
  }

  await localStrategy.sync(data)
  const restored = await localStrategy.restore()

  expect(restored?.imageAssets).toEqual(data.imageAssets)
  expect(restored?.pendingImageDeletes).toEqual(data.pendingImageDeletes)
})
```

- [ ] **Step 2: Run local backup test to verify it fails**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/local-strategy.test.ts
```

Expected: FAIL because `FullBackupData` and file backup omit image metadata.

- [ ] **Step 3: Extend backup types**

Update `packages/extension/src/lib/sync/types.ts`:

```ts
import type { Prompt, Category, ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'

export interface FullBackupData {
  prompts: Prompt[]
  categories: Category[]
  temporaryPrompts: Prompt[]
  timestamp: number
  imageAssets?: Record<string, ImageAsset>
  pendingImageDeletes?: PendingImageDelete[]
}

export interface MergeResult {
  data: FullBackupData
  localOnlyItems: {
    prompts: Prompt[]
    categories: Category[]
    temporaryPrompts: Prompt[]
    imageAssetIds: string[]
    pendingImageDeleteKeys: string[]
  }
}
```

Update `packages/extension/src/lib/sync/file-sync.ts` `FullBackupData`:

```ts
import type { Prompt, Category, ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'

export interface FullBackupData extends BackupData {
  temporaryPrompts: Prompt[]
  imageAssets?: Record<string, ImageAsset>
  pendingImageDeletes?: PendingImageDelete[]
}
```

- [ ] **Step 4: Write image metadata in backup files**

In both backup file builders in `backupToFolder` and `syncToLocalFolder`, include:

```ts
imageAssets: backupData.imageAssets || {},
pendingImageDeletes: backupData.pendingImageDeletes || [],
```

The resulting backup object should have:

```ts
const backupFile = {
  version: manifestVersion,
  userData: {
    prompts: backupData.prompts,
    categories: backupData.categories
  },
  temporaryPrompts: backupData.temporaryPrompts,
  imageAssets: backupData.imageAssets || {},
  pendingImageDeletes: backupData.pendingImageDeletes || [],
  backupTime: new Date().toISOString(),
  contentHash
}
```

- [ ] **Step 5: Read image metadata from backup files**

In `readFromLocalFolder`, return metadata for both current and legacy shapes:

```ts
return {
  prompts: userData.prompts as Prompt[],
  categories: userData.categories as Category[],
  temporaryPrompts: parsed.temporaryPrompts || [],
  imageAssets: parsed.imageAssets || {},
  pendingImageDeletes: parsed.pendingImageDeletes || []
}
```

For legacy direct `prompts/categories` backup, return:

```ts
return {
  prompts: parsed.prompts as Prompt[],
  categories: parsed.categories as Category[],
  temporaryPrompts: [],
  imageAssets: parsed.imageAssets || {},
  pendingImageDeletes: parsed.pendingImageDeletes || []
}
```

- [ ] **Step 6: Run local backup tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/local-strategy.test.ts packages/extension/src/lib/sync/__tests__/integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/lib/sync/file-sync.ts packages/extension/src/lib/sync/types.ts packages/extension/src/lib/sync/__tests__/local-strategy.test.ts packages/extension/src/lib/sync/__tests__/integration.test.ts
git commit -m "feat: include image metadata in local backups"
```

## Task 4: Offscreen WebP Normalization And Exact Image File Operations

**Files:**
- Create: `packages/extension/src/lib/sync/image-processing.ts`
- Modify: `packages/shared/messages.ts`
- Modify: `packages/web-app/src/shared/messages.ts`
- Modify: `packages/extension/src/offscreen/offscreen.ts`
- Modify: `packages/extension/src/background/service-worker.ts`
- Modify: `packages/extension/src/lib/sync/image-sync.ts`
- Test: `packages/extension/src/lib/sync/__tests__/image-processing.test.ts`
- Test: `packages/extension/src/lib/sync/__tests__/image-sync.test.ts`

- [ ] **Step 1: Write failing image processing unit tests**

Create `packages/extension/src/lib/sync/__tests__/image-processing.test.ts`:

```ts
import { buildImagePath, computeBlobSha256, validateImageId } from '../image-processing'

describe('image-processing helpers', () => {
  it('builds stable WebP image paths from safe IDs', () => {
    expect(buildImagePath('11111111-1111-4111-8111-111111111111')).toBe('images/11111111-1111-4111-8111-111111111111.webp')
  })

  it('rejects unsafe image IDs', () => {
    expect(validateImageId('../bad')).toBe(false)
    expect(validateImageId('11111111-1111-4111-8111-111111111111')).toBe(true)
  })

  it('computes SHA-256 for blobs', async () => {
    const hash = await computeBlobSha256(new Blob(['abc'], { type: 'text/plain' }))
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
```

- [ ] **Step 2: Add failing image-sync exact delete test**

Append to `packages/extension/src/lib/sync/__tests__/image-sync.test.ts`:

```ts
import { buildImagePath } from '../image-processing'
import { deleteImageByPath } from '../image-sync'

it('deletes exact image asset path without deriving extensions from prompt id', async () => {
  const result = await deleteImageByPath(buildImagePath('11111111-1111-4111-8111-111111111111'))

  expect(result.success).toBe(true)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-processing.test.ts packages/extension/src/lib/sync/__tests__/image-sync.test.ts
```

Expected: FAIL because `image-processing.ts` and `deleteImageByPath` do not exist.

- [ ] **Step 4: Implement image-processing helpers**

Create `packages/extension/src/lib/sync/image-processing.ts`:

```ts
import { IMAGE_DIR_NAME } from '@oh-my-prompt/shared/constants'

export const TARGET_IMAGE_SIZE = 500 * 1024
export const HARD_IMAGE_SIZE_LIMIT = 1024 * 1024
export const MAX_IMAGE_SIDE = 2000
export const INITIAL_WEBP_QUALITY = 0.82
export const MIN_WEBP_QUALITY = 0.72

export interface NormalizedImageResult {
  data: number[]
  mimeType: 'image/webp'
  width: number
  height: number
  size: number
  hash: string
}

export function validateImageId(imageId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageId)
}

export function buildImagePath(imageId: string): string {
  if (!validateImageId(imageId)) {
    throw new Error('INVALID_IMAGE_ID')
  }
  return `${IMAGE_DIR_NAME}/${imageId}.webp`
}

export async function computeBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 5: Add message enum for normalization**

In both `packages/shared/messages.ts` and `packages/web-app/src/shared/messages.ts`, add near the offscreen image messages:

```ts
OFFSCREEN_NORMALIZE_IMAGE = 'OFFSCREEN_NORMALIZE_IMAGE',
```

- [ ] **Step 6: Implement offscreen normalization**

In `packages/extension/src/offscreen/offscreen.ts`, import helper constants:

```ts
import {
  buildImagePath,
  computeBlobSha256,
  HARD_IMAGE_SIZE_LIMIT,
  INITIAL_WEBP_QUALITY,
  MAX_IMAGE_SIDE,
  MIN_WEBP_QUALITY,
  TARGET_IMAGE_SIZE,
  type NormalizedImageResult
} from '../lib/sync/image-processing'
```

Add a switch case:

```ts
case MessageType.OFFSCREEN_NORMALIZE_IMAGE:
  handleNormalizeImage(message.payload as { data: number[]; mimeType?: string })
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ success: false, error: String(error) }))
  return true
```

Add the handler:

```ts
async function handleNormalizeImage(payload: { data: number[]; mimeType?: string }): Promise<MessageResponse<NormalizedImageResult>> {
  const sourceBlob = new Blob([new Uint8Array(payload.data)], { type: payload.mimeType || 'image/jpeg' })
  const bitmap = await createImageBitmap(sourceBlob)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return { success: false, error: 'CANVAS_UNAVAILABLE' }
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let output = await canvas.convertToBlob({ type: 'image/webp', quality: INITIAL_WEBP_QUALITY })
  if (output.size > TARGET_IMAGE_SIZE) {
    output = await canvas.convertToBlob({ type: 'image/webp', quality: MIN_WEBP_QUALITY })
  }
  if (output.size > HARD_IMAGE_SIZE_LIMIT) {
    return { success: false, error: 'FILE_TOO_LARGE' }
  }

  const hash = await computeBlobSha256(output)
  const data = Array.from(new Uint8Array(await output.arrayBuffer()))

  return {
    success: true,
    data: {
      data,
      mimeType: 'image/webp',
      width,
      height,
      size: output.size,
      hash
    }
  }
}
```

- [ ] **Step 7: Update offscreen save to use imageId and WebP path**

Change `handleSaveImage` payload to:

```ts
async function handleSaveImage(payload: { imageId?: string; promptId?: string; data: number[]; originalFilename?: string; mimeType?: string }): Promise<MessageResponse> {
```

Inside the try block, use exact WebP filename when `imageId` exists:

```ts
const relativePath = payload.imageId ? buildImagePath(payload.imageId) : undefined
const filename = relativePath ? relativePath.split('/').pop()! : `${payload.promptId}.${finalExt}`
const fileHandle = await imagesDir.getFileHandle(filename, { create: true })
const imageBlob = new Blob([uint8Array], { type: payload.mimeType || mimeType })
```

Return:

```ts
return { success: true, data: { relativePath: relativePath || `${IMAGE_DIR_NAME}/${filename}` } } as MessageResponse
```

- [ ] **Step 8: Add exact delete by path**

In `packages/extension/src/lib/sync/image-sync.ts`, add:

```ts
async function deleteImageByPathViaServiceWorker(relativePath: string): Promise<{ success: boolean; error?: string }> {
  const response = await chrome.runtime.sendMessage({
    type: MessageType.DELETE_IMAGE,
    payload: { relativePath }
  })
  return { success: response?.success ?? false, error: response?.error }
}

async function deleteImageByPathDirect(relativePath: string): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
  }

  try {
    const imagesDir = await handle.getDirectoryHandle(IMAGE_DIR_NAME)
    const filename = relativePath.split('/').pop()
    if (!filename) {
      return { success: false, error: 'INVALID_PATH' }
    }
    await imagesDir.removeEntry(filename)
    revokeCachedImageUrl(relativePath)
    return { success: true }
  } catch {
    return { success: true }
  }
}

export async function deleteImageByPath(relativePath: string): Promise<{ success: boolean; error?: string }> {
  if (isContentScriptContext()) {
    return deleteImageByPathViaServiceWorker(relativePath)
  }
  return deleteImageByPathDirect(relativePath)
}
```

- [ ] **Step 9: Update service worker and offscreen delete payloads**

In `packages/extension/src/background/service-worker.ts`, change delete payload type:

```ts
const deleteImagePayload = message.payload as { promptId?: string; relativePath?: string }
if (!deleteImagePayload || (!deleteImagePayload.promptId && !deleteImagePayload.relativePath)) {
  sendResponse({ success: false, error: 'Invalid payload' })
  return true
}
```

In `packages/extension/src/offscreen/offscreen.ts`, change delete handler signature:

```ts
async function handleDeleteImage(payload: { promptId?: string; relativePath?: string }): Promise<MessageResponse> {
```

At the start of the try block:

```ts
if (payload.relativePath) {
  const filename = payload.relativePath.split('/').pop()
  if (!filename) return { success: false, error: 'INVALID_PATH' }
  await imagesDir.removeEntry(filename)
  return { success: true } as MessageResponse
}
```

- [ ] **Step 10: Run tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-processing.test.ts packages/extension/src/lib/sync/__tests__/image-sync.test.ts
npm run check-shared
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/extension/src/lib/sync/image-processing.ts packages/shared/messages.ts packages/web-app/src/shared/messages.ts packages/extension/src/offscreen/offscreen.ts packages/extension/src/background/service-worker.ts packages/extension/src/lib/sync/image-sync.ts packages/extension/src/lib/sync/__tests__/image-processing.test.ts packages/extension/src/lib/sync/__tests__/image-sync.test.ts
git commit -m "feat: normalize prompt images to webp"
```

## Task 5: Extension Image Cloud Client

**Files:**
- Create: `packages/extension/src/lib/sync/image-cloud-client.ts`
- Test: `packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Create `packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCloudImage, uploadCloudImage } from '../image-cloud-client'

vi.mock('@/lib/config', () => ({ WEB_APP_URL: 'https://oh-my-prompt.test', SUPABASE_PROJECT_REF: 'test-ref' }))

describe('image-cloud-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            'sb-test-ref-auth-token': JSON.stringify({
              access_token: 'token',
              expires_at: Math.floor(Date.now() / 1000) + 3600
            })
          }))
        }
      }
    } as unknown as typeof chrome
  })

  it('uploads WebP image with metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      data: {
        cloudUrl: 'https://blob/img.webp',
        cloudPath: 'users/u/images/image-1.webp',
        size: 1000
      }
    }), { status: 200 }))

    const result = await uploadCloudImage({
      imageId: 'image-1',
      promptId: 'prompt-1',
      blob: new Blob(['abc'], { type: 'image/webp' }),
      hash: 'hash-1',
      width: 100,
      height: 80,
      size: 1000
    })

    expect(result.success).toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://oh-my-prompt.test/api/images/upload', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' })
    }))
  })

  it('deletes cloud image with cloudPath payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const result = await deleteCloudImage('image-1', 'users/u/images/image-1.webp')

    expect(result.success).toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://oh-my-prompt.test/api/images/image-1', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ cloudPath: 'users/u/images/image-1.webp' })
    }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts
```

Expected: FAIL because `image-cloud-client.ts` does not exist.

- [ ] **Step 3: Implement image cloud client**

Create `packages/extension/src/lib/sync/image-cloud-client.ts`:

```ts
import { WEB_APP_URL, SUPABASE_PROJECT_REF } from '@/lib/config'

const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

export interface UploadCloudImageInput {
  imageId: string
  promptId: string
  blob: Blob
  hash: string
  width: number
  height: number
  size: number
}

export interface UploadCloudImageResult {
  success: boolean
  cloudUrl?: string
  cloudPath?: string
  size?: number
  error?: string
}

async function getAuthTokenDirect(): Promise<string | null> {
  const result = await chrome.storage.local.get(AUTH_STORAGE_KEY)
  const sessionData = result[AUTH_STORAGE_KEY]
  if (!sessionData) return null
  const session = JSON.parse(sessionData)
  if (!session.access_token || !session.expires_at) return null
  if (session.expires_at < Math.floor(Date.now() / 1000)) return null
  return session.access_token
}

export async function uploadCloudImage(input: UploadCloudImageInput): Promise<UploadCloudImageResult> {
  const token = await getAuthTokenDirect()
  if (!token) return { success: false, error: 'NOT_LOGGED_IN' }

  const formData = new FormData()
  formData.set('file', input.blob, `${input.imageId}.webp`)
  formData.set('imageId', input.imageId)
  formData.set('promptId', input.promptId)
  formData.set('hash', input.hash)
  formData.set('width', String(input.width))
  formData.set('height', String(input.height))
  formData.set('size', String(input.size))

  const response = await fetch(`${WEB_APP_URL}/api/images/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.success) {
    return { success: false, error: body.error || `HTTP_${response.status}` }
  }

  return {
    success: true,
    cloudUrl: body.data.cloudUrl,
    cloudPath: body.data.cloudPath,
    size: body.data.size
  }
}

export async function deleteCloudImage(imageId: string, cloudPath?: string): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthTokenDirect()
  if (!token) return { success: false, error: 'NOT_LOGGED_IN' }

  const response = await fetch(`${WEB_APP_URL}/api/images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ cloudPath })
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.success) {
    return { success: false, error: body.error || `HTTP_${response.status}` }
  }
  return { success: true }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/image-cloud-client.ts packages/extension/src/lib/sync/__tests__/image-cloud-client.test.ts
git commit -m "feat: add extension image cloud client"
```

## Task 6: Image Asset Service

**Files:**
- Create: `packages/extension/src/lib/sync/image-asset-service.ts`
- Test: `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageSchema } from '@oh-my-prompt/shared/types'
import { savePromptImageAsset, deletePromptImageAsset, queuePendingImageDelete } from '../image-asset-service'

vi.mock('../image-sync', () => ({
  saveImage: vi.fn(async () => ({ success: true, relativePath: 'images/image-1.webp' })),
  deleteImageByPath: vi.fn(async () => ({ success: true })),
  getCachedImageUrl: vi.fn(async () => 'blob:local')
}))

vi.mock('../image-cloud-client', () => ({
  uploadCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' })),
  deleteCloudImage: vi.fn(async () => ({ success: false, error: 'NETWORK_ERROR' }))
}))

vi.mock('../image-processing', () => ({
  buildImagePath: vi.fn((id: string) => `images/${id}.webp`),
  computeBlobSha256: vi.fn(async () => 'hash-1')
}))

describe('image-asset-service', () => {
  let storageData: StorageSchema

  beforeEach(() => {
    storageData = {
      version: '1.0.0',
      userData: {
        prompts: [{ id: 'prompt-1', name: 'Prompt', content: 'Text', categoryId: 'cat-1', order: 0 }],
        categories: [{ id: 'cat-1', name: 'Cat', order: 0 }]
      },
      settings: { showBuiltin: true, syncEnabled: true },
      temporaryPrompts: [],
      imageAssets: {},
      pendingImageDeletes: []
    }
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('image-1' as `${string}-${string}-${string}-${string}-${string}`)
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({ prompt_script_data: storageData })),
          set: vi.fn(async value => {
            storageData = value.prompt_script_data
          })
        }
      }
    } as unknown as typeof chrome
  })

  it('saves image asset metadata and updates prompt compatibility fields', async () => {
    const result = await savePromptImageAsset({
      promptId: 'prompt-1',
      blob: new Blob(['abc'], { type: 'image/png' }),
      sourceUrl: 'https://example.com/source.png',
      canUseCloud: false,
      width: 100,
      height: 80,
      size: 1000,
      hash: 'hash-1'
    })

    expect(result.success).toBe(true)
    expect(storageData.userData.prompts[0]).toMatchObject({
      imageId: 'image-1',
      localImage: 'images/image-1.webp',
      remoteImageUrl: 'https://example.com/source.png'
    })
    expect(storageData.imageAssets?.['image-1']).toMatchObject({
      promptId: 'prompt-1',
      status: 'local_only',
      localPath: 'images/image-1.webp'
    })
  })

  it('queues pending delete with copied cloudPath after cloud delete failure', async () => {
    storageData.userData.prompts[0].imageId = 'image-1'
    storageData.userData.prompts[0].localImage = 'images/image-1.webp'
    storageData.imageAssets = {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudPath: 'users/u/images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'synced',
        updatedAt: 1
      }
    }

    await deletePromptImageAsset('prompt-1')

    expect(storageData.imageAssets?.['image-1']).toBeUndefined()
    expect(storageData.pendingImageDeletes).toEqual([expect.objectContaining({
      imageId: 'image-1',
      cloudPath: 'users/u/images/image-1.webp',
      attempts: 1
    })])
  })

  it('dedupes pending delete queue entries', async () => {
    await queuePendingImageDelete('image-1', 'users/u/images/image-1.webp', 'first')
    await queuePendingImageDelete('image-1', 'users/u/images/image-1.webp', 'second')

    expect(storageData.pendingImageDeletes).toHaveLength(1)
    expect(storageData.pendingImageDeletes?.[0]).toMatchObject({
      attempts: 2,
      lastError: 'second'
    })
  })
})
```

- [ ] **Step 2: Run service tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement image asset service**

Create `packages/extension/src/lib/sync/image-asset-service.ts`:

```ts
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
  return result[STORAGE_KEY]
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

export async function savePromptImageAsset(input: SavePromptImageAssetInput): Promise<{ success: boolean; imageId?: string; localPath?: string; error?: string }> {
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
    await writeStorage({
      ...latest,
      imageAssets: {
        ...(latest.imageAssets || {}),
        [imageId]: { ...asset, status: 'missing_local', updatedAt: Date.now() }
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
  const nextData = mapPrompt(data, promptId, item => ({
    ...item,
    imageId: undefined,
    localImage: undefined,
    updatedAt: Date.now()
  }))
  await writeStorage({ ...nextData, imageAssets: nextAssets })

  if (copiedCloudPath) {
    const result = await deleteCloudImage(imageId, copiedCloudPath)
    if (!result.success) {
      await queuePendingImageDelete(imageId, copiedCloudPath, result.error)
    }
  }
}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/image-asset-service.ts packages/extension/src/lib/sync/__tests__/image-asset-service.test.ts
git commit -m "feat: add image asset service"
```

## Task 7: Cloud Sync Strategy And Orchestrator Metadata Merge

**Files:**
- Modify: `packages/extension/src/lib/sync/strategies/cloud.ts`
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`
- Test: `packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts`
- Test: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write failing cloud strategy test**

Append to `packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts`:

```ts
it('uploads and restores image metadata through cloud sync payloads', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, timestamp: 1700000000001 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      data: {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        imageAssets: {
          'image-1': {
            id: 'image-1',
            promptId: 'prompt-1',
            localPath: 'images/image-1.webp',
            mimeType: 'image/webp',
            width: 100,
            height: 80,
            size: 1000,
            hash: 'hash-1',
            status: 'synced',
            updatedAt: 1,
            cloudUrl: 'https://blob/img.webp',
            cloudPath: 'users/u/images/image-1.webp'
          }
        },
        pendingImageDeletes: [],
        timestamp: 1700000000002
      }
    }), { status: 200 }))

  await strategy.sync({
    prompts: [],
    categories: [],
    temporaryPrompts: [],
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'pending_upload',
        updatedAt: 1
      }
    },
    pendingImageDeletes: [],
    timestamp: 1700000000000
  })
  const uploadedBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
  const restored = await strategy.restore()

  expect(uploadedBody.imageAssets['image-1'].localPath).toBe('images/image-1.webp')
  expect(restored?.imageAssets?.['image-1'].cloudUrl).toBe('https://blob/img.webp')
})
```

- [ ] **Step 2: Write failing orchestrator merge test**

Append to `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`:

```ts
it('merges image metadata from cloud and local snapshots', async () => {
  const cloudData = {
    prompts: [],
    categories: [],
    temporaryPrompts: [],
    timestamp: 1,
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudUrl: 'https://blob/img.webp',
        cloudPath: 'users/u/images/image-1.webp',
        mimeType: 'image/webp' as const,
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'synced' as const,
        updatedAt: 1
      }
    },
    pendingImageDeletes: []
  }
  const localData = {
    ...cloudData,
    imageAssets: {
      'image-1': {
        ...cloudData.imageAssets['image-1'],
        cloudUrl: undefined,
        cloudPath: undefined,
        status: 'pending_upload' as const,
        updatedAt: 2
      }
    }
  }

  const result = orchestrator['mergeFullBackupData'](cloudData, localData)

  expect(result.data.imageAssets?.['image-1']).toMatchObject({
    status: 'pending_upload',
    cloudUrl: 'https://blob/img.webp',
    cloudPath: 'users/u/images/image-1.webp'
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
```

Expected: FAIL because cloud sync omits metadata and orchestrator does not merge it.

- [ ] **Step 4: Include metadata in cloud strategy upload/download**

In `packages/extension/src/lib/sync/strategies/cloud.ts`, update sync body:

```ts
body: JSON.stringify({
  prompts: data.prompts,
  categories: data.categories,
  temporaryPrompts: data.temporaryPrompts,
  imageAssets: data.imageAssets || {},
  pendingImageDeletes: data.pendingImageDeletes || [],
  timestamp: data.timestamp
})
```

Update restore return:

```ts
return {
  prompts: result.data.prompts || [],
  categories: result.data.categories || [],
  temporaryPrompts: result.data.temporaryPrompts || [],
  imageAssets: result.data.imageAssets || {},
  pendingImageDeletes: result.data.pendingImageDeletes || [],
  timestamp: result.data.timestamp || Date.now()
}
```

Update `uploadPartial` input type and body to allow:

```ts
imageAssets?: FullBackupData['imageAssets']
pendingImageDeletes?: FullBackupData['pendingImageDeletes']
```

- [ ] **Step 5: Merge image metadata in orchestrator**

In `packages/extension/src/lib/sync/orchestrator.ts`, import:

```ts
import { mergeImageAssets, mergePendingImageDeletes } from './image-metadata-merge'
```

Update `preserveMissingImageMetadata` generic to include `imageId`:

```ts
private preserveMissingImageMetadata<T extends { imageId?: string; localImage?: string; remoteImageUrl?: string }>(
  preferred: T,
  fallback?: T
): T {
  if (!fallback) return preferred
  return {
    ...preferred,
    imageId: preferred.imageId || fallback.imageId,
    localImage: preferred.localImage || fallback.localImage,
    remoteImageUrl: preferred.remoteImageUrl || fallback.remoteImageUrl
  }
}
```

In the full data merge method that returns `FullBackupData`, include:

```ts
imageAssets: mergeImageAssets(cloud.imageAssets, local.imageAssets),
pendingImageDeletes: mergePendingImageDeletes(cloud.pendingImageDeletes, local.pendingImageDeletes)
```

Also extend local-only tracking:

```ts
imageAssetIds: Object.keys(local.imageAssets || {}).filter(id => !(cloud.imageAssets || {})[id]),
pendingImageDeleteKeys: (local.pendingImageDeletes || [])
  .filter(item => !(cloud.pendingImageDeletes || []).some(other => other.imageId === item.imageId && other.cloudPath === item.cloudPath))
  .map(item => `${item.imageId}\n${item.cloudPath}`)
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/lib/sync/strategies/cloud.ts packages/extension/src/lib/sync/orchestrator.ts packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
git commit -m "feat: sync image metadata through extension strategies"
```

## Task 8: Supabase Metadata Tables And Sync Routes

**Files:**
- Create: `packages/web-app/supabase/migrations/020_prompt_image_assets.sql`
- Modify: `packages/web-app/app/api/sync/upload/route.ts`
- Modify: `packages/web-app/app/api/sync/download/route.ts`
- Test: `packages/web-app/app/api/sync/upload/route.test.ts`
- Test: `packages/web-app/app/api/sync/status/route.test.ts`

- [ ] **Step 1: Write failing upload route test**

Append to `packages/web-app/app/api/sync/upload/route.test.ts`:

```ts
it('upserts image metadata and pending image deletes without image bytes', async () => {
  const body = {
    prompts: [],
    categories: [],
    temporaryPrompts: [],
    imageAssets: {
      'image-1': {
        id: 'image-1',
        promptId: 'prompt-1',
        localPath: 'images/image-1.webp',
        cloudUrl: 'https://blob/img.webp',
        cloudPath: 'users/user-1/images/image-1.webp',
        mimeType: 'image/webp',
        width: 100,
        height: 80,
        size: 1000,
        hash: 'hash-1',
        status: 'synced',
        updatedAt: 1700000000000
      }
    },
    pendingImageDeletes: [{
      imageId: 'image-2',
      cloudPath: 'users/user-1/images/image-2.webp',
      attempts: 1,
      updatedAt: 1700000000001
    }],
    timestamp: 1700000000002
  }

  const response = await POST(new Request('http://localhost/api/sync/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: JSON.stringify(body)
  }) as NextRequest)

  expect(response.status).toBe(200)
  expect(mockSupabase.from).toHaveBeenCalledWith('image_assets')
  expect(mockSupabase.from).toHaveBeenCalledWith('pending_image_deletes')
})
```

- [ ] **Step 2: Create migration**

Create `packages/web-app/supabase/migrations/020_prompt_image_assets.sql`:

```sql
CREATE TABLE IF NOT EXISTS image_assets (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  local_path TEXT NOT NULL,
  cloud_url TEXT,
  cloud_path TEXT,
  source_url TEXT,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 1048576),
  hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('local_only', 'synced', 'pending_upload', 'upload_failed', 'missing_local')),
  updated_at_ms BIGINT NOT NULL,
  last_upload_attempt_at_ms BIGINT,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, image_id)
);

CREATE TABLE IF NOT EXISTS pending_image_deletes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  cloud_path TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  last_error TEXT,
  updated_at_ms BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, image_id, cloud_path)
);

ALTER TABLE image_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_image_deletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own image assets"
  ON image_assets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own pending image deletes"
  ON pending_image_deletes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_image_assets_user_prompt ON image_assets(user_id, prompt_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_cloud_path ON image_assets(user_id, cloud_path);
CREATE INDEX IF NOT EXISTS idx_pending_image_deletes_user ON pending_image_deletes(user_id);
```

- [ ] **Step 3: Map upload body metadata to tables**

In `packages/web-app/app/api/sync/upload/route.ts`, after prompt/category upserts succeed, add:

```ts
const imageAssets = Object.values(body.imageAssets || {})
const imageAssetRows = imageAssets.map(asset => ({
  user_id: userId,
  image_id: asset.id,
  prompt_id: asset.promptId,
  local_path: asset.localPath,
  cloud_url: asset.cloudUrl,
  cloud_path: asset.cloudPath,
  source_url: asset.sourceUrl,
  mime_type: asset.mimeType,
  width: asset.width,
  height: asset.height,
  size: asset.size,
  hash: asset.hash,
  status: asset.status,
  updated_at_ms: asset.updatedAt,
  last_upload_attempt_at_ms: asset.lastUploadAttemptAt,
  last_error: asset.lastError
}))

if (imageAssetRows.length > 0) {
  const { error } = await supabase
    .from('image_assets')
    .upsert(imageAssetRows, { onConflict: 'user_id,image_id' })
  if (error) throw error
}

const currentImageIds = imageAssets.map(asset => asset.id)
if (currentImageIds.length === 0) {
  await supabase.from('image_assets').delete().eq('user_id', userId)
} else {
  await supabase.from('image_assets').delete().eq('user_id', userId).not('image_id', 'in', `(${currentImageIds.map(id => `"${id}"`).join(',')})`)
}

const pendingDeleteRows = (body.pendingImageDeletes || []).map(item => ({
  user_id: userId,
  image_id: item.imageId,
  cloud_path: item.cloudPath,
  attempts: item.attempts,
  last_error: item.lastError,
  updated_at_ms: item.updatedAt
}))

if (pendingDeleteRows.length > 0) {
  const { error } = await supabase
    .from('pending_image_deletes')
    .upsert(pendingDeleteRows, { onConflict: 'user_id,image_id,cloud_path' })
  if (error) throw error
}
```

Also pass `body.imageAssets || {}` and `body.pendingImageDeletes || []` into both local and remote `normalizeForHash` calls.

- [ ] **Step 4: Return metadata from download route**

In `packages/web-app/app/api/sync/download/route.ts`, add queries:

```ts
const [imageAssetsResult, pendingDeletesResult] = await Promise.all([
  supabase.from('image_assets').select('*').eq('user_id', userId),
  supabase.from('pending_image_deletes').select('*').eq('user_id', userId)
])
```

Transform:

```ts
const imageAssets = Object.fromEntries((imageAssetsResult.data || []).map(row => [row.image_id, {
  id: row.image_id,
  promptId: row.prompt_id,
  localPath: row.local_path,
  cloudUrl: row.cloud_url,
  cloudPath: row.cloud_path,
  sourceUrl: row.source_url,
  mimeType: row.mime_type,
  width: row.width,
  height: row.height,
  size: row.size,
  hash: row.hash,
  status: row.status,
  updatedAt: Number(row.updated_at_ms),
  lastUploadAttemptAt: row.last_upload_attempt_at_ms ? Number(row.last_upload_attempt_at_ms) : undefined,
  lastError: row.last_error
}]))

const pendingImageDeletes = (pendingDeletesResult.data || []).map(row => ({
  imageId: row.image_id,
  cloudPath: row.cloud_path,
  attempts: row.attempts,
  lastError: row.last_error,
  updatedAt: Number(row.updated_at_ms)
}))
```

Add to response data:

```ts
imageAssets,
pendingImageDeletes,
```

- [ ] **Step 5: Run web tests**

Run:

```bash
npm run test --workspace=@oh-my-prompt/web-app -- packages/web-app/app/api/sync/upload/route.test.ts packages/web-app/app/api/sync/status/route.test.ts packages/web-app/lib/sync/upload-data-hash.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web-app/supabase/migrations/020_prompt_image_assets.sql packages/web-app/app/api/sync/upload/route.ts packages/web-app/app/api/sync/download/route.ts packages/web-app/app/api/sync/upload/route.test.ts packages/web-app/app/api/sync/status/route.test.ts
git commit -m "feat: sync prompt image metadata in cloud"
```

## Task 9: Web App Image Upload And Delete Routes

**Files:**
- Create: `packages/web-app/app/api/images/upload/route.ts`
- Create: `packages/web-app/app/api/images/[imageId]/route.ts`
- Test: `packages/web-app/app/api/images/upload/route.test.ts`
- Test: `packages/web-app/app/api/images/[imageId]/route.test.ts`

- [ ] **Step 1: Write failing upload route test**

Create `packages/web-app/app/api/images/upload/route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async () => ({
    url: 'https://blob/img.webp',
    pathname: 'users/user-1/images/image-1.webp'
  }))
}))

describe('POST /api/images/upload', () => {
  it('requires WebP image under 1MB and upserts metadata', async () => {
    const form = new FormData()
    form.set('file', new Blob(['abc'], { type: 'image/webp' }), 'image-1.webp')
    form.set('imageId', 'image-1')
    form.set('promptId', 'prompt-1')
    form.set('hash', 'hash-1')
    form.set('width', '100')
    form.set('height', '80')
    form.set('size', '3')

    const response = await POST(new Request('http://localhost/api/images/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: form
    }) as NextRequest)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.cloudPath).toBe('users/user-1/images/image-1.webp')
  })
})
```

- [ ] **Step 2: Write failing delete route test**

Create `packages/web-app/app/api/images/[imageId]/route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DELETE } from './route'

vi.mock('@vercel/blob', () => ({
  del: vi.fn(async () => undefined)
}))

describe('DELETE /api/images/:imageId', () => {
  it('deletes only user-scoped blob path', async () => {
    const response = await DELETE(new Request('http://localhost/api/images/image-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ cloudPath: 'users/user-1/images/image-1.webp' })
    }) as NextRequest, { params: Promise.resolve({ imageId: 'image-1' }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })
})
```

- [ ] **Step 3: Run route tests to verify they fail**

Run:

```bash
npm run test --workspace=@oh-my-prompt/web-app -- packages/web-app/app/api/images/upload/route.test.ts packages/web-app/app/api/images/[imageId]/route.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 4: Implement upload route**

Create `packages/web-app/app/api/images/upload/route.ts`:

```ts
import { put } from '@vercel/blob'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireCloudSyncSubscription } from '@/lib/sync-subscription'
import { type NextRequest, NextResponse } from 'next/server'

const MAX_IMAGE_BYTES = 1024 * 1024

function isSafeImageId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const subscription = await requireCloudSyncSubscription(user.id)
  if (!subscription.allowed) {
    return NextResponse.json({ success: false, error: 'SUBSCRIPTION_REQUIRED' }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const imageId = String(form.get('imageId') || '')
  const promptId = String(form.get('promptId') || '')
  const hash = String(form.get('hash') || '')
  const width = Number(form.get('width'))
  const height = Number(form.get('height'))
  const size = Number(form.get('size'))

  if (!(file instanceof Blob) || file.type !== 'image/webp') {
    return NextResponse.json({ success: false, error: 'INVALID_MIME_TYPE' }, { status: 400 })
  }
  if (!isSafeImageId(imageId) || !promptId || !hash || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(size)) {
    return NextResponse.json({ success: false, error: 'INVALID_METADATA' }, { status: 400 })
  }
  if (file.size > MAX_IMAGE_BYTES || size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ success: false, error: 'FILE_TOO_LARGE' }, { status: 400 })
  }

  const cloudPath = `users/${user.id}/images/${imageId}.webp`
  const blob = await put(cloudPath, file, {
    access: 'public',
    contentType: 'image/webp',
    addRandomSuffix: false
  })

  const { error } = await supabase.from('image_assets').upsert({
    user_id: user.id,
    image_id: imageId,
    prompt_id: promptId,
    local_path: `images/${imageId}.webp`,
    cloud_url: blob.url,
    cloud_path: cloudPath,
    mime_type: 'image/webp',
    width,
    height,
    size: file.size,
    hash,
    status: 'synced',
    updated_at_ms: Date.now()
  }, { onConflict: 'user_id,image_id' })
  if (error) {
    return NextResponse.json({ success: false, error: 'METADATA_WRITE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      cloudUrl: blob.url,
      cloudPath,
      size: file.size
    }
  })
}
```

- [ ] **Step 5: Implement delete route**

Create `packages/web-app/app/api/images/[imageId]/route.ts`:

```ts
import { del } from '@vercel/blob'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

function isSafeImageId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ imageId: string }> }
): Promise<NextResponse> {
  const { imageId } = await context.params
  if (!isSafeImageId(imageId)) {
    return NextResponse.json({ success: false, error: 'INVALID_IMAGE_ID' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const requestedPath = typeof body.cloudPath === 'string' ? body.cloudPath : undefined
  const { data: asset } = await supabase
    .from('image_assets')
    .select('cloud_path')
    .eq('user_id', user.id)
    .eq('image_id', imageId)
    .maybeSingle()
  const cloudPath = asset?.cloud_path || requestedPath || `users/${user.id}/images/${imageId}.webp`
  const expectedPrefix = `users/${user.id}/images/`
  if (!cloudPath.startsWith(expectedPrefix) || !cloudPath.endsWith(`/${imageId}.webp`)) {
    return NextResponse.json({ success: false, error: 'INVALID_CLOUD_PATH' }, { status: 400 })
  }

  await del(cloudPath)
  await supabase
    .from('image_assets')
    .delete()
    .eq('user_id', user.id)
    .eq('image_id', imageId)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Run route tests**

Run:

```bash
npm run test --workspace=@oh-my-prompt/web-app -- packages/web-app/app/api/images/upload/route.test.ts packages/web-app/app/api/images/[imageId]/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web-app/app/api/images/upload/route.ts packages/web-app/app/api/images/[imageId]/route.ts packages/web-app/app/api/images/upload/route.test.ts packages/web-app/app/api/images/[imageId]/route.test.ts
git commit -m "feat: add cloud image upload routes"
```

## Task 10: UI Migration To Image Asset Service

**Files:**
- Modify: `packages/extension/src/content/components/PromptEditModal.tsx`
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`
- Modify: `packages/extension/src/content/components/PromptPreviewModal.tsx`
- Modify: `packages/extension/src/content/components/PromptThumbnail.tsx`
- Modify: `packages/extension/src/sidepanel/views/PromptListView.tsx`
- Test: `packages/extension/src/content/components/__tests__/prompt-edit-modal.test.ts`
- Test: `packages/extension/src/lib/sync/__tests__/image-loader-queue.test.ts`

- [ ] **Step 1: Write failing UI/service integration tests**

Update `packages/extension/src/content/components/__tests__/prompt-edit-modal.test.ts` to mock `savePromptImageAsset`:

```ts
vi.mock('../../../lib/sync/image-asset-service', () => ({
  savePromptImageAsset: vi.fn(async () => ({
    success: true,
    imageId: 'image-1',
    localPath: 'images/image-1.webp'
  })),
  deletePromptImageAsset: vi.fn(async () => undefined),
  getDisplayUrl: vi.fn(async () => 'blob:asset')
}))
```

Add assertion to the image upload test:

```ts
const { savePromptImageAsset } = await import('../../../lib/sync/image-asset-service')
expect(savePromptImageAsset).toHaveBeenCalledWith(expect.objectContaining({
  sourceUrl: expect.anything()
}))
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/content/components/__tests__/prompt-edit-modal.test.ts packages/extension/src/lib/sync/__tests__/image-loader-queue.test.ts
```

Expected: FAIL because UI still imports direct image sync helpers.

- [ ] **Step 3: Add display URL helper to service**

Add to `packages/extension/src/lib/sync/image-asset-service.ts`:

```ts
export async function getDisplayUrl(prompt: Prompt): Promise<string | null> {
  if (prompt.imageId) {
    const data = await readStorage()
    const asset = data.imageAssets?.[prompt.imageId]
    if (asset?.localPath) {
      const localUrl = await getCachedImageUrl(asset.localPath)
      if (localUrl) return localUrl
      if (asset.cloudUrl) return asset.cloudUrl
    }
  }

  if (prompt.localImage) {
    const legacyUrl = await getCachedImageUrl(prompt.localImage)
    if (legacyUrl) return legacyUrl
  }

  return prompt.remoteImageUrl || null
}
```

- [ ] **Step 4: Update `PromptThumbnail`**

Replace direct `getCachedImageUrl(relativePath)` loading with `getDisplayUrl(prompt)` when a prompt object is available. Keep `relativePath` support for legacy callers:

```ts
import { getDisplayUrl } from '../../lib/sync/image-asset-service'

const url = prompt ? await getDisplayUrl(prompt) : await getCachedImageUrl(relativePath)
```

- [ ] **Step 5: Update save callers**

In `PromptEditModal.tsx`, `DropdownContainer.tsx`, and `PromptListView.tsx`, replace direct `saveImage(promptId, blob, filename)` calls with:

```ts
const imageResult = await savePromptImageAsset({
  promptId,
  blob: normalizedBlob,
  sourceUrl: remoteImageUrl,
  canUseCloud: authState.status === 'logged_in' && Boolean(authState.cloudSyncEnabled),
  width: normalized.width,
  height: normalized.height,
  size: normalized.size,
  hash: normalized.hash
})
```

Use the returned `imageId` and `localPath` for local component state:

```ts
if (imageResult.success) {
  setLocalImage(imageResult.localPath)
}
```

When a caller does not already have `width`, `height`, `size`, and `hash`, call the offscreen normalization path first and pass those values through.

- [ ] **Step 6: Update preview callers**

In `PromptPreviewModal.tsx`, replace:

```ts
const { getCachedImageUrl } = await import('../../lib/sync/image-sync')
const url = await getCachedImageUrl(prompt.localImage)
```

with:

```ts
const { getDisplayUrl } = await import('../../lib/sync/image-asset-service')
const url = await getDisplayUrl(prompt)
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- packages/extension/src/content/components/__tests__/prompt-edit-modal.test.ts packages/extension/src/lib/sync/__tests__/image-loader-queue.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/extension/src/content/components/PromptEditModal.tsx packages/extension/src/content/components/DropdownContainer.tsx packages/extension/src/content/components/PromptPreviewModal.tsx packages/extension/src/content/components/PromptThumbnail.tsx packages/extension/src/sidepanel/views/PromptListView.tsx packages/extension/src/content/components/__tests__/prompt-edit-modal.test.ts packages/extension/src/lib/sync/__tests__/image-loader-queue.test.ts packages/extension/src/lib/sync/image-asset-service.ts
git commit -m "feat: use image asset service in extension UI"
```

## Task 11: End-To-End Verification And Docs

**Files:**
- Modify: `docs/architecture.md`
- Verify: extension and web-app tests

- [ ] **Step 1: Update architecture docs**

Add to `docs/architecture.md` under storage schema:

```md
Prompt images are local-first assets. Prompts may reference `imageId`, while image metadata lives in top-level `imageAssets` and retryable cloud deletes live in `pendingImageDeletes`. `remoteImageUrl` remains the original source URL; Vercel Blob recovery URLs are stored as `imageAssets[imageId].cloudUrl`.
```

- [ ] **Step 2: Run extension verification**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
npm run test:unit --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 3: Run web app verification**

Run:

```bash
npm run web:build
npm run test --workspace=@oh-my-prompt/web-app
```

Expected: PASS.

- [ ] **Step 4: Run shared verification**

Run:

```bash
npm run check-shared
```

Expected: PASS.

- [ ] **Step 5: Manual extension smoke test**

Run:

```bash
npm run dev
```

Expected: extension dev build starts and writes `packages/extension/dist/`.

Manual checks:

```text
1. Load packages/extension/dist in chrome://extensions.
2. Configure a local backup folder.
3. Save a prompt with a PNG image.
4. Confirm the folder contains images/{imageId}.webp.
5. Confirm prompt_script_data has prompt.imageId, prompt.localImage, imageAssets[imageId].
6. Delete the prompt.
7. Confirm imageAssets[imageId] is removed and local image file is removed.
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: document prompt image asset storage"
```

## Self-Review

- Spec coverage: The plan covers shared schema, local backup, cloud metadata storage, cloud upload/delete APIs, offscreen WebP processing, save/load/delete/replace service behavior, retry queues, hash changes, merge rules, UI migration, and verification.
- Placeholder scan: No unfinished marker text or unbounded validation steps remain. Each code-changing step names exact files and includes concrete code or exact replacements.
- Type consistency: The plan uses `ImageAsset`, `PendingImageDelete`, `imageAssets`, `pendingImageDeletes`, `imageId`, `cloudUrl`, `cloudPath`, `localPath`, and `status` consistently across shared, extension, and web-app tasks.
