# 云端同步重构：iCloud 风格透明备份系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将备份系统重构为完全透明的 iCloud 风格，用户只需看到"云端/本地是否安全"，无需手动触发或理解复杂状态

**Architecture:** 
1. 状态模型简化：去掉顶层 BackupStatus 抽象，只保留云端和本地两行独立状态
2. 自动重试机制：备份失败时指数退避重试（1s → 5s → 30s → 5min）
3. UI 简化：去掉"立即备份"按钮，状态实时显示（同步中/等待重试/已同步）
4. 双向合并：多设备同步用合并代替覆盖，保留最新版本

**Tech Stack:** Chrome Extension (Manifest V3), React, TypeScript, Supabase (Cloud), File System Access API (Local)

---

## File Structure

### New Files (Create)
- `packages/extension/src/sidepanel/settings/BackupSection.tsx` - 统一备份区块（替代 UnifiedSyncSection）
- `packages/extension/src/sidepanel/settings/BackupStatusRow.tsx` - 状态行组件（云端/本地各一行）
- `packages/extension/src/sidepanel/settings/BackupMoreOptions.tsx` - 折叠的更多选项
- `packages/extension/src/sidepanel/settings/MergePreviewModal.tsx` - 合并预览弹窗
- `packages/extension/src/sidepanel/settings/ConflictResolutionModal.tsx` - 冲突解决弹窗
- `packages/extension/src/sidepanel/settings/EmergencyExport.tsx` - 应急导出功能
- `packages/extension/src/lib/sync/retry-manager.ts` - 自动重试管理器
- `packages/extension/src/lib/sync/__tests__/retry-manager.test.ts` - 重试管理器测试

### Modified Files
- `packages/extension/src/lib/sync/types.ts` - 添加 syncing/retryCount 字段，去掉顶层状态
- `packages/extension/src/lib/sync/orchestrator.ts` - 添加自动重试逻辑
- `packages/extension/src/background/service-worker.ts` - 处理 BACKUP_PROGRESS/BACKUP_RETRY 消息
- `packages/shared/messages.ts` - 添加 BACKUP_PROGRESS / BACKUP_RETRY 消息类型
- `packages/extension/src/sidepanel/views/SettingsView.tsx` - 引用 BackupSection 替代 UnifiedSyncSection

### Deleted Files
- `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx` - 替换为 BackupSection

---

## Phase 1: 核心架构改造（状态模型 + 自动重试）

### Task 1.1: 添加新消息类型

**Files:**
- Modify: `packages/shared/messages.ts`

- [ ] **Step 1: 添加 BACKUP_PROGRESS 和 BACKUP_RETRY 消息类型**

```typescript
// 在 MessageType enum 中添加（约第 95 行后）

  // Backup progress notifications (transparent auto-backup)
  BACKUP_PROGRESS = 'BACKUP_PROGRESS',  // SW → UI: Notify backup in progress
  BACKUP_RETRY = 'BACKUP_RETRY',  // SW → UI: Notify retry attempt (with count)
  BACKUP_COMPLETE = 'BACKUP_COMPLETE',  // SW → UI: Notify backup completed (success or failure)
  EMERGENCY_EXPORT = 'EMERGENCY_EXPORT',  // UI → SW: Export all data when all backups failed
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/messages.ts
git commit -m "feat(sync): add BACKUP_PROGRESS/RETRY message types for transparent auto-backup"
```

---

### Task 1.2: 更新 BackupStatusStorage 类型

**Files:**
- Modify: `packages/extension/src/lib/sync/types.ts`

- [ ] **Step 1: 添加 BackupStatusStorage 接口（替代 UnifiedSyncStatus 的部分字段）**

在 `UnifiedSyncStatus` 接口之前添加：

```typescript
/**
 * Backup status for each backup target (cloud/local).
 * Used for transparent auto-backup - user sees two independent status rows.
 */
export interface BackupTargetStatus {
  enabled: boolean       // 是否启用此备份方式
  loggedIn?: boolean     // 是否已登录（仅云端）
  lastSyncTime: number | null  // 上次成功备份时间戳
  syncing: boolean       // 当前是否正在同步中
  error: string | null   // 失败原因（用于错误提示）
  retryCount: number     // 连续失败次数（用于显示重试状态）
  retryScheduledAt?: number  // 下次重试时间（用于显示倒计时）
  permissionStatus?: 'granted' | 'prompt' | 'denied'  // 权限状态（仅本地）
  folderName?: string    // 文件夹名称（仅本地）
}

/**
 * Combined backup status storage.
 * Stored in chrome.storage.local under 'backupStatus' key.
 */
export interface BackupStatusStorage {
  cloud: BackupTargetStatus
  local: BackupTargetStatus
}
```

- [ ] **Step 2: 更新 UnifiedSyncStatus 添加 syncing/retryCount 字段**

修改 `UnifiedSyncStatus` 接口，添加新字段：

```typescript
export interface UnifiedSyncStatus {
  cloudEnabled: boolean
  cloudLoggedIn: boolean
  lastCloudSyncTime?: number
  cloudError?: string
  cloudSyncing?: boolean  // NEW: 正在同步中
  cloudRetryCount?: number  // NEW: 连续失败次数
  cloudRetryScheduledAt?: number  // NEW: 下次重试时间
  localEnabled: boolean
  lastLocalSyncTime?: number
  localError?: string
  localSyncing?: boolean  // NEW: 正在同步中
  localRetryCount?: number  // NEW: 连续失败次数
  localRetryScheduledAt?: number  // NEW: 下次重试时间
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/lib/sync/types.ts
git commit -m "feat(sync): add BackupTargetStatus with syncing/retryCount fields"
```

---

### Task 1.3: 创建 RetryManager 自动重试管理器

