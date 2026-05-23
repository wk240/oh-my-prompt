import { WEB_APP_URL } from '@/lib/config'
import type { TeamPrompt, TeamSyncStatus } from '@oh-my-prompt/shared/types'

/**
 * Sync team prompts to local storage
 */
export async function syncTeamPrompts(): Promise<{
  success: boolean
  promptsCount?: number
  error?: string
}> {
  try {
    const result = await chrome.storage.local.get('sb-auth-token')
    const tokenData = result['sb-auth-token']

    if (!tokenData) {
      return { success: false, error: 'NOT_LOGGED_IN' }
    }

    let token: string
    try {
      const parsed = JSON.parse(tokenData)
      token = parsed.access_token
    } catch {
      return { success: false, error: 'INVALID_TOKEN' }
    }

    const response = await fetch(`${WEB_APP_URL}/api/teams/prompts`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: 'NOT_LOGGED_IN' }
      return { success: false, error: 'SYNC_FAILED' }
    }

    const data = await response.json()
    if (!data.success) return { success: false, error: data.error || 'SYNC_FAILED' }

    const teamPrompts: TeamPrompt[] = data.data.prompts || []
    const teamIds: string[] = data.data.teams?.map((t: { id: string }) => t.id) || []

    const syncStatus: TeamSyncStatus = { lastSyncTime: Date.now(), teamIds }

    await chrome.storage.local.set({ teamPrompts, teamSyncStatus: syncStatus })

    return { success: true, promptsCount: teamPrompts.length }
  } catch (error) {
    console.error('[Oh My Prompt] Team sync error:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}

export async function getLocalTeamPrompts(): Promise<TeamPrompt[]> {
  const result = await chrome.storage.local.get('teamPrompts')
  return result.teamPrompts || []
}

export async function getTeamSyncStatus(): Promise<TeamSyncStatus | null> {
  const result = await chrome.storage.local.get('teamSyncStatus')
  return result.teamSyncStatus || null
}

export async function sharePromptToTeam(
  promptId: string,
  teamId: string,
  category?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await chrome.storage.local.get('sb-auth-token')
    const tokenData = result['sb-auth-token']

    if (!tokenData) return { success: false, error: 'NOT_LOGGED_IN' }

    let token: string
    try {
      const parsed = JSON.parse(tokenData)
      token = parsed.access_token
    } catch {
      return { success: false, error: 'INVALID_TOKEN' }
    }

    const response = await fetch(`${WEB_APP_URL}/api/teams/${teamId}/prompts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ promptId, category })
    })

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: 'NOT_LOGGED_IN' }
      if (response.status === 403) return { success: false, error: 'NOT_TEAM_MEMBER' }
      if (response.status === 400) {
        const data = await response.json()
        return { success: false, error: data.error || 'ALREADY_SHARED' }
      }
      return { success: false, error: 'SHARE_FAILED' }
    }

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Share to team error:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}