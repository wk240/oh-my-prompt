# Cloud Sync & Local Backup Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor cloud sync and local backup into a unified SyncOrchestrator with strategy pattern, supporting automatic parallel sync, merge logic for local-only items, and consolidated UI.

**Architecture:** Use Strategy Pattern with CloudSyncStrategy and LocalSyncStrategy implementing SyncStrategy interface. SyncOrchestrator orchestrates parallel sync, handles offline scenarios, and manages merge logic. UI consolidates into UnifiedSyncSection with unified status indicators.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, React, Supabase, File System Access API

---

## Phase 1: Foundation - Sync Strategy Interface & Types

### Task 1: Create Sync Types File

**Files:**
- Create: `packages/extension/src/lib/sync/types.ts`
- Test: `packages/extension/src/lib/sync/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/extension/src/lib/sync/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import { SyncResultError, StrategyStatus, UnifiedSyncStatus } from '../types'

describe('Sync types', () => {
  it('should have all error types defined', () => {
    const errors: SyncResultError[] = [
      'NOT_LOGGED_IN',
      'NETWORK_ERROR',
      'PERMISSION_DENIED',
      'SYNC_FAILED',
      'INVALID_DATA'
    ]
    expect(errors).toHaveLength(5)
  })

  it('should create valid StrategyStatus', () => {
    const status: StrategyStatus = {
      enabled: true,
      lastSyncTime: Date.now(),
      error: undefined
    }
    expect(status.enabled).toBe(true)
    expect(status.lastSyncTime).toBeDefined()
  })

  it('should create valid UnifiedSyncStatus', () => {
    const status: UnifiedSyncStatus = {
      cloudEnabled: true,
      cloudLoggedIn: true,
      lastCloudSyncTime: Date.now(),
      localEnabled: true,
      lastLocalSyncTime: Date.now(),
      hasUnsyncedChanges: false,
      pendingCloudSync: false,
      pendingUpload: false,
      localOnlyItems: {
        promptIds: [],
        categoryIds: [],
        temporaryPromptIds: []
      }
    }
    expect(status.cloudEnabled).toBe(true)
    expect(status.localOnlyItems.promptIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && npm test -- types.test.ts -v`
Expected: FAIL - "Cannot find module '../types'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/extension/src/lib/sync/types.ts
import { Prompt, Category } from '@oh-my-prompt/shared/types'

export type SyncStrategyId = 'cloud' | 'local'

export type SyncResultError =
  | 'NOT_LOGGED_IN'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED'
  | 'SYNC_FAILED'
  | 'INVALID_DATA'

export interface SyncResult {
  success: boolean
  error?: SyncResultError
  syncedAt?: number
  promptsCount?: number
  categoriesCount?: number
  temporaryPromptsCount?: number
}

export interface StrategyStatus {
  enabled: boolean
  lastSyncTime?: number
  error?: string
}

export interface FullBackupData {
  prompts: Prompt[]
  categories: Category[]
  temporaryPrompts: Prompt[]
  timestamp: number
}

export interface MergeResult {
  data: FullBackupData
  localOnlyItems: {
    prompts: Prompt[]
    categories: Category[]
    temporaryPrompts: Prompt[]
  }
}

export interface UnifiedSyncStatus {
  cloudEnabled: boolean
  cloudLoggedIn: boolean
  lastCloudSyncTime?: number
  cloudError?: string
  localEnabled: boolean
  lastLocalSyncTime?: number
  localError?: string
  folderName?: string
  permissionStatus?: 'granted' | 'prompt' | 'denied'
  hasUnsyncedChanges: boolean
  pendingCloudSync: boolean
  pendingUpload: boolean
  localOnlyItems: {
    promptIds: string[]
    categoryIds: string[]
    temporaryPromptIds: string[]
  }
}

export interface SyncStrategy {
  id: SyncStrategyId
  name: string
  sync(data: FullBackupData): Promise<SyncResult>
  restore(): Promise<FullBackupData | null>
  isAvailable(): Promise<boolean>
  getStatus(): Promise<StrategyStatus>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && npm test -- types.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/
git commit -m "feat(sync): add sync types and interfaces"
```

---

### Task 2: Create Base SyncStrategy Abstract Class

**Files:**
- Create: `packages/extension/src/lib/sync/strategies/base.ts`
- Modify: `packages/extension/src/lib/sync/types.ts` (add base import)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/extension/src/lib/sync/__tests__/base-strategy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BaseSyncStrategy } from '../strategies/base'
import { FullBackupData, SyncResult, StrategyStatus } from '../types'

class TestStrategy extends BaseSyncStrategy {
  constructor() {
    super('test', 'Test Strategy')
  }

  async sync(data: FullBackupData): Promise<SyncResult> {
    return { success: true, syncedAt: Date.now() }
  }

  async restore(): Promise<FullBackupData | null> {
    return null
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getStatus(): Promise<StrategyStatus> {
    return { enabled: true, lastSyncTime: Date.now() }
  }
}

describe('BaseSyncStrategy', () => {
  let strategy: TestStrategy

  beforeEach(() => {
    strategy = new TestStrategy()
  })

  it('should have id and name', () => {
    expect(strategy.id).toBe('test')
    expect(strategy.name).toBe('Test Strategy')
  })

  it('should merge by ID with cloud priority', () => {
    const cloud = [{ id: '1', name: 'Cloud Item' }]
    const local = [{ id: '1', name: 'Local Item' }, { id: '2', name: 'Local Only' }]

    const result = strategy.mergeById(cloud, local)

    expect(result).toHaveLength(2)
    expect(result.find(i => i.id === '1')?.name).toBe('Cloud Item')
    expect(result.find(i => i.id === '2')?.name).toBe('Local Only')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && npm test -- base-strategy.test.ts -v`
Expected: FAIL - "Cannot find module '../strategies/base'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/extension/src/lib/sync/strategies/base.ts
import { SyncStrategy, SyncStrategyId, FullBackupData, SyncResult, StrategyStatus } from '../types'

export abstract class BaseSyncStrategy implements SyncStrategy {
  abstract id: SyncStrategyId
  abstract name: string

  abstract sync(data: FullBackupData): Promise<SyncResult>
  abstract restore(): Promise<FullBackupData | null>
  abstract isAvailable(): Promise<boolean>
  abstract getStatus(): Promise<StrategyStatus>

  /**
   * Merge arrays by ID with cloud priority
   * Same ID: cloud item wins
   * Local only: preserved
   */
  protected mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
    const merged = new Map<string, T>()

    // Cloud data takes priority
    for (const item of cloud) {
      merged.set(item.id, item)
    }

