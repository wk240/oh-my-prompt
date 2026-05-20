// Auth state for cloud sync feature

export type AuthStatus = 'checking' | 'logged_in' | 'not_logged_in'

export interface CloudAuthState {
  status: AuthStatus
  user?: {
    id: string
    email?: string
  }
  subscription?: {
    planType: 'free' | 'pro' | 'team'
    status: 'active' | 'inactive' | 'expired' | 'canceled'
    currentPeriodEnd?: number
    optimizationQuota?: {
      used: number
      remaining: number
      limit: number
    }
  }
  lastSyncAt?: number
}

export interface OAuthProvider {
  name: 'google' | 'github'
  label: string
  icon: string
}