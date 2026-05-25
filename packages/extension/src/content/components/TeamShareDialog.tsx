/**
 * TeamShareDialog - React component for sharing prompts to team libraries
 * Uses Portal rendering to escape Shadow DOM isolation
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Users } from 'lucide-react'
import type { Prompt, TeamInfo } from '@oh-my-prompt/shared/types'
import { usePromptStore } from '@/lib/store'
import { sharePromptToTeam, syncTeamPrompts } from '@/lib/team-sync'
import { showToast } from './ToastNotification'
import {
  TEAM_SHARE_PORTAL_ID,
  TEAM_SHARE_STYLE_ID,
  TEAM_SHARE_DIALOG_STYLES
} from '../styles/team-share-dialog-styles'

interface TeamShareDialogProps {
  prompt: Prompt
  isOpen: boolean
  onClose: () => void
}

/**
 * Get or create the portal container for team share dialog
 */
function getPortalContainer(): HTMLElement | null {
  let container = document.getElementById(TEAM_SHARE_PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = TEAM_SHARE_PORTAL_ID
    document.body.appendChild(container)
  }
  return container
}

/**
 * Inject styles into the portal container
 */
function injectStyles(): void {
  // Check if styles already exist
  if (document.getElementById(TEAM_SHARE_STYLE_ID)) {
    return
  }

  const styleElement = document.createElement('style')
  styleElement.id = TEAM_SHARE_STYLE_ID
  styleElement.textContent = TEAM_SHARE_DIALOG_STYLES
  document.head.appendChild(styleElement)
}

/**
 * Remove styles from the document head
 */
function removeStyles(): void {
  const styleElement = document.getElementById(TEAM_SHARE_STYLE_ID)
  if (styleElement) {
    styleElement.remove()
  }
}

/**
 * Remove portal container from document body
 */
function removePortalContainer(): void {
  const container = document.getElementById(TEAM_SHARE_PORTAL_ID)
  if (container) {
    container.remove()
  }
}

/**
 * Error message mapping for user-friendly display
 */
function getErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    NOT_LOGGED_IN: '请先登录后再分享到团队',
    NOT_TEAM_MEMBER: '您不是该团队的成员',
    ALREADY_SHARED: '该提示词已分享到该团队',
    TEAM_NOT_FOUND: '团队不存在或已被删除',
    NETWORK_ERROR: '网络错误，请稍后重试',
    SHARE_FAILED: '分享失败，请稍后重试',
    FETCH_FAILED: '获取团队列表失败'
  }
  return errorMessages[error] || '操作失败，请稍后重试'
}

export function TeamShareDialog({ prompt, isOpen, onClose }: TeamShareDialogProps) {
  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)

  const getUserTeams = usePromptStore(state => state.getUserTeams)
  const loadTeamPrompts = usePromptStore(state => state.loadTeamPrompts)

  // Load teams when dialog opens - does NOT depend on onClose to avoid re-triggering
  const loadTeams = useCallback(async () => {
    setLoading(true)
    setSelectedTeamId(null)
    console.log('[Oh My Prompt] TeamShareDialog: Loading teams...')

    try {
      const result = await getUserTeams()
      console.log('[Oh My Prompt] TeamShareDialog: getUserTeams result:', result)

      if (result.success && result.teams) {
        console.log('[Oh My Prompt] TeamShareDialog: Teams loaded:', result.teams.length)
        setTeams(result.teams)
      } else if (result.error === 'NOT_LOGGED_IN') {
        showToast('请先登录后再分享到团队')
        // Close dialog after showing toast
        setTimeout(() => onClose(), 100)
      } else {
        console.error('[Oh My Prompt] TeamShareDialog: Error loading teams:', result.error)
        showToast(getErrorMessage(result.error || 'FETCH_FAILED'))
      }
    } catch (error) {
      console.error('[Oh My Prompt] TeamShareDialog: Load teams exception:', error)
      showToast('获取团队列表失败')
    } finally {
      setLoading(false)
    }
  }, [getUserTeams]) // Removed onClose dependency

  // Handle share action
  const handleShare = useCallback(async () => {
    if (!selectedTeamId) {
      showToast('请选择一个团队')
      return
    }

    setSharing(true)

    try {
      const result = await sharePromptToTeam(prompt, selectedTeamId)

      if (result.success) {
        showToast('已成功分享到团队')

        // Sync team prompts to update cache
        await syncTeamPrompts()
        await loadTeamPrompts()

        onClose()
      } else {
        showToast(getErrorMessage(result.error || 'SHARE_FAILED'))
      }
    } catch (error) {
      console.error('[Oh My Prompt] Share to team error:', error)
      showToast('分享失败，请稍后重试')
    } finally {
      setSharing(false)
    }
  }, [selectedTeamId, prompt, loadTeamPrompts, onClose])

  // Handle overlay click (close dialog)
  const handleOverlayClick = useCallback(() => {
    if (!sharing) {
      onClose()
    }
  }, [sharing, onClose])

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !sharing) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, sharing, onClose])

  // Load teams and inject styles when dialog opens
  useEffect(() => {
    if (isOpen) {
      injectStyles()
      loadTeams()
    }
  }, [isOpen, loadTeams])

  // Cleanup styles and portal container when dialog closes
  useEffect(() => {
    if (!isOpen) {
      removeStyles()
      removePortalContainer()
    }
  }, [isOpen])

  // Don't render if not open
  if (!isOpen) {
    return null
  }

  const container = getPortalContainer()
  if (!container) {
    return null
  }

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="team-share-overlay"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Dialog content */}
      <div className="team-share-content" role="dialog" aria-modal="true" aria-labelledby="team-share-title">
        {/* Close button */}
        <button
          className="team-share-close"
          onClick={onClose}
          disabled={sharing}
          aria-label="关闭"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="team-share-header">
          <h2 id="team-share-title" className="team-share-title">
            分享到团队
          </h2>
          <p className="team-share-description">
            选择一个团队，将提示词「{prompt.name}」分享给团队成员
          </p>
        </div>

        {/* Team list */}
        <div className="team-share-list">
          {loading ? (
            <div className="team-share-loading">
              <div className="team-share-spinner" />
              <span className="team-share-empty-message">正在加载团队列表...</span>
            </div>
          ) : teams.length === 0 ? (
            <div className="team-share-empty">
              <Users size={32} color="#D4D4D4" />
              <p className="team-share-empty-message">
                您还没有加入任何团队<br />
                请先创建或加入一个团队
              </p>
            </div>
          ) : (
            teams.map(team => (
              <button
                key={team.id}
                className={`team-share-option ${selectedTeamId === team.id ? 'selected' : ''}`}
                onClick={() => setSelectedTeamId(team.id)}
                disabled={sharing}
                aria-pressed={selectedTeamId === team.id}
              >
                <div className="team-share-option-content">
                  <div className="team-share-radio">
                    {selectedTeamId === team.id && <div className="team-share-radio-dot" />}
                  </div>
                  <span className="team-share-name">{team.name}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="team-share-footer">
          <button
            className="team-share-btn-outline"
            onClick={onClose}
            disabled={sharing}
          >
            取消
          </button>
          <button
            className="team-share-btn-primary"
            onClick={handleShare}
            disabled={sharing || loading || teams.length === 0 || !selectedTeamId}
          >
            <span className="team-share-btn-primary-content">
              {sharing ? (
                <>
                  <div className="team-share-btn-spinner" />
                  分享中...
                </>
              ) : (
                '确认分享'
              )}
            </span>
          </button>
        </div>
      </div>
    </>,
    container
  )
}

export default TeamShareDialog