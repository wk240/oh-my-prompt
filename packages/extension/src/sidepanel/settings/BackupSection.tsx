// packages/extension/src/sidepanel/settings/BackupSection.tsx
import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, FolderOpen } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { BackupStatusRow } from './BackupStatusRow'
import { BackupMoreOptions } from './BackupMoreOptions'
import { AuthModal } from '@/sidepanel/components/CloudSync/AuthModal'
import { MergePreviewModal, MergePreviewData } from './MergePreviewModal'
import { HistoryModal } from './HistoryModal'
import { signOut } from '@/lib/cloud-sync/auth-service'
import { changeSyncFolder, enableSync, getBackupVersions, restoreFromBackup } from '@/lib/sync/sync-manager'
import type { BackupStatusStorage, UnifiedSyncStatus } from '@/lib/sync/types'
import type { BackupVersion } from '@/lib/sync/file-sync'
import { MessageType } from '@oh-my-prompt/shared/messages'

/**
 * Transform UnifiedSyncStatus to BackupStatusStorage
 */
const transformUnifiedToBackup = (unified: UnifiedSyncStatus): BackupStatusStorage => ({
  cloud: {
    enabled: unified.cloudEnabled,
    loggedIn: unified.cloudLoggedIn,
    lastSyncTime: unified.lastCloudSyncTime || null,
    syncing: unified.cloudSyncing || false,
    error: unified.cloudError || null,
    retryCount: unified.cloudRetryCount || 0,
    retryScheduledAt: unified.cloudRetryScheduledAt
  },
  local: {
    enabled: unified.localEnabled,
    lastSyncTime: unified.lastLocalSyncTime || null,
    syncing: unified.localSyncing || false,
    error: unified.localError || null,
    retryCount: unified.localRetryCount || 0,
    retryScheduledAt: unified.localRetryScheduledAt,
    permissionStatus: unified.permissionStatus,
    folderName: unified.folderName
  }
})

/**
 * BackupSection - Main backup UI with transparent auto-backup display
 *
 * Features:
 * - Two status rows (cloud + local) using BackupStatusRow
 * - Collapsible "更多选项" section with BackupMoreOptions
 * - NO manual backup button - backup is automatic after each edit
 * - Auto-refreshes on BACKUP_PROGRESS/BACKUP_RETRY/BACKUP_COMPLETE events
 * - "选择备份文件夹" button if local not configured
 *
 * Design philosophy:
 * - Backup is automatic, not manual - user sees status, not triggers
 * - User only interacts to: login, configure folder, or fix errors
 * - Emergency export when both backups have failed
 */
