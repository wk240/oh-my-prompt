export enum MessageType {
  PING = 'PING',
  GET_STORAGE = 'GET_STORAGE',
  SET_STORAGE = 'SET_STORAGE',
  INSERT_PROMPT = 'INSERT_PROMPT',
  BACKUP_TO_FOLDER = 'BACKUP_TO_FOLDER',
  SAVE_IMAGE = 'SAVE_IMAGE',  // Save image via service worker (content script cannot access FileSystemDirectoryHandle cross-origin)
  READ_IMAGE = 'READ_IMAGE',  // Read image via service worker and return data array for content script
  DELETE_IMAGE = 'DELETE_IMAGE',  // Delete image via service worker
  GET_FOLDER_HANDLE = 'GET_FOLDER_HANDLE',  // Get folder handle from service worker (deprecated - handles cannot cross origins)
  SAVE_FOLDER_HANDLE = 'SAVE_FOLDER_HANDLE',
  GET_SYNC_STATUS = 'GET_SYNC_STATUS',
  TRIGGER_SYNC = 'TRIGGER_SYNC',  // Trigger sync after permission restored
  SET_UNSYNCED_FLAG = 'SET_UNSYNCED_FLAG',
  SYNC_FAILED = 'SYNC_FAILED',  // Broadcast to content scripts when sync fails
  REFRESH_DATA = 'REFRESH_DATA',
  CHECK_UPDATE = 'CHECK_UPDATE',
  GET_UPDATE_STATUS = 'GET_UPDATE_STATUS',
  CLEAR_UPDATE_STATUS = 'CLEAR_UPDATE_STATUS',
  OPEN_EXTENSIONS = 'OPEN_EXTENSIONS',
  EXPORT_DATA = 'EXPORT_DATA',
  DISMISS_BACKUP_WARNING = 'DISMISS_BACKUP_WARNING',
  RESTORE_PERMISSION = 'RESTORE_PERMISSION',  // Restore folder permission after extension update
  REQUEST_PERMISSION_GESTURE = 'REQUEST_PERMISSION_GESTURE',  // Direct permission request preserving user gesture (Content -> SW -> Offscreen)
  SET_SETTINGS_ONLY = 'SET_SETTINGS_ONLY',  // Update settings only, no backup trigger (for language toggle)
  OPEN_SIDEPANEL = 'OPEN_SIDEPANEL',  // Open sidepanel (general use - backup settings, etc.)
  OPEN_SIDEPANEL_FOR_PERMISSION = 'OPEN_SIDEPANEL_FOR_PERMISSION',  // Open sidepanel to restore folder permission (user gesture propagates)
  OPEN_SIDEPANEL_FOR_SETTINGS = 'OPEN_SIDEPANEL_FOR_SETTINGS',  // Open sidepanel and navigate to settings view

  // Phase 10: API configuration operations
  GET_API_CONFIG = 'GET_API_CONFIG',
  SET_API_CONFIG = 'SET_API_CONFIG',
  DELETE_API_CONFIG = 'DELETE_API_CONFIG',

  // Provider config management (multi-provider support)
  GET_PROVIDER_CONFIGS = 'GET_PROVIDER_CONFIGS',
  SET_PROVIDER_CONFIGS = 'SET_PROVIDER_CONFIGS',
  ADD_PROVIDER_CONFIG = 'ADD_PROVIDER_CONFIG',
  UPDATE_PROVIDER_CONFIG = 'UPDATE_PROVIDER_CONFIG',
  DELETE_PROVIDER_CONFIG = 'DELETE_PROVIDER_CONFIG',
  SET_ACTIVE_CONFIG = 'SET_ACTIVE_CONFIG',
  GET_ACTIVE_CONFIG = 'GET_ACTIVE_CONFIG',

  // Phase 11: Vision API operations
  VISION_API_CALL = 'VISION_API_CALL',     // Request API call from loading page
  VISION_API_RESULT = 'VISION_API_RESULT', // Response with generated prompt
  VISION_API_ERROR = 'VISION_API_ERROR',    // Error classification for UI

  // Phase 12: Prompt insertion routing
  INSERT_PROMPT_TO_CS = 'INSERT_PROMPT_TO_CS',  // Forward INSERT_PROMPT to content script
  SAVE_TEMPORARY_PROMPT = 'SAVE_TEMPORARY_PROMPT',  // Save prompt to temporary library
  UPDATE_TEMPORARY_PROMPT_FORMAT = 'UPDATE_TEMPORARY_PROMPT_FORMAT',  // Update format of saved temporary prompt
  CLEAR_TEMPORARY_PROMPTS = 'CLEAR_TEMPORARY_PROMPTS',  // Clear all temporary prompts
  TRANSFER_TEMPORARY_PROMPT = 'TRANSFER_TEMPORARY_PROMPT',  // Transfer temporary prompt to category

  // Vision Modal: In-page popup for image-to-prompt conversion
  OPEN_VISION_MODAL = 'OPEN_VISION_MODAL',      // SW → CS: Open modal in current page
  VISION_MODAL_RESPONSE = 'VISION_MODAL_RESPONSE',  // CS → SW: Modal operation result

  // Universal input detection
  CHECK_INPUT_AVAILABILITY = 'CHECK_INPUT_AVAILABILITY',  // SP → CS: Query if input element is available
  INPUT_AVAILABILITY_RESPONSE = 'INPUT_AVAILABILITY_RESPONSE',  // CS → SP: Response with availability status

  // Port-based connection (SidePanel ↔ Content Script)
  SIDEPANEL_CONNECT = 'SIDEPANEL_CONNECT',  // SP → CS: Establish Port connection
  INPUT_STATUS_CHANGED = 'INPUT_STATUS_CHANGED',  // CS → SP: Notify input status change (hasInput: boolean)
  CHECK_INPUT_PORT = 'CHECK_INPUT_PORT',  // SP → CS: Request input check via Port

  // Cloud Sync: Auth callback from web-app OAuth
  AUTH_CALLBACK_COMPLETE = 'AUTH_CALLBACK_COMPLETE',  // Web-app callback → SW: Notify auth success/failure
  AUTH_STATUS_UPDATE = 'AUTH_STATUS_UPDATE',  // SW → Sidepanel: Broadcast auth status change

  // Offscreen Document: File system operations (SW → Offscreen)
  OFFSCREEN_PING = 'OFFSCREEN_PING',                   // Ping offscreen document for readiness check
  OFFSCREEN_SYNC = 'OFFSCREEN_SYNC',                     // Sync user data to folder
  OFFSCREEN_BACKUP = 'OFFSCREEN_BACKUP',                  // Backup user data
  OFFSCREEN_SAVE_IMAGE = 'OFFSCREEN_SAVE_IMAGE',          // Save image to folder
  OFFSCREEN_READ_IMAGE = 'OFFSCREEN_READ_IMAGE',          // Read image from folder
  OFFSCREEN_DELETE_IMAGE = 'OFFSCREEN_DELETE_IMAGE',      // Delete image from folder
  OFFSCREEN_CHECK_PERMISSION = 'OFFSCREEN_CHECK_PERMISSION',  // Check folder permission status
  OFFSCREEN_REQUEST_PERMISSION = 'OFFSCREEN_REQUEST_PERMISSION',  // Request folder permission
  OFFSCREEN_GET_FOLDER_HANDLE = 'OFFSCREEN_GET_FOLDER_HANDLE',  // Get folder handle
  OFFSCREEN_SAVE_FOLDER_HANDLE = 'OFFSCREEN_SAVE_FOLDER_HANDLE',  // Save folder handle
  OFFSCREEN_LIST_VERSIONS = 'OFFSCREEN_LIST_VERSIONS',    // List backup versions
  OFFSCREEN_READ_BACKUP = 'OFFSCREEN_READ_BACKUP',        // Read specific backup file
  OFFSCREEN_SAVE_API_CONFIG = 'OFFSCREEN_SAVE_API_CONFIG',  // Save encrypted API config
  OFFSCREEN_READ_API_CONFIG = 'OFFSCREEN_READ_API_CONFIG',  // Read encrypted API config
  OFFSCREEN_SAVE_PROVIDER_CONFIGS = 'OFFSCREEN_SAVE_PROVIDER_CONFIGS',  // Save ProviderConfigsStorage
  OFFSCREEN_READ_PROVIDER_CONFIGS = 'OFFSCREEN_READ_PROVIDER_CONFIGS',  // Read ProviderConfigsStorage

  // Sidepanel status check
  SIDEPANEL_PING = 'SIDEPANEL_PING',  // Check if sidepanel is open (SW → Sidepanel)

  // Unified sync status (Sidepanel → SW)
  GET_UNIFIED_SYNC_STATUS = 'GET_UNIFIED_SYNC_STATUS',  // Get unified sync status from service worker
  UPLOAD_LOCAL_ONLY = 'UPLOAD_LOCAL_ONLY',  // Upload local-only items to cloud
  DOWNLOAD_AND_MERGE = 'DOWNLOAD_AND_MERGE',  // Download cloud data and merge with local
  PREVIEW_MERGE = 'PREVIEW_MERGE',  // Preview merge diff without actually merging

  // Backup progress notifications (transparent auto-backup)
  BACKUP_PROGRESS = 'BACKUP_PROGRESS',  // SW → UI: Notify backup in progress
  BACKUP_RETRY = 'BACKUP_RETRY',  // SW → UI: Notify retry attempt (with count)
  BACKUP_COMPLETE = 'BACKUP_COMPLETE',  // SW → UI: Notify backup completed (success or failure)
  EMERGENCY_EXPORT = 'EMERGENCY_EXPORT',  // UI → SW: Export all data when all backups failed

  // Official Vision API
  GET_VISION_QUOTA = 'GET_VISION_QUOTA',           // 获取 Vision 额度状态
  ACTIVATE_OFFICIAL_CONFIG = 'ACTIVATE_OFFICIAL_CONFIG', // 激活官方配置

  // Agent: Prompt enhancement feature
  AGENT_GENERATE = 'AGENT_GENERATE',           // Request Agent generation
  AGENT_GENERATE_RESULT = 'AGENT_GENERATE_RESULT', // Response with generated prompt
  AGENT_EXTRACT_FROM_CS = 'AGENT_EXTRACT_FROM_CS', // Content Script extract input to Sidepanel
  AGENT_ECOMMERCE_AI_WRITE = 'AGENT_ECOMMERCE_AI_WRITE', // Ecommerce AI write via Agent
}

export interface Message<T = unknown> {
  type: MessageType
  payload?: T
}

export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}