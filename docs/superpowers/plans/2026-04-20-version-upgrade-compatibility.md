# Version Upgrade Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure 1.0 version user data survives version upgrades and provide local folder backup via File System Access API.

**Architecture:** Refactor StorageSchema to wrap prompts/categories under `userData`, add `settings` for sync config, implement migration system that detects old structure and transforms it. Use IndexedDB for FileSystemDirectoryHandle persistence since chrome.storage cannot store it.

**Tech Stack:** Chrome Extension Manifest V3, IndexedDB, File System Access API, TypeScript

---

## File Structure

### New Files
| Path | Responsibility |
|------|-----------------|
| `src/lib/migrations/index.ts` | Migration manager: version detection, step execution, ordering |
| `src/lib/migrations/v1.0.ts` | Legacy flat structure → new nested structure migration |
| `src/lib/sync/indexeddb.ts` | IndexedDB wrapper for FileSystemDirectoryHandle storage |
| `src/lib/sync/file-sync.ts` | File read/write operations using File System Access API |
| `src/lib/sync/sync-manager.ts` | Sync triggering on CRUD, permission validation, error handling |
| `src/popup/components/SyncSettingsPanel.tsx` | Settings UI for sync configuration |

### Modified Files
| Path | Changes |
|------|---------|
| `src/shared/types.ts` | Add new StorageSchema structure, UserData, SyncSettings types |
| `src/shared/constants.ts` | Remove `EXTENSION_VERSION`, add `SYNC_DB_NAME`, `SYNC_STORE_NAME` |
| `src/shared/messages.ts` | Add `SYNC_TRIGGER`, `GET_SYNC_STATUS` message types |
| `src/lib/storage.ts` | Refactor: dynamic version, check existing data before init, migration integration |
| `src/lib/store.ts` | Trigger sync after CRUD, use new StorageSchema structure |
| `src/background/service-worker.ts` | Handle new sync message types |
| `src/popup/App.tsx` | Add SyncSettingsPanel to header/settings section |
| `manifest.json` | Add `fileSystem.write` permission for local sync |

---

## Tasks

### Task 1: Refactor StorageSchema Types

**Files:**
- Modify: `src/shared/types.ts:19-23`

- [ ] **Step 1: Write new type definitions**

```typescript
// src/shared/types.ts (replace existing StorageSchema)

// User data container - all prompts and categories owned by user
export interface UserData {
  prompts: Prompt[]
  categories: Category[]
}

// Sync settings for local folder backup
export interface SyncSettings {
  showBuiltin: boolean       // Show resource library reference in UI
  syncEnabled: boolean       // Auto-sync to local folder enabled
  lastSyncTime?: number      // Timestamp of last successful sync
}

// New storage schema with nested structure
export interface StorageSchema {
  version: string              // From manifest, dynamic read
  userData: UserData           // User's prompts and categories
  settings: SyncSettings       // Sync and display settings
  _migrationComplete?: boolean // Prevents re-migration
}

// Legacy schema for migration detection
export interface LegacyStorageSchema {
  prompts: Prompt[]
  categories: Category[]
  version: string
}

// Local sync file format
export interface LocalSyncFile {
  version: 1                  // File format version (not extension version)
  prompts: Prompt[]
  categories: Category[]
  exportedAt: number           // Timestamp
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (types are definitions only, no runtime impact yet)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "refactor(types): add new StorageSchema with userData/settings structure"
```

---

### Task 2: Update Constants - Remove Hardcoded Version

**Files:**
- Modify: `src/shared/constants.ts:3`

- [ ] **Step 1: Remove EXTENSION_VERSION and add sync constants**

```typescript
// src/shared/constants.ts

// Extension metadata
export const EXTENSION_NAME = 'Oh My Prompt Script'

// REMOVE: export const EXTENSION_VERSION = '1.0.0'
// Version is now read dynamically from manifest via chrome.runtime.getManifest().version

// Platform domain
export const PLATFORM_DOMAIN = '*.lovart.ai'

// Storage key
export const STORAGE_KEY = 'prompt_script_data'

// Default category
export const DEFAULT_CATEGORY_NAME = '默认分类'

// IndexedDB for sync folder handle storage
export const SYNC_DB_NAME = 'oh-my-prompt-script-sync'
export const SYNC_STORE_NAME = 'handles'
export const SYNC_HANDLE_KEY = 'syncFolderHandle'
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: May FAIL - need to update files referencing EXTENSION_VERSION

- [ ] **Step 3: Update store.ts to use dynamic version**

Find usages of EXTENSION_VERSION and replace:

```typescript
// src/lib/store.ts:175-188 (saveToStorage function)
// Change version from '1.0.0' to dynamic read

saveToStorage: async () => {
  const { prompts, categories } = get()
  try {
    const version = chrome.runtime.getManifest().version
    await sendStorageMessage(MessageType.SET_STORAGE, {
      version,
      userData: { prompts, categories },
      settings: { showBuiltin: true, syncEnabled: false }
    })
    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt Script] Failed to save storage:', error)
    return { success: false, error: '数据保存失败，请检查存储配额' }
  }
},
```

- [ ] **Step 4: Update App.tsx export function**

```typescript
// src/popup/App.tsx:76-95 (handleExport function)

