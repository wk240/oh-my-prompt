# Restore Folder Backup Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two-step restore confirmation flow with merge/replace options when user selects a folder containing existing backup data.

**Architecture:** 
- Phase 1: Core merge logic (`merge-data.ts`) + extend `restoreFromBackup()` with merge mode
- Phase 2: Two Modal components (`RestoreDecisionModal`, `MergeConflictModal`) 
- Phase 3: Integrate into `BackupSection.tsx` with state management

**Tech Stack:** TypeScript, React, Zustand, Chrome Extension APIs, Vitest for unit tests

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/extension/src/lib/sync/merge-data.ts` | Create | Merge logic (by ID + updatedAt) |
| `packages/extension/src/lib/sync/sync-manager.ts` | Modify | Extend `restoreFromBackup()` with merge mode |
| `packages/extension/src/sidepanel/settings/RestoreDecisionModal.tsx` | Create | Step 1: Restore decision dialog |
| `packages/extension/src/sidepanel/settings/MergeConflictModal.tsx` | Create | Step 2: Merge/replace selection dialog |
| `packages/extension/src/sidepanel/settings/BackupSection.tsx` | Modify | Add state management and callback handlers |
| `packages/extension/src/lib/sync/__tests__/merge-data.test.ts` | Create | Unit tests for merge logic |

---

## Task 1: Create Merge Logic

**Files:**
- Create: `packages/extension/src/lib/sync/merge-data.ts`
- Create: `packages/extension/src/lib/sync/__tests__/merge-data.test.ts`

### Step 1: Write the failing test

```typescript
// packages/extension/src/lib/sync/__tests__/merge-data.test.ts
import { describe, it, expect } from 'vitest'
import { mergePromptData, mergeById } from '../merge-data'
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

describe('mergeById', () => {
  it('should add new items from backup', () => {
    const current = [{ id: '1', updatedAt: '2024-01-01' }]
    const backup = [{ id: '2', updatedAt: '2024-01-02' }]
    const result = mergeById(current, backup)
    expect(result.length).toBe(2)
    expect(result.find(i => i.id === '2')).toBeDefined()
  })

  it('should keep newer version when same ID', () => {
    const current = [{ id: '1', updatedAt: '2024-01-01' }]
    const backup = [{ id: '1', updatedAt: '2024-01-02' }]
    const result = mergeById(current, backup)
    expect(result.length).toBe(1)
    expect(result[0].updatedAt).toBe('2024-01-02')
  })

  it('should keep current version when current is newer', () => {
    const current = [{ id: '1', updatedAt: '2024-01-03' }]
    const backup = [{ id: '1', updatedAt: '2024-01-01' }]
    const result = mergeById(current, backup)
    expect(result.length).toBe(1)
    expect(result[0].updatedAt).toBe('2024-01-03')
  })

  it('should keep current when both have no updatedAt', () => {
    const current = [{ id: '1' }] as any
    const backup = [{ id: '1' }] as any
    const result = mergeById(current, backup)
    expect(result.length).toBe(1)
    // Current wins when no timestamps
    expect(result[0]).toEqual(current[0])
  })

  it('should prefer backup when backup has updatedAt but current does not', () => {
    const current = [{ id: '1' }] as any
    const backup = [{ id: '1', updatedAt: '2024-01-01' }]
    const result = mergeById(current, backup)
    expect(result[0].updatedAt).toBe('2024-01-01')
  })
})