export function BackupSection() {
  const [status, setStatus] = useState<BackupStatusStorage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  const [diffPreview, setDiffPreview] = useState<MergePreviewData | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyVersions, setHistoryVersions] = useState<BackupVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  /**
   * Load backup status from service worker
   */
  const loadBackupStatus = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_UNIFIED_SYNC_STATUS })
      if (response?.success && response.data) {
        setStatus(transformUnifiedToBackup(response.data))
        setError(null)
      } else {
        console.error('[Oh My Prompt] Failed to load backup status:', response?.error)
        setError('获取状态失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Failed to load backup status:', err)
      setError('获取状态失败')
    }
  }, [])

  // Load status on mount
  useEffect(() => {
    loadBackupStatus()
  }, [loadBackupStatus])

  // Auto-dismiss messages after 3 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [success, error])

  // Listen for backup progress/retry/complete events to refresh status
  useEffect(() => {
    const handleMessage = (message: { type: string }) => {
      if (
        [
          MessageType.BACKUP_PROGRESS,
          MessageType.BACKUP_RETRY,
          MessageType.BACKUP_COMPLETE,
          MessageType.AUTH_CALLBACK_COMPLETE
        ].includes(message.type as MessageType)
      ) {
        loadBackupStatus()
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [loadBackupStatus])

  /**
   * Handle cloud login - open AuthModal
   */
  const handleLogin = () => {
    setAuthModalOpen(true)
  }

  /**
   * Handle successful OAuth login
   */
  const handleAuthSuccess = async () => {
    setSuccess('登录成功')
    await loadBackupStatus()
  }

  /**
   * Handle cloud logout
   */
  const handleLogout = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await signOut()
      if (result.success) {
        setSuccess('已退出登录')
        await loadBackupStatus()
      } else {
        setError('退出失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Logout failed:', err)
      setError('退出失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle local permission restore
   */
  const handleRestorePermission = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_REQUEST_PERMISSION })
      if (response?.success) {
        setSuccess('权限已恢复')
        // Re-enable sync and trigger backup
        await chrome.runtime.sendMessage({
          type: MessageType.SET_SETTINGS_ONLY,
          payload: { settings: { syncEnabled: true, hasUnsyncedChanges: false } }
        })
        chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC }).catch(() => { /* Ignore sync errors */ })
        await loadBackupStatus()
      } else {
        setError('权限恢复失败：' + (response?.error || '未知错误'))
      }
    } catch (err) {
      console.error('[Oh My Prompt] Permission restore failed:', err)
      setError('权限恢复失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle change backup folder
   */
  const handleChangeFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await changeSyncFolder()
      if (result.success) {
        setSuccess('文件夹已更换')
        await loadBackupStatus()
      } else {
        setError(result.error || '更换文件夹失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Change folder failed:', err)
      setError('更换文件夹失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle enable local backup (select folder)
   */
  const handleEnableFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await enableSync()
      if (result.success) {
        setSuccess('备份已启用')
        await loadBackupStatus()
      } else {
        setError(result.error || '选择文件夹失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Enable sync failed:', err)
      setError('选择文件夹失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Load backup versions for history modal
   */
  const loadBackupVersions = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null) // Clear previous error
    try {
      const result = await getBackupVersions()
      if (result.error) {
        setHistoryError(result.error)
      } else {
        setHistoryVersions(result.versions)
      }
    } catch (err) {
      console.error('[Oh My Prompt] Failed to load backup versions:', err)
      setHistoryError('加载备份历史失败')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  /**
   * Handle view backup history - open history modal and load versions
   */
  const handleViewHistory = () => {
    setHistoryModalOpen(true)
    setHistoryError(null)
    loadBackupVersions() // Load versions immediately when opening modal
  }

  /**
   * Handle restore from backup version
   */
  const handleRestoreFromBackup = async (filename: string): Promise<{ success: boolean; error?: string }> => {
    const result = await restoreFromBackup(filename, true)
    if (result.success) {
      setSuccess('数据已恢复')
      await loadBackupStatus()
    }
    return result
  }

  /**
   * Handle merge from cloud
   */
  const handleMergeFromCloud = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_AND_MERGE })
      if (response?.success) {
        setSuccess('合并成功')
        await loadBackupStatus()
      } else {
        setError(response?.error || '合并失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Merge from cloud failed:', err)
      setError('合并失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle view diff - show modal comparing cloud vs local data
   */
  const handleViewDiff = async () => {
    setDiffLoading(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.PREVIEW_MERGE })
      if (response?.success && response.data) {
        setDiffPreview(response.data as MergePreviewData)
        setDiffModalOpen(true)
      } else {
        setError(response?.error || '获取差异失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Preview merge failed:', err)
      setError('获取差异失败')
    } finally {
      setDiffLoading(false)
    }
  }

  /**
   * Handle confirm merge from diff modal
   */
  const handleConfirmMerge = async () => {
    setDiffModalOpen(false)
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_AND_MERGE })
      if (response?.success) {
        setSuccess('合并成功')
        await loadBackupStatus()
      } else {
        setError(response?.error || '合并失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Merge from cloud failed:', err)
      setError('合并失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle emergency export - export all data when both backups failed
   */
  const handleEmergencyExport = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.EMERGENCY_EXPORT })
      if (response?.success) {
        setSuccess('数据已导出')
      } else {
        setError(response?.error || '导出失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Emergency export failed:', err)
      setError('导出失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full p-4">
      <div className="w-full p-4 bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">数据备份</h3>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 mb-3 bg-red-50 rounded-lg border border-red-200">
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="p-3 mb-3 bg-green-50 rounded-lg border border-green-200">
          <span className="text-sm text-green-800">{success}</span>
        </div>
      )}

      {/* Status rows */}
      <div className="space-y-1 mb-3">
        <BackupStatusRow
          target="cloud"
          status={status?.cloud ?? null}
          onLogin={handleLogin}
          onClickError={() => setShowMoreOptions(true)}
        />
        <BackupStatusRow
          target="local"
          status={status?.local ?? null}
          onRestorePermission={handleRestorePermission}
          onClickError={() => setShowMoreOptions(true)}
        />
      </div>

      {/* Enable local backup button (if not configured) */}
      {status?.local && !status.local.enabled && (
        <div className="pt-2">
          <Button
            onClick={handleEnableFolder}
            disabled={loading}
            className="w-full h-9"
          >
            <FolderOpen className="w-4 h-4" />
            {loading ? '处理中...' : '选择备份文件夹'}
          </Button>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            选择文件夹后，每次编辑提示词将自动备份到此文件夹
          </p>
        </div>
      )}

      {/* More options toggle */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowMoreOptions(!showMoreOptions)}
          className="w-full flex items-center justify-between py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <span>更多选项</span>
          {showMoreOptions ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {showMoreOptions && (
          <BackupMoreOptions
            status={status}
            onLogout={handleLogout}
            onChangeFolder={handleChangeFolder}
            onViewHistory={handleViewHistory}
            onMergeFromCloud={handleMergeFromCloud}
            onViewDiff={handleViewDiff}
            onEmergencyExport={handleEmergencyExport}
            loading={loading}
          />
        )}
      </div>

      {/* Info text */}
      <p className="text-xs text-gray-500 mt-3 leading-relaxed">
        备份在每次编辑提示词后自动触发，无需手动操作
      </p>

      {/* Auth Modal for GitHub OAuth login */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Merge Preview Modal for viewing cloud vs local diff */}
      <MergePreviewModal
        open={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        preview={diffPreview}
        onConfirm={handleConfirmMerge}
        loading={diffLoading}
      />

      {/* History Modal for viewing backup versions */}
      <HistoryModal
        open={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false)
          setHistoryError(null) // Clear error on close
        }}
        versions={historyVersions}
        loading={historyLoading}
        error={historyError}
        onRestore={handleRestoreFromBackup}
      />
      </div>
    </div>
  )
}