const handleExport = async () => {
  const version = chrome.runtime.getManifest().version
  const data: StorageSchema = {
    version,
    userData: { prompts, categories },
    settings: { showBuiltin: true, syncEnabled: false }
  }
  try {
    await exportData(data)
    toast({
      title: '导出成功',
      description: `文件已保存为 lovart-prompts-${new Date().toISOString().slice(0, 10)}.json`
    })
  } catch (error) {
    toast({
      title: '导出失败',
      description: '请检查下载权限',
      variant: 'destructive'
    })
  }
}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/constants.ts src/lib/store.ts src/popup/App.tsx
git commit -m "refactor: remove hardcoded version, use manifest dynamically"
```

---

### Task 3: Create Migration System

**Files:**
- Create: `src/lib/migrations/index.ts`
- Create: `src/lib/migrations/v1.0.ts`

- [ ] **Step 1: Create migration manager**

```typescript
// src/lib/migrations/index.ts

import type { StorageSchema, LegacyStorageSchema } from '../../shared/types'

export interface MigrationStep {
  version: string
  handler: (data: unknown) => StorageSchema
}

/**
 * Simple semver comparison: returns negative if a < b, positive if a > b, 0 if equal
 * Only compares major.minor (ignores patch for simplicity)
 */
function semverCompare(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const parts = v.split('.').map(Number)
    return { major: parts[0] || 0, minor: parts[1] || 0 }
  }
  
  const va = parseVersion(a)
  const vb = parseVersion(b)
  
  if (va.major !== vb.major) return va.major - vb.major
  return va.minor - vb.minor
}

// Migration steps registry
const migrations: MigrationStep[] = [
  // 1.0 legacy → new structure (registered in v1.0.ts)
]

/**
 * Register a migration step
 */
export function registerMigration(step: MigrationStep): void {
  migrations.push(step)
  // Sort by version ascending
  migrations.sort((a, b) => semverCompare(a.version, b.version))
}

/**
 * Check if data is legacy format (flat prompts/categories)
 */
export function isLegacyFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  // Legacy: has prompts/categories directly, no userData wrapper
  return Array.isArray(obj.prompts) && Array.isArray(obj.categories) && !obj.userData
}

/**
 * Execute migration from old version to target version
 */
export async function migrate(
  oldData: unknown,
  targetVersion: string
): Promise<StorageSchema> {
  // Determine start version
  let startVersion = '1.0'
  if (oldData && typeof oldData === 'object') {
    const obj = oldData as Record<string, unknown>
    if (typeof obj.version === 'string') {
      startVersion = obj.version
    }
  }
  
  // Find migration steps to execute
  const steps = migrations.filter(m =>
    semverCompare(m.version, startVersion) >= 0 &&
    semverCompare(m.version, targetVersion) < 0
  )
  
  // Execute each step
  let data = oldData
  for (const step of steps) {
    console.log(`[Oh My Prompt Script] Executing migration ${step.version}`)
    data = step.handler(data)
  }
  
  // Ensure final structure
  const result = data as StorageSchema
  result.version = targetVersion
  result._migrationComplete = true
  
  return result
}
```

- [ ] **Step 2: Create v1.0 migration handler**

```typescript
// src/lib/migrations/v1.0.ts

import type { StorageSchema, LegacyStorageSchema, Prompt, Category } from '../../shared/types'
import { registerMigration } from './index'

/**
 * Migration from 1.0 legacy flat structure to new nested structure
 * Legacy: { prompts: [], categories: [], version: '1.0.0' }
 * New: { version, userData: { prompts, categories }, settings: {...} }
 */
function migrateFromLegacy(oldData: unknown): StorageSchema {
  const legacy = oldData as LegacyStorageSchema
  
  // Ensure we have arrays (fallback to empty)
  const prompts: Prompt[] = Array.isArray(legacy.prompts) ? legacy.prompts : []
  const categories: Category[] = Array.isArray(legacy.categories) ? legacy.categories : []
  
  return {
    version: legacy.version || '1.0.0',  // Temporary, will be updated by migrate()
    userData: {
      prompts,
      categories
    },
    settings: {
      showBuiltin: true,
      syncEnabled: false
    },
    _migrationComplete: false  // Final migration step will set true
  }
}

// Register this migration
registerMigration({
  version: '1.0',
  handler: migrateFromLegacy
})
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/migrations/index.ts src/lib/migrations/v1.0.ts
git commit -m "feat: add migration system for version upgrades"
```

---

### Task 4: Refactor StorageManager with Migration Integration

**Files:**
- Modify: `src/lib/storage.ts:14-92`

- [ ] **Step 1: Rewrite StorageManager with new logic**

```typescript
// src/lib/storage.ts

import type { StorageSchema, UserData, SyncSettings } from '../shared/types'
import { STORAGE_KEY } from '../shared/constants'
import { BUILT_IN_CATEGORIES, BUILT_IN_PROMPTS } from '../data/built-in-data'
import { migrate, isLegacyFormat } from './migrations/index'