describe('mergePromptData', () => {
  const createPrompt = (id: string, updatedAt: string, categoryId: string): Prompt => ({
    id,
    title: `Prompt ${id}`,
    content: `Content ${id}`,
    categoryId,
    createdAt: '2024-01-01',
    updatedAt,
    order: 0
  })

  const createCategory = (id: string, updatedAt: string): Category => ({
    id,
    name: `Category ${id}`,
    createdAt: '2024-01-01',
    updatedAt,
    order: 0
  })

  it('should count added prompts correctly', () => {
    const currentPrompts = [createPrompt('1', '2024-01-01', 'cat1')]
    const backupPrompts = [createPrompt('2', '2024-01-02', 'cat1')]
    const result = mergePromptData(currentPrompts, backupPrompts, [], [])
    expect(result.addedPrompts).toBe(1)
    expect(result.prompts.length).toBe(2)
  })

  it('should count updated prompts correctly', () => {
    const currentPrompts = [createPrompt('1', '2024-01-01', 'cat1')]
    const backupPrompts = [createPrompt('1', '2024-01-02', 'cat1')]
    const result = mergePromptData(currentPrompts, backupPrompts, [], [])
    expect(result.updatedPrompts).toBe(1)
    expect(result.prompts.length).toBe(1)
    expect(result.prompts[0].updatedAt).toBe('2024-01-02')
  })

  it('should count added categories correctly', () => {
    const currentCategories = [createCategory('cat1', '2024-01-01')]
    const backupCategories = [createCategory('cat2', '2024-01-02')]
    const result = mergePromptData([], [], currentCategories, backupCategories)
    expect(result.addedCategories).toBe(1)
    expect(result.categories.length).toBe(2)
  })

  it('should handle empty inputs', () => {
    const result = mergePromptData([], [], [], [])
    expect(result.prompts.length).toBe(0)
    expect(result.categories.length).toBe(0)
    expect(result.addedPrompts).toBe(0)
    expect(result.updatedPrompts).toBe(0)
    expect(result.addedCategories).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- packages/extension/src/lib/sync/__tests__/merge-data.test.ts`
Expected: FAIL with "mergeById is not defined" or similar

### Step 3: Write minimal implementation

```typescript
// packages/extension/src/lib/sync/merge-data.ts
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

interface MergeableItem {
  id: string
  updatedAt?: string
}

/**
 * 按 ID 合并两个列表，保留 updatedAt 最新的版本
 */
export function mergeById<T extends MergeableItem>(currentList: T[], backupList: T[]): T[] {
  const map = new Map<string, T>()

  // 先添加当前数据
  currentList.forEach(item => map.set(item.id, item))

  // 合并备份数据
  backupList.forEach(backupItem => {
    const currentItem = map.get(backupItem.id)
    if (!currentItem) {
      // 新数据，直接添加
      map.set(backupItem.id, backupItem)
    } else if (backupItem.updatedAt && currentItem.updatedAt) {
      // 都有 updatedAt，比较时间
      if (new Date(backupItem.updatedAt) > new Date(currentItem.updatedAt)) {
        map.set(backupItem.id, backupItem)
      }
    } else if (backupItem.updatedAt && !currentItem.updatedAt) {
      // 备份有 updatedAt，当前没有，优先备份
      map.set(backupItem.id, backupItem)
    }
    // else: 当前版本更新或无时间戳，保留当前
  })

  return Array.from(map.values())
}

/**
 * 合并提示词和分类数据
 */
export function mergePromptData(
  currentPrompts: Prompt[],
  backupPrompts: Prompt[],
  currentCategories: Category[],
  backupCategories: Category[]
): {
  prompts: Prompt[]
  categories: Category[]
  addedPrompts: number
  updatedPrompts: number
  addedCategories: number
} {
  const mergedPrompts = mergeById(currentPrompts, backupPrompts)
  const mergedCategories = mergeById(currentCategories, backupCategories)

  // 统计新增和更新数量
  const currentPromptIds = new Set(currentPrompts.map(p => p.id))
  const addedPrompts = mergedPrompts.filter(p => !currentPromptIds.has(p.id)).length
  const updatedPrompts = mergedPrompts.length - currentPrompts.length - addedPrompts

  const currentCategoryIds = new Set(currentCategories.map(c => c.id))
  const addedCategories = mergedCategories.filter(c => !currentCategoryIds.has(c.id)).length

  return {
    prompts: mergedPrompts,
    categories: mergedCategories,
    addedPrompts,
    updatedPrompts: Math.max(0, updatedPrompts), // 确保不为负
    addedCategories,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- packages/extension/src/lib/sync/__tests__/merge-data.test.ts`
Expected: PASS all tests

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/merge-data.ts packages/extension/src/lib/sync/__tests__/merge-data.test.ts
git commit -m "feat: add merge-data logic for combining prompts/categories by updatedAt"
```

---

## Task 2: Extend restoreFromBackup with merge mode

**Files:**
- Modify: `packages/extension/src/lib/sync/sync-manager.ts:667-739`

### Step 1: Read current restoreFromBackup implementation

Current implementation is at lines 667-739 in sync-manager.ts. Key signature:
```typescript
export async function restoreFromBackup(
  filename: string,
  backupFirst: boolean = true
): Promise<{ success: boolean; error?: string }>
```

- [ ] **Step 2: Extend signature and add merge mode**

Find the `restoreFromBackup` function (line 667) and replace with:

```typescript
/**
 * Restore data from specific backup version (including temporary prompts)
 * Uses offscreen document for file operations
 * 
 * @param filename - Backup file name
 * @param backupFirst - Whether to backup current data before restoring (default: true)
 * @param mode - 'replace' to overwrite, 'merge' to combine by updatedAt (default: 'replace')
 */
export async function restoreFromBackup(
  filename: string,
  backupFirst: boolean = true,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{
  success: boolean
  error?: string
  addedCount?: number
  updatedCount?: number
  addedCategories?: number
}> {
  try {
    await ensureOffscreenDocument()

    // Read backup file via offscreen (includes temporaryPrompts)
    const readResult = await sendToOffscreen<FullBackupData>(MessageType.OFFSCREEN_READ_BACKUP, { filename })
    if (!readResult.success || !readResult.data) {
      return { success: false, error: readResult.error || '备份文件无效或已损坏' }
    }

    const backupData = readResult.data

    // Optionally backup current data before restoring
    if (backupFirst) {
      const storageManager = StorageManager.getInstance()
      const currentData = await storageManager.getData()
      const version = chrome.runtime.getManifest().version
      const currentBackupData: FullBackupData = {
        prompts: currentData.userData.prompts,
        categories: currentData.userData.categories,
        temporaryPrompts: currentData.temporaryPrompts || []
      }
      await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData: currentBackupData, version })
    }

    const storageManager = StorageManager.getInstance()

    if (mode === 'merge') {
      // Get current data for merge
      const currentData = await storageManager.getData()
      
      // Merge using merge-data logic
      const { mergePromptData } = await import('./merge-data')
      const merged = mergePromptData(
        currentData.userData.prompts,
        backupData.prompts,
        currentData.userData.categories,
        backupData.categories
      )

      // Save merged data
      await storageManager.updateUserData({
        prompts: merged.prompts,
        categories: merged.categories
      })

      // Handle temporary prompts: keep current + add new from backup (by ID)
      const currentTempIds = new Set(currentData.temporaryPrompts?.map(p => p.id) || [])
      const mergedTemporaryPrompts = [
        ...(currentData.temporaryPrompts || []),
        ...(backupData.temporaryPrompts?.filter(p => !currentTempIds.has(p.id)) || [])
      ]
      if (mergedTemporaryPrompts.length > 0) {
        await storageManager.updateTemporaryPrompts(mergedTemporaryPrompts)
      }

      await storageManager.updateSettings({ lastSyncTime: Date.now() })

      // Sync merged data to latest backup file
      const version = chrome.runtime.getManifest().version
      const mergedBackupData: FullBackupData = {
        prompts: merged.prompts,
        categories: merged.categories,
        temporaryPrompts: mergedTemporaryPrompts
      }
      await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData: mergedBackupData, version })

      return {
        success: true,
        addedCount: merged.addedPrompts,
        updatedCount: merged.updatedPrompts,
        addedCategories: merged.addedCategories
      }
    }

    // mode === 'replace': original behavior
    // Restore backup data (including temporary prompts)
    await storageManager.updateUserData({
      prompts: backupData.prompts,
      categories: backupData.categories
    })
    // Restore temporary prompts
    if (backupData.temporaryPrompts) {
      await storageManager.updateTemporaryPrompts(backupData.temporaryPrompts)
    }
    await storageManager.updateSettings({ lastSyncTime: Date.now() })

    // Sync restored data to latest backup file (omps-latest.json)
    const version = chrome.runtime.getManifest().version
    await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })

    // Restore API config from backup folder (overwrite existing)
    try {
      const apiResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_API_CONFIG)
      if (apiResult.success && apiResult.data) {
        await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: apiResult.data })
        console.log('[Oh My Prompt] API config restored from backup')
      }
    } catch (apiRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore API config from backup:', apiRestoreError)
    }

    // Restore ProviderConfigs from backup folder (overwrite existing)
    try {
      const providerResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_PROVIDER_CONFIGS)
      if (providerResult.success && providerResult.data) {
        await chrome.storage.local.set({ [PROVIDER_CONFIGS_STORAGE_KEY]: providerResult.data })
        console.log('[Oh My Prompt] Provider configs restored from backup')
      }
    } catch (providerRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore provider configs from backup:', providerRestoreError)
    }

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Restore failed:', error)
    return { success: false, error: '恢复失败，请检查文件权限' }
  }
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/lib/sync/sync-manager.ts
git commit -m "feat: extend restoreFromBackup with merge mode support"
```

---

## Task 3: Create RestoreDecisionModal Component

**Files:**
- Create: `packages/extension/src/sidepanel/settings/RestoreDecisionModal.tsx`

### Step 1: Create the modal component

Reference: `HistoryModal.tsx` for Dialog structure pattern.

```typescript
// packages/extension/src/sidepanel/settings/RestoreDecisionModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import { Button } from '@/popup/components/ui/button'
import { AlertTriangle, RotateCcw, FolderOpen } from 'lucide-react'
import type { ExistingBackupInfo } from '@/lib/sync/sync-manager'

interface RestoreDecisionModalProps {
  open: boolean
  onClose: () => void
  onRestore: () => void
  onContinue: () => void
  onReselect: () => void
  existingBackup: ExistingBackupInfo
}

/**
 * Format backup time to readable string
 */
function formatBackupTime(isoTime: string | undefined): string {
  if (!isoTime) return '未知时间'
  const date = new Date(isoTime)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * RestoreDecisionModal - Step 1: Ask user how to handle existing backup
 *
 * Shows when user selects a folder that already contains backup data.
 * User can: restore backup, continue using (current data wins), or reselect folder.
 */
export function RestoreDecisionModal({
  open,
  onClose,
  onRestore,
  onContinue,
  onReselect,
  existingBackup
}: RestoreDecisionModalProps) {
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            此文件夹已有备份数据
          </DialogTitle>
          <DialogDescription>
            请选择如何处理已有的备份数据
          </DialogDescription>
        </DialogHeader>

        {/* Backup info */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-sm text-blue-900 mb-2">
            检测到 <span className="font-semibold">{existingBackup.promptCount || 0}</span> 条提示词
            和 <span className="font-semibold">{existingBackup.categoryCount || 0}</span> 个分类
          </div>
          {existingBackup.temporaryPromptCount && existingBackup.temporaryPromptCount > 0 && (
            <div className="text-sm text-blue-700 mb-2">
              以及 <span className="font-semibold">{existingBackup.temporaryPromptCount}</span> 条临时提示词
            </div>
          )}
          <div className="text-xs text-blue-600">
            备份时间：{formatBackupTime(existingBackup.backupTime)}
          </div>
        </div>

        {/* Warning for continue option */}
        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="text-xs text-yellow-800">
            ⚠️ 选择"继续使用此文件夹"后，当前数据会覆盖文件夹中的备份数据
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={onRestore}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="w-4 h-4" />
            恢复备份数据
          </Button>
          <Button
            variant="outline"
            onClick={onContinue}
            className="w-full sm:w-auto"
          >
            继续使用此文件夹
          </Button>
          <Button
            variant="ghost"
            onClick={onReselect}
            className="w-full sm:w-auto text-gray-600"
          >
            <FolderOpen className="w-4 h-4" />
            重新选择文件夹
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/sidepanel/settings/RestoreDecisionModal.tsx
git commit -m "feat: add RestoreDecisionModal for folder backup restore decision"
```

---

## Task 4: Create MergeConflictModal Component

**Files:**
- Create: `packages/extension/src/sidepanel/settings/MergeConflictModal.tsx`

### Step 1: Create the modal component

```typescript
// packages/extension/src/sidepanel/settings/MergeConflictModal.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import { Button } from '@/popup/components/ui/button'
import { Merge, Replace, CheckCircle, AlertTriangle } from 'lucide-react'

interface MergeConflictModalProps {
  open: boolean
  onClose: () => void
  currentData: { promptCount: number; categoryCount: number }
  backupData: { promptCount: number; categoryCount: number; backupTime: string }
  onMerge: () => Promise<MergeResult>
  onReplace: () => Promise<{ success: boolean; error?: string }>
}

export interface MergeResult {
  success: boolean
  addedCount: number
  updatedCount: number
  addedCategories: number
  error?: string
}

/**
 * Format backup time to readable string
 */
function formatBackupTime(isoTime: string): string {
  if (!isoTime) return '未知时间'
  const date = new Date(isoTime)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * MergeConflictModal - Step 2: Choose merge or replace when data conflict exists
 *
 * Shows when user wants to restore backup but current storage also has data.
 * Provides two options: merge (keep both, newer wins) or replace (backup overwrites).
 * After successful merge, shows result summary.
 */
export function MergeConflictModal({
  open,
  onClose,
  currentData,
  backupData,
  onMerge,
  onReplace
}: MergeConflictModalProps) {
  const [processing, setProcessing] = useState(false)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !processing) {
      // Reset state on close
      setMergeResult(null)
      setShowResult(false)
      setError(null)
      onClose()
    }
  }

  const handleMerge = async () => {
    setProcessing(true)
    setError(null)

    try {
      const result = await onMerge()
      if (result.success) {
        setMergeResult(result)
        setShowResult(true)
      } else {
        setError(result.error || '合并失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Merge failed:', err)
      setError('合并失败，请重试')
    } finally {
      setProcessing(false)
    }
  }

  const handleReplace = async () => {
    setProcessing(true)
    setError(null)

    try {
      const result = await onReplace()
      if (result.success) {
        // Close modal on successful replace
        handleOpenChange(false)
      } else {
        setError(result.error || '替换失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Replace failed:', err)
      setError('替换失败，请重试')
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmResult = () => {
    handleOpenChange(false)
  }

  // Show result summary after successful merge
  if (showResult && mergeResult) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              合并完成
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-sm text-green-900 space-y-2">
              {mergeResult.addedCount > 0 && (
                <div>✅ 新增 <span className="font-semibold">{mergeResult.addedCount}</span> 条提示词</div>
              )}
              {mergeResult.addedCategories > 0 && (
                <div>✅ 新增 <span className="font-semibold">{mergeResult.addedCategories}</span> 个分类</div>
              )}
              {mergeResult.updatedCount > 0 && (
                <div>✅ 更新 <span className="font-semibold">{mergeResult.updatedCount}</span> 条提示词（保留最新修改）</div>
              )}
              {mergeResult.addedCount === 0 && mergeResult.updatedCount === 0 && mergeResult.addedCategories === 0 && (
                <div>✅ 数据已同步，无新增或更新</div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleConfirmResult} disabled={processing}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Show conflict selection UI
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            数据冲突处理
          </DialogTitle>
          <DialogDescription>
            当前数据和备份数据都存在，请选择恢复方式
          </DialogDescription>
        </DialogHeader>

        {/* Data comparison */}
        <div className="space-y-2">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-1">当前数据</div>
            <div className="text-sm text-gray-900">
              {currentData.promptCount} 条提示词，{currentData.categoryCount} 个分类
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs text-blue-600 mb-1">备份数据</div>
            <div className="text-sm text-blue-900">
              {backupData.promptCount} 条提示词，{backupData.categoryCount} 个分类
            </div>
            <div className="text-xs text-blue-600 mt-1">
              备份时间：{formatBackupTime(backupData.backupTime)}
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="text-xs text-yellow-800 space-y-1">
            <div><span className="font-medium">合并数据：</span>保留双方数据，相同ID保留最新版本</div>
            <div><span className="font-medium">替换数据：</span>用备份数据完全替换当前数据</div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <span className="text-sm text-red-800">{error}</span>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleMerge}
            disabled={processing}
            className="w-full sm:w-auto"
          >
            <Merge className="w-4 h-4" />
            {processing ? '处理中...' : '合并数据（推荐）'}
          </Button>
          <Button
            variant="destructive"
            onClick={handleReplace}
            disabled={processing}
            className="w-full sm:w-auto"
          >
            <Replace className="w-4 h-4" />
            {processing ? '处理中...' : '替换数据'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/sidepanel/settings/MergeConflictModal.tsx
git commit -m "feat: add MergeConflictModal for merge/replace conflict resolution"
```

---

## Task 5: Integrate into BackupSection

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/BackupSection.tsx`

### Step 1: Add imports at top of file

Add after existing imports (around line 14):

```typescript
import { RestoreDecisionModal } from './RestoreDecisionModal'
import { MergeConflictModal, MergeResult } from './MergeConflictModal'
import { BACKUP_FILE_NAME } from '@oh-my-prompt/shared/constants'
```

### Step 2: Add new state variables

Add after existing state declarations (around line 68, after `historyError`):

```typescript
  // Restore decision modal state (Step 1)
  const [decisionModalOpen, setDecisionModalOpen] = useState(false)
  const [existingBackup, setExistingBackup] = useState<ExistingBackupInfo | null>(null)

  // Merge conflict modal state (Step 2)
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const [currentDataInfo, setCurrentDataInfo] = useState<{ promptCount: number; categoryCount: number } | null>(null)
  const [backupDataInfo, setBackupDataInfo] = useState<{ promptCount: number; categoryCount: number; backupTime: string } | null>(null)
```

### Step 3: Add getCurrentDataInfo helper function

Add after `loadBackupVersions` function (around line 260):

```typescript
  /**
   * Get current data info for conflict detection
   */
  const getCurrentDataInfo = async (): Promise<{ promptCount: number; categoryCount: number }> => {
    const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE_DATA })
    if (response?.success && response.data) {
      const userData = response.data.userData
      return {
        promptCount: userData?.prompts?.length || 0,
        categoryCount: userData?.categories?.length || 0,
      }
    }
    return { promptCount: 0, categoryCount: 0 }
  }
```

### Step 4: Modify handleEnableFolder function

Replace existing `handleEnableFolder` (lines 220-238) with:

```typescript
  /**
   * Handle enable local backup (select folder)
   */
  const handleEnableFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await enableSync()
      if (result.success) {
        if (result.existingBackup?.hasBackup) {
          // 有备份数据，打开第一步对话框
          setExistingBackup(result.existingBackup)
          setDecisionModalOpen(true)
        } else {
          setSuccess('备份已启用')
        }
        await loadBackupStatus()
      } else {
        setError(result.error || '选择文件夹失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Enable sync failed:', err)
      setError('选择文件夹失败')
    } finally {
      setLoading(false)
    }
  }
```

### Step 5: Modify handleChangeFolder function

Replace existing `handleChangeFolder` (lines 196-215) with:

```typescript
  /**
   * Handle change backup folder
   */
  const handleChangeFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await changeSyncFolder()
      if (result.success) {
        if (result.existingBackup?.hasBackup) {
          // 有备份数据，打开第一步对话框
          setExistingBackup(result.existingBackup)
          setDecisionModalOpen(true)
        } else {
          setSuccess('文件夹已更换')
        }
        await loadBackupStatus()
      } else {
        setError(result.error || '更换文件夹失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Change folder failed:', err)
      setError('更换文件夹失败')
    } finally {
      setLoading(false)
    }
  }
```

### Step 6: Add decision modal callback functions

Add after `handleEmergencyExport` function (around line 376):

```typescript
  /**
   * Handle decision modal restore action
   */
  const handleDecisionRestore = async () => {
    // 获取当前数据信息
    const currentInfo = await getCurrentDataInfo()

    // 检测是否存在冲突（当前有数据）
    if (currentInfo.promptCount > 0 || currentInfo.categoryCount > 0) {
      // 有冲突，打开第二步对话框
      setCurrentDataInfo(currentInfo)
      setBackupDataInfo({
        promptCount: existingBackup!.promptCount || 0,
        categoryCount: existingBackup!.categoryCount || 0,
        backupTime: existingBackup!.backupTime || '',
      })
      setDecisionModalOpen(false)
      setConflictModalOpen(true)
    } else {
      // 无冲突，直接恢复
      setLoading(true)
      try {
        const result = await restoreFromBackup(BACKUP_FILE_NAME, false, 'replace')
        if (result.success) {
          setDecisionModalOpen(false)
          setExistingBackup(null)
          setSuccess('数据已恢复')
          await loadBackupStatus()
        } else {
          setError(result.error || '恢复失败')
        }
      } catch (err) {
        console.error('[Oh My Prompt] Restore failed:', err)
        setError('恢复失败')
      } finally {
        setLoading(false)
      }
    }
  }

  /**
   * Handle decision modal continue action
   */
  const handleDecisionContinue = () => {
    setDecisionModalOpen(false)
    setExistingBackup(null)
    setSuccess('备份已启用，当前数据优先')
  }

  /**
   * Handle decision modal reselect action
   */
  const handleDecisionReselect = () => {
    setDecisionModalOpen(false)
    setExistingBackup(null)
    // 不设置 success，允许用户重新选择
  }

  /**
   * Handle merge data action (from conflict modal)
   */
  const handleMergeData = async (): Promise<MergeResult> => {
    const result = await restoreFromBackup(BACKUP_FILE_NAME, false, 'merge')
    if (result.success) {
      setSuccess(`合并完成：新增 ${result.addedCount || 0} 条，更新 ${result.updatedCount || 0} 条`)
      await loadBackupStatus()
    }
    return {
      success: result.success,
      addedCount: result.addedCount || 0,
      updatedCount: result.updatedCount || 0,
      addedCategories: result.addedCategories || 0,
      error: result.error,
    }
  }

  /**
   * Handle replace data action (from conflict modal)
   */
  const handleReplaceData = async (): Promise<{ success: boolean; error?: string }> => {
    const result = await restoreFromBackup(BACKUP_FILE_NAME, false, 'replace')
    if (result.success) {
      setConflictModalOpen(false)
      setSuccess('数据已恢复')
      await loadBackupStatus()
    }
    return result
  }

  /**
   * Handle conflict modal close
   */
  const handleConflictClose = () => {
    setConflictModalOpen(false)
    setCurrentDataInfo(null)
    setBackupDataInfo(null)
    setExistingBackup(null)
  }
```

### Step 7: Add Modal components to JSX

Add after `HistoryModal` component in JSX (around line 493, before closing div):

```typescript
      {/* Restore Decision Modal - Step 1 */}
      <RestoreDecisionModal
        open={decisionModalOpen}
        onClose={() => {
          setDecisionModalOpen(false)
          setExistingBackup(null)
        }}
        onRestore={handleDecisionRestore}
        onContinue={handleDecisionContinue}
        onReselect={handleDecisionReselect}
        existingBackup={existingBackup!}
      />

      {/* Merge Conflict Modal - Step 2 */}
      <MergeConflictModal
        open={conflictModalOpen}
        onClose={handleConflictClose}
        currentData={currentDataInfo!}
        backupData={backupDataInfo!}
        onMerge={handleMergeData}
        onReplace={handleReplaceData}
      />
```

### Step 8: Add ExistingBackupInfo import

Add to imports at top (around line 12, after `changeSyncFolder`):

```typescript
import { changeSyncFolder, enableSync, getBackupVersions, restoreFromBackup } from '@/lib/sync/sync-manager'
import type { ExistingBackupInfo } from '@/lib/sync/sync-manager'
```

- [ ] **Step 9: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Run dev server to test**

Run: `npm run dev`
Expected: Extension builds successfully

Manual test:
1. Load extension in Chrome
2. Open sidepanel → Settings → Backup
3. Select a folder with existing backup data
4. Verify RestoreDecisionModal appears
5. Click "恢复备份数据" → verify MergeConflictModal appears if conflict
6. Test merge and replace options

- [ ] **Step 11: Commit**

```bash
git add packages/extension/src/sidepanel/settings/BackupSection.tsx
git commit -m "feat: integrate restore decision and conflict modals into BackupSection"
```

---

## Task 6: Final Integration Test

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 3: Manual E2E test**

Test scenarios:
1. **No backup in folder**: Select empty folder → shows "备份已启用"
2. **Backup exists, no current data**: Select folder with backup → RestoreDecisionModal → "恢复" → direct restore
3. **Backup exists, current data exists**: Select folder with backup → RestoreDecisionModal → "恢复" → MergeConflictModal → merge/replace
4. **Continue using**: RestoreDecisionModal → "继续使用" → backup enabled, current data preserved
5. **Reselect**: RestoreDecisionModal → "重新选择" → modal closes, can select again

- [ ] **Step 4: Final commit (if all tests pass)**

```bash
git add -A
git commit -m "feat: complete folder backup restore confirmation with merge/replace options"
```

---

## Self-Review Checklist

After completing all tasks, verify:

1. **Spec coverage:**
   - ✅ RestoreDecisionModal: 三个选项（恢复/继续/重新选择）
   - ✅ MergeConflictModal: 合并/替换选择 + 结果摘要
   - ✅ mergePromptData: 按 ID + updatedAt 合并
   - ✅ restoreFromBackup: 支持 merge 模式
   - ✅ BackupSection: 状态管理 + 回调函数

2. **Placeholder scan:** No TBD/TODO found, all code is complete

3. **Type consistency:**
   - `ExistingBackupInfo` used consistently
   - `MergeResult` interface matches return values
   - `restoreFromBackup` signature extended correctly