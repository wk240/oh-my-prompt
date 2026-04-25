// Phase 2: Prompt types
export interface Prompt {
  id: string
  name: string
  content: string
  categoryId: string
  description?: string // Optional description for display in selection UI
  order: number // 分类内排序顺序
}

// Phase 3: Category types
export interface Category {
  id: string
  name: string
  order: number
}

// User data container - all prompts and categories owned by user
export interface UserData {
  prompts: Prompt[]
  categories: Category[]
}

// Sync settings for local folder backup
export interface SyncSettings {
  showBuiltin: boolean // Show resource library reference in UI
  syncEnabled: boolean // Auto-sync to local folder enabled
  lastSyncTime?: number // Timestamp of last successful sync
  hasUnsyncedChanges?: boolean // Flag to show backup reminder after reorder
  dismissedBackupWarning?: boolean // User dismissed the backup warning dialog
}

// New storage schema with nested structure
export interface StorageSchema {
  version: string // From manifest, dynamic read
  userData: UserData // User's prompts and categories
  settings: SyncSettings // Sync and display settings
  _migrationComplete?: boolean // Prevents re-migration
}

// Legacy schema for migration detection
export interface LegacyStorageSchema {
  prompts: Prompt[]
  categories: Category[]
  version: string
}

// Resource library prompt types (from local JSON data)
export interface ResourcePrompt extends Prompt {
  sourceCategory?: string // Original category from source
  previewImage?: string // Preview image URL
  author?: string // Original author name, e.g. "宝玉"
  authorUrl?: string // Author attribution link, e.g. "https://x.com/..."
}

// Resource library category metadata
export interface ResourceCategory {
  id: string
  name: string
  order: number
  count: number // Number of prompts in category
}

// Update notification status
export interface UpdateStatus {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  downloadUrl: string
  releaseNotes?: string
  checkedAt: number
}

// Online search types (prompts.chat API)
export interface OnlinePrompt {
  id: string
  title: string
  slug: string
  description: string | null
  content: string
  type: 'TEXT' | 'IMAGE'
  mediaUrl: string | null
  author: {
    id: string
    name: string
    username: string
    avatar: string
    verified: boolean
  }
  category: {
    id: string
    name: string
    slug: string
    description?: string
  }
  tags: Array<{ id: string; name: string; color: string }>
  voteCount: number
  createdAt: string
}

export interface OnlineCategory {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  order: number
}

export interface PromptsChatResponse {
  prompts: OnlinePrompt[]
  total: number
  page: number
  perPage: number
  totalPages: number
}