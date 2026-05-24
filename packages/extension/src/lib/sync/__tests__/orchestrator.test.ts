import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncOrchestrator } from '../orchestrator'
import { CloudSyncStrategy } from '../strategies/cloud'
import { LocalSyncStrategy } from '../strategies/local'
import { FullBackupData, MergeResult } from '../types'
import { computeBackupDataHash } from '../hash'
import { executeLocalSync } from '../local-sync-executor'

// Mock the strategies
vi.mock('../strategies/cloud')
vi.mock('../strategies/local')
vi.mock('../local-sync-executor', () => ({
  executeLocalSync: vi.fn()
}))

type BackupDataInput =
  | { promptId: string; updatedAt: number }
  | Partial<Pick<FullBackupData, 'prompts' | 'categories' | 'temporaryPrompts' | 'timestamp'>>

function makeBackupData(input: BackupDataInput): FullBackupData {
  if ('promptId' in input) {
    const { promptId, updatedAt } = input
    return {
      prompts: [
        {
          id: promptId,
          name: `Prompt ${promptId}`,
          content: `Content ${updatedAt}`,
          categoryId: 'c1',
          order: 0,
          updatedAt
        }
      ],
      categories: [{ id: 'c1', name: 'Category', order: 0, updatedAt }],
      temporaryPrompts: [],
      timestamp: updatedAt
    }
  }

  return {
    prompts: input.prompts || [],
    categories: input.categories || [],
    temporaryPrompts: input.temporaryPrompts || [],
    timestamp: input.timestamp || Date.now()
  }
}

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator
  let cloudStrategy: CloudSyncStrategy
  let localStrategy: LocalSyncStrategy
  let storageData: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    storageData = {}

    // Create fresh strategy instances
    cloudStrategy = new CloudSyncStrategy()
    localStrategy = new LocalSyncStrategy()
    orchestrator = new SyncOrchestrator(cloudStrategy, localStrategy)

    // Mock chrome.storage.local
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getManifest: vi.fn().mockReturnValue({ version: '2.0.0' })
      },
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[]) => {
            if (!keys) return storageData
            if (typeof keys === 'string') {
              return { [keys]: storageData[keys] }
            }
            return keys.reduce<Record<string, unknown>>((result, key) => {
              result[key] = storageData[key]
              return result
            }, {})
          }),
          set: vi.fn(async (updates: Record<string, unknown>) => {
            Object.assign(storageData, updates)
          })
        }
      }
    } as any

    vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 1 })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('triggerSync', () => {
    it('should skip upload when persisted lastUploadedHash matches the current snapshot', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const hash = await computeBackupDataHash(data)

      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: { guard: { lastUploadedHash: hash, lastLocalSyncedHash: hash } }
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const result = await orchestrator.triggerSync(data)

      expect(result.skipped).toBe(true)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()
    })

    it('should queue the latest snapshot when triggerSync is called inside the minimum interval', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(10_000)

      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const secondHash = await computeBackupDataHash(second)

      storageData.syncStatus = { guard: { lastUploadStartedAt: 9_500 } }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const result = await orchestrator.triggerSync(second)

      expect(result.skipped).toBe(true)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          guard: expect.objectContaining({ pendingSnapshotHash: secondHash })
        })
      }))
    })

    it('should run a delayed follow-up for a standalone min-interval skip', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(10_000)

      const data = makeBackupData({ promptId: 'p1', updatedAt: 200 })

      storageData.syncStatus = { guard: { lastUploadStartedAt: 9_500 } }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.skipped).toBe(true)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1_499)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(1)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
    })

    it('should clear pending hash when delayed min-interval follow-up finds unchanged snapshot', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(10_000)

      const data = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const hash = await computeBackupDataHash(data)

      storageData.syncStatus = {
        guard: {
          lastUploadStartedAt: 9_500,
          lastUploadedHash: hash,
          lastLocalSyncedHash: hash
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const result = await orchestrator.triggerSync(data)

      expect(result.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: hash
      }))

      await vi.advanceTimersByTimeAsync(1_500)

      expect(cloudStrategy.sync).not.toHaveBeenCalled()
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: undefined
      }))
    })

    it('should not drain a stale queued snapshot after a newer trigger follows a min-interval skip', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(10_000)

      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const staleQueued = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const newest = makeBackupData({ promptId: 'p1', updatedAt: 300 })
      const newestHash = await computeBackupDataHash(newest)
      let releaseInitialRead: (() => void) | undefined
      let delayInitialSyncStatusRead = true

      storageData.syncStatus = { guard: { lastUploadStartedAt: 9_500 } }
      vi.mocked(chrome.storage.local.get).mockImplementation((key?: string | string[]) => {
        if (key === 'syncStatus' && delayInitialSyncStatusRead) {
          delayInitialSyncStatusRead = false
          return new Promise(resolve => {
            releaseInitialRead = () => resolve({ syncStatus: storageData.syncStatus })
          })
        }
        if (!key) return Promise.resolve(storageData)
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: storageData[key] })
        }
        return Promise.resolve(key.reduce<Record<string, unknown>>((result, storageKey) => {
          result[storageKey] = storageData[storageKey]
          return result
        }, {}))
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseInitialRead).toBeTypeOf('function')
      })

      const staleQueuedResult = await orchestrator.triggerSync(staleQueued)
      releaseInitialRead!()
      const firstResult = await firstRun

      expect(firstResult.skipped).toBe(true)
      expect(staleQueuedResult.skipped).toBe(true)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()

      vi.setSystemTime(12_000)
      const newestResult = await orchestrator.triggerSync(newest)

      expect(newestResult.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledTimes(1)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(newest)
      expect(cloudStrategy.sync).not.toHaveBeenCalledWith(staleQueued)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: undefined,
        lastUploadedHash: newestHash
      }))
    })

    it('should recover an orphaned persisted in-flight guard and run sync', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          lastUploadStartedAt: Date.now()
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should not clear another live orchestrator lock or start a parallel sync', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      })).mockResolvedValue({ success: true, syncedAt: 3 })
      vi.spyOn(otherCloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const secondResult = await otherOrchestrator.triggerSync(second)

      expect(secondResult.skipped).toBe(true)
      expect(otherCloudStrategy.sync).not.toHaveBeenCalled()
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: true
      }))

      releaseFirst()
      await firstRun
    })

    it('should not run duplicate cloud syncs when two instances acquire an empty guard concurrently', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const pendingHash = await computeBackupDataHash(second)
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      const releaseSyncs: Array<() => void> = []
      vi.spyOn(cloudStrategy, 'sync').mockImplementation(() => new Promise(resolve => {
        releaseSyncs.push(() => resolve({ success: true, syncedAt: 1 }))
      }))
      vi.spyOn(otherCloudStrategy, 'sync').mockImplementation(() => new Promise(resolve => {
        releaseSyncs.push(() => resolve({ success: true, syncedAt: 2 }))
      }))

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = otherOrchestrator.triggerSync(second)

      await vi.waitFor(() => {
        expect(cloudStrategy.sync.mock.calls.length + otherCloudStrategy.sync.mock.calls.length).toBe(1)
      })

      releaseSyncs.forEach(release => release())
      const [firstResult, secondResult] = await Promise.all([firstRun, secondRun])

      expect(cloudStrategy.sync.mock.calls.length + otherCloudStrategy.sync.mock.calls.length).toBe(1)
      expect([firstResult.skipped, secondResult.skipped]).toContain(true)

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: pendingHash
      }))
    })

    it('should not let stale-lock cleanup erase a fresh owner lock', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const freshOwnerId = 'fresh-owner'
      let releaseInitialRead: (() => void) | undefined

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          lockOwnerId: 'stale-owner',
          lastUploadStartedAt: 1,
          pendingSnapshotHash: 'stale-pending'
        }
      }

      vi.mocked(chrome.storage.local.get).mockImplementation((key?: string | string[]) => {
        if (key === 'syncStatus' && !releaseInitialRead) {
          return new Promise(resolve => {
            releaseInitialRead = () => resolve({
              syncStatus: {
                guard: {
                  syncInFlight: true,
                  lockOwnerId: 'stale-owner',
                  lastUploadStartedAt: 1,
                  pendingSnapshotHash: 'stale-pending'
                }
              }
            })
          })
        }
        if (!key) return Promise.resolve(storageData)
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: storageData[key] })
        }
        return Promise.resolve(key.reduce<Record<string, unknown>>((result, storageKey) => {
          result[storageKey] = storageData[storageKey]
          return result
        }, {}))
      })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const run = orchestrator.triggerSync(data)

      await vi.waitFor(() => {
        expect(releaseInitialRead).toBeTypeOf('function')
      })

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          lockOwnerId: freshOwnerId,
          lastUploadStartedAt: Date.now(),
          pendingSnapshotHash: undefined
        }
      }

      releaseInitialRead()
      const result = await run

      expect(result.skipped).toBe(true)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: true,
        lockOwnerId: freshOwnerId
      }))
    })

    it('should recover a stale persisted in-flight guard and clear durable pending state', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const hash = await computeBackupDataHash(data)

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          pendingSnapshotHash: hash,
          lastUploadStartedAt: 1
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should keep cross-instance pending hash durable when skipped snapshot is not drained in memory', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const pendingHash = await computeBackupDataHash(second)
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync')
        .mockImplementationOnce(() => new Promise(resolve => {
          releaseFirst = () => resolve({ success: true, syncedAt: 1 })
        }))
        .mockResolvedValue({ success: true, syncedAt: 3 })
      vi.spyOn(otherCloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const secondResult = await otherOrchestrator.triggerSync(second)

      expect(secondResult.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: pendingHash
      }))

      releaseFirst()
      await firstRun

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: pendingHash
      }))

      const cloudCallsAfterFirstRun = cloudStrategy.sync.mock.calls.length
      ;(storageData.syncStatus as any).guard.lastUploadStartedAt = Date.now() - 2000

      await orchestrator.triggerSync(second)

      expect(cloudStrategy.sync.mock.calls.length).toBe(cloudCallsAfterFirstRun + 1)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: undefined
      }))
    })

    it('should not clear newer pending hash queued while consuming an older pending hash', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const firstHash = await computeBackupDataHash(first)
      const secondHash = await computeBackupDataHash(second)
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      storageData.syncStatus = {
        guard: {
          pendingSnapshotHash: firstHash
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      }))
      vi.spyOn(otherCloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const secondResult = await otherOrchestrator.triggerSync(second)

      expect(secondResult.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: secondHash
      }))

      releaseFirst()
      await firstRun

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: secondHash
      }))
    })

    it('should clear same-hash pending marker queued during active sync after handling it', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const hash = await computeBackupDataHash(data)
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      }))
      vi.spyOn(otherCloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(data)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const secondResult = await otherOrchestrator.triggerSync(data)

      expect(secondResult.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: hash
      }))

      releaseFirst()
      await firstRun

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should not clear cross-instance pending hash when draining duplicate in-memory snapshot', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const secondHash = await computeBackupDataHash(second)
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      }))
      vi.spyOn(otherCloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const duplicateResult = await orchestrator.triggerSync(first)
      const secondResult = await otherOrchestrator.triggerSync(second)

      expect(duplicateResult.skipped).toBe(true)
      expect(secondResult.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: secondHash
      }))

      releaseFirst()
      await firstRun

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: secondHash
      }))
    })

    it('should not clear newer cross-instance pending hash before non-duplicate drain follow-up', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })
      const thirdHash = await computeBackupDataHash(third)
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync')
        .mockImplementationOnce(() => new Promise(resolve => {
          releaseFirst = () => resolve({ success: true, syncedAt: 1 })
        }))
        .mockResolvedValue({ success: true, syncedAt: 3 })
      vi.spyOn(otherCloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const secondResult = await orchestrator.triggerSync(second)
      const thirdResult = await otherOrchestrator.triggerSync(third)

      expect(secondResult.skipped).toBe(true)
      expect(thirdResult.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: thirdHash
      }))

      releaseFirst()
      await firstRun

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: thirdHash
      }))
      expect(cloudStrategy.sync).toHaveBeenCalledWith(second)
    })

    it('should keep non-duplicate pending hash until follow-up acquisition starts', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const secondHash = await computeBackupDataHash(second)
      const setSpy = vi.mocked(chrome.storage.local.set)
      let followUpSetCallIndex = Number.POSITIVE_INFINITY

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync')
        .mockImplementationOnce(() => new Promise(resolve => {
          releaseFirst = () => resolve({ success: true, syncedAt: 1 })
        }))
        .mockImplementationOnce(async () => {
          followUpSetCallIndex = setSpy.mock.calls.length
          return { success: true, syncedAt: 2 }
        })

      const firstRun = orchestrator.triggerSync(first)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })

      const secondResult = await orchestrator.triggerSync(second)

      expect(secondResult.skipped).toBe(true)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        pendingSnapshotHash: secondHash
      }))

      releaseFirst()
      await firstRun

      const preFollowUpSets = setSpy.mock.calls.slice(0, followUpSetCallIndex)
      const clearedBeforeFollowUp = preFollowUpSets.some(([updates]) => {
        const guard = (updates as any).syncStatus?.guard
        return guard?.syncInFlight === false &&
          Object.prototype.hasOwnProperty.call(guard, 'pendingSnapshotHash') &&
          guard.pendingSnapshotHash === undefined
      })
      expect(clearedBeforeFollowUp).toBe(false)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(second)
    })

    it('should preserve unrelated durable pending hash while another snapshot acquires lock', async () => {
      const pending = makeBackupData({ promptId: 'p1', updatedAt: 300 })
      const current = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const pendingHash = await computeBackupDataHash(pending)

      storageData.syncStatus = {
        guard: {
          pendingSnapshotHash: pendingHash
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      await orchestrator.triggerSync(current)

      expect(cloudStrategy.sync).toHaveBeenCalledWith(current)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: pendingHash
      }))
    })

    it('should not let ordinary status writes overwrite another live persisted lock', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const lockOwnerId = 'other-live-owner'

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      await orchestrator.triggerSync(data)

      const cleanedGuard = (storageData.syncStatus as any).guard
      expect(cleanedGuard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))

      storageData.syncStatus = {
        ...(storageData.syncStatus as any),
        guard: {
          syncInFlight: true,
          lockOwnerId,
          lastUploadStartedAt: Date.now(),
          pendingSnapshotHash: 'live-pending'
        }
      }
      vi.spyOn(cloudStrategy, 'getStatus').mockResolvedValue({ enabled: true, lastSyncTime: 1 })
      vi.spyOn(localStrategy, 'getStatus').mockResolvedValue({ enabled: true, lastSyncTime: 1 })

      await orchestrator.getStatus()

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: true,
        lockOwnerId,
        pendingSnapshotHash: 'live-pending'
      }))
    })

    it('should serialize ordinary status writes with fresh guard acquisition', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const otherCloudStrategy = new CloudSyncStrategy()
      const otherLocalStrategy = new LocalSyncStrategy()
      const otherOrchestrator = new SyncOrchestrator(otherCloudStrategy, otherLocalStrategy)
      let releaseStatusRead: (() => void) | undefined
      let delayNextSyncStatusRead = true

      vi.mocked(chrome.storage.local.get).mockImplementation((key?: string | string[]) => {
        if (key === 'syncStatus' && delayNextSyncStatusRead) {
          delayNextSyncStatusRead = false
          return new Promise(resolve => {
            releaseStatusRead = () => resolve({})
          })
        }
        if (!key) return Promise.resolve(storageData)
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: storageData[key] })
        }
        return Promise.resolve(key.reduce<Record<string, unknown>>((result, storageKey) => {
          result[storageKey] = storageData[storageKey]
          return result
        }, {}))
      })

      vi.spyOn(cloudStrategy, 'getStatus').mockResolvedValue({ enabled: true, lastSyncTime: 1 })
      vi.spyOn(localStrategy, 'getStatus').mockResolvedValue({ enabled: true, lastSyncTime: 1 })
      vi.spyOn(otherCloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(otherLocalStrategy, 'isAvailable').mockResolvedValue(true)

      let releaseSync: (() => void) | undefined
      vi.spyOn(otherCloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseSync = () => resolve({ success: true, syncedAt: 1 })
      }))

      const statusRun = orchestrator.getStatus()

      await vi.waitFor(() => {
        expect(releaseStatusRead).toBeTypeOf('function')
      })

      const syncRun = otherOrchestrator.triggerSync(data)
      releaseStatusRead()

      await vi.waitFor(() => {
        expect(releaseSync).toBeTypeOf('function')
      })

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: true
      }))

      releaseSync()
      await Promise.all([statusRun, syncRun])

      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false
      }))
    })

    it('should leave guard clean after draining the latest pending snapshot', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 1 })

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      })).mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = orchestrator.triggerSync(second)
      const thirdRun = orchestrator.triggerSync(third)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })
      releaseFirst()
      await Promise.all([firstRun, secondRun, thirdRun])

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
      expect((storageData.syncStatus as any).guard).toEqual(expect.objectContaining({
        syncInFlight: false,
        pendingSnapshotHash: undefined
      }))
    })

    it('should not throw when runtime messaging is unavailable in tests', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      global.chrome = {
        storage: {
          local: chrome.storage.local
        }
      } as any
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      await expect(orchestrator.triggerSync(data)).resolves.toEqual(expect.objectContaining({
        cloudSynced: true
      }))
    })

    it('should recover a stale persisted in-flight guard and run sync', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      storageData.syncStatus = {
        guard: {
          syncInFlight: true,
          lastUploadStartedAt: 1
        }
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
    })

    it('should coalesce same-tick trigger calls before storage guard writes finish', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

      let releaseStorageRead: (() => void) | undefined
      let delayNextSyncStatusRead = true
      vi.mocked(chrome.storage.local.get).mockImplementation((key?: string | string[]) => {
        if (key === 'syncStatus' && delayNextSyncStatusRead) {
          delayNextSyncStatusRead = false
          return new Promise(resolve => {
            releaseStorageRead = () => resolve({})
          })
        }
        if (!key) return Promise.resolve(storageData)
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: storageData[key] })
        }
        return Promise.resolve(key.reduce<Record<string, unknown>>((result, storageKey) => {
          result[storageKey] = storageData[storageKey]
          return result
        }, {}))
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = orchestrator.triggerSync(second)
      const thirdRun = orchestrator.triggerSync(third)

      await vi.waitFor(() => {
        expect(releaseStorageRead).toBeTypeOf('function')
      })
      releaseStorageRead()
      await Promise.all([firstRun, secondRun, thirdRun])

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(1, first)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
    })

    it('should not skip identical cloud hash when local retry state is pending', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const hash = await computeBackupDataHash(data)

      storageData.syncStatus = {
        guard: { lastUploadedHash: hash },
        localError: 'PERMISSION_DENIED'
      }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })

      const result = await orchestrator.triggerSync(data)

      expect(result.skipped).not.toBe(true)
      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
    })

    it('should not skip identical cloud hash after cloud-only success when local becomes available', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 1 })
      vi.spyOn(localStrategy, 'isAvailable')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)

      const firstResult = await orchestrator.triggerSync(data)
      ;(storageData.syncStatus as any).guard.lastUploadStartedAt = Date.now() - 2000
      const secondResult = await orchestrator.triggerSync(data)

      expect(firstResult.cloudSynced).toBe(true)
      expect(secondResult.skipped).not.toBe(true)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
    })

    it('should run one follow-up sync with the latest pending snapshot after an in-flight sync finishes', async () => {
      const first = makeBackupData({ promptId: 'p1', updatedAt: 100 })
      const second = makeBackupData({ promptId: 'p1', updatedAt: 200 })
      const third = makeBackupData({ promptId: 'p1', updatedAt: 300 })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 1 })

      let releaseFirst: (() => void) | undefined
      vi.spyOn(cloudStrategy, 'sync').mockImplementationOnce(() => new Promise(resolve => {
        releaseFirst = () => resolve({ success: true, syncedAt: 1 })
      })).mockResolvedValue({ success: true, syncedAt: 2 })

      const firstRun = orchestrator.triggerSync(first)
      const secondRun = orchestrator.triggerSync(second)
      const thirdRun = orchestrator.triggerSync(third)

      await vi.waitFor(() => {
        expect(releaseFirst).toBeTypeOf('function')
      })
      releaseFirst()
      await Promise.all([firstRun, secondRun, thirdRun])

      expect(cloudStrategy.sync).toHaveBeenCalledTimes(2)
      expect(cloudStrategy.sync).toHaveBeenNthCalledWith(2, third)
    })

    it('should trigger sync to both strategies when cloud available', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      // Mock strategies
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        promptsCount: 0,
        categoriesCount: 0
      })
      vi.spyOn(localStrategy, 'sync').mockResolvedValue({
        success: true,
        syncedAt: Date.now(),
        promptsCount: 0,
        categoriesCount: 0
      })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      await orchestrator.triggerSync(data)

      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
    })

    it('should mark pendingCloudSync when cloud unavailable', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(localStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: Date.now() })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const setSpy = chrome.storage.local.set as any

      await orchestrator.triggerSync(data)

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({ pendingCloudSync: true })
      }))
    })

    it('should sync cloud when local unavailable and cloud available', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: Date.now() })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)

      await orchestrator.triggerSync(data)

      expect(cloudStrategy.sync).toHaveBeenCalledWith(data)
      expect(executeLocalSync).not.toHaveBeenCalled()
    })

    it('LOCAL_ONLY should sync local and set pendingCloudSync without clearing cloud error', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      storageData.syncStatus = { cloudError: 'AUTH_REQUIRED' }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)
      vi.mocked(executeLocalSync).mockResolvedValue({ success: true, syncedAt: 123 })

      const result = await orchestrator.triggerSync(data)

      expect(result.localSynced).toBe(true)
      expect(result.cloudSynced).toBe(false)
      expect(executeLocalSync).toHaveBeenCalledWith(data)
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          hasUnsyncedChanges: true,
          pendingCloudSync: true,
          cloudError: 'AUTH_REQUIRED',
          localError: undefined
        })
      }))
    })

    it('CLOUD_ONLY should sync cloud and keep local error visible', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      storageData.syncStatus = { localError: 'PERMISSION_DENIED' }
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: 123 })

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(true)
      expect(result.localSynced).toBe(false)
      expect(executeLocalSync).not.toHaveBeenCalled()
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingCloudSync: false,
          pendingUpload: false,
          cloudError: undefined,
          localError: 'PERMISSION_DENIED',
          localSyncing: false
        })
      }))
      expect((storageData.syncStatus as any).lastLocalSyncTime).toBeUndefined()
    })

    it('BOTH_UNAVAILABLE should mark unsynced changes without scheduling retry storm', async () => {
      const data = makeBackupData({ promptId: 'p1', updatedAt: 100 })

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(false)

      const result = await orchestrator.triggerSync(data)

      expect(result.cloudSynced).toBe(false)
      expect(result.localSynced).toBe(false)
      expect(cloudStrategy.sync).not.toHaveBeenCalled()
      expect(executeLocalSync).not.toHaveBeenCalled()
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          hasUnsyncedChanges: true,
          pendingCloudSync: true,
          cloudSyncing: false,
          localSyncing: false
        })
      }))
    })

    it('should handle cloud sync failure with local success', async () => {
      const data: FullBackupData = {
        prompts: [],
        categories: [],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'sync').mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR'
      })
      vi.spyOn(localStrategy, 'sync').mockResolvedValue({ success: true, syncedAt: Date.now() })
      vi.spyOn(localStrategy, 'isAvailable').mockResolvedValue(true)

      const setSpy = chrome.storage.local.set as any

      await orchestrator.triggerSync(data)

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingCloudSync: true,
          cloudError: 'NETWORK_ERROR'
        })
      }))
    })
  })

  describe('downloadAndMerge', () => {
    it('should not auto-download inside cloud upload cooldown', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(20_000)

      const localData: FullBackupData = {
        prompts: [{ id: '1', name: 'Local', content: 'local', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: 20_000
      }

      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: { guard: { lastCloudUploadAt: 10_000 } },
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const result = await orchestrator.downloadAndMerge({ reason: 'auto' })

      expect(result.skipped).toBe(true)
      expect(result.data.prompts).toEqual(localData.prompts)
      expect(result.localOnlyItems).toEqual({ prompts: [], categories: [], temporaryPrompts: [] })
      expect(cloudStrategy.restore).not.toHaveBeenCalled()
    })

    it('should allow manual download inside cloud upload cooldown', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(20_000)

      const cloudData = makeBackupData({ promptId: 'cloud', updatedAt: 200 })

      storageData.syncStatus = { guard: { lastCloudUploadAt: 10_000 } }
      storageData.prompt_script_data = {
        userData: { prompts: [], categories: [] },
        temporaryPrompts: []
      }
      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)

      const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

      expect(result.skipped).not.toBe(true)
      expect(cloudStrategy.restore).toHaveBeenCalled()
      expect(result.data.prompts).toEqual(cloudData.prompts)
    })

    it('should allow initial download inside cloud upload cooldown', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(20_000)

      const cloudData = makeBackupData({ promptId: 'cloud', updatedAt: 200 })

      storageData.syncStatus = { guard: { lastCloudUploadAt: 10_000 } }
      storageData.prompt_script_data = {
        userData: { prompts: [], categories: [] },
        temporaryPrompts: []
      }
      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)

      const result = await orchestrator.downloadAndMerge({ reason: 'initial' })

      expect(result.skipped).not.toBe(true)
      expect(cloudStrategy.restore).toHaveBeenCalled()
      expect(result.data.prompts).toEqual(cloudData.prompts)
    })

    it('should merge data with cloud priority', async () => {
      const cloudData: FullBackupData = {
        prompts: [
          { id: '1', name: 'Cloud Prompt', content: 'cloud', categoryId: 'c1', order: 0 }
        ],
        categories: [{ id: 'c1', name: 'Cloud Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      const localData: FullBackupData = {
        prompts: [
          { id: '1', name: 'Local Prompt', content: 'local', categoryId: 'c1', order: 0 },
          { id: '2', name: 'Local Only', content: 'local-only', categoryId: 'c1', order: 0 }
        ],
        categories: [
          { id: 'c1', name: 'Local Category', order: 0 },
          { id: 'c2', name: 'Local Only Category', order: 0 }
        ],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      vi.spyOn(localStrategy, 'restore').mockResolvedValue(null)
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const result = await orchestrator.downloadAndMerge()

      expect(result.data.prompts).toHaveLength(2)
      expect(result.data.prompts.find(p => p.id === '1')?.name).toBe('Cloud Prompt')
      expect(result.localOnlyItems.prompts).toHaveLength(1)
      expect(result.localOnlyItems.prompts[0].id).toBe('2')
    })

    it('should return local data when cloud unavailable', async () => {
      const localData: FullBackupData = {
        prompts: [{ id: '1', name: 'Local', content: 'local', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(null)
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const result = await orchestrator.downloadAndMerge()

      expect(result.data.prompts).toHaveLength(1)
      expect(result.localOnlyItems.prompts).toHaveLength(0)
    })

    it('should mark pendingUpload when local-only items exist', async () => {
      const cloudData: FullBackupData = {
        prompts: [{ id: '1', name: 'Cloud', content: 'cloud', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Cloud Cat', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      const localData: FullBackupData = {
        prompts: [
          { id: '1', name: 'Local', content: 'local', categoryId: 'c1', order: 0 },
          { id: '2', name: 'Local Only', content: 'local-only', categoryId: 'c1', order: 0 }
        ],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        prompt_script_data: {
          userData: { prompts: localData.prompts, categories: localData.categories },
          temporaryPrompts: localData.temporaryPrompts
        }
      })

      const setSpy = chrome.storage.local.set as any

      await orchestrator.downloadAndMerge()

      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        syncStatus: expect.objectContaining({
          pendingUpload: true,
          localOnlyItems: expect.objectContaining({
            promptIds: ['2']
          })
        })
      }))
    })

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
      storageData.prompt_script_data = {
        userData: { prompts: localData.prompts, categories: localData.categories },
        temporaryPrompts: localData.temporaryPrompts
      }

      const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

      expect(result.data.categories.map(c => c.id).sort()).toEqual(['cloud-cat', 'local-cat'])
      expect(result.data.prompts.find(p => p.id === 'local-prompt')?.categoryId).toBe('local-cat')
    })

    it('should remap category aliases and dedupe only when alias map is explicit', async () => {
      storageData.syncStatus = {
        idAliasMap: {
          categories: { 'old-cat': 'kept-cat' },
          prompts: { 'old-prompt': 'kept-prompt' }
        }
      }

      const cloudData = makeBackupData({
        categories: [{ id: 'kept-cat', name: 'Ideas', order: 0, updatedAt: 200 }],
        prompts: [{ id: 'kept-prompt', name: 'A', content: 'new', categoryId: 'kept-cat', order: 0, updatedAt: 200 }]
      })
      const localData = makeBackupData({
        categories: [{ id: 'old-cat', name: 'Ideas', order: 1, updatedAt: 100 }],
        prompts: [{ id: 'old-prompt', name: 'A', content: 'old', categoryId: 'old-cat', order: 0, updatedAt: 100 }]
      })

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      storageData.prompt_script_data = {
        userData: { prompts: localData.prompts, categories: localData.categories },
        temporaryPrompts: localData.temporaryPrompts
      }

      const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

      expect(result.data.categories).toHaveLength(1)
      expect(result.data.categories[0].id).toBe('kept-cat')
      expect(result.data.prompts).toHaveLength(1)
      expect(result.data.prompts[0].id).toBe('kept-prompt')
      expect(result.data.prompts[0].categoryId).toBe('kept-cat')
    })

    it('should canonicalize cyclic aliases to one stable ID', async () => {
      storageData.syncStatus = {
        idAliasMap: {
          prompts: { a: 'b', b: 'a' }
        }
      }

      const cloudData = makeBackupData({
        prompts: [{ id: 'a', name: 'Cycle', content: 'new', categoryId: 'c1', order: 0, updatedAt: 200 }],
        categories: [{ id: 'c1', name: 'Category', order: 0, updatedAt: 200 }]
      })
      const localData = makeBackupData({
        prompts: [{ id: 'b', name: 'Cycle', content: 'old', categoryId: 'c1', order: 0, updatedAt: 100 }],
        categories: [{ id: 'c1', name: 'Category', order: 0, updatedAt: 100 }]
      })

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      storageData.prompt_script_data = {
        userData: { prompts: localData.prompts, categories: localData.categories },
        temporaryPrompts: localData.temporaryPrompts
      }

      const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

      expect(result.data.prompts).toHaveLength(1)
      expect(result.data.prompts[0].id).toBe('a')
      expect(result.data.prompts[0].content).toBe('new')
    })

    it('should dedupe equal updatedAt aliases deterministically independent of input order', async () => {
      storageData.syncStatus = {
        idAliasMap: {
          prompts: { old: 'kept' }
        }
      }

      const firstLocalData = makeBackupData({
        prompts: [
          { id: 'old', name: 'Stable', content: 'B', categoryId: 'c1', order: 0, updatedAt: 100 },
          { id: 'kept', name: 'Stable', content: 'A', categoryId: 'c1', order: 0, updatedAt: 100 }
        ],
        categories: [{ id: 'c1', name: 'Category', order: 0, updatedAt: 100 }]
      })
      const secondLocalData = makeBackupData({
        prompts: [...firstLocalData.prompts].reverse(),
        categories: firstLocalData.categories
      })
      const cloudData = makeBackupData({
        categories: [{ id: 'c1', name: 'Category', order: 0, updatedAt: 100 }]
      })

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      storageData.prompt_script_data = {
        userData: { prompts: firstLocalData.prompts, categories: firstLocalData.categories },
        temporaryPrompts: firstLocalData.temporaryPrompts
      }
      const firstResult = await orchestrator.downloadAndMerge({ reason: 'manual' })

      storageData.prompt_script_data = {
        userData: { prompts: secondLocalData.prompts, categories: secondLocalData.categories },
        temporaryPrompts: secondLocalData.temporaryPrompts
      }
      const secondResult = await orchestrator.downloadAndMerge({ reason: 'manual' })

      expect(firstResult.data.prompts).toHaveLength(1)
      expect(secondResult.data.prompts).toHaveLength(1)
      expect(firstResult.data.prompts[0].content).toBe('A')
      expect(secondResult.data.prompts[0].content).toBe('A')
    })

    it('should remap temporary prompt aliases and keep categoryId temporary', async () => {
      storageData.syncStatus = {
        idAliasMap: {
          temporaryPrompts: { 'old-temp': 'kept-temp' }
        }
      }

      const cloudData = makeBackupData({
        temporaryPrompts: [{ id: 'kept-temp', name: 'Temp', content: 'new', categoryId: 'temporary', order: 0, updatedAt: 200 }]
      })
      const localData = makeBackupData({
        temporaryPrompts: [{ id: 'old-temp', name: 'Temp', content: 'old', categoryId: 'not-temporary', order: 0, updatedAt: 100 }]
      })

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      storageData.prompt_script_data = {
        userData: { prompts: localData.prompts, categories: localData.categories },
        temporaryPrompts: localData.temporaryPrompts
      }

      const result = await orchestrator.downloadAndMerge({ reason: 'manual' })

      expect(result.data.temporaryPrompts).toHaveLength(1)
      expect(result.data.temporaryPrompts[0].id).toBe('kept-temp')
      expect(result.data.temporaryPrompts[0].categoryId).toBe('temporary')
      expect(result.data.temporaryPrompts[0].content).toBe('new')
    })

    it('should apply alias remap when previewing merge', async () => {
      storageData.syncStatus = {
        idAliasMap: {
          categories: { 'old-cat': 'kept-cat' },
          prompts: { 'old-prompt': 'kept-prompt' }
        }
      }

      const cloudData = makeBackupData({
        categories: [{ id: 'kept-cat', name: 'Ideas', order: 0, updatedAt: 200 }],
        prompts: [{ id: 'kept-prompt', name: 'A', content: 'new', categoryId: 'kept-cat', order: 0, updatedAt: 200 }]
      })
      const localData = makeBackupData({
        categories: [{ id: 'old-cat', name: 'Ideas', order: 1, updatedAt: 100 }],
        prompts: [{ id: 'old-prompt', name: 'A', content: 'old', categoryId: 'old-cat', order: 0, updatedAt: 100 }]
      })

      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      storageData.prompt_script_data = {
        userData: { prompts: localData.prompts, categories: localData.categories },
        temporaryPrompts: localData.temporaryPrompts
      }

      const preview = await orchestrator.previewMerge()

      expect(preview.mergedCount.categories).toBe(1)
      expect(preview.mergedCount.prompts).toBe(1)
      expect(preview.cloudOnlyItems.categories).toHaveLength(0)
      expect(preview.localOnlyItems.categories).toHaveLength(0)
      expect(preview.changes.updateToLocal).toBe(2)
    })
  })

  describe('uploadLocalOnlyItems', () => {
    it('should upload local-only items when pending', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'syncStatus') {
          return {
            syncStatus: {
              pendingUpload: true,
              localOnlyItems: {
                promptIds: ['local-1'],
                categoryIds: [],
                temporaryPromptIds: []
              }
            }
          }
        }
        if (key === 'prompt_script_data') {
          return {
            prompt_script_data: {
              userData: {
                prompts: [{ id: 'local-1', name: 'Local Only', content: 'test', categoryId: 'c1', order: 0 }],
                categories: []
              },
              temporaryPrompts: []
            }
          }
        }
        return {}
      })

      vi.spyOn(cloudStrategy, 'uploadPartial').mockResolvedValue({ success: true, syncedAt: Date.now() })

      await orchestrator.uploadLocalOnlyItems()

      expect(cloudStrategy.uploadPartial).toHaveBeenCalled()
    })

    it('should skip upload when not pending', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          pendingUpload: false,
          localOnlyItems: { promptIds: [], categoryIds: [], temporaryPromptIds: [] }
        }
      })

      vi.spyOn(cloudStrategy, 'uploadPartial').mockResolvedValue({ success: true, syncedAt: Date.now() })

      await orchestrator.uploadLocalOnlyItems()

      expect(cloudStrategy.uploadPartial).not.toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('should return unified sync status', async () => {
      vi.spyOn(cloudStrategy, 'getStatus').mockResolvedValue({
        enabled: true,
        lastSyncTime: 1000
      })
      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(localStrategy, 'getStatus').mockResolvedValue({
        enabled: true,
        lastSyncTime: 2000
      })
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        syncStatus: {
          hasUnsyncedChanges: false,
          pendingCloudSync: false,
          pendingUpload: false,
          localOnlyItems: { promptIds: [], categoryIds: [], temporaryPromptIds: [] }
        }
      })

      const status = await orchestrator.getStatus()

      expect(status.cloudEnabled).toBe(true)
      expect(status.cloudLoggedIn).toBe(true)
      expect(status.lastCloudSyncTime).toBe(1000)
      expect(status.localEnabled).toBe(true)
      expect(status.lastLocalSyncTime).toBe(2000)
    })
  })

  describe('initialSync', () => {
    it('should restore from cloud when storage empty', async () => {
      const cloudData: FullBackupData = {
        prompts: [{ id: '1', name: 'Cloud Prompt', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(true)
      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
      vi.spyOn(localStrategy, 'restore').mockResolvedValue(null)
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return { prompt_script_data: { userData: { prompts: [], categories: [] }, temporaryPrompts: [] } }
        }
        return {}
      })

      await orchestrator.initialSync()

      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([expect.objectContaining({ id: '1' })])
          })
        })
      }))
    })

    it('should restore from local when cloud unavailable and storage empty', async () => {
      const localData: FullBackupData = {
        prompts: [{ id: '1', name: 'Local Prompt', content: 'test', categoryId: 'c1', order: 0 }],
        categories: [{ id: 'c1', name: 'Category', order: 0 }],
        temporaryPrompts: [],
        timestamp: Date.now()
      }

      vi.spyOn(cloudStrategy, 'isAvailable').mockResolvedValue(false)
      vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(null)
      vi.spyOn(localStrategy, 'restore').mockResolvedValue(localData)
      vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const key = Array.isArray(keys) ? keys[0] : keys
        if (key === 'prompt_script_data') {
          return { prompt_script_data: { userData: { prompts: [], categories: [] }, temporaryPrompts: [] } }
        }
        return {}
      })

      await orchestrator.initialSync()

      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        prompt_script_data: expect.objectContaining({
          userData: expect.objectContaining({
            prompts: expect.arrayContaining([expect.objectContaining({ id: '1' })])
          })
        })
      }))
    })
  })
})
