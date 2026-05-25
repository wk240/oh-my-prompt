# Cloud Sync ID-First Minimal-Intrusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate frequent cloud upload/download thrash and stop new duplicate categories/prompts by routing auto-sync through `SyncOrchestrator`, adding durable sync guards, and making merge identity ID-first.

**Architecture:** `SET_STORAGE` keeps its existing debounce behavior, but the debounced flush calls `SyncOrchestrator.triggerSync` instead of the legacy `sync-manager.triggerSync` path. Sync guard metadata is persisted in `chrome.storage.local` under `syncStatus` so Manifest V3 service-worker restarts do not erase dedupe state. Merge remains bidirectional by ID, while legacy personal-library duplicates are handled only through an explicit typed alias map; names are display text, not identity.

**Tech Stack:** Chrome Extension MV3, TypeScript, `chrome.storage.local`, existing sync strategies/orchestrator, existing `computeBackupDataHash`, Vitest unit tests.

---

## File Structure

- Modify: `packages/extension/src/background/service-worker.ts`
  - Keep `SET_STORAGE -> debouncedTriggerSync`, but replace the debounced flush from legacy `triggerSync` to `syncOrchestrator.triggerSync`.
  - Remove the now-unused `triggerSync` import from `../lib/sync/sync-manager` if no other code path uses it.
- Modify or create test: service-worker message handler test near the existing background tests.
  - Verify `SET_STORAGE` calls the orchestrator path once after debounce and never calls the old sync-manager auto-sync path.
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`
  - Add durable hash/min-interval/in-flight guard flow.
  - Drain exactly one pending latest snapshot after the active sync finishes.
  - Add explicit ID-first alias remap before preview/merge/apply.
  - Remove implicit same-name merge behavior from `mergeBidirectional`.
- Modify: `packages/extension/src/lib/sync/types.ts`
  - Extend `UnifiedSyncStatus` with durable guard bookkeeping and typed alias map fields.
- Reuse: `packages/extension/src/lib/sync/hash.ts`
  - Use the existing `computeBackupDataHash`; do not add a competing hash API unless tests prove the existing field set is wrong.
- Modify: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`
  - Add tests for guard behavior, pending snapshot drain, download cooldown, state matrix, ID-first merge, and alias remap.
- Optional docs update: `docs/architecture.md`
  - Add short section describing single auto-sync entry and ID-first policy.

---

### Task 1: Unify Auto-Sync Entry in Service Worker

**Files:**
- Modify: `packages/extension/src/background/service-worker.ts`
- Test: service-worker/background message handler test file in `packages/extension/src/background/` or `packages/extension/src/background/__tests__/`

- [ ] **Step 1: Locate the existing background test harness**

Run: `rg -n "SET_STORAGE|onMessage|debouncedTriggerSync|service-worker" packages/extension/src --glob '*test.ts'`
Expected: output identifies the closest existing background/service-worker test file. If none exists, create `packages/extension/src/background/__tests__/service-worker.test.ts`.

- [ ] **Step 2: Write failing test for the real `SET_STORAGE` route**

```ts
it('SET_STORAGE auto-sync flushes through SyncOrchestrator only', async () => {
  vi.useFakeTimers()

  const oldTriggerSync = vi.fn().mockResolvedValue({ success: true })
  const orchestratorTriggerSync = vi.fn().mockResolvedValue({
    cloudSynced: true,
    localSynced: true,
    syncedAt: 123
  })

  vi.doMock('../../lib/sync/sync-manager', async () => ({
    getSyncStatus: vi.fn(),
    triggerSync: oldTriggerSync,
    restorePermission: vi.fn(),
    initialSync: vi.fn(),
    triggerProviderConfigsSync: vi.fn()
  }))
  vi.doMock('../../lib/sync', async () => ({
    createSyncOrchestrator: () => ({ triggerSync: orchestratorTriggerSync }),
    FullBackupData: undefined
  }))

  const sendResponse = vi.fn()
  await dispatchRuntimeMessage({
    type: MessageType.SET_STORAGE,
    payload: {
      version: '1.0.0',
      userData: { prompts: [], categories: [] },
      temporaryPrompts: [],
      settings: {}
    }
  }, sendResponse)

  await vi.advanceTimersByTimeAsync(500)

  expect(oldTriggerSync).not.toHaveBeenCalled()
  expect(orchestratorTriggerSync).toHaveBeenCalledTimes(1)
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: expect.objectContaining({ syncSuccess: true })
  }))
})
```

