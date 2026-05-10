import type { Prompt, Category } from '@oh-my-prompt/shared/types'

/**
 * Strategy Pattern types for unified sync architecture
 */

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