    // Add local-only items
    for (const item of local) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item)
      }
    }

    return Array.from(merged.values())
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && npm test -- base-strategy.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/
git commit -m "feat(sync): add BaseSyncStrategy with mergeById helper"
```

---

## Phase 2: Local Sync Strategy

### Task 3: Refactor file-sync.ts to LocalSyncStrategy

**Files:**
- Read first: `packages/extension/src/lib/sync/file-sync.ts`
- Create: `packages/extension/src/lib/sync/strategies/local.ts`
- Modify: `packages/extension/src/lib/sync/index.ts`

- [ ] **Step 1: Read existing file-sync.ts**

Run: `cat packages/extension/src/lib/sync/file-sync.ts`
Note: Understand existing API to preserve backward compatibility.

- [ ] **Step 2: Write the failing test**

```typescript
// packages/extension/src/lib/sync/__tests__/local-strategy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalSyncStrategy } from '../strategies/local'
import { FullBackupData } from '../types'

describe('LocalSyncStrategy', () => {
  let strategy: LocalSyncStrategy

  beforeEach(() => {
    strategy = new LocalSyncStrategy()
    // Mock File System Access API
    global.showDirectoryPicker = vi.fn()
  })

  it('should have correct id and name', () => {
    expect(strategy.id).toBe('local')
    expect(strategy.name).toBe('Local Backup')
  })

  it('should return false when no folder handle', async () => {
    const available = await strategy.isAvailable()
    expect(available).toBe(false)
  })

  it('should sync data to file', async () => {
    const data: FullBackupData = {
      prompts: [{ id: '1', name: 'Test', content: 'test', categoryId: 'c1', order: 0, createdAt: 1, updatedAt: 1 }],
      categories: [{ id: 'c1', name: 'Test Category', sortOrder: 0, createdAt: 1, updatedAt: 1 }],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    // Mock file system operations
    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn(),
        close: vi.fn()
      })
    }
    const mockDirHandle = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
      requestPermission: vi.fn().mockResolvedValue('granted')
    }

    vi.spyOn(strategy as any, 'getFolderHandle').mockResolvedValue(mockDirHandle)

    const result = await strategy.sync(data)
    expect(result.success).toBe(true)
    expect(result.syncedAt).toBeDefined()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/extension && npm test -- local-strategy.test.ts -v`
Expected: FAIL - "Cannot find module '../strategies/local'"

- [ ] **Step 4: Write implementation**

```typescript
// packages/extension/src/lib/sync/strategies/local.ts
import { BaseSyncStrategy } from './base'
import { FullBackupData, SyncResult, StrategyStatus } from '../types'
import { BACKUP_FILE_NAME_LATEST, BACKUP_FOLDER_DB_NAME } from '../../constants'

const DB_NAME = 'OMP_FileSystem_DB'
const STORE_NAME = 'folder_handles'

export class LocalSyncStrategy extends BaseSyncStrategy {
  id: 'local' = 'local'
  name = 'Local Backup'
  private folderHandle: FileSystemDirectoryHandle | null = null

  async sync(data: FullBackupData): Promise<SyncResult> {
    try {
      const handle = await this.getFolderHandle()
      if (!handle) {
        return { success: false, error: 'PERMISSION_DENIED' }
      }

      // Write backup file
      const timestamp = Date.now()
      const fileName = `omps-backup-${timestamp}.json`

      await this.writeBackupFile(handle, fileName, data)
      await this.writeBackupFile(handle, BACKUP_FILE_NAME_LATEST, data)

      return {
        success: true,
        syncedAt: timestamp,
        promptsCount: data.prompts.length,
        categoriesCount: data.categories.length,
        temporaryPromptsCount: data.temporaryPrompts.length
      }
    } catch (error) {
      console.error('[Oh My Prompt] Local sync failed:', error)
      return { success: false, error: 'SYNC_FAILED' }
    }
  }

  async restore(): Promise<FullBackupData | null> {
    try {
      const handle = await this.getFolderHandle()
      if (!handle) return null

      const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME_LATEST)
      const file = await fileHandle.getFile()
      const content = await file.text()
      return JSON.parse(content) as FullBackupData
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    const handle = await this.getFolderHandle()
    if (!handle) return false

    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' })
      return permission === 'granted'
    } catch {
      return false
    }
  }

  async getStatus(): Promise<StrategyStatus> {
    const available = await this.isAvailable()
    const handle = await this.getFolderHandle()

    let lastSyncTime: number | undefined
    try {
      const fileHandle = await handle?.getFileHandle(BACKUP_FILE_NAME_LATEST)
      const file = await fileHandle?.getFile()
      if (file) {
        lastSyncTime = file.lastModified
      }
    } catch {
      // No backup file yet
    }

    return {
      enabled: available,
      lastSyncTime,
      error: available ? undefined : 'Permission not granted'
    }
  }

  private async getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this.folderHandle) return this.folderHandle

    try {
      const db = await openDB()
      const handle = await db.get(STORE_NAME, BACKUP_FOLDER_DB_NAME)
      this.folderHandle = handle
      return handle
    } catch {
      return null
    }
  }

  private async writeBackupFile(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    data: FullBackupData
  ): Promise<void> {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }
}