If the local test harness uses a different helper than `dispatchRuntimeMessage`, adapt only the helper call; keep the assertions against old `triggerSync` and `orchestrator.triggerSync`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- service-worker.test.ts`
Expected: FAIL because `debouncedTriggerSync` still calls the old `sync-manager.triggerSync`.

- [ ] **Step 4: Implement single entry while preserving debounce**

```ts
async function debouncedTriggerSync(backupData: FullBackupData): Promise<{ success: boolean; error?: { type: string; message: string } }> {
  // existing debounce setup stays unchanged
  const syncResult = await syncOrchestrator.triggerSync(dataToSync)
  const success = syncResult.cloudSynced || syncResult.localSynced || syncResult.skipped === true
  const errorMessage = syncResult.cloudError || syncResult.localError

  return {
    success,
    error: success || !errorMessage
      ? undefined
      : { type: 'unknown', message: errorMessage }
  }
}
```

Also remove `triggerSync` from the `../lib/sync/sync-manager` import when it becomes unused.

- [ ] **Step 5: Run test to verify pass**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- service-worker.test.ts`
Expected: PASS for the single-path assertion.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/background/service-worker.ts packages/extension/src/background/__tests__/service-worker.test.ts
git commit -m "refactor(sync): route auto-sync through orchestrator only"
```

---

### Task 2: Add Durable Sync Guards

**Files:**
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`
- Modify: `packages/extension/src/lib/sync/types.ts`
- Test: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Extend status types**

```ts
export interface SyncGuardStatus {
  lastUploadedHash?: string
  lastUploadStartedAt?: number
  lastCloudUploadAt?: number
  syncInFlight?: boolean
  pendingSnapshotHash?: string
}

export interface UnifiedSyncStatus {
  // existing fields...
  guard?: SyncGuardStatus
}
```

- [ ] **Step 2: Write failing tests for durable hash skip and pending drain**

```ts
it('should skip upload when persisted lastUploadedHash matches the current snapshot', async () => {
  const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
  const hash = await computeBackupDataHash(data)

  vi.mocked(chrome.storage.local.get).mockResolvedValue({
    syncStatus: { guard: { lastUploadedHash: hash } }
  })
  vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
  vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

  const result = await orchestrator.triggerSync(data)

  expect(result.skipped).toBe(true)
  expect(cloudStrategy.sync).not.toHaveBeenCalled()
})

it('should run one follow-up sync with the latest pending snapshot after an in-flight sync finishes', async () => {
  const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
  const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
  const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

  vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
  vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
  vi.spyOn(localStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

  let releaseFirst!: () => void
  vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
    releaseFirst = () => resolve({ success: true, syncedAt: 1 })
  })).mockResolvedValue({ success: true, syncedAt: 2 })

  const firstRun = orchestrator.triggerSync(first)
  const secondRun = orchestrator.triggerSync(second)
  const thirdRun = orchestrator.triggerSync(third)

  await Promise.resolve()
  releaseFirst()
  await Promise.all([firstRun, secondRun, thirdRun])

  expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
  expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: FAIL because guard status is not read/written and pending snapshots are not drained.

- [ ] **Step 4: Reuse existing hash utility**

```ts
import { computeBackupDataHash } from './hash'
```

Do not add `buildSyncSnapshotHash`. `computeBackupDataHash` already sorts by ID and includes prompts, categories, and temporary prompts.

- [ ] **Step 5: Implement durable guard helpers**

```ts
private async getGuardStatus(): Promise<SyncGuardStatus> {
  const status = await this.getSyncStatus()
  return status.guard || {}
}

private async updateGuardStatus(updates: Partial<SyncGuardStatus>): Promise<void> {
  const status = await this.getSyncStatus()
  await this.updateSyncStatus({
    guard: {
      ...(status.guard || {}),
      ...updates
    }
  })
}
```

- [ ] **Step 6: Apply guard flow in `triggerSync`**

```ts
const snapshotHash = await computeBackupDataHash(data)
const guard = await this.getGuardStatus()

if (guard.lastUploadedHash === snapshotHash) {
  return { cloudSynced: false, localSynced: false, skipped: true }
}

if (guard.syncInFlight) {
  await this.updateGuardStatus({ pendingSnapshotHash: snapshotHash })
  this.pendingSnapshot = data
  return { cloudSynced: false, localSynced: false, skipped: true }
}

await this.updateGuardStatus({
  syncInFlight: true,
  lastUploadStartedAt: Date.now(),
  pendingSnapshotHash: undefined
})

