import type { NetworkPrompt, ProviderCategory } from './types'

export enum MessageType {
  PING = 'PING',
  GET_STORAGE = 'GET_STORAGE',
  SET_STORAGE = 'SET_STORAGE',
  INSERT_PROMPT = 'INSERT_PROMPT',
  OPEN_SETTINGS = 'OPEN_SETTINGS',
  // Phase 5: Network prompts
  FETCH_NETWORK_PROMPTS = 'FETCH_NETWORK_PROMPTS'
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

// Phase 5: Network prompt request payload
export interface FetchNetworkPromptsPayload {
  providerId?: string // Optional: defaults to 'nano-banana'
}

// Phase 5: Network prompt response payload
export interface NetworkDataResponse {
  prompts: NetworkPrompt[]
  categories: ProviderCategory[]
}