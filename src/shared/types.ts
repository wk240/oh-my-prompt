// Phase 2: Prompt types
export interface Prompt {
  id: string
  name: string
  nameEn?: string // English name for bilingual support
  content: string
  contentEn?: string // English content for bilingual support
  categoryId: string
  description?: string // Optional description for display in selection UI
  descriptionEn?: string // English description for bilingual support
  order: number // 分类内排序顺序
  // Image support fields (optional)
  localImage?: string // Local image relative path, e.g. "images/{id}.jpg"
  remoteImageUrl?: string // Original network URL (record source, optional)
}

// Phase 3: Category types
export interface Category {
  id: string
  name: string
  nameEn?: string // English name for bilingual support
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
  resourceLanguage?: 'zh' | 'en' // Language preference for resource library, default 'zh'
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
  // Bilingual fields (optional, supports progressive translation)
  nameEn?: string // English name
  contentEn?: string // English content
  descriptionEn?: string // English description
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

// Phase 10: Vision API configuration
export interface VisionApiConfig {
  baseUrl: string // API endpoint base URL
  apiKey: string // User-provided API key
  modelName: string // Model identifier (e.g., 'claude-3-5-sonnet-20241022')
  configuredAt?: number // Timestamp of configuration (optional)
}