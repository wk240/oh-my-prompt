import type { Prompt, Category, ImageAsset, PendingImageDelete } from '@oh-my-prompt/shared/types'

/**
 * Strategy Pattern types for unified sync architecture
 */

export type SyncStrategyId = 'cloud' | 'local'

export type SyncResultError =
  | 'NOT_LOGGED_IN'
  | 'SUBSCRIPTION_REQUIRED'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED'
  | 'SYNC_FAILED'
  | 'INVALID_DATA'

export interface SyncResult {
  success: boolean
  error?: SyncResultError
  skipped?: boolean // Data unchanged, no actual sync needed
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

/**
 * Backup status for each backup target (cloud/local).
 * Used for transparent auto-backup - user sees two independent status rows.
 */
export interface BackupTargetStatus {
  enabled: boolean // 是否启用此备份方式
  loggedIn?: boolean // 是否已登录（仅云端）
  lastSyncTime: number | null // 上次成功备份时间戳
  syncing: boolean // 当前是否正在同步中
  error: string | null // 失败原因（用于错误提示）
  retryCount: number // 连续失败次数（用于显示重试状态）
  retryScheduledAt?: number // 下次重试时间（用于显示倒计时）
  permissionStatus?: 'granted' | 'prompt' | 'denied' // 权限状态（仅本地）
  folderName?: string // 文件夹名称（仅本地）
}

/**
 * Combined backup status storage.
 * Stored in chrome.storage.local under 'backupStatus' key.
 */
export interface BackupStatusStorage {
  cloud: BackupTargetStatus
  local: BackupTargetStatus
}

export interface SyncGuardStatus {
  lastUploadedHash?: string
  lastLocalSyncedHash?: string
  lastUploadStartedAt?: number
  lastCloudUploadAt?: number
  syncInFlight?: boolean
  lockOwnerId?: string
  pendingSnapshotHash?: string
}

export interface IdAliasMap {
  prompts?: Record<string, string>
  categories?: Record<string, string>
  temporaryPrompts?: Record<string, string>
}

export interface UnifiedSyncStatus {
  cloudEnabled: boolean
  cloudLoggedIn: boolean
  lastCloudSyncTime?: number
  cloudError?: string
  cloudSyncing?: boolean // 正在同步中
  cloudRetryCount?: number // 连续失败次数
  cloudRetryScheduledAt?: number // 下次重试时间
  localEnabled: boolean
  lastLocalSyncTime?: number
  localError?: string
  localSyncing?: boolean // 正在同步中
  localRetryCount?: number // 连续失败次数
  localRetryScheduledAt?: number // 下次重试时间
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
  guard?: SyncGuardStatus
  idAliasMap?: IdAliasMap
}

export interface SyncStrategy {
  id: SyncStrategyId
  name: string
  sync(data: FullBackupData): Promise<SyncResult>
  restore(): Promise<FullBackupData | null>
  isAvailable(): Promise<boolean>
  getStatus(): Promise<StrategyStatus>
}