**Files:**
- Create: `packages/extension/src/lib/sync/retry-manager.ts`
- Create: `packages/extension/src/lib/sync/__tests__/retry-manager.test.ts`

- [ ] **Step 1: 创建 retry-manager.ts**

```typescript
/**
 * RetryManager - Automatic retry with exponential backoff.
 * 
 * Retry schedule: 1s → 5s → 30s → 5min (max)
 * After 3 consecutive failures, notify user for intervention.
 */

type RetryCallback = () => Promise<{ success: boolean; error?: string }>

interface RetryState {
  retryCount: number
  lastError?: string
  retryScheduledAt?: number
  retryTimer?: ReturnType<typeof setTimeout>
}

const RETRY_SCHEDULE = [1000, 5000, 30000, 300000] // 1s, 5s, 30s, 5min
const MAX_RETRIES = 3

export class RetryManager {
  private state: RetryState = {
    retryCount: 0
  }
  private callback: RetryCallback
  private onProgress?: (state: RetryState) => void
  private onComplete?: (success: boolean) => void

  constructor(
    callback: RetryCallback,
    onProgress?: (state: RetryState) => void,
    onComplete?: (success: boolean) => void
  ) {
    this.callback = callback
    this.onProgress = onProgress
    this.onComplete = onComplete
  }

  /**
   * Execute operation with automatic retry on failure.
   */
  async execute(): Promise<{ success: boolean; retryCount: number }> {
    // Clear any pending retry
    this.clearRetryTimer()

    // Reset retry count for new operation
    this.state.retryCount = 0

    const result = await this.callback()

    if (result.success) {
      this.state.retryCount = 0
      this.state.lastError = undefined
      this.state.retryScheduledAt = undefined
      this.onComplete?.(true)
      return { success: true, retryCount: 0 }
    }

    // Start retry schedule
    this.state.lastError = result.error
    this.scheduleRetry()
    return { success: false, retryCount: this.state.retryCount }
  }

  /**
   * Get current retry state.
   */
  getState(): RetryState {
    return { ...this.state }
  }

  /**
   * Cancel pending retry.
   */
  cancel(): void {
    this.clearRetryTimer()
    this.state.retryScheduledAt = undefined
  }

  /**
   * Reset retry state.
   */
  reset(): void {
    this.clearRetryTimer()
    this.state = { retryCount: 0 }
  }

  private scheduleRetry(): void {
    if (this.state.retryCount >= MAX_RETRIES) {
      // Max retries reached - notify for user intervention
      this.onProgress?.(this.state)
      this.onComplete?.(false)
      return
    }

    this.state.retryCount++
    const delay = RETRY_SCHEDULE[Math.min(this.state.retryCount - 1, RETRY_SCHEDULE.length - 1)]
    this.state.retryScheduledAt = Date.now() + delay

    this.onProgress?.(this.state)

    this.state.retryTimer = setTimeout(() => {
      this.executeRetry()
    }, delay)
  }

  private async executeRetry(): Promise<void> {
    this.state.retryScheduledAt = undefined
    const result = await this.callback()

    if (result.success) {
      this.state.retryCount = 0
      this.state.lastError = undefined
      this.onComplete?.(true)
      return
    }

    this.state.lastError = result.error
    this.scheduleRetry()
  }

  private clearRetryTimer(): void {
    if (this.state.retryTimer) {
      clearTimeout(this.state.retryTimer)
      this.state.retryTimer = undefined
    }
  }
}
```

- [ ] **Step 2: 创建 retry-manager.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetryManager } from '../retry-manager'

describe('RetryManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('should return success immediately on successful operation', async () => {
    const callback = vi.fn().mockResolvedValue({ success: true })
    const manager = new RetryManager(callback)

    const result = await manager.execute()

    expect(result.success).toBe(true)
    expect(result.retryCount).toBe(0)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should retry with 1s delay on first failure', async () => {
    const callback = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'test error' })
      .mockResolvedValueOnce({ success: true })
    
    const manager = new RetryManager(callback)
    const result = await manager.execute()

    expect(result.success).toBe(false)
    expect(result.retryCount).toBe(0) // First retry not yet executed

    // Advance 1s
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should follow exponential backoff schedule', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const onProgress = vi.fn()
    const manager = new RetryManager(callback, onProgress)

    await manager.execute()

    // First retry: 1s
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 1, retryScheduledAt: expect.any(Number) })
    )

    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    // Second retry: 5s
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 2 })
    )

    vi.advanceTimersByTime(5000)
    await vi.runAllTimersAsync()

    // Third retry: 30s
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 3 })
    )

    vi.advanceTimersByTime(30000)
    await vi.runAllTimersAsync()

    // Max retries reached - no more retries
    expect(callback).toHaveBeenCalledTimes(4) // Initial + 3 retries
  })

  it('should stop retrying after MAX_RETRIES and notify failure', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const onComplete = vi.fn()
    const manager = new RetryManager(callback, undefined, onComplete)

    await manager.execute()

    // Run all retries
    vi.advanceTimersByTime(360000) // Run through all delays
    await vi.runAllTimersAsync()

    expect(onComplete).toHaveBeenCalledWith(false)
  })

  it('should reset retry count on success after failures', async () => {
    const callback = vi.fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true })
    
    const manager = new RetryManager(callback)
    await manager.execute()

    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    const state = manager.getState()
    expect(state.retryCount).toBe(0)
    expect(state.lastError).toBeUndefined()
  })

  it('should cancel pending retry', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false })
    const manager = new RetryManager(callback)
    await manager.execute()

    manager.cancel()

    vi.advanceTimersByTime(5000)
    await vi.runAllTimersAsync()

    expect(callback).toHaveBeenCalledTimes(1) // Only initial call, no retry
  })
})
```

- [ ] **Step 3: Run tests to verify**

```bash
npm run test:unit packages/extension/src/lib/sync/__tests__/retry-manager.test.ts
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/lib/sync/retry-manager.ts packages/extension/src/lib/sync/__tests__/retry-manager.test.ts
git commit -m "feat(sync): implement RetryManager with exponential backoff"
```

---

### Task 1.4: 集成 RetryManager 到 SyncOrchestrator

**Files:**
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`

