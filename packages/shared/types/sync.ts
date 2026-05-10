import type { Prompt, Category } from './prompt'

// Sync status for tracking cloud synchronization
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'not_logged_in'

// Sync payload for uploading to cloud
export interface SyncPayload {
  prompts: Prompt[]
  categories: Category[]
  temporaryPrompts?: Prompt[] // Temporary library prompts (optional)
  timestamp: number
}

// Sync result from cloud API
export interface SyncResult {
  success: boolean
  error?: 'NOT_LOGGED_IN' | 'SYNC_FAILED' | 'NETWORK_ERROR' | 'INVALID_DATA'
  promptsCount?: number
  categoriesCount?: number
  syncedAt?: number
}

// Cloud user info (for authentication)
export interface CloudUser {
  id: string
  email?: string
  name?: string
  avatarUrl?: string
  subscriptionStatus: 'free' | 'pro' | 'team'
}

// Team member (for team collaboration feature)
export interface TeamMember {
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: number
}