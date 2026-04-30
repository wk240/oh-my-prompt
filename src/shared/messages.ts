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
  SET_UNSYNCED_FLAG = 'SET_UNSYNCED_FLAG',
  SYNC_FAILED = 'SYNC_FAILED',  // Broadcast to content scripts when sync fails
  OPEN_BACKUP_PAGE = 'OPEN_BACKUP_PAGE',
  REFRESH_DATA = 'REFRESH_DATA',
  CHECK_UPDATE = 'CHECK_UPDATE',
  GET_UPDATE_STATUS = 'GET_UPDATE_STATUS',
  CLEAR_UPDATE_STATUS = 'CLEAR_UPDATE_STATUS',
  OPEN_EXTENSIONS = 'OPEN_EXTENSIONS',
  EXPORT_DATA = 'EXPORT_DATA',
  DISMISS_BACKUP_WARNING = 'DISMISS_BACKUP_WARNING',
  RESTORE_PERMISSION = 'RESTORE_PERMISSION',  // Restore folder permission after extension update
  SET_SETTINGS_ONLY = 'SET_SETTINGS_ONLY',  // Update settings only, no backup trigger (for language toggle)
  OPEN_SETTINGS_PAGE = 'OPEN_SETTINGS_PAGE',  // Open settings.html for settings center
  OPEN_API_CONFIG_PAGE = 'OPEN_API_CONFIG_PAGE',  // Open api-config.html from Vision Modal

  // Phase 10: API configuration operations
  GET_API_CONFIG = 'GET_API_CONFIG',
  SET_API_CONFIG = 'SET_API_CONFIG',
  DELETE_API_CONFIG = 'DELETE_API_CONFIG',

  // Phase 11: Vision API operations
  VISION_API_CALL = 'VISION_API_CALL',     // Request API call from loading page
  VISION_API_RESULT = 'VISION_API_RESULT', // Response with generated prompt
  VISION_API_ERROR = 'VISION_API_ERROR',    // Error classification for UI

  // Phase 12: Prompt insertion routing
  INSERT_PROMPT_TO_CS = 'INSERT_PROMPT_TO_CS',  // Forward INSERT_PROMPT to content script
  SAVE_TEMPORARY_PROMPT = 'SAVE_TEMPORARY_PROMPT',  // Save prompt to temporary library
  CLEAR_TEMPORARY_PROMPTS = 'CLEAR_TEMPORARY_PROMPTS',  // Clear all temporary prompts
  TRANSFER_TEMPORARY_PROMPT = 'TRANSFER_TEMPORARY_PROMPT',  // Transfer temporary prompt to category

  // Vision Modal: In-page popup for image-to-prompt conversion
  OPEN_VISION_MODAL = 'OPEN_VISION_MODAL',      // SW → CS: Open modal in current page
  VISION_MODAL_RESPONSE = 'VISION_MODAL_RESPONSE',  // CS → SW: Modal operation result

  // Universal input detection
  CHECK_INPUT_AVAILABILITY = 'CHECK_INPUT_AVAILABILITY',  // SP → CS: Query if input element is available
  INPUT_AVAILABILITY_RESPONSE = 'INPUT_AVAILABILITY_RESPONSE',  // CS → SP: Response with availability status
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