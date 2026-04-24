// Extension metadata
export const EXTENSION_NAME = 'Oh My Prompt'

// Version is now read dynamically from manifest via chrome.runtime.getManifest().version

// Platform domain (D-01)
export const PLATFORM_DOMAIN = '*.lovart.ai'

// Storage key
export const STORAGE_KEY = 'prompt_script_data'

// Default category (Phase 3)
export const DEFAULT_CATEGORY_NAME = '默认分类'

// IndexedDB for sync folder handle storage
export const SYNC_DB_NAME = 'oh-my-prompt-sync'
export const SYNC_STORE_NAME = 'handles'
export const SYNC_HANDLE_KEY = 'syncFolderHandle'

// Backup file name for local folder sync (latest version)
export const BACKUP_FILE_NAME = 'omps-latest.json'

// Backup history file prefix and limits
export const BACKUP_HISTORY_PREFIX = 'omps-backup-'
export const BACKUP_HISTORY_PATTERN = /^omps-backup-\d{8}-\d{6}\.json$/
export const MAX_BACKUP_HISTORY = 100