- [ ] **Step 1: 导入 RetryManager 并添加重试管理器实例**

在文件顶部添加导入：

```typescript
import { RetryManager } from './retry-manager'
```

在 SyncOrchestrator 类中添加私有属性：

```typescript
export class SyncOrchestrator {
  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy
  private cloudRetryManager: RetryManager | null = null
  private localRetryManager: RetryManager | null = null
  // ... existing code
```

- [ ] **Step 2: 添加重试回调函数**

在 constructor 后添加私有方法：

```typescript
  /**
   * Create retry callback for cloud sync.
   */
  private createCloudRetryCallback(data: FullBackupData): () => Promise<{ success: boolean; error?: string }> {
    return async () => {
      const result = await this.cloudStrategy.sync(data)
      return {
        success: result.success,
        error: result.error
      }
    }
  }

  /**
   * Create retry callback for local sync.
   */
  private createLocalRetryCallback(data: FullBackupData): () => Promise<{ success: boolean; error?: string }> {
    return async () => {
      const result = await executeLocalSync(data)
      return {
        success: result.success,
        error: result.error
      }
    }
  }
```

- [ ] **Step 3: 添加通知函数**

```typescript
  /**
   * Notify UI about retry progress.
   */
  private notifyRetryProgress(target: 'cloud' | 'local', state: { retryCount: number; retryScheduledAt?: number }): void {
    chrome.runtime.sendMessage({
      type: MessageType.BACKUP_RETRY,
      payload: {
        target,
        retryCount: state.retryCount,
        retryScheduledAt: state.retryScheduledAt
      }
    }).catch(() => { /* UI may not be listening */ })
  }

  /**
   * Notify UI about backup completion.
   */
  private notifyBackupComplete(target: 'cloud' | 'local', success: boolean): void {
    chrome.runtime.sendMessage({
      type: MessageType.BACKUP_COMPLETE,
      payload: {
        target,
        success
      }
    }).catch(() => { /* UI may not be listening */ })
  }
```

- [ ] **Step 4: 修改 triggerSync 添加同步状态**

在 `triggerSync` 方法开头添加同步状态通知：

```typescript
  async triggerSync(data: FullBackupData): Promise<{
    cloudSynced: boolean
    localSynced: boolean
    cloudError?: string
    localError?: string
    syncedAt?: number
    skipped?: boolean
  }> {
    // Notify UI that sync is starting
    chrome.runtime.sendMessage({
      type: MessageType.BACKUP_PROGRESS,
      payload: { cloud: true, local: true }
    }).catch(() => { /* UI may not be listening */ })

    // Update sync status to indicate syncing
    await this.updateSyncStatus({
      cloudSyncing: true,
      localSyncing: true
    })

    const cloudAvailable = await this.cloudStrategy.isAvailable()
    const localAvailable = await this.localStrategy.isAvailable()
    // ... existing code continues
```

在 triggerSync 方法结尾，成功后重置 retryCount：

```typescript
    // On success, reset retry counts
    if (cloudSynced) {
      await this.updateSyncStatus({
        cloudSyncing: false,
        cloudRetryCount: 0,
        cloudError: undefined
      })
    }
    if (localSynced) {
      await this.updateSyncStatus({
        localSyncing: false,
        localRetryCount: 0,
        localError: undefined
      })
    }

    return result
  }
```

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts
git commit -m "feat(sync): integrate RetryManager into SyncOrchestrator with progress notifications"
```

---

## Phase 2: UI 重构（去掉按钮，简化状态）

### Task 2.1: 创建 BackupStatusRow 组件

**Files:**
- Create: `packages/extension/src/sidepanel/settings/BackupStatusRow.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
import { Cloud, HardDrive, RefreshCw, AlertTriangle, Check, Clock, LogIn, FolderOpen } from 'lucide-react'
import type { BackupTargetStatus } from '@/lib/sync/types'

interface BackupStatusRowProps {
  type: 'cloud' | 'local'
  status: BackupTargetStatus | null
  onLogin?: () => void
  onRestorePermission?: () => void
  onClickError?: () => void
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '从未'
  
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
}

function formatRetryWait(scheduledAt: number): string {
  const diff = scheduledAt - Date.now()
  if (diff <= 0) return '即将重试'
  if (diff < 60000) return `${Math.ceil(diff / 1000)} 秒后`
  if (diff < 3600000) return `${Math.ceil(diff / 60000)} 分钟后`
  return `${Math.ceil(diff / 3600000)} 小时后`
}

/**
 * BackupStatusRow - Single status row for cloud or local backup.
 * 
 * Status states:
 * - ✅ 已同步 · 刚刚 — Success, timestamp updated
 * - 🔄 同步中... — Currently syncing
 * - ⏳ 等待重试 (第N次) — Failed, auto-retry scheduled
 * - ⚠️ 未登录 — Need user action (login)
 * - ⚠️ 未配置文件夹 — Need user action (select folder)
 * - 🔴 备份失败 · 点击查看 — Continuous failures, need intervention
 */
