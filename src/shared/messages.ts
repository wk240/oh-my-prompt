export enum MessageType {
  PING = 'PING',
  GET_STORAGE = 'GET_STORAGE',
  SET_STORAGE = 'SET_STORAGE',
  INSERT_PROMPT = 'INSERT_PROMPT',
  OPEN_SETTINGS = 'OPEN_SETTINGS',
  BACKUP_TO_FOLDER = 'BACKUP_TO_FOLDER',
  SELECT_AND_SAVE_FOLDER = 'SELECT_AND_SAVE_FOLDER',
  GET_SYNC_STATUS = 'GET_SYNC_STATUS'
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