export class StorageManager {
  private static instance: StorageManager

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  /**
   * Get current extension version from manifest
   */
  getCurrentVersion(): string {
    return chrome.runtime.getManifest().version
  }

  /**
   * Default user data for first-time users
   * Copies built-in data as initial userData
   */
  getDefaultUserData(): UserData {
    return {
      prompts: [...BUILT_IN_PROMPTS],
      categories: [...BUILT_IN_CATEGORIES]
    }
  }

  /**
   * Default settings for first-time users
   */
  getDefaultSettings(): SyncSettings {
    return {
      showBuiltin: true,
      syncEnabled: false
    }
  }

  /**
   * Full default storage schema for first-time installation
   */
  getDefaultData(): StorageSchema {
    return {
      version: this.getCurrentVersion(),
      userData: this.getDefaultUserData(),
      settings: this.getDefaultSettings(),
      _migrationComplete: true
    }
  }

  /**
   * Initialize storage for first-time installation
   * Only called when storage is completely empty
   */
  async initializeStorage(): Promise<StorageSchema> {
    const defaultData = this.getDefaultData()
    await this.saveData(defaultData)
    console.log('[Oh My Prompt Script] Initialized storage with default data')
    return defaultData
  }

  /**
   * Check and migrate storage data
   * Entry point for all storage reads
   */
  async getData(): Promise<StorageSchema> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      const data = result[STORAGE_KEY]

      // Case 1: No data at all - first install
      if (!data) {
        return await this.initializeStorage()
      }

      // Case 2: Legacy format - needs migration
      if (isLegacyFormat(data)) {
        console.log('[Oh My Prompt Script] Detected legacy format, migrating...')
        const migrated = await migrate(data, this.getCurrentVersion())
        await this.saveData(migrated)
        return migrated
      }

      // Case 3: Already new format but wrong version
      const currentVersion = this.getCurrentVersion()
      const schema = data as StorageSchema

      if (schema.version !== currentVersion && !schema._migrationComplete) {
        console.log('[Oh My Prompt Script] Version mismatch, running migration...')
        const migrated = await migrate(schema, currentVersion)
        await this.saveData(migrated)
        return migrated
      }

      // Case 4: Already migrated and up-to-date
      if (schema._migrationComplete && schema.version === currentVersion) {
        return schema
      }

      // Case 5: Has userData but version needs update
      if (schema.userData && schema.version !== currentVersion) {
        schema.version = currentVersion
        schema._migrationComplete = true
        await this.saveData(schema)
        return schema
      }

      // Fallback: malformed data, reinitialize
      console.warn('[Oh My Prompt Script] Malformed storage data, reinitializing...')
      return await this.initializeStorage()
    } catch (error: unknown) {
      console.error('[Oh My Prompt Script] Failed to get storage data:', error)
      return this.getDefaultData()
    }
  }

  /**
   * Save full storage data
   */
  async saveData(data: StorageSchema): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: data })
    } catch (error: unknown) {
      console.error('[Oh My Prompt Script] Failed to save storage data:', error)
      throw error
    }
  }

  /**
   * Update settings only
   */
  async updateSettings(updates: Partial<SyncSettings>): Promise<void> {
    const data = await this.getData()
    data.settings = { ...data.settings, ...updates }
    await this.saveData(data)
  }

  /**
   * Update user data only
   */
  async updateUserData(userData: UserData): Promise<void> {
    const data = await this.getData()
    data.userData = userData
    await this.saveData(data)
  }

  /**
   * Get user data directly
   */
  async getUserData(): Promise<UserData> {
    const data = await this.getData()
    return data.userData
  }

  /**
   * Get settings directly
   */
  async getSettings(): Promise<SyncSettings> {
    const data = await this.getData()
    return data.settings
  }
}

export const storageManager = StorageManager.getInstance()

// Storage quota constants remain unchanged
const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024

