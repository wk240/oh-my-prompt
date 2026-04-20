export enum MessageType {
  PING = 'PING',
  GET_STORAGE = 'GET_STORAGE',
  SET_STORAGE = 'SET_STORAGE',
  INSERT_PROMPT = 'INSERT_PROMPT',
  OPEN_SETTINGS = 'OPEN_SETTINGS',
  BACKUP_TO_FOLDER = 'BACKUP_TO_FOLDER',
  SAVE_FOLDER_HANDLE = 'SAVE_FOLDER_HANDLE',
  GET_SYNC_STATUS = 'GET_SYNC_STATUS',
  OPEN_BACKUP_PAGE = 'OPEN_BACKUP_PAGE',
  REFRESH_DATA = 'REFRESH_DATA'
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