// IndexedDB helper
interface IDBDatabase {
  get(storeName: string, key: string): Promise<FileSystemDirectoryHandle | undefined>
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      resolve({
        get: (storeName: string, key: string) => {
          return new Promise((res, rej) => {
            const tx = db.transaction(storeName, 'readonly')
            const store = tx.objectStore(storeName)
            const req = store.get(key)
            req.onsuccess = () => res(req.result)
            req.onerror = () => rej(req.error)
          })
        }
      })
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/extension && npm test -- local-strategy.test.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/lib/sync/strategies/local.ts
git commit -m "feat(sync): add LocalSyncStrategy"
```

---

## Phase 3: Cloud Sync Strategy

### Task 4: Create CloudSyncStrategy

**Files:**
- Read first: `packages/extension/src/lib/sync/cloud-sync-service.ts`
- Create: `packages/extension/src/lib/sync/strategies/cloud.ts`

- [ ] **Step 1: Read existing cloud-sync-service.ts**

Run: `cat packages/extension/src/lib/sync/cloud-sync-service.ts`
Note: Extract cloud sync logic to wrap in strategy pattern.

- [ ] **Step 2: Write the failing test**

```typescript
// packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CloudSyncStrategy } from '../strategies/cloud'
import { FullBackupData } from '../types'

describe('CloudSyncStrategy', () => {
  let strategy: CloudSyncStrategy

  beforeEach(() => {
    strategy = new CloudSyncStrategy()
    // Mock fetch
    global.fetch = vi.fn()
  })

  it('should have correct id and name', () => {
    expect(strategy.id).toBe('cloud')
    expect(strategy.name).toBe('Cloud Sync')
  })

  it('should check availability based on auth token', async () => {
    // Mock chrome.storage.local
    const mockStorage = { authToken: 'test-token' }
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue(mockStorage)
        }
      }
    } as any

    const available = await strategy.isAvailable()
    expect(available).toBe(true)
  })

  it('should return false when no auth token', async () => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({})
        }
      }
    } as any

    const available = await strategy.isAvailable()
    expect(available).toBe(false)
  })

  it('should upload data via API', async () => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ authToken: 'token' })
        }
      }
    } as any

    const mockResponse = { success: true, timestamp: Date.now() }
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse)
    })

    const data: FullBackupData = {
      prompts: [{ id: '1', name: 'Test', content: 'test', categoryId: 'c1', order: 0, createdAt: 1, updatedAt: 1 }],
      categories: [],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    const result = await strategy.sync(data)
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/extension && npm test -- cloud-strategy.test.ts -v`
Expected: FAIL - "Cannot find module '../strategies/cloud'"

- [ ] **Step 4: Write implementation**

```typescript
// packages/extension/src/lib/sync/strategies/cloud.ts
import { BaseSyncStrategy } from './base'
import { FullBackupData, SyncResult, StrategyStatus, SyncResultError } from '../types'

const WEB_APP_URL = 'https://oh-my-prompt.com'

export class CloudSyncStrategy extends BaseSyncStrategy {
  id: 'cloud' = 'cloud'
  name = 'Cloud Sync'

  async sync(data: FullBackupData): Promise<SyncResult> {
    try {
      const token = await this.getAuthToken()
      if (!token) {
        return { success: false, error: 'NOT_LOGGED_IN' }
      }

      const response = await fetch(`${WEB_APP_URL}/api/sync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompts: data.prompts,
          categories: data.categories,
          temporaryPrompts: data.temporaryPrompts,
          timestamp: data.timestamp
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const error = this.mapHttpError(response.status, errorData.error)
        return { success: false, error }
      }

      const result = await response.json()
      return {
        success: true,
        syncedAt: result.timestamp || Date.now(),
        promptsCount: data.prompts.length,
        categoriesCount: data.categories.length,
        temporaryPromptsCount: data.temporaryPrompts.length
      }
    } catch (error) {
      console.error('[Oh My Prompt] Cloud sync failed:', error)
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  async restore(): Promise<FullBackupData | null> {
    try {
      const token = await this.getAuthToken()
      if (!token) return null

      const response = await fetch(`${WEB_APP_URL}/api/sync/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) return null

      const data = await response.json()
      return {
        prompts: data.prompts || [],
        categories: data.categories || [],
        temporaryPrompts: data.temporaryPrompts || [],
        timestamp: data.timestamp || Date.now()
      }
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    const token = await this.getAuthToken()
    if (!token) return false

    try {
      // Quick check if API is reachable
      const response = await fetch(`${WEB_APP_URL}/api/sync/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
        method: 'HEAD'
      })
      return response.ok
    } catch {
      return false
    }
  }

  async getStatus(): Promise<StrategyStatus> {
    const token = await this.getAuthToken()
    if (!token) {
      return { enabled: false, error: 'Not logged in' }
    }

    try {
      const response = await fetch(`${WEB_APP_URL}/api/sync/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        return { enabled: true, error: 'Failed to fetch status' }
      }

      const data = await response.json()
      return {
        enabled: true,
        lastSyncTime: data.lastSyncTime,
        error: data.error
      }
    } catch {
      return { enabled: true, error: 'Network error' }
    }
  }

  /**
   * Upload only specific items (for local-only data)
   */
  async uploadPartial(data: {
    prompts?: FullBackupData['prompts']
    categories?: FullBackupData['categories']
    temporaryPrompts?: FullBackupData['temporaryPrompts']
    timestamp: number
  }): Promise<SyncResult> {
    try {
      const token = await this.getAuthToken()
      if (!token) {
        return { success: false, error: 'NOT_LOGGED_IN' }
      }

      const response = await fetch(`${WEB_APP_URL}/api/sync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        return { success: false, error: 'SYNC_FAILED' }
      }

      return { success: true, syncedAt: Date.now() }
    } catch {
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get('authToken')
      return result.authToken || null
    } catch {
      return null
    }
  }

  private mapHttpError(status: number, errorMsg?: string): SyncResultError {
    if (status === 401) return 'NOT_LOGGED_IN'
    if (status === 403) return 'PERMISSION_DENIED'
    if (status >= 500) return 'SYNC_FAILED'
    if (status === 400) return 'INVALID_DATA'
    return 'NETWORK_ERROR'
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/extension && npm test -- cloud-strategy.test.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/lib/sync/strategies/cloud.ts
git commit -m "feat(sync): add CloudSyncStrategy"
```

---

## Phase 4: Sync Orchestrator

### Task 5: Create SyncOrchestrator

**Files:**
- Create: `packages/extension/src/lib/sync/orchestrator.ts`
- Modify: `packages/extension/src/lib/sync/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/extension/src/lib/sync/__tests__/orchestrator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncOrchestrator } from '../orchestrator'
import { CloudSyncStrategy } from '../strategies/cloud'
import { LocalSyncStrategy } from '../strategies/local'
import { FullBackupData, MergeResult } from '../types'

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator
  let cloudStrategy: CloudSyncStrategy
  let localStrategy: LocalSyncStrategy

  beforeEach(() => {
    cloudStrategy = new CloudSyncStrategy()
    localStrategy = new LocalSyncStrategy()
    orchestrator = new SyncOrchestrator(cloudStrategy, localStrategy)

    // Mock chrome.storage.local
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any
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
    expect(localStrategy.sync).toHaveBeenCalledWith(data)
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
      pendingCloudSync: true
    }))
  })

  it('should merge data with cloud priority', async () => {
    const cloudData: FullBackupData = {
      prompts: [
        { id: '1', name: 'Cloud Prompt', content: 'cloud', categoryId: 'c1', order: 0, createdAt: 1, updatedAt: 2 }
      ],
      categories: [{ id: 'c1', name: 'Cloud Category', sortOrder: 0, createdAt: 1, updatedAt: 1 }],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    const localData: FullBackupData = {
      prompts: [
        { id: '1', name: 'Local Prompt', content: 'local', categoryId: 'c1', order: 0, createdAt: 1, updatedAt: 1 },
        { id: '2', name: 'Local Only', content: 'local-only', categoryId: 'c1', order: 0, createdAt: 1, updatedAt: 1 }
      ],
      categories: [
        { id: 'c1', name: 'Local Category', sortOrder: 0, createdAt: 1, updatedAt: 1 },
        { id: 'c2', name: 'Local Only Category', sortOrder: 0, createdAt: 1, updatedAt: 1 }
      ],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    vi.spyOn(cloudStrategy, 'restore').mockResolvedValue(cloudData)
    vi.spyOn(orchestrator as any, 'getLocalData').mockResolvedValue(localData)

    // Mock chrome.storage.local.set for sync status
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue(undefined)

    const result = await orchestrator.downloadAndMerge()

    expect(result.data.prompts).toHaveLength(2)
    expect(result.data.prompts.find(p => p.id === '1')?.name).toBe('Cloud Prompt')
    expect(result.localOnlyItems.prompts).toHaveLength(1)
    expect(result.localOnlyItems.prompts[0].id).toBe('2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/extension && npm test -- orchestrator.test.ts -v`
Expected: FAIL - "Cannot find module '../orchestrator'"

- [ ] **Step 3: Write implementation**

```typescript
// packages/extension/src/lib/sync/orchestrator.ts
import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import {
  FullBackupData,
  MergeResult,
  UnifiedSyncStatus,
  SyncResult
} from './types'

interface StorageManager {
  getData(): Promise<{
    userData: { prompts: any[]; categories: any[] }
    temporaryPrompts: any[]
  }>
  updateUserData(data: { prompts: any[]; categories: any[] }): Promise<void>
  updateTemporaryPrompts(prompts: any[]): Promise<void>
  getSettings(): Promise<any>
  updateSettings(settings: any): Promise<void>
}

const STORAGE_KEY = 'prompt_script_data'

export class SyncOrchestrator {
  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy

  constructor(cloudStrategy: CloudSyncStrategy, localStrategy: LocalSyncStrategy) {
    this.cloudStrategy = cloudStrategy
    this.localStrategy = localStrategy
  }

  /**
   * Trigger sync on data change
   * Parallel sync to both strategies when cloud available
   * Fallback to local only when cloud unavailable
   */
  async triggerSync(data: FullBackupData): Promise<void> {
    const cloudAvailable = await this.cloudStrategy.isAvailable()
    const localAvailable = await this.localStrategy.isAvailable()

    if (!localAvailable) {
      console.log('[Oh My Prompt] Local sync not available, skipping sync')
      return
    }

    if (!cloudAvailable) {
      // Cloud unavailable: local backup only, mark pending
      const localResult = await this.localStrategy.sync(data)

      if (localResult.success) {
        await this.updateSyncStatus({
          lastLocalSyncTime: localResult.syncedAt,
          hasUnsyncedChanges: true,
          pendingCloudSync: true
        })
      }
      return
    }

    // Cloud available: parallel sync
    const [cloudResult, localResult] = await Promise.all([
      this.cloudStrategy.sync(data),
      this.localStrategy.sync(data)
    ])

    if (cloudResult.success && localResult.success) {
      await this.updateSyncStatus({
        lastCloudSyncTime: cloudResult.syncedAt,
        lastLocalSyncTime: localResult.syncedAt,
        hasUnsyncedChanges: false,
        pendingCloudSync: false
      })
    } else if (localResult.success) {
      // Local success, cloud failed
      await this.updateSyncStatus({
        lastLocalSyncTime: localResult.syncedAt,
        hasUnsyncedChanges: true,
        pendingCloudSync: true,
        cloudError: cloudResult.error
      })
    }
  }

  /**
   * Download from cloud and merge with local
   * Cloud wins on conflict, local-only items preserved
   */
  async downloadAndMerge(): Promise<MergeResult> {
    const cloudData = await this.cloudStrategy.restore()
    const localData = await this.getLocalData()

    if (!cloudData) {
      // No cloud data, use local
      return {
        data: localData,
        localOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] }
      }
    }

    // Merge with cloud priority
    const mergedPrompts = this.mergeById(cloudData.prompts, localData.prompts)
    const mergedCategories = this.mergeById(cloudData.categories, localData.categories)
    const mergedTemporaryPrompts = this.mergeById(
      cloudData.temporaryPrompts,
      localData.temporaryPrompts
    )

    // Find local-only items
    const cloudPromptIds = new Set(cloudData.prompts.map(p => p.id))
    const cloudCategoryIds = new Set(cloudData.categories.map(c => c.id))
    const cloudTempIds = new Set(cloudData.temporaryPrompts.map(p => p.id))

    const localOnlyPrompts = localData.prompts.filter(p => !cloudPromptIds.has(p.id))
    const localOnlyCategories = localData.categories.filter(c => !cloudCategoryIds.has(c.id))
    const localOnlyTemporaryPrompts = localData.temporaryPrompts.filter(p => !cloudTempIds.has(p.id))

    const result: MergeResult = {
      data: {
        prompts: mergedPrompts,
        categories: mergedCategories,
        temporaryPrompts: mergedTemporaryPrompts,
        timestamp: Date.now()
      },
      localOnlyItems: {
        prompts: localOnlyPrompts,
        categories: localOnlyCategories,
        temporaryPrompts: localOnlyTemporaryPrompts
      }
    }

    // Apply merged data to storage
    await this.applyData(result.data)

    // Mark pending upload if local-only items exist
    if (localOnlyPrompts.length > 0 ||
        localOnlyCategories.length > 0 ||
        localOnlyTemporaryPrompts.length > 0) {
      await this.updateSyncStatus({
        pendingUpload: true,
        localOnlyItems: {
          promptIds: localOnlyPrompts.map(p => p.id),
          categoryIds: localOnlyCategories.map(c => c.id),
          temporaryPromptIds: localOnlyTemporaryPrompts.map(p => p.id)
        }
      })
    }

    return result
  }

  /**
   * Upload local-only items to cloud
   */
  async uploadLocalOnlyItems(): Promise<void> {
    const status = await this.getSyncStatus()

    if (!status.pendingUpload) return

    const localData = await this.getLocalData()

    const localOnlyPrompts = localData.prompts.filter(p =>
      status.localOnlyItems.promptIds.includes(p.id)
    )
    const localOnlyCategories = localData.categories.filter(c =>
      status.localOnlyItems.categoryIds.includes(c.id)
    )
    const localOnlyTemporaryPrompts = localData.temporaryPrompts.filter(p =>
      status.localOnlyItems.temporaryPromptIds.includes(p.id)
    )

    const result = await (this.cloudStrategy as any).uploadPartial({
      prompts: localOnlyPrompts,
      categories: localOnlyCategories,
      temporaryPrompts: localOnlyTemporaryPrompts,
      timestamp: Date.now()
    })

    if (result.success) {
      await this.updateSyncStatus({
        pendingUpload: false,
        localOnlyItems: {
          promptIds: [],
          categoryIds: [],
          temporaryPromptIds: []
        }
      })
    }
  }

  /**
   * Initial sync on plugin startup
   */
  async initialSync(): Promise<void> {
    const cloudAvailable = await this.cloudStrategy.isAvailable()
    const cloudData = cloudAvailable ? await this.cloudStrategy.restore() : null
    const localData = await this.localStrategy.restore()
    const storageData = await this.getLocalData()

    // Decision matrix
    if (cloudData && storageData.prompts.length === 0) {
      // Cloud has data, local storage empty -> restore from cloud
      await this.applyData(cloudData)
      await this.updateSyncStatus({ initialized: true })
      return
    }

    if (localData && storageData.prompts.length === 0) {
      // Local backup exists, storage empty -> restore from local
      await this.applyData(localData)
      await this.updateSyncStatus({
        initialized: true,
        pendingCloudSync: cloudAvailable
      })
      return
    }

    if (cloudData && localData && storageData.prompts.length > 0) {
      // All three have data -> merge
      await this.downloadAndMerge()
    }

    await this.updateSyncStatus({ initialized: true })
  }

  /**
   * Get unified sync status
   */
  async getStatus(): Promise<UnifiedSyncStatus> {
    const [cloudStatus, localStatus] = await Promise.all([
      this.cloudStrategy.getStatus(),
      this.localStrategy.getStatus()
    ])

    const settings = await this.getSyncStatus()

    return {
      cloudEnabled: cloudStatus.enabled,
      cloudLoggedIn: await this.cloudStrategy.isAvailable(),
      lastCloudSyncTime: cloudStatus.lastSyncTime,
      cloudError: cloudStatus.error,
      localEnabled: localStatus.enabled,
      lastLocalSyncTime: localStatus.lastSyncTime,
      localError: localStatus.error,
      hasUnsyncedChanges: settings.hasUnsyncedChanges || false,
      pendingCloudSync: settings.pendingCloudSync || false,
      pendingUpload: settings.pendingUpload || false,
      localOnlyItems: settings.localOnlyItems || {
        promptIds: [],
        categoryIds: [],
        temporaryPromptIds: []
      }
    }
  }

  // Private helpers
  private async getLocalData(): Promise<FullBackupData> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = result[STORAGE_KEY] || { userData: { prompts: [], categories: [] }, temporaryPrompts: [] }
    return {
      prompts: data.userData?.prompts || [],
      categories: data.userData?.categories || [],
      temporaryPrompts: data.temporaryPrompts || [],
      timestamp: Date.now()
    }
  }

  private async applyData(data: FullBackupData): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const existing = result[STORAGE_KEY] || {}

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...existing,
        userData: {
          prompts: data.prompts,
          categories: data.categories
        },
        temporaryPrompts: data.temporaryPrompts
      }
    })
  }

  private async updateSyncStatus(updates: Partial<UnifiedSyncStatus & { initialized?: boolean }>): Promise<void> {
    const result = await chrome.storage.local.get('syncStatus')
    const existing = result.syncStatus || {}

    await chrome.storage.local.set({
      syncStatus: {
        ...existing,
        ...updates
      }
    })
  }

  private async getSyncStatus(): Promise<Partial<UnifiedSyncStatus & { initialized?: boolean }>> {
    const result = await chrome.storage.local.get('syncStatus')
    return result.syncStatus || {}
  }

  private mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
    const merged = new Map<string, T>()
    for (const item of cloud) merged.set(item.id, item)
    for (const item of local) {
      if (!merged.has(item.id)) merged.set(item.id, item)
    }
    return Array.from(merged.values())
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/extension && npm test -- orchestrator.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts
git commit -m "feat(sync): add SyncOrchestrator with merge logic"
```

---

### Task 6: Create Sync Module Index

**Files:**
- Create: `packages/extension/src/lib/sync/index.ts`
- Modify: `packages/extension/src/lib/sync/strategies/index.ts`

- [ ] **Step 1: Write implementation**

```typescript
// packages/extension/src/lib/sync/index.ts
export { SyncOrchestrator } from './orchestrator'
export { CloudSyncStrategy } from './strategies/cloud'
export { LocalSyncStrategy } from './strategies/local'
export { BaseSyncStrategy } from './strategies/base'
export * from './types'

// Factory function for easy instantiation
import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { SyncOrchestrator } from './orchestrator'

export function createSyncOrchestrator(): SyncOrchestrator {
  const cloudStrategy = new CloudSyncStrategy()
  const localStrategy = new LocalSyncStrategy()
  return new SyncOrchestrator(cloudStrategy, localStrategy)
}
```

```typescript
// packages/extension/src/lib/sync/strategies/index.ts
export { BaseSyncStrategy } from './base'
export { CloudSyncStrategy } from './cloud'
export { LocalSyncStrategy } from './local'
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/lib/sync/index.ts
git add packages/extension/src/lib/sync/strategies/index.ts
git commit -m "feat(sync): add sync module exports"
```

---

## Phase 5: Database Updates (Web App)

### Task 7: Create Database Migration for temporary_prompts

**Files:**
- Read first: `web-app/supabase/migrations/` (list existing)
- Create: `web-app/supabase/migrations/20260510_add_temporary_prompts.sql`
- Create: `web-app/supabase/migrations/20260510_extend_sync_status.sql`

- [ ] **Step 1: Check existing migrations**

Run: `ls -la web-app/supabase/migrations/`

- [ ] **Step 2: Write migration for temporary_prompts**

```sql
-- web-app/supabase/migrations/20260510_add_temporary_prompts.sql
-- Create temporary_prompts table for cloud sync

CREATE TABLE IF NOT EXISTS public.temporary_prompts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  content TEXT,
  content_en TEXT,
  category_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.temporary_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage own temporary prompts
CREATE POLICY "Users can manage own temporary prompts"
  ON public.temporary_prompts FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_temporary_prompts_user_id ON public.temporary_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_temporary_prompts_category_id ON public.temporary_prompts(category_id);
```

- [ ] **Step 3: Write migration for sync_status extension**

```sql
-- web-app/supabase/migrations/20260510_extend_sync_status.sql
-- Extend user_sync_status with local sync fields

ALTER TABLE public.user_sync_status
ADD COLUMN IF NOT EXISTS last_local_sync_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pending_cloud_sync BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pending_upload BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS local_only_prompt_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS local_only_category_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS local_only_temporary_prompt_ids TEXT[] DEFAULT '{}';

-- Indexes for new fields
CREATE INDEX IF NOT EXISTS idx_user_sync_status_pending_cloud ON public.user_sync_status(pending_cloud_sync);
CREATE INDEX IF NOT EXISTS idx_user_sync_status_pending_upload ON public.user_sync_status(pending_upload);
```

- [ ] **Step 4: Commit**

```bash
git add web-app/supabase/migrations/
git commit -m "feat(db): add temporary_prompts table and extend sync_status"
```

---

### Task 8: Update Web App API Routes

**Files:**
- Read first: `web-app/app/api/sync/upload/route.ts`
- Read first: `web-app/app/api/sync/download/route.ts`
- Read first: `web-app/app/api/sync/status/route.ts`
- Modify: `web-app/app/api/sync/upload/route.ts`
- Modify: `web-app/app/api/sync/download/route.ts`
- Modify: `web-app/app/api/sync/status/route.ts`

- [ ] **Step 1: Read existing API routes**

Run: `cat web-app/app/api/sync/upload/route.ts`
Run: `cat web-app/app/api/sync/download/route.ts`
Run: `cat web-app/app/api/sync/status/route.ts`

- [ ] **Step 2: Update upload route**

```typescript
// web-app/app/api/sync/upload/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { prompts, categories, temporaryPrompts, timestamp } = body

    // Upsert prompts
    if (prompts?.length > 0) {
      const { error } = await supabase
        .from('prompts')
        .upsert(
          prompts.map((p: any) => ({
            id: p.id,
            user_id: user.id,
            name: p.name,
            name_en: p.name_en,
            content: p.content,
            content_en: p.content_en,
            category_id: p.categoryId,
            sort_order: p.order,
            created_at: new Date(p.createdAt).toISOString(),
            updated_at: new Date(p.updatedAt).toISOString()
          })),
          { onConflict: 'id' }
        )
      if (error) throw error
    }

    // Upsert categories
    if (categories?.length > 0) {
      const { error } = await supabase
        .from('categories')
        .upsert(
          categories.map((c: any) => ({
            id: c.id,
            user_id: user.id,
            name: c.name,
            sort_order: c.sortOrder,
            created_at: new Date(c.createdAt).toISOString(),
            updated_at: new Date(c.updatedAt).toISOString()
          })),
          { onConflict: 'id' }
        )
      if (error) throw error
    }

    // Upsert temporary prompts
    if (temporaryPrompts?.length > 0) {
      const { error } = await supabase
        .from('temporary_prompts')
        .upsert(
          temporaryPrompts.map((p: any) => ({
            id: p.id,
            user_id: user.id,
            name: p.name,
            name_en: p.name_en,
            content: p.content,
            content_en: p.content_en,
            category_id: p.categoryId,
            sort_order: p.order,
            created_at: new Date(p.createdAt).toISOString(),
            updated_at: new Date(p.updatedAt).toISOString()
          })),
          { onConflict: 'id' }
        )
      if (error) throw error
    }

    // Update sync status
    await supabase
      .from('user_sync_status')
      .upsert({
        user_id: user.id,
        last_sync_time: new Date(timestamp).toISOString(),
        prompts_count: prompts?.length || 0,
        categories_count: categories?.length || 0
      }, { onConflict: 'user_id' })

    return NextResponse.json({ success: true, timestamp })
  } catch (error) {
    console.error('Sync upload error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Update download route**

```typescript
// web-app/app/api/sync/download/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Fetch prompts
    const { data: prompts, error: promptsError } = await supabase
      .from('prompts')
      .select('*')
      .eq('user_id', user.id)

    if (promptsError) throw promptsError

    // Fetch categories
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)

    if (categoriesError) throw categoriesError

    // Fetch temporary prompts
    const { data: temporaryPrompts, error: tempError } = await supabase
      .from('temporary_prompts')
      .select('*')
      .eq('user_id', user.id)

    if (tempError) throw tempError

    // Fetch sync status
    const { data: syncStatus } = await supabase
      .from('user_sync_status')
      .select('*')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      prompts: prompts?.map(p => ({
        id: p.id,
        name: p.name,
        name_en: p.name_en,
        content: p.content,
        content_en: p.content_en,
        categoryId: p.category_id,
        order: p.sort_order,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime()
      })) || [],
      categories: categories?.map(c => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        createdAt: new Date(c.created_at).getTime(),
        updatedAt: new Date(c.updated_at).getTime()
      })) || [],
      temporaryPrompts: temporaryPrompts?.map(p => ({
        id: p.id,
        name: p.name,
        name_en: p.name_en,
        content: p.content,
        content_en: p.content_en,
        categoryId: p.category_id,
        order: p.sort_order,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime()
      })) || [],
      timestamp: syncStatus?.last_sync_time
        ? new Date(syncStatus.last_sync_time).getTime()
        : Date.now()
    })
  } catch (error) {
    console.error('Sync download error:', error)
    return NextResponse.json(
      { error: 'Download failed', details: String(error) },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Update status route**

```typescript
// web-app/app/api/sync/status/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Fetch sync status
    const { data: syncStatus, error } = await supabase
      .from('user_sync_status')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error
    }

    return NextResponse.json({
      lastSyncTime: syncStatus?.last_sync_time
        ? new Date(syncStatus.last_sync_time).getTime()
        : null,
      lastLocalSyncTime: syncStatus?.last_local_sync_time
        ? new Date(syncStatus.last_local_sync_time).getTime()
        : null,
      promptsCount: syncStatus?.prompts_count || 0,
      categoriesCount: syncStatus?.categories_count || 0,
      pendingCloudSync: syncStatus?.pending_cloud_sync || false,
      pendingUpload: syncStatus?.pending_upload || false,
      localOnlyItems: {
        promptIds: syncStatus?.local_only_prompt_ids || [],
        categoryIds: syncStatus?.local_only_category_ids || [],
        temporaryPromptIds: syncStatus?.local_only_temporary_prompt_ids || []
      }
    })
  } catch (error) {
    console.error('Sync status error:', error)
    return NextResponse.json(
      { error: 'Status check failed', details: String(error) },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add web-app/app/api/sync/
git commit -m "feat(api): update sync endpoints for temporaryPrompts and new status fields"
```

---

## Phase 6: UI Refactoring

### Task 9: Create UnifiedSyncSection Component

**Files:**
- Read first: `packages/extension/src/sidepanel/settings/CloudSyncSection.tsx`
- Read first: `packages/extension/src/sidepanel/settings/BackupSection.tsx`
- Create: `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx`

- [ ] **Step 1: Read existing UI components**

Run: `cat packages/extension/src/sidepanel/settings/CloudSyncSection.tsx`
Run: `cat packages/extension/src/sidepanel/settings/BackupSection.tsx`

- [ ] **Step 2: Write UnifiedSyncSection component**

```typescript
// packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx
import React, { useEffect, useState } from 'react'
import { createSyncOrchestrator, UnifiedSyncStatus } from '@/lib/sync'

const orchestrator = createSyncOrchestrator()

export function UnifiedSyncSection() {
  const [status, setStatus] = useState<UnifiedSyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  useEffect(() => {
    loadStatus()
    // Poll every 10 seconds
    const interval = setInterval(loadStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    const s = await orchestrator.getStatus()
    setStatus(s)
  }

  const handleManualSync = async () => {
    setLoading(true)
    // Get current data and trigger sync
    const result = await chrome.storage.local.get('prompt_script_data')
    const data = result.prompt_script_data
    if (data) {
      await orchestrator.triggerSync({
        prompts: data.userData?.prompts || [],
        categories: data.userData?.categories || [],
        temporaryPrompts: data.temporaryPrompts || [],
        timestamp: Date.now()
      })
    }
    await loadStatus()
    setLoading(false)
  }

  const handleDownloadAndMerge = async () => {
    setLoading(true)
    const result = await orchestrator.downloadAndMerge()
    if (result.localOnlyItems.prompts.length > 0) {
      setShowUploadDialog(true)
    }
    await loadStatus()
    setLoading(false)
  }

  const handleUploadLocalOnly = async () => {
    setLoading(true)
    await orchestrator.uploadLocalOnlyItems()
    setShowUploadDialog(false)
    await loadStatus()
    setLoading(false)
  }

  const getCloudStatusColor = () => {
    if (!status?.cloudLoggedIn) return 'text-gray-400'
    if (status.cloudError) return 'text-red-500'
    if (status.pendingCloudSync) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getLocalStatusColor = () => {
    if (!status?.localEnabled) return 'text-gray-400'
    if (status.localError) return 'text-red-500'
    return 'text-green-500'
  }

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleString()
  }

  if (!status) {
    return <div className="p-4 text-gray-500">Loading sync status...</div>
  }

  return (
    <div className="space-y-4">
      {/* Cloud Sync Section */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Cloud Sync</h3>
          <span className={`text-sm ${getCloudStatusColor()}`}>
            {status.cloudLoggedIn ? '●' : '○'}
          </span>
        </div>

        {status.cloudLoggedIn ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Last sync: {formatTime(status.lastCloudSyncTime)}
            </p>
            {status.cloudError && (
              <p className="text-sm text-red-500">Error: {status.cloudError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                disabled={loading}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Syncing...' : 'Manual Sync'}
              </button>
              <button
                onClick={handleDownloadAndMerge}
                disabled={loading}
                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Restore from Cloud
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            <p>Not logged in. Open the web app to sync.</p>
            <button
              onClick={() => chrome.tabs.create({ url: 'https://oh-my-prompt.com' })}
              className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Open Web App
            </button>
          </div>
        )}
      </div>

      {/* Local Backup Section */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Local Backup</h3>
          <span className={`text-sm ${getLocalStatusColor()}`}>
            {status.localEnabled ? '●' : '○'}
          </span>
        </div>

        {status.localEnabled ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Last backup: {formatTime(status.lastLocalSyncTime)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                disabled={loading}
                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Backup Now
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            <p>Local backup folder not configured.</p>
            <button
              onClick={() => {
                // Open backup folder selection
                chrome.runtime.sendMessage({ type: 'OPEN_BACKUP_PAGE' })
              }}
              className="mt-2 px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
            >
              Select Folder
            </button>
          </div>
        )}
      </div>

      {/* Pending Upload Warning */}
      {status.pendingUpload && status.localOnlyItems.promptIds.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600">⚠️</span>
            <div className="flex-1">
              <p className="text-sm text-yellow-800">
                You have {status.localOnlyItems.promptIds.length} local item(s) not synced to cloud.
              </p>
              <button
                onClick={() => setShowUploadDialog(true)}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700"
              >
                Review and upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      {showUploadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h4 className="font-medium mb-2">Local Items Not Synced</h4>
            <p className="text-sm text-gray-600 mb-4">
              Upload {status.localOnlyItems.promptIds.length} local item(s) to cloud?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowUploadDialog(false)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Later
              </button>
              <button
                onClick={handleUploadLocalOnly}
                disabled={loading}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Uploading...' : 'Upload Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Text */}
      <p className="text-xs text-gray-500 px-2">
        Cloud sync automatically triggers on data changes. Local backup provides double protection.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx
git commit -m "feat(ui): add UnifiedSyncSection component"
```

---

### Task 10: Update Settings View Tabs

**Files:**
- Read first: `packages/extension/src/sidepanel/SettingsView.tsx`
- Modify: `packages/extension/src/sidepanel/SettingsView.tsx`

- [ ] **Step 1: Read existing SettingsView**

Run: `cat packages/extension/src/sidepanel/SettingsView.tsx`

- [ ] **Step 2: Update SettingsView**

Replace the CloudSync and Backup tabs with UnifiedSync:

```typescript
// packages/extension/src/sidepanel/SettingsView.tsx
import { UnifiedSyncSection } from './settings/UnifiedSyncSection'
// Remove: import { CloudSyncSection } from './settings/CloudSyncSection'
// Remove: import { BackupSection } from './settings/BackupSection'

// In the tabs configuration:
const tabs = [
  { id: 'sync', label: 'Sync & Backup', component: UnifiedSyncSection },
  // Remove: { id: 'cloud', label: 'Cloud Sync', component: CloudSyncSection },
  // Remove: { id: 'backup', label: 'Local Backup', component: BackupSection },
  { id: 'ai', label: 'AI Vision', component: AIVisionSection },
  { id: 'import', label: 'Import/Export', component: ImportExportSection },
]
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/sidepanel/SettingsView.tsx
git commit -m "feat(ui): merge cloud and local sync tabs into unified section"
```

---

## Phase 7: Integration & Migration

### Task 11: Integrate SyncOrchestrator with Storage Manager

**Files:**
- Read first: `packages/extension/src/lib/storage.ts`
- Modify: `packages/extension/src/lib/storage.ts`

- [ ] **Step 1: Read existing storage.ts**

Run: `cat packages/extension/src/lib/storage.ts`

- [ ] **Step 2: Update storage.ts to use SyncOrchestrator**

Add orchestrator integration to `saveToStorage`:

```typescript
// packages/extension/src/lib/storage.ts
import { createSyncOrchestrator } from './sync'

const orchestrator = createSyncOrchestrator()

export class StorageManager {
  // ...existing code...

  async saveToStorage(data: StorageSchema): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEY]: data
    })

    // Trigger automatic sync
    const syncData = {
      prompts: data.userData?.prompts || [],
      categories: data.userData?.categories || [],
      temporaryPrompts: data.temporaryPrompts || [],
      timestamp: Date.now()
    }

    // Fire-and-forget sync (don't block save)
    orchestrator.triggerSync(syncData).catch(err => {
      console.error('[Oh My Prompt] Auto-sync failed:', err)
    })
  }

  // ...rest of existing code...
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/lib/storage.ts
git commit -m "feat(sync): integrate SyncOrchestrator with StorageManager"
```

---

### Task 12: Update Extension Background Script

**Files:**
- Read first: `packages/extension/src/background/index.ts`
- Modify: `packages/extension/src/background/index.ts`

- [ ] **Step 1: Add initial sync on extension startup**

```typescript
// packages/extension/src/background/index.ts
import { createSyncOrchestrator } from '@/lib/sync'

const orchestrator = createSyncOrchestrator()

// On extension startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Oh My Prompt] Extension started, running initial sync...')
  try {
    await orchestrator.initialSync()
  } catch (error) {
    console.error('[Oh My Prompt] Initial sync failed:', error)
  }
})

// On extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Oh My Prompt] Extension installed/updated:', details.reason)
  try {
    await orchestrator.initialSync()
  } catch (error) {
    console.error('[Oh My Prompt] Initial sync failed:', error)
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/background/index.ts
git commit -m "feat(sync): add initial sync on extension startup"
```

---

## Phase 8: Testing & Verification

### Task 13: Create Integration Test

**Files:**
- Create: `packages/extension/src/lib/sync/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// packages/extension/src/lib/sync/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSyncOrchestrator } from '../index'
import { FullBackupData } from '../types'

describe('Sync Integration', () => {
  beforeEach(() => {
    // Mock chrome APIs
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    } as any

    global.fetch = vi.fn()
    global.indexedDB = {
      open: vi.fn().mockReturnValue({
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
          createObjectStore: vi.fn(),
          transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: undefined
              })
            })
          })
        }
      })
    } as any
  })

  it('should complete full sync flow', async () => {
    const orchestrator = createSyncOrchestrator()

    const data: FullBackupData = {
      prompts: [
        { id: '1', name: 'Test Prompt', content: 'test', categoryId: 'c1', order: 0, createdAt: 1, updatedAt: 1 }
      ],
      categories: [{ id: 'c1', name: 'Test', sortOrder: 0, createdAt: 1, updatedAt: 1 }],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    // Mock cloud available
    vi.spyOn(orchestrator['cloudStrategy'], 'isAvailable').mockResolvedValue(true)
    vi.spyOn(orchestrator['cloudStrategy'], 'sync').mockResolvedValue({
      success: true,
      syncedAt: Date.now()
    })
    vi.spyOn(orchestrator['localStrategy'], 'isAvailable').mockResolvedValue(true)
    vi.spyOn(orchestrator['localStrategy'], 'sync').mockResolvedValue({
      success: true,
      syncedAt: Date.now()
    })

    await orchestrator.triggerSync(data)

    expect(orchestrator['cloudStrategy'].sync).toHaveBeenCalledWith(data)
    expect(orchestrator['localStrategy'].sync).toHaveBeenCalledWith(data)
  })

  it('should handle offline scenario', async () => {
    const orchestrator = createSyncOrchestrator()

    const data: FullBackupData = {
      prompts: [],
      categories: [],
      temporaryPrompts: [],
      timestamp: Date.now()
    }

    // Cloud unavailable
    vi.spyOn(orchestrator['cloudStrategy'], 'isAvailable').mockResolvedValue(false)
    vi.spyOn(orchestrator['localStrategy'], 'isAvailable').mockResolvedValue(true)
    vi.spyOn(orchestrator['localStrategy'], 'sync').mockResolvedValue({
      success: true,
      syncedAt: Date.now()
    })

    const setSpy = chrome.storage.local.set as any

    await orchestrator.triggerSync(data)

    expect(orchestrator['cloudStrategy'].sync).not.toHaveBeenCalled()
    expect(orchestrator['localStrategy'].sync).toHaveBeenCalled()
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      syncStatus: expect.objectContaining({ pendingCloudSync: true })
    }))
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `cd packages/extension && npm test -- integration.test.ts -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/lib/sync/__tests__/integration.test.ts
git commit -m "test(sync): add integration tests for sync flow"
```

---

## Phase 9: Cleanup

### Task 14: Remove Legacy Sync Files

**Files:**
- Delete: `packages/extension/src/lib/sync/file-sync.ts`
- Delete: `packages/extension/src/lib/sync/cloud-sync-service.ts`
- Delete: `packages/extension/src/lib/sync/sync-manager.ts`
- Delete: `packages/extension/src/sidepanel/settings/CloudSyncSection.tsx`
- Delete: `packages/extension/src/sidepanel/settings/BackupSection.tsx`

- [ ] **Step 1: Delete legacy files**

Run:
```bash
rm packages/extension/src/lib/sync/file-sync.ts
rm packages/extension/src/lib/sync/cloud-sync-service.ts
rm packages/extension/src/lib/sync/sync-manager.ts
rm packages/extension/src/sidepanel/settings/CloudSyncSection.tsx
rm packages/extension/src/sidepanel/settings/BackupSection.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor(sync): remove legacy sync files (replaced by strategy pattern)"
```

---

## Summary

### Files Created:

**New Sync System:**
- `packages/extension/src/lib/sync/types.ts` - Type definitions
- `packages/extension/src/lib/sync/strategies/base.ts` - Base strategy class
- `packages/extension/src/lib/sync/strategies/cloud.ts` - Cloud sync strategy
- `packages/extension/src/lib/sync/strategies/local.ts` - Local sync strategy
- `packages/extension/src/lib/sync/orchestrator.ts` - Sync orchestrator
- `packages/extension/src/lib/sync/index.ts` - Module exports

**UI Components:**
- `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx` - Unified sync UI

**Database:**
- `web-app/supabase/migrations/20260510_add_temporary_prompts.sql`
- `web-app/supabase/migrations/20260510_extend_sync_status.sql`

**Tests:**
- `packages/extension/src/lib/sync/__tests__/types.test.ts`
- `packages/extension/src/lib/sync/__tests__/base-strategy.test.ts`
- `packages/extension/src/lib/sync/__tests__/local-strategy.test.ts`
- `packages/extension/src/lib/sync/__tests__/cloud-strategy.test.ts`
- `packages/extension/src/lib/sync/__tests__/orchestrator.test.ts`
- `packages/extension/src/lib/sync/__tests__/integration.test.ts`

### Files Modified:
- `packages/extension/src/lib/storage.ts` - Integrate orchestrator
- `packages/extension/src/background/index.ts` - Add initial sync
- `packages/extension/src/sidepanel/SettingsView.tsx` - Merge tabs
- `web-app/app/api/sync/upload/route.ts` - Add temporaryPrompts
- `web-app/app/api/sync/download/route.ts` - Return temporaryPrompts
- `web-app/app/api/sync/status/route.ts` - Return new status fields

### Files Deleted:
- `packages/extension/src/lib/sync/file-sync.ts`
- `packages/extension/src/lib/sync/cloud-sync-service.ts`
- `packages/extension/src/lib/sync/sync-manager.ts`
- `packages/extension/src/sidepanel/settings/CloudSyncSection.tsx`
- `packages/extension/src/sidepanel/settings/BackupSection.tsx`

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-cloud-sync-local-backup-refactor-plan.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration
   - **REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development`

2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints
   - **REQUIRED SUB-SKILL:** Use `superpowers:executing-plans`

**Which approach?**

**Recommended:** Execute Phase 1-4 (core sync system) first, then Phase 5 (database), then Phase 6-7 (UI integration), then Phase 8-9 (tests and cleanup).