try {
  const result = await this.runSyncNow(data)
  if (result.cloudSynced) {
    await this.updateGuardStatus({
      lastUploadedHash: snapshotHash,
      lastCloudUploadAt: Date.now()
    })
  }
  return result
} finally {
  await this.updateGuardStatus({ syncInFlight: false })
  await this.drainPendingSnapshot(snapshotHash)
}
```

Move the current body of `triggerSync` into `private async runSyncNow(data: FullBackupData)` so the guard wrapper is small and testable. `drainPendingSnapshot` must only run when `this.pendingSnapshot` exists and its hash differs from the completed hash.

- [ ] **Step 7: Run tests to verify pass**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: PASS, with no duplicate parallel cloud syncs and exactly one latest follow-up sync.

- [ ] **Step 8: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts packages/extension/src/lib/sync/types.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
git commit -m "feat(sync): add durable hash and in-flight guards"
```

---

### Task 3: Add Min-Interval and Download Cooldown

**Files:**
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`
- Test: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write failing min-interval test**

```ts
it('should queue the latest snapshot when triggerSync is called inside the minimum interval', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)

  const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
  const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })

  vi.mocked(chrome.storage.local.get).mockResolvedValue({
    syncStatus: { guard: { lastUploadStartedAt: 9_500 } }
  })

  const result = await orchestrator.triggerSync(second)

  expect(result.skipped).toBe(true)
  expect(cloudStrategy.sync).not.toHaveBeenCalled()
  expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
    syncStatus: expect.objectContaining({
      guard: expect.objectContaining({ pendingSnapshotHash: await computeBackupDataHash(second) })
    })
  }))
})
```

- [ ] **Step 2: Write failing download cooldown test**

```ts
it('should not auto-download inside cloud upload cooldown', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(20_000)

  vi.mocked(chrome.storage.local.get).mockResolvedValue({
    syncStatus: { guard: { lastCloudUploadAt: 10_000 } }
  })

  const result = await orchestrator.downloadAndMerge({ reason: 'auto' })

  expect(result.skipped).toBe(true)
  expect(cloudStrategy.restore).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: FAIL because min-interval and cooldown checks are not implemented.

- [ ] **Step 4: Implement constants and explicit download reason**

```ts
private readonly MIN_SYNC_INTERVAL_MS = 2000
private readonly DOWNLOAD_COOLDOWN_MS = 15000

async downloadAndMerge(options: { reason: 'manual' | 'initial' | 'auto' } = { reason: 'manual' }): Promise<MergeResult & { skipped?: boolean; conflicts?: Array<{ type: 'prompt' | 'category'; cloud: unknown; local: unknown }> }> {
  const guard = await this.getGuardStatus()
  if (options.reason === 'auto' && guard.lastCloudUploadAt && Date.now() - guard.lastCloudUploadAt < this.DOWNLOAD_COOLDOWN_MS) {
    return {
      skipped: true,
      data: await this.getLocalData(),
      localOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] }
    }
  }

  // existing restore and merge flow
}
```

Update `initialSync` to call `downloadAndMerge({ reason: 'initial' })`. Sidepanel/manual merge calls should call `downloadAndMerge({ reason: 'manual' })`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: PASS for min-interval and cooldown tests.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
git commit -m "feat(sync): add min interval and download cooldown"
```

---

### Task 4: Make Merge ID-First and Alias-Only

**Files:**
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`
- Modify: `packages/extension/src/lib/sync/types.ts`
- Test: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Add typed alias-map fields**

```ts
export interface IdAliasMap {
  prompts?: Record<string, string>
  categories?: Record<string, string>
  temporaryPrompts?: Record<string, string>
}

export interface UnifiedSyncStatus {
  // existing fields...
  idAliasMap?: IdAliasMap
}
```

Alias keys are old IDs and values are kept IDs. Prompt IDs, category IDs, and temporary prompt IDs are stored separately to avoid cross-entity collisions. The literal category ID `'temporary'` must never be remapped.

- [ ] **Step 2: Write failing test proving same names do not merge**

```ts
it('should keep same-name categories separate when no alias exists', async () => {
  const cloudData = makeBackupData({
    categories: [{ id: 'cloud-cat', name: 'Ideas', order: 0, updatedAt: 100 }],
    prompts: [{ id: 'cloud-prompt', name: 'A', content: 'A', categoryId: 'cloud-cat', order: 0, updatedAt: 100 }]
  })
  const localData = makeBackupData({
    categories: [{ id: 'local-cat', name: 'Ideas', order: 1, updatedAt: 200 }],
    prompts: [{ id: 'local-prompt', name: 'B', content: 'B', categoryId: 'local-cat', order: 0, updatedAt: 200 }]
  })

  vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
  mockLocalStorageData(localData)

  const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

  expect(result.data.categories.map(c => c.id).sort()).toEqual(['cloud-cat', 'local-cat'])
  expect(result.data.prompts.find(p => p.id === 'local-prompt')?.categoryId).toBe('local-cat')
})
```

- [ ] **Step 3: Write failing alias remap test**

```ts
it('should remap category aliases and dedupe only when alias map is explicit', async () => {
  vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({
    syncStatus: {
      idAliasMap: {
        categories: { 'old-cat': 'kept-cat' },
        prompts: { 'old-prompt': 'kept-prompt' }
      }
    }
  })

  const cloudData = makeBackupData({
    categories: [{ id: 'kept-cat', name: 'Ideas', order: 0, updatedAt: 200 }],
    prompts: [{ id: 'kept-prompt', name: 'A', content: 'new', categoryId: 'kept-cat', order: 0, updatedAt: 200 }]
  })
  const localData = makeBackupData({
    categories: [{ id: 'old-cat', name: 'Ideas', order: 1, updatedAt: 100 }],
    prompts: [{ id: 'old-prompt', name: 'A', content: 'old', categoryId: 'old-cat', order: 0, updatedAt: 100 }]
  })

  vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
  mockLocalStorageData(localData)

  const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

  expect(result.data.categories).toHaveLength(1)
  expect(result.data.categories[0].id).toBe('kept-cat')
  expect(result.data.prompts).toHaveLength(1)
  expect(result.data.prompts[0].id).toBe('kept-prompt')
  expect(result.data.prompts[0].categoryId).toBe('kept-cat')
})
```

- [ ] **Step 4: Run tests to verify failure**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: FAIL because current `mergeBidirectional` merges by same `name` and alias remap does not exist.

- [ ] **Step 5: Add alias helpers**

```ts
private async getIdAliasMap(): Promise<IdAliasMap> {
  const status = await this.getSyncStatus()
  return status.idAliasMap || {}
}

private resolveAliasId(id: string, map: Record<string, string> = {}): string {
  if (id === 'temporary') return id

  const seen = new Set<string>()
  let current = id
  while (map[current] && !seen.has(current)) {
    seen.add(current)
    current = map[current]
  }
  return current
}

private applyAliasMap(data: FullBackupData, aliasMap: IdAliasMap): FullBackupData {
  const categories = data.categories.map(c => ({
    ...c,
    id: this.resolveAliasId(c.id, aliasMap.categories)
  }))
  const prompts = data.prompts.map(p => ({
    ...p,
    id: this.resolveAliasId(p.id, aliasMap.prompts),
    categoryId: this.resolveAliasId(p.categoryId, aliasMap.categories)
  }))
  const temporaryPrompts = data.temporaryPrompts.map(p => ({
    ...p,
    id: this.resolveAliasId(p.id, aliasMap.temporaryPrompts),
    categoryId: 'temporary'
  }))

  return {
    ...data,
    categories: this.dedupeById(categories),
    prompts: this.dedupeById(prompts),
    temporaryPrompts: this.dedupeById(temporaryPrompts)
  }
}
```

- [ ] **Step 6: Remove implicit name merge from `mergeBidirectional`**

```ts
// Build only ID maps. Do not build cloudNameMap/localNameMap.
// If an item is not present by ID, it is cloudOnly or localOnly.
```

After this change, delete `mergedByName` from return values, preview stats, logs, and comments, or rename the UI count to `aliasMerged` if the UI still needs a count.

- [ ] **Step 7: Apply alias remap before preview and merge**

```ts
const aliasMap = await this.getIdAliasMap()
const cloudData = cloudRaw ? this.applyAliasMap(cloudRaw, aliasMap) : null
const localData = this.applyAliasMap(await this.getLocalData(), aliasMap)
```

Use the remapped data in both `previewMerge` and `downloadAndMerge` before calling `mergeBidirectional`.

- [ ] **Step 8: Run tests to verify pass**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: PASS for same-name separation and explicit alias cleanup.

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts packages/extension/src/lib/sync/types.ts packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
git commit -m "feat(sync): make merge id-first with explicit aliases"
```

---

### Task 5: Verify State Matrix Behavior

**Files:**
- Modify: `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`

- [ ] **Step 1: Add matrix tests**

```ts
it('LOCAL_ONLY should sync local and set pendingCloudSync without clearing cloud error', async () => {
  const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

  vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
  vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
  vi.spyOn(localStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 123 })

  const result = await orchestrator.triggerSync(data)

  expect(result.localSynced).toBe(true)
  expect(result.cloudSynced).toBe(false)
  expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
    syncStatus: expect.objectContaining({
      hasUnsyncedChanges: true,
      pendingCloudSync: true,
      localError: undefined
    })
  }))
})