export function BackupStatusRow({ type, status, onLogin, onRestorePermission, onClickError }: BackupStatusRowProps) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {type === 'cloud' ? <Cloud className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
        <span>加载中...</span>
      </div>
    )
  }

  const Icon = type === 'cloud' ? Cloud : HardDrive
  const label = type === 'cloud' ? '云端' : '本地'

  // Render status based on state
  const renderStatus = () => {
    // Case 1: Syncing in progress
    if (status.syncing) {
      return (
        <span className="flex items-center gap-1.5 text-blue-600">
          <RefreshCw className="w-4 h-4 animate-spin" />
          同步中...
        </span>
      )
    }

    // Case 2: Auto retry scheduled
    if (status.retryCount > 0 && status.retryScheduledAt) {
      return (
        <span className="flex items-center gap-1.5 text-yellow-600">
          <Clock className="w-4 h-4" />
          等待重试 (第{status.retryCount}次) · {formatRetryWait(status.retryScheduledAt)}
        </span>
      )
    }

    // Case 3: Not enabled/logged in (cloud)
    if (type === 'cloud' && !status.loggedIn) {
      return (
        <button 
          onClick={onLogin}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700"
        >
          <LogIn className="w-4 h-4" />
          未登录 · 点击登录
        </button>
      )
    }

    // Case 4: Not enabled (local)
    if (type === 'local' && !status.enabled) {
      return (
        <span className="flex items-center gap-1.5 text-gray-500">
          <FolderOpen className="w-4 h-4" />
          未配置文件夹
        </span>
      )
    }

    // Case 5: Permission lost (local)
    if (type === 'local' && status.permissionStatus === 'denied') {
      return (
        <button
          onClick={onRestorePermission}
          className="flex items-center gap-1.5 text-red-600 hover:text-red-700"
        >
          <AlertTriangle className="w-4 h-4" />
          权限丢失 · 点击修复
        </button>
      )
    }

    // Case 6: Permission prompt (local) - can be restored silently
    if (type === 'local' && status.permissionStatus === 'prompt') {
      return (
        <button
          onClick={onRestorePermission}
          className="flex items-center gap-1.5 text-yellow-600 hover:text-yellow-700"
        >
          <RefreshCw className="w-4 h-4" />
          恢复权限
        </button>
      )
    }

    // Case 7: Consecutive failures (>3) - need intervention
    if (status.retryCount >= 3 || (status.error && !status.retryScheduledAt)) {
      return (
        <button
          onClick={onClickError}
          className="flex items-center gap-1.5 text-red-600 hover:text-red-700"
        >
          <AlertTriangle className="w-4 h-4" />
          备份失败 · 点击查看
        </button>
      )
    }

    // Case 8: Success - show timestamp
    if (status.lastSyncTime) {
      return (
        <span className="flex items-center gap-1.5 text-green-600">
          <Check className="w-4 h-4" />
          已同步 · {formatRelativeTime(status.lastSyncTime)}
        </span>
      )
    }

    // Default: waiting
    return (
      <span className="text-gray-500">等待同步</span>
    )
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      {renderStatus()}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/settings/BackupStatusRow.tsx
git commit -m "feat(ui): create BackupStatusRow component with transparent status display"
```

---

### Task 2.2: 创建 BackupMoreOptions 组件

**Files:**
- Create: `packages/extension/src/sidepanel/settings/BackupMoreOptions.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
import { useState } from 'react'
import { Download, Upload, History, LogOut, FolderOpen, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import type { BackupStatusStorage } from '@/lib/sync/types'
import { WEB_APP_URL } from '@/lib/config'

interface BackupMoreOptionsProps {
  status: BackupStatusStorage | null
  onLogout?: () => void
  onChangeFolder?: () => void
  onViewHistory?: () => void
  onMergeFromCloud?: () => void
  onViewDiff?: () => void
  onEmergencyExport?: () => void
  loading?: boolean
}

/**
 * BackupMoreOptions - Collapsible section with advanced options.
 * 
 * Features:
 * - Cloud backup: logout, web app link
 * - Local backup: change folder, view history
 * - Multi-device sync: merge from cloud, view diff
 * - Emergency export: when all backups failed
 */
export function BackupMoreOptions({
  status,
  onLogout,
  onChangeFolder,
  onViewHistory,
  onMergeFromCloud,
  onViewDiff,
  onEmergencyExport,
  loading
}: BackupMoreOptionsProps) {
  const [showCloudOptions, setShowCloudOptions] = useState(false)
  const [showLocalOptions, setShowLocalOptions] = useState(false)
  const [showSyncOptions, setShowSyncOptions] = useState(false)

  if (!status) return null

  const bothFailed = (status.cloud.error && status.cloud.retryCount >= 3) &&
                     (status.local.error && status.local.retryCount >= 3)

  return (
    <div className="space-y-3 pt-3">
      {/* Emergency warning when both backups failed */}
      {bothFailed && (
        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">数据安全警告</span>
          </div>
          <p className="text-xs text-red-700 mb-2">
            所有备份方式均已失败。数据仅存在于本地存储，扩展卸载后将丢失。
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onEmergencyExport}
            disabled={loading}
            className="w-full"
          >
            <Download className="w-4 h-4" />
            应急导出所有数据
          </Button>
        </div>
      )}

      {/* Cloud backup options */}
      {status.cloud.loggedIn && (
        <div>
          <button
            onClick={() => setShowCloudOptions(!showCloudOptions)}
            className="w-full flex items-center justify-between py-2 text-sm text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-2">
              ☁️ 云端备份
            </span>
            {showCloudOptions ? '▼' : '▶'}
          </button>
          
          {showCloudOptions && (
            <div className="pl-4 space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">状态</span>
                <span className="text-green-600">已登录</span>
              </div>
              
              <div className="flex gap-2">
                <a
                  href={`${WEB_APP_URL}/backup`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  进入Web端管理
                </a>
              </div>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={onLogout}
                disabled={loading}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="w-3.5 h-3.5" />
                退出登录
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Local backup options */}
      {status.local.enabled && (
        <div>
          <button
            onClick={() => setShowLocalOptions(!showLocalOptions)}
            className="w-full flex items-center justify-between py-2 text-sm text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-2">
              💾 本地备份
            </span>
            {showLocalOptions ? '▼' : '▶'}
          </button>
          
          {showLocalOptions && (
            <div className="pl-4 space-y-2 pt-2">
              {status.local.folderName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">文件夹</span>
                  <span className="text-gray-500 truncate max-w-[120px]" title={status.local.folderName}>
                    {status.local.folderName}
                  </span>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onChangeFolder}
                  disabled={loading}
                >
                  <FolderOpen className="w-4 h-4" />
                  更换文件夹
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewHistory}
                  disabled={loading}
                >
                  <History className="w-4 h-4" />
                  查看历史
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Multi-device sync options */}
      {status.cloud.loggedIn && (
        <div>
          <button
            onClick={() => setShowSyncOptions(!showSyncOptions)}
            className="w-full flex items-center justify-between py-2 text-sm text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-2">
              🔄 多设备同步
            </span>
            {showSyncOptions ? '▼' : '▶'}
          </button>
          
          {showSyncOptions && (
            <div className="pl-4 space-y-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onMergeFromCloud}
                disabled={loading}
                className="w-full"
              >
                <Download className="w-4 h-4" />
                合并云端数据
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onViewDiff}
                disabled={loading}
                className="w-full text-gray-500"
              >
                查看差异
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/settings/BackupMoreOptions.tsx
git commit -m "feat(ui): create BackupMoreOptions with emergency export warning"
```

---

### Task 2.3: 创建 BackupSection 主组件

**Files:**
- Create: `packages/extension/src/sidepanel/settings/BackupSection.tsx`

- [ ] **Step 1: 创建主组件文件**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { BackupStatusRow } from './BackupStatusRow'
import { BackupMoreOptions } from './BackupMoreOptions'
import { AuthModal } from '@/sidepanel/components/CloudSync/AuthModal'
import { signOut, checkWebAppSession } from '@/lib/cloud-sync/auth-service'
import { getBackupVersions, restoreFromBackup, changeSyncFolder, enableSync } from '@/lib/sync/sync-manager'
import type { BackupStatusStorage } from '@/lib/sync/types'
import type { BackupVersion } from '@/lib/sync/file-sync'
import { MessageType } from '@oh-my-prompt/shared/messages'

/**
 * BackupSection - Unified backup UI with transparent auto-backup.
 * 
 * Key changes from UnifiedSyncSection:
 * - NO manual "立即备份" button - backup is automatic
 * - Two independent status rows (cloud + local)
 * - Auto-refresh on BACKUP_PROGRESS/BACKUP_RETRY/BACKUP_COMPLETE events
 * - Emergency export when both backups failed
 */
export function BackupSection() {
  const [status, setStatus] = useState<BackupStatusStorage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<BackupVersion[]>([])

  const loadBackupStatus = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_UNIFIED_SYNC_STATUS })
      if (response?.success && response.data) {
        // Transform UnifiedSyncStatus to BackupStatusStorage
        const unifiedStatus = response.data
        setStatus({
          cloud: {
            enabled: unifiedStatus.cloudEnabled,
            loggedIn: unifiedStatus.cloudLoggedIn,
            lastSyncTime: unifiedStatus.lastCloudSyncTime || null,
            syncing: unifiedStatus.cloudSyncing || false,
            error: unifiedStatus.cloudError || null,
            retryCount: unifiedStatus.cloudRetryCount || 0,
            retryScheduledAt: unifiedStatus.cloudRetryScheduledAt
          },
          local: {
            enabled: unifiedStatus.localEnabled,
            lastSyncTime: unifiedStatus.lastLocalSyncTime || null,
            syncing: unifiedStatus.localSyncing || false,
            error: unifiedStatus.localError || null,
            retryCount: unifiedStatus.localRetryCount || 0,
            retryScheduledAt: unifiedStatus.localRetryScheduledAt,
            permissionStatus: unifiedStatus.permissionStatus,
            folderName: unifiedStatus.folderName
          }
        })
        setError(null)
      } else {
        setError('获取状态失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Failed to load backup status:', err)
      setError('获取状态失败')
    }
  }, [])

  // Load status on mount
  useEffect(() => {
    loadBackupStatus()
  }, [loadBackupStatus])

  // Listen for backup events to refresh status
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: unknown }) => {
      if (
        message.type === MessageType.BACKUP_PROGRESS ||
        message.type === MessageType.BACKUP_RETRY ||
        message.type === MessageType.BACKUP_COMPLETE ||
        message.type === 'AUTH_CALLBACK_COMPLETE'
      ) {
        // Refresh status on any backup event
        loadBackupStatus()
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [loadBackupStatus])

  // Auto-dismiss messages after 3 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [success, error])

  // Load backup history when showing
  useEffect(() => {
    if (showHistory && status?.local?.enabled) {
      loadVersions()
    }
  }, [showHistory, status])

  const loadVersions = async () => {
    const result = await getBackupVersions()
    setVersions(result.versions)
    if (result.error) {
      setError(result.error)
    }
  }

  // Handlers
  const handleLogin = () => {
    setAuthModalOpen(true)
  }

  const handleAuthSuccess = async () => {
    setSuccess('登录成功')
    await loadBackupStatus()
  }

  const handleLogout = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await signOut()
      if (result.success) {
        setSuccess('已退出登录')
        await loadBackupStatus()
      } else {
        setError('退出失败')
      }
    } catch (err) {
      setError('退出失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRestorePermission = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_REQUEST_PERMISSION })
      if (response?.success) {
        setSuccess('权限已恢复')
        await loadBackupStatus()
        // Trigger sync after permission restored
        chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC }).catch(() => {})
      } else {
        setError('权限恢复失败')
      }
    } catch (err) {
      setError('权限恢复失败')
    } finally {
      setLoading(false)
    }
  }

  const handleChangeFolder = async () => {
    setLoading(true)
    try {
      const result = await changeSyncFolder()
      if (result.success) {
        setSuccess('文件夹已更换')
        await loadBackupStatus()
      } else {
        setError(result.error || '更换失败')
      }
    } catch (err) {
      setError('更换失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEnableFolder = async () => {
    setLoading(true)
    try {
      const result = await enableSync()
      if (result.success) {
        setSuccess('备份已启用')
        await loadBackupStatus()
      } else {
        setError(result.error || '启用失败')
      }
    } catch (err) {
      setError('启用失败')
    } finally {
      setLoading(false)
    }
  }

  const handleMergeFromCloud = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_AND_MERGE })
      if (response?.success) {
        setSuccess('合并成功')
        await loadBackupStatus()
      } else {
        setError(response?.error || '合并失败')
      }
    } catch (err) {
      setError('合并失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEmergencyExport = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.EXPORT_DATA })
      if (response?.success) {
        setSuccess('数据已导出')
      } else {
        setError('导出失败')
      }
    } catch (err) {
      setError('导出失败')
    } finally {
      setLoading(false)
    }
  }

  const handleErrorClick = () => {
    // Show error details in a modal or expand options
    setShowMoreOptions(true)
  }

  return (
    <div className="w-full p-4 bg-white rounded-lg border border-gray-200">
      {/* Error/Success messages */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 rounded border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 p-2 bg-green-50 rounded border border-green-200 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-5 h-5 text-gray-500" />
        <h3 className="text-sm font-medium text-gray-900">数据备份</h3>
      </div>

      {/* Status rows - NO manual trigger button */}
      <div className="space-y-2">
        <BackupStatusRow
          type="cloud"
          status={status?.cloud}
          onLogin={handleLogin}
          onClickError={handleErrorClick}
        />
        <BackupStatusRow
          type="local"
          status={status?.local}
          onRestorePermission={handleRestorePermission}
          onClickError={handleErrorClick}
        />
        
        {/* Enable folder button if not configured */}
        {!status?.local?.enabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleEnableFolder}
            disabled={loading}
            className="w-full mt-2"
          >
            选择备份文件夹
          </Button>
        )}
      </div>

      {/* More options toggle */}
      <button
        onClick={() => setShowMoreOptions(!showMoreOptions)}
        className="w-full flex items-center justify-center gap-1 py-2 mt-3 text-sm text-gray-600 hover:text-gray-900"
      >
        更多选项
        {showMoreOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Collapsible more options */}
      {showMoreOptions && (
        <BackupMoreOptions
          status={status}
          onLogout={handleLogout}
          onChangeFolder={handleChangeFolder}
          onViewHistory={() => setShowHistory(true)}
          onMergeFromCloud={handleMergeFromCloud}
          onEmergencyExport={handleEmergencyExport}
          loading={loading}
        />
      )}

      {/* Info text */}
      <p className="text-xs text-gray-500 mt-3">
        数据变更后自动备份，无需手动触发
      </p>

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/settings/BackupSection.tsx
git commit -m "feat(ui): create BackupSection with transparent auto-backup UI (no manual button)"
```

---

### Task 2.4: 更新 SettingsView 引用新组件

**Files:**
- Modify: `packages/extension/src/sidepanel/views/SettingsView.tsx`

- [ ] **Step 1: 替换 UnifiedSyncSection 为 BackupSection**

找到 UnifiedSyncSection 的导入和使用位置，替换为：

```typescript
// Change import
import { BackupSection } from '../settings/BackupSection'

// Replace usage
// OLD: <UnifiedSyncSection />
// NEW: <BackupSection />
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/views/SettingsView.tsx
git commit -m "refactor(ui): replace UnifiedSyncSection with BackupSection"
```

---

### Task 2.5: 删除旧组件

**Files:**
- Delete: `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx`

- [ ] **Step 1: 删除 UnifiedSyncSection.tsx**

```bash
git rm packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx
git commit -m "remove: delete UnifiedSyncSection (replaced by BackupSection)"
```

---

## Phase 3: 合并逻辑改进（双向同步）

### Task 3.1: 实现双向合并算法

**Files:**
- Modify: `packages/extension/src/lib/sync/orchestrator.ts`

- [ ] **Step 1: 添加双向合并算法**

在 `mergeById` 方法后添加新方法：

```typescript
  /**
   * Bidirectional merge - keeps latest version based on updatedAt.
   * This is TRUE multi-device sync (not cloud-wins-all).
   */
  private mergeBidirectional<T extends { id: string; updatedAt?: number }>(
    cloud: T[],
    local: T[],
    onConflict?: (cloudItem: T, localItem: T) => T
  ): {
    merged: T[]
    cloudOnly: T[]
    localOnly: T[]
    conflicts: Array<{ cloud: T; local: T }>
  } {
    const merged = new Map<string, T>()
    const cloudOnly: T[] = []
    const localOnly: T[] = []
    const conflicts: Array<{ cloud: T; local: T }> = []

    const cloudMap = new Map(cloud.map(item => [item.id, item]))
    const localMap = new Map(local.map(item => [item.id, item]))

    // Process all items
    for (const [id, cloudItem] of cloudMap) {
      const localItem = localMap.get(id)

      if (!localItem) {
        // Cloud only
        cloudOnly.push(cloudItem)
        merged.set(id, cloudItem)
      } else {
        // Both exist - compare updatedAt
        const cloudUpdated = cloudItem.updatedAt || 0
        const localUpdated = localItem.updatedAt || 0

        if (cloudUpdated > localUpdated) {
          merged.set(id, cloudItem)
        } else if (localUpdated > cloudUpdated) {
          merged.set(id, localItem)
          localOnly.push(localItem) // Track for upload
        } else {
          // Same timestamp - conflict
          conflicts.push({ cloud: cloudItem, local: localItem })
          // Default: use conflict resolver or keep cloud
          const resolved = onConflict?.(cloudItem, localItem) ?? cloudItem
          merged.set(id, resolved)
        }
      }
    }

    // Add local-only items
    for (const [id, localItem] of localMap) {
      if (!cloudMap.has(id)) {
        localOnly.push(localItem)
        merged.set(id, localItem)
      }
    }

    return {
      merged: Array.from(merged.values()),
      cloudOnly,
      localOnly,
      conflicts
    }
  }
```

- [ ] **Step 2: 更新 downloadAndMerge 使用双向合并**

修改 `downloadAndMerge` 方法：

```typescript
  /**
   * Download from cloud and merge with local.
   * Now uses bidirectional merge (keeps latest version).
   */
  async downloadAndMerge(): Promise<MergeResult & { conflicts?: Array<{ type: 'prompt' | 'category'; cloud: unknown; local: unknown }> }> {
    const cloudData = await this.cloudStrategy.restore()
    const localData = await this.getLocalData()

    if (!cloudData) {
      return {
        data: localData,
        localOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] }
      }
    }

    // Bidirectional merge
    const promptMerge = this.mergeBidirectional(
      cloudData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.prompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const categoryMerge = this.mergeBidirectional(
      cloudData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 })),
      localData.categories.map(c => ({ ...c, updatedAt: c.updatedAt || 0 }))
    )

    const tempMerge = this.mergeBidirectional(
      cloudData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 })),
      localData.temporaryPrompts.map(p => ({ ...p, updatedAt: p.updatedAt || 0 }))
    )

    const result: MergeResult = {
      data: {
        prompts: promptMerge.merged as Prompt[],
        categories: categoryMerge.merged as Category[],
        temporaryPrompts: tempMerge.merged as Prompt[],
        timestamp: Date.now()
      },
      localOnlyItems: {
        prompts: promptMerge.localOnly as Prompt[],
        categories: categoryMerge.localOnly as Category[],
        temporaryPrompts: tempMerge.localOnly as Prompt[]
      }
    }

    // Apply merged data
    await this.applyData(result.data)

    // Mark pending upload if local items newer than cloud
    if (promptMerge.localOnly.length > 0 || categoryMerge.localOnly.length > 0) {
      await this.updateSyncStatus({
        pendingUpload: true,
        localOnlyItems: {
          promptIds: promptMerge.localOnly.map(p => p.id),
          categoryIds: categoryMerge.localOnly.map(c => c.id),
          temporaryPromptIds: tempMerge.localOnly.map(p => p.id)
        }
      })
    }

    return {
      ...result,
      conflicts: [
        ...promptMerge.conflicts.map(c => ({ type: 'prompt', cloud: c.cloud, local: c.local })),
        ...categoryMerge.conflicts.map(c => ({ type: 'category', cloud: c.cloud, local: c.local }))
      ]
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/lib/sync/orchestrator.ts
git commit -m "feat(sync): implement bidirectional merge for true multi-device sync"
```

---

### Task 3.2: 创建 MergePreviewModal 组件

**Files:**
- Create: `packages/extension/src/sidepanel/settings/MergePreviewModal.tsx`

- [ ] **Step 1: 创建合并预览组件**

```typescript
import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/popup/components/ui/dialog'

interface MergePreviewData {
  cloudCount: { prompts: number; categories: number }
  localCount: { prompts: number; categories: number }
  mergedCount: { prompts: number; categories: number }
  changes: {
    addToLocal: number
    addToCloud: number
    updateToLocal: number
    updateToCloud: number
  }
}

interface MergePreviewModalProps {
  open: boolean
  onClose: () => void
  preview: MergePreviewData | null
  onConfirm: () => void
  loading?: boolean
}

/**
 * MergePreviewModal - Preview merge before execution.
 * Shows counts and changes before user confirms.
 */
export function MergePreviewModal({
  open,
  onClose,
  preview,
  onConfirm,
  loading
}: MergePreviewModalProps) {
  if (!preview) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🔄 合并预览</DialogTitle>
          <DialogDescription>
            以下是将执行的合并操作，请确认后继续
          </DialogDescription>
        </DialogHeader>

        {/* Counts */}
        <div className="p-3 bg-gray-50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">云端数据</span>
            <span className="text-gray-900">{preview.cloudCount.prompts} 条 prompts</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">本地数据</span>
            <span className="text-gray-900">{preview.localCount.prompts} 条 prompts</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2 mt-2">
            <span className="font-medium text-gray-700">合并后</span>
            <span className="font-medium text-gray-900">{preview.mergedCount.prompts} 条</span>
          </div>
        </div>

        {/* Changes detail */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">变更明细</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {preview.changes.addToLocal > 0 && (
              <li>• 新增 {preview.changes.addToLocal} 条到本地</li>
            )}
            {preview.changes.addToCloud > 0 && (
              <li>• 上传 {preview.changes.addToCloud} 条到云端</li>
            )}
            {preview.changes.updateToLocal > 0 && (
              <li>• 更新 {preview.changes.updateToLocal} 条为最新版本</li>
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? '合并中...' : '确认合并'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/settings/MergePreviewModal.tsx
git commit -m "feat(ui): create MergePreviewModal for merge preview"
```

---

### Task 3.3: 创建 ConflictResolutionModal 组件

**Files:**
- Create: `packages/extension/src/sidepanel/settings/ConflictResolutionModal.tsx`

- [ ] **Step 1: 创建冲突解决组件**

```typescript
import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/popup/components/ui/dialog'

interface ConflictItem {
  type: 'prompt' | 'category'
  cloud: { id: string; name?: string; content?: string; updatedAt?: number }
  local: { id: string; name?: string; content?: string; updatedAt?: number }
}

interface ConflictResolutionModalProps {
  open: boolean
  onClose: () => void
  conflict: ConflictItem | null
  onResolve: (choice: 'cloud' | 'local' | 'both') => void
  loading?: boolean
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '未知时间'
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * ConflictResolutionModal - Resolve merge conflicts.
 * User chooses which version to keep or keeps both (creates copy).
 */
export function ConflictResolutionModal({
  open,
  onClose,
  conflict,
  onResolve,
  loading
}: ConflictResolutionModalProps) {
  const [choice, setChoice] = useState<'cloud' | 'local' | 'both' | null>(null)

  if (!conflict) return null

  const typeName = conflict.type === 'prompt' ? '提示词' : '分类'
  const name = conflict.cloud.name || conflict.local.name || '未命名'

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>⚠️ 冲突：{typeName} "{name}"</DialogTitle>
        </DialogHeader>

        {/* Cloud version */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">云端版本</span>
            <span className="text-xs text-blue-600">
              {formatDate(conflict.cloud.updatedAt)}
            </span>
          </div>
          <p className="text-sm text-blue-900 line-clamp-3">
            {conflict.cloud.content || conflict.cloud.name}
          </p>
        </div>

        {/* Local version */}
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-800">本地版本</span>
            <span className="text-xs text-green-600">
              {formatDate(conflict.local.updatedAt)}
            </span>
          </div>
          <p className="text-sm text-green-900 line-clamp-3">
            {conflict.local.content || conflict.local.name}
          </p>
        </div>

        {/* Resolution options */}
        <div className="space-y-2">
          <Button
            variant={choice === 'cloud' ? 'default' : 'outline'}
            onClick={() => setChoice('cloud')}
            className="w-full justify-start"
          >
            保留云端版本
          </Button>
          <Button
            variant={choice === 'local' ? 'default' : 'outline'}
            onClick={() => setChoice('local')}
            className="w-full justify-start"
          >
            保留本地版本
          </Button>
          <Button
            variant={choice === 'both' ? 'default' : 'outline'}
            onClick={() => setChoice('both')}
            className="w-full justify-start"
          >
            保留两者（创建副本）
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消合并
          </Button>
          <Button
            onClick={() => choice && onResolve(choice)}
            disabled={!choice || loading}
          >
            {loading ? '处理中...' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/settings/ConflictResolutionModal.tsx
git commit -m "feat(ui): create ConflictResolutionModal for merge conflict handling"
```

---

## Phase 4: 测试验证

### Task 4.1: 测试自动备份触发

**Files:**
- Manual testing checklist

- [ ] **Step 1: 测试编辑后自动备份**

测试步骤：
1. 运行 `npm run dev` 启动开发服务器
2. 在 Chrome 中加载扩展
3. 打开 Sidepanel 设置页面
4. 编辑一个提示词（修改名称或内容）
5. 观察 BackupSection 状态：
   - 应显示 `🔄 同步中...`
   - 成功后显示 `✅ 已同步 · 刚刚`
   - 无需点击任何按钮

Expected: 编辑后自动触发备份，状态实时更新

- [ ] **Step 2: 测试云端登录后自动备份**

测试步骤：
1. 点击"登录"按钮
2. 完成 OAuth 登录
3. 观察云端状态行：
   - 应从 `⚠️ 未登录` 变为 `🔄 同步中...`
   - 成功后显示 `✅ 已同步 · 刚刚`

Expected: 登录后自动触发云端同步

---

### Task 4.2: 测试备份失败自动重试

**Files:**
- Manual testing checklist

- [ ] **Step 1: 测试本地备份权限丢失后重试**

测试步骤：
1. 配置本地备份文件夹
2. 在 Chrome 设置中撤销文件夹权限（或模拟网络断开）
3. 编辑一个提示词触发备份
4. 观察本地状态行：
   - 应显示 `⏳ 等待重试 (第1次) · X秒后`
   - 重试成功后显示 `✅ 已同步`
   - 或重试3次后显示 `🔴 备份失败 · 点击查看`

Expected: 失败后自动重试，显示重试进度

---

### Task 4.3: 测试应急导出功能

**Files:**
- Manual testing checklist

- [ ] **Step 1: 测试两方都失败时显示应急导出**

测试步骤：
1. 模拟云端和本地都失败的状态
2. 观察 BackupMoreOptions：
   - 应显示红色警告框
   - 显示"应急导出所有数据"按钮
3. 点击导出按钮
4. 验证 JSON 文件下载成功

Expected: 两方都失败时显示警告并提供导出选项

---

## Success Criteria Checklist

- [ ] **完全透明**: 用户编辑后自动备份，无需任何手动操作
- [ ] **状态清晰**: 一眼看出云端和本地是否已备份（"同步中"/"等待重试"/"失败")
- [ ] **时间戳实时**: 备份成功后时间戳立刻更新为"刚刚"
- [ ] **失败有兜底**: 连续失败后提供用户干预建议；两方都失败时提供应急导出
- [ ] **真正的同步**: 多设备间用合并代替覆盖，保留最新版本
- [ ] **冲突可视化**: 相同数据两边修改时，让用户选择保留哪个版本
- [ ] **数据安全**: 用户明确知道数据存储位置和风险
- [ ] **无手动按钮**: BackupSection 没有"立即备份"按钮