export async function checkStorageQuota(): Promise<{
  usedBytes: number
  quotaBytes: number
  percentage: number
}> {
  try {
    const usedBytes = await chrome.storage.local.getBytesInUse(STORAGE_KEY)
    const percentage = Math.round((usedBytes / STORAGE_QUOTA_BYTES) * 100)

    if (percentage > 80) {
      console.warn(`[Oh My Prompt Script] Storage usage warning: ${percentage}%`)
    }

    return {
      usedBytes,
      quotaBytes: STORAGE_QUOTA_BYTES,
      percentage
    }
  } catch (error: unknown) {
    console.error('[Oh My Prompt Script] Failed to check storage quota:', error)
    return {
      usedBytes: 0,
      quotaBytes: STORAGE_QUOTA_BYTES,
      percentage: 0
    }
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "refactor(storage): integrate migration, check existing data before init"
```

---

### Task 5: Update Store to Use New Schema

**Files:**
- Modify: `src/lib/store.ts:1-320`

- [ ] **Step 1: Refactor store with new schema and sync trigger**

```typescript
// src/lib/store.ts

import { create } from 'zustand'
import type { Prompt, Category, StorageSchema, UserData } from '../shared/types'
import { MessageType } from '../shared/messages'
import { sortPromptsByOrder } from '../shared/utils'
import { triggerSync } from './sync/sync-manager'

interface PromptStore {
  prompts: Prompt[]
  categories: Category[]
  selectedCategoryId: string | null
  isLoading: boolean

  // Actions
  loadFromStorage: () => Promise<{ success: boolean; error?: string }>
  saveToStorage: () => Promise<{ success: boolean; error?: string }>
  setSelectedCategory: (categoryId: string | null) => void

  // Prompt CRUD
  addPrompt: (prompt: Omit<Prompt, 'id'>) => void
  updatePrompt: (id: string, updates: Partial<Prompt>) => void
  deletePrompt: (id: string) => void

  // Category CRUD
  addCategory: (name: string) => void
  deleteCategory: (id: string) => void

  // Reorder
  reorderCategories: (newOrder: string[]) => void
  reorderPrompts: (categoryId: string, newOrder: string[]) => void

  // Computed getters
  getPromptsByCategory: (categoryId: string) => Prompt[]
  getFilteredPrompts: () => Prompt[]
}

async function sendStorageMessage(
  type: MessageType.GET_STORAGE | MessageType.SET_STORAGE,
  payload?: StorageSchema
): Promise<StorageSchema | undefined> {
  try {
    const response = await chrome.runtime.sendMessage({
      type,
      payload
    })

    if (!response?.success) {
      throw new Error(response?.error || 'Storage operation failed')
    }

    return response.data
  } catch (error) {
    console.error('[Oh My Prompt Script] Storage message error:', error)
    throw error
  }
}

function generateId(): string {
  return crypto.randomUUID()
}

function getDefaultState() {
  return {
    prompts: [],
    categories: [],
    selectedCategoryId: 'all'
  }
}

function migratePromptOrders(prompts: Prompt[]): Prompt[] {
  const needsMigration = prompts.some(p => p.order === undefined || p.order === null)
  if (!needsMigration) return prompts

  const categoryMap = new Map<string, Prompt[]>()
  prompts.forEach(p => {
    const list = categoryMap.get(p.categoryId) || []
    list.push(p)
    categoryMap.set(p.categoryId, list)
  })

  const migrated: Prompt[] = []
  categoryMap.forEach((categoryPrompts) => {
    categoryPrompts.forEach((p, index) => {
      migrated.push({
        ...p,
        order: p.order ?? index
      })
    })
  })

  console.log('[Oh My Prompt Script] Migrated prompt order field for', migrated.length, 'prompts')
  return migrated
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

export const usePromptStore = create<PromptStore>((set, get) => ({
  prompts: [],
  categories: [],
  selectedCategoryId: 'all',
  isLoading: true,

  loadFromStorage: async () => {
    set({ isLoading: true })
    try {
      const data = await sendStorageMessage(MessageType.GET_STORAGE)
      if (data && data.userData) {
        // Warn for large datasets
        if (data.userData.prompts.length > 500) {
          console.warn('[Oh My Prompt Script] Large dataset:', data.userData.prompts.length, 'prompts')
        }

        const migratedPrompts = migratePromptOrders(data.userData.prompts)

        set({
          prompts: migratedPrompts,
          categories: data.userData.categories,
          selectedCategoryId: 'all',
          isLoading: false
        })

        if (migratedPrompts !== data.userData.prompts) {
          get().saveToStorage()
        }

        return { success: true }
      } else {
        const defaultState = getDefaultState()
        set({
          prompts: defaultState.prompts,
          categories: defaultState.categories,
          selectedCategoryId: 'all',
          isLoading: false
        })
        return { success: true }
      }
    } catch (error) {
      console.error('[Oh My Prompt Script] Failed to load storage:', error)
      const defaultState = getDefaultState()
      set({
        prompts: defaultState.prompts,
        categories: defaultState.categories,
        selectedCategoryId: 'all',
        isLoading: false
      })
      return { success: false, error: '数据加载失败，请检查存储权限' }
    }
  },

  saveToStorage: async () => {
    const { prompts, categories } = get()
    try {
      const version = chrome.runtime.getManifest().version
      const payload: StorageSchema = {
        version,
        userData: { prompts, categories },
        settings: {
          showBuiltin: true,
          syncEnabled: false  // Will be preserved by service worker
        }
      }
      
      await sendStorageMessage(MessageType.SET_STORAGE, payload)
      
      // Trigger sync after save (non-blocking)
      triggerSync({ prompts, categories }).catch(err => {
        console.warn('[Oh My Prompt Script] Sync trigger failed:', err)
      })
      
      return { success: true }
    } catch (error) {
      console.error('[Oh My Prompt Script] Failed to save storage:', error)
      return { success: false, error: '数据保存失败，请检查存储配额' }
    }
  },

  setSelectedCategory: (categoryId: string | null) => {
    set({ selectedCategoryId: categoryId })
  },

  addPrompt: (prompt: Omit<Prompt, 'id'>) => {
    const { prompts } = get()
    const categoryPrompts = prompts.filter(p => p.categoryId === prompt.categoryId)
    const maxOrder = categoryPrompts.length > 0
      ? Math.max(...categoryPrompts.map(p => p.order))
      : -1

    const newPrompt: Prompt = {
      ...prompt,
      id: generateId(),
      order: maxOrder + 1
    }
    set((state) => ({
      prompts: [...state.prompts, newPrompt]
    }))
    get().saveToStorage()
  },

  updatePrompt: (id: string, updates: Partial<Prompt>) => {
    set((state) => ({
      prompts: state.prompts.map((prompt) =>
        prompt.id === id ? { ...prompt, ...updates } : prompt
      )
    }))
    get().saveToStorage()
  },

  deletePrompt: (id: string) => {
    set((state) => ({
      prompts: state.prompts.filter((prompt) => prompt.id !== id)
    }))
    get().saveToStorage()
  },

  addCategory: (name: string) => {
    const { categories } = get()
    const newCategory: Category = {
      id: generateId(),
      name,
      order: categories.length
    }
    set((state) => ({
      categories: [...state.categories, newCategory]
    }))
    get().saveToStorage()
  },

  deleteCategory: (id: string) => {
    set((state) => {
      const updatedCategories = state.categories.filter((cat) => cat.id !== id)
      const updatedPrompts = state.prompts.filter((prompt) => prompt.categoryId !== id)

      return {
        categories: updatedCategories,
        prompts: updatedPrompts,
        selectedCategoryId: state.selectedCategoryId === id ? 'all' : state.selectedCategoryId
      }
    })
    get().saveToStorage()
  },

  reorderCategories: (newOrder: string[]) => {
    set((state) => {
      const updatedCategories = state.categories.map((cat) => ({
        ...cat,
        order: newOrder.indexOf(cat.id)
      }))
      return { categories: updatedCategories }
    })
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }
    saveDebounceTimer = setTimeout(() => {
      get().saveToStorage()
      saveDebounceTimer = null
    }, 500)
  },

  reorderPrompts: (categoryId: string, newOrder: string[]) => {
    set((state) => {
      const updatedPrompts = state.prompts.map((prompt) => {
        if (prompt.categoryId === categoryId) {
          return {
            ...prompt,
            order: newOrder.indexOf(prompt.id)
          }
        }
        return prompt
      })
      return { prompts: updatedPrompts }
    })
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }
    saveDebounceTimer = setTimeout(() => {
      get().saveToStorage()
      saveDebounceTimer = null
    }, 500)
  },

  getPromptsByCategory: (categoryId: string) => {
    const { prompts } = get()
    const categoryPrompts = prompts.filter((prompt) => prompt.categoryId === categoryId)
    return sortPromptsByOrder(categoryPrompts)
  },

  getFilteredPrompts: () => {
    const { prompts, selectedCategoryId } = get()
    if (selectedCategoryId === 'all' || selectedCategoryId === null) {
      return prompts
    }
    const categoryPrompts = prompts.filter((prompt) => prompt.categoryId === selectedCategoryId)
    return sortPromptsByOrder(categoryPrompts)
  }
}))
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: May FAIL - triggerSync not yet created

- [ ] **Step 3: Create stub sync-manager for now**

```typescript
// src/lib/sync/sync-manager.ts (temporary stub)

import type { UserData } from '../../shared/types'

export async function triggerSync(userData: UserData): Promise<void> {
  // Will be implemented in Task 8
  console.log('[Oh My Prompt Script] Sync trigger called (stub)')
}
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts src/lib/sync/sync-manager.ts
git commit -m "refactor(store): use new StorageSchema, add sync trigger hook"
```

---

### Task 6: Update Service Worker for New Schema

**Files:**
- Modify: `src/background/service-worker.ts:1-67`

- [ ] **Step 1: Update service worker to preserve settings**

```typescript
// src/background/service-worker.ts

import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings } from '../shared/types'
import { StorageManager } from '../lib/storage'
import './lib/migrations/v1.0'  // Register migrations

console.log('[Oh My Prompt Script] Service Worker started')

const storageManager = StorageManager.getInstance()

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    console.log('[Oh My Prompt Script] Received message:', message.type)

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      case MessageType.GET_STORAGE:
        storageManager.getData()
          .then(data => sendResponse({ success: true, data } as MessageResponse<StorageSchema>))
          .catch(error => {
            console.error('[Oh My Prompt Script] GET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage retrieval failed' })
          })
        return true

      case MessageType.SET_STORAGE:
        console.log('[Oh My Prompt Script] SET_STORAGE payload:', message.payload)
        if (!message.payload) {
          console.error('[Oh My Prompt Script] SET_STORAGE: No payload provided')
          sendResponse({ success: false, error: 'No payload provided' })
          return true
        }
        
        // Merge with existing settings to preserve syncEnabled, etc.
        storageManager.getData()
          .then(existingData => {
            const payload = message.payload as StorageSchema
            // Preserve existing settings if payload doesn't have full settings
            const mergedSettings: SyncSettings = {
              ...existingData.settings,
              ...payload.settings
            }
            
            const mergedData: StorageSchema = {
              version: payload.version,
              userData: payload.userData,
              settings: mergedSettings,
              _migrationComplete: payload._migrationComplete ?? existingData._migrationComplete
            }
            
            return storageManager.saveData(mergedData)
          })
          .then(() => {
            console.log('[Oh My Prompt Script] SET_STORAGE: Save successful')
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt Script] SET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true

      case MessageType.INSERT_PROMPT:
        sendResponse({ success: true, data: message.payload } as MessageResponse)
        break

      case MessageType.OPEN_SETTINGS:
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt Script] OPEN_SETTINGS error:', error)
            sendResponse({ success: false, error: 'Failed to open settings' })
          })
        return true

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true
  }
)
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "refactor(service-worker): preserve settings on SET_STORAGE"
```

---

### Task 7: Create IndexedDB Handler Storage

**Files:**
- Create: `src/lib/sync/indexeddb.ts`

- [ ] **Step 1: Create IndexedDB wrapper for FileSystemDirectoryHandle**

```typescript
// src/lib/sync/indexeddb.ts

import { SYNC_DB_NAME, SYNC_STORE_NAME, SYNC_HANDLE_KEY } from '../../shared/constants'

/**
 * Open IndexedDB for storing FileSystemDirectoryHandle
 * chrome.storage cannot store handles, so we use IndexedDB
 */
export async function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, 1)
    
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME)
      }
    }
    
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Save folder handle to IndexedDB
 */
export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openSyncDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_STORE_NAME)
    const request = store.put(handle, SYNC_HANDLE_KEY)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    
    transaction.oncomplete = () => db.close()
  })
}

/**
 * Get folder handle from IndexedDB
 * Returns null if not found or permission not granted
 */
export async function getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openSyncDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readonly')
    const store = transaction.objectStore(SYNC_STORE_NAME)
    const request = store.get(SYNC_HANDLE_KEY)
    
    request.onsuccess = async () => {
      const handle = request.result as FileSystemDirectoryHandle | undefined
      
      if (!handle) {
        resolve(null)
        return
      }
      
      // Check permission
      const permission = await handle.queryPermission({ mode: 'readwrite' })
      
      if (permission === 'granted') {
        resolve(handle)
        return
      }
      
      // Try to request permission
      try {
        const requested = await handle.requestPermission({ mode: 'readwrite' })
        if (requested === 'granted') {
          resolve(handle)
          return
        }
      } catch {
        // Permission request failed (user denied or handle revoked)
      }
      
      resolve(null)
    }
    
    request.onerror = () => reject(request.error)
    
    transaction.oncomplete = () => db.close()
  })
}

/**
 * Remove folder handle from IndexedDB
 */
export async function removeFolderHandle(): Promise<void> {
  const db = await openSyncDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_STORE_NAME)
    const request = store.delete(SYNC_HANDLE_KEY)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    
    transaction.oncomplete = () => db.close()
  })
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/indexeddb.ts
git commit -m "feat(sync): add IndexedDB storage for FileSystemDirectoryHandle"
```

---

### Task 8: Create File Sync Operations

**Files:**
- Create: `src/lib/sync/file-sync.ts`

- [ ] **Step 1: Create file read/write functions**

```typescript
// src/lib/sync/file-sync.ts

import type { Prompt, Category, LocalSyncFile, UserData } from '../../shared/types'

const SYNC_FILE_NAME = 'user-prompts.json'

/**
 * Sync user data to local folder
 */
export async function syncToLocalFolder(
  userData: UserData,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const fileHandle = await handle.getFileHandle(SYNC_FILE_NAME, { create: true })
  const writable = await fileHandle.createWritable()
  
  const syncFile: LocalSyncFile = {
    version: 1,
    prompts: userData.prompts,
    categories: userData.categories,
    exportedAt: Date.now()
  }
  
  await writable.write(JSON.stringify(syncFile, null, 2))
  await writable.close()
  
  console.log('[Oh My Prompt Script] Synced to local folder:', SYNC_FILE_NAME)
}

/**
 * Read user data from local folder
 * Returns null if file doesn't exist or is invalid
 */
export async function readFromLocalFolder(
  handle: FileSystemDirectoryHandle
): Promise<UserData | null> {
  try {
    const fileHandle = await handle.getFileHandle(SYNC_FILE_NAME)
    const file = await fileHandle.getFile()
    const content = await file.text()
    const parsed = JSON.parse(content) as LocalSyncFile
    
    // Validate structure
    if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.categories)) {
      console.warn('[Oh My Prompt Script] Invalid local file format')
      return null
    }
    
    return {
      prompts: parsed.prompts as Prompt[],
      categories: parsed.categories as Category[]
    }
  } catch (error) {
    console.warn('[Oh My Prompt Script] Failed to read local file:', error)
    return null
  }
}

/**
 * Request user to select a folder for sync
 * Returns handle if successful, null if cancelled or denied
 */
export async function selectSyncFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    })
    
    // Verify permission
    const permission = await handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      console.warn('[Oh My Prompt Script] Folder permission denied')
      return null
    }
    
    return handle
  } catch (error) {
    // User cancelled or picker failed
    console.log('[Oh My Prompt Script] Folder selection cancelled:', error)
    return null
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (FileSystemDirectoryHandle is standard DOM type)

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/file-sync.ts
git commit -m "feat(sync): add file read/write operations for local backup"
```

---

### Task 9: Complete Sync Manager with Trigger Logic

**Files:**
- Modify: `src/lib/sync/sync-manager.ts`

- [ ] **Step 1: Complete sync manager implementation**

```typescript
// src/lib/sync/sync-manager.ts

import type { UserData } from '../../shared/types'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle, removeFolderHandle } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder } from './file-sync'

export interface SyncStatus {
  enabled: boolean
  hasFolder: boolean
  lastSyncTime?: number
  folderName?: string
}

/**
 * Trigger sync after data change
 * Called by store.saveToStorage()
 */
export async function triggerSync(userData: UserData): Promise<void> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()
  
  if (!settings.syncEnabled) {
    return
  }
  
  const handle = await getFolderHandle()
  
  if (!handle) {
    // Folder handle lost - disable sync
    await storageManager.updateSettings({ syncEnabled: false })
    console.warn('[Oh My Prompt Script] Sync folder handle lost, disabled sync')
    return
  }
  
  try {
    await syncToLocalFolder(userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })
    console.log('[Oh My Prompt Script] Auto-sync completed')
  } catch (error) {
    console.error('[Oh My Prompt Script] Auto-sync failed:', error)
    // Keep syncEnabled - user can see error in settings
  }
}

/**
 * Initial sync check at startup
 * Restore from local if chrome.storage empty
 */
export async function initialSync(): Promise<void> {
  const handle = await getFolderHandle()
  
  if (!handle) {
    return
  }
  
  const storageManager = StorageManager.getInstance()
  const storageData = await storageManager.getData()
  const localData = await readFromLocalFolder(handle)
  
  // Case: chrome.storage empty, local has data → restore
  if (localData && storageData.userData.prompts.length === 0) {
    await storageManager.updateUserData(localData)
    console.log('[Oh My Prompt Script] Restored from local folder backup')
    return
  }
  
  // Case: both have data → sync chrome.storage to local
  if (localData && storageData.userData.prompts.length > 0) {
    const settings = await storageManager.getSettings()
    if (settings.syncEnabled) {
      await syncToLocalFolder(storageData.userData, handle)
      await storageManager.updateSettings({ lastSyncTime: Date.now() })
    }
  }
}

/**
 * Enable sync and select folder
 */
export async function enableSync(): Promise<{ success: boolean; error?: string }> {
  const handle = await selectSyncFolder()
  
  if (!handle) {
    return { success: false, error: '请选择一个文件夹' }
  }
  
  await saveFolderHandle(handle)
  
  // Sync current data immediately
  const storageManager = StorageManager.getInstance()
  const data = await storageManager.getData()
  await syncToLocalFolder(data.userData, handle)
  await storageManager.updateSettings({
    syncEnabled: true,
    lastSyncTime: Date.now()
  })
  
  return { success: true }
}

/**
 * Disable sync and clear handle
 */
export async function disableSync(): Promise<void> {
  await removeFolderHandle()
  const storageManager = StorageManager.getInstance()
  await storageManager.updateSettings({
    syncEnabled: false,
    lastSyncTime: undefined
  })
}

/**
 * Manual sync trigger (from UI button)
 */
export async function manualSync(): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  
  if (!handle) {
    return { success: false, error: '文件夹权限已失效，请重新选择' }
  }
  
  try {
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })
    return { success: true }
  } catch (error) {
    return { success: false, error: '同步失败，请检查文件夹权限' }
  }
}

/**
 * Get current sync status for UI display
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()
  const handle = await getFolderHandle()
  
  return {
    enabled: settings.syncEnabled,
    hasFolder: handle !== null,
    lastSyncTime: settings.lastSyncTime,
    folderName: handle?.name
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/sync-manager.ts
git commit -m "feat(sync): complete sync manager with trigger and status logic"
```

---

### Task 10: Add Sync Settings UI

**Files:**
- Create: `src/popup/components/SyncSettingsPanel.tsx`
- Modify: `src/popup/App.tsx:150-195`

- [ ] **Step 1: Create SyncSettingsPanel component**

```typescript
// src/popup/components/SyncSettingsPanel.tsx

import { useState, useEffect } from 'react'
import { getSyncStatus, enableSync, disableSync, manualSync } from '../../lib/sync/sync-manager'
import type { SyncStatus } from '../../lib/sync/sync-manager'
import { Button } from './ui/button'

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function SyncSettingsPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    const currentStatus = await getSyncStatus()
    setStatus(currentStatus)
  }

  const handleEnable = async () => {
    setLoading(true)
    setError(null)
    const result = await enableSync()
    setLoading(false)
    
    if (result.success) {
      await loadStatus()
    } else {
      setError(result.error || '启用失败')
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    await disableSync()
    setLoading(false)
    await loadStatus()
  }

  const handleManualSync = async () => {
    setLoading(true)
    setError(null)
    const result = await manualSync()
    setLoading(false)
    
    if (result.success) {
      await loadStatus()
    } else {
      setError(result.error || '同步失败')
    }
  }

  if (!status) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="p-4 border-b">
      <h3 className="text-sm font-medium mb-3">本地备份同步</h3>
      
      <div className="space-y-3">
        {status.enabled ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm">状态</span>
              <span className="text-sm text-green-600">已启用</span>
            </div>
            
            {status.folderName && (
              <div className="flex items-center justify-between">
                <span className="text-sm">备份文件夹</span>
                <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                  {status.folderName}
                </span>
              </div>
            )}
            
            {status.lastSyncTime && (
              <div className="flex items-center justify-between">
                <span className="text-sm">最后同步</span>
                <span className="text-sm text-muted-foreground">
                  {formatTimestamp(status.lastSyncTime)}
                </span>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSync}
                disabled={loading}
              >
                立即同步
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisable}
                disabled={loading}
              >
                禁用
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              启用自动备份到本地文件夹，数据变更时自动同步。
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnable}
              disabled={loading}
            >
              选择文件夹并启用
            </Button>
          </>
        )}
        
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        
        <p className="text-xs text-muted-foreground">
          提示：扩展卸载后数据仍可从此文件夹恢复
        </p>
      </div>
    </div>
  )
}

export default SyncSettingsPanel
```

- [ ] **Step 2: Add to App.tsx**

```typescript
// src/popup/App.tsx - add import and component

import SyncSettingsPanel from './components/SyncSettingsPanel'

// In the JSX, after Header component:
return (
  <div className="w-full h-full flex flex-col bg-white overflow-hidden">
    <Header onImport={handleImport} onExport={handleExport} onRefresh={handleRefresh} />
    <SyncSettingsPanel />  {/* Add here */}
    <div className="flex flex-1 overflow-hidden min-h-0">
      ...
    </div>
    ...
  </div>
)
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/popup/components/SyncSettingsPanel.tsx src/popup/App.tsx
git commit -m "feat(ui): add sync settings panel to popup"
```

---

### Task 11: Add Manifest Permissions for File System

**Files:**
- Modify: `manifest.json:34`

- [ ] **Step 1: Add fileSystem permission**

```json
{
  "manifest_version": 3,
  "name": "Oh My Prompt Script",
  "version": "1.1.0",
  ...
  "permissions": [
    "activeTab",
    "downloads",
    "storage",
    "tabs",
    "fileSystem.write"  // Add this for local folder sync
  ],
  ...
}
```

- [ ] **Step 2: Verify manifest is valid**

Run: `npm run build`
Expected: Build succeeds with no manifest errors

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore(manifest): add fileSystem.write permission for sync"
```

---

### Task 12: Integration Test - Migration from Legacy

**Files:**
- Manual testing

- [ ] **Step 1: Create test legacy data in storage**

Open Chrome DevTools → Application → Storage → Local Storage → extension origin

Add key `prompt_script_data` with legacy format:
```json
{
  "prompts": [{"id":"test1","name":"Test Prompt","content":"test content","categoryId":"cat-quality","order":0}],
  "categories": [{"id":"cat-quality","name":"质量与细节","order":1}],
  "version": "1.0.0"
}
```

- [ ] **Step 2: Reload extension**

Go to `chrome://extensions` → reload extension → open popup

- [ ] **Step 3: Verify migration**

Check storage again - should now have:
```json
{
  "version": "1.1.0",
  "userData": {
    "prompts": [{"id":"test1",...}],
    "categories": [{"id":"cat-quality",...}]
  },
  "settings": {
    "showBuiltin": true,
    "syncEnabled": false
  },
  "_migrationComplete": true
}
```

- [ ] **Step 4: Verify user data preserved**

Confirm popup shows "Test Prompt" in "质量与细节" category

- [ ] **Step 5: Commit test documentation**

```bash
git add docs/superpowers/specs/2026-04-20-version-upgrade-compatibility-design.md
git commit -m "docs: mark migration integration test as validated"
```

---

## Self-Review Checklist

**1. Spec Coverage:**
- ✅ Section I (Data Classification): Task 1 types, Task 4 storage logic
- ✅ Section II (Data Structure): Task 1 StorageSchema
- ✅ Section III (Initialization): Task 4 initializeStorage()
- ✅ Section IV (Migration): Tasks 3, 4, 6
- ✅ Section V (Local Sync): Tasks 7, 8, 9
- ✅ Section VI (Exception Handling): Task 9 sync-manager error handling
- ✅ Section VII (Settings UI): Task 10
- ✅ Section VIII (File Structure): All tasks match spec
- ✅ Section IX (Priority): P0 tasks 1-6, P1 tasks 7-11, P2 handled in sync-manager

**2. Placeholder Scan:**
- ✅ No "TBD", "TODO", "implement later"
- ✅ All code blocks contain actual implementation
- ✅ All steps have exact commands with expected output

**3. Type Consistency:**
- ✅ `StorageSchema` defined in Task 1, used consistently in all tasks
- ✅ `UserData` interface defined and used
- ✅ `SyncSettings` interface defined and used
- ✅ `triggerSync(userData: UserData)` signature matches call in store.ts

---

Plan complete and saved to `docs/superpowers/plans/2026-04-20-version-upgrade-compatibility.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?