it('CLOUD_ONLY should sync cloud and keep local error visible', async () => {
  const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

  vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
  vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)
  vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 123 })

  const result = await orchestrator.triggerSync(data)

  expect(result.cloudSynced).toBe(true)
  expect(result.localSynced).toBe(false)
  expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
    syncStatus: expect.objectContaining({
      pendingCloudSync: false,
      cloudError: undefined,
      localSyncing: false
    })
  }))
})

it('BOTH_UNAVAILABLE should mark unsynced changes without scheduling retry storm', async () => {
  const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

  vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
  vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)

  const result = await orchestrator.triggerSync(data)

  expect(result.cloudSynced).toBe(false)
  expect(result.localSynced).toBe(false)
  expect(cloudStrategy.sync).not.toHaveBeenCalled()
  expect(localStrategy.sync).not.toHaveBeenCalled()
  expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
    syncStatus: expect.objectContaining({
      hasUnsyncedChanges: true,
      pendingCloudSync: true,
      cloudSyncing: false,
      localSyncing: false
    })
  }))
})
```

- [ ] **Step 2: Run tests to verify failure or baseline**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: FAIL for any inconsistent state writes, or PASS if earlier tasks already fixed them.

- [ ] **Step 3: Fix status updates in `runSyncNow`**

```ts
// LOCAL_ONLY success:
// hasUnsyncedChanges true, pendingCloudSync true, localError undefined.

// CLOUD_ONLY success:
// lastCloudSyncTime set, pendingCloudSync false, pendingUpload false, cloudError undefined.
// Do not write a fake lastLocalSyncTime.

// BOTH_UNAVAILABLE:
// hasUnsyncedChanges true, pendingCloudSync true, cloudSyncing false, localSyncing false.
// Do not instantiate RetryManager.
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- orchestrator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/__tests__/orchestrator.test.ts packages/extension/src/lib/sync/orchestrator.ts
git commit -m "fix(sync): enforce sync availability state matrix"
```

---

### Task 6: Integration Verification + Docs Update

**Files:**
- Modify (optional): `docs/architecture.md`

- [ ] **Step 1: Run extension type checks**

Run: `npm run typecheck --workspace=@oh-my-prompt/extension`
Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run sync unit test suite**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- sync`
Expected: PASS including guard, cooldown, state matrix, and alias tests.

- [ ] **Step 3: Run background/service-worker unit tests**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension -- service-worker.test.ts`
Expected: PASS for the `SET_STORAGE` single-entry test.

- [ ] **Step 4: Run full extension unit tests**

Run: `npm run test:unit --workspace=@oh-my-prompt/extension`
Expected: PASS.

- [ ] **Step 5: Add architecture note**

```md
### Sync Entry and Identity Policy

- Auto-sync entry is `SET_STORAGE -> debouncedTriggerSync -> SyncOrchestrator.triggerSync`.
- Sync dedupe state is persisted in `syncStatus.guard` so MV3 service-worker restarts do not erase upload guards.
- Identity is ID-first; `name` is display-only and must not merge entities.
- Legacy personal duplicates are handled only by explicit typed `idAliasMap` entries.
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(sync): document single-entry and id-first policy"
```

---

## Self-Review

### 1. Spec coverage

- Single auto-sync entry: covered in Task 1 at the service-worker/message boundary, not only orchestrator unit tests.
- Frequent upload/download stop-loss: covered in Tasks 2 and 3 with durable hash guards, in-flight coalescing, min interval, and cooldown.
- Manifest V3 lifecycle safety: covered by persisting guard fields in `syncStatus.guard`.
- ID-first identity and no name-based equivalence: covered in Task 4 by removing implicit same-name merge behavior.
- Duplicate categories + prompts cleanup: covered in Task 4 through typed explicit alias maps.
- State matrix (dual/local/cloud/degraded): covered in Task 5.
- Legacy personal local backup safety: covered by soft alias remap and no destructive backup-file migration.

### 2. Placeholder scan

- No unresolved placeholder markers left.
- Code steps include concrete signatures, fields, and expected assertions.
- Any helper names such as `makeBackupData`, `mockLocalStorageData`, and `dispatchRuntimeMessage` are test harness helpers; if absent, create them in the test file before using them.

### 3. Type consistency

- Guard state is `UnifiedSyncStatus.guard`.
- Alias state is `UnifiedSyncStatus.idAliasMap`.
- Hashing reuses `computeBackupDataHash`.
- Auto-sync success treats `{ skipped: true }` as a successful no-op so `SET_STORAGE` does not surface false sync failures.
