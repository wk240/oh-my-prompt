import { Cloud, HardDrive, RefreshCw, Clock, Check, AlertTriangle, LogIn, FolderOpen } from 'lucide-react'
import type { BackupTargetStatus } from '@/lib/sync/types'

interface BackupStatusRowProps {
  target: 'cloud' | 'local'
  status: BackupTargetStatus | null
  onLogin?: () => void        // For cloud login
  onRestorePermission?: () => void  // For local permission restore
  onClickError?: () => void   // For showing error details
}

/**
 * Format relative time from timestamp
 */
function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '从未'

  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${Math.floor(diff / 86400000)} 天前`
}

/**
 * Format retry countdown
 */
function formatRetryWait(scheduledAt: number): string {
  const diff = scheduledAt - Date.now()
  if (diff <= 0) return '即将重试'
  if (diff < 60000) return `${Math.ceil(diff / 1000)} 秒后`
  if (diff < 3600000) return `${Math.ceil(diff / 60000)} 分钟后`
  return `${Math.ceil(diff / 3600000)} 小时后`
}

/**
 * BackupStatusRow - Displays backup status for a single target (cloud or local)
 *
 * Status display priority:
 * 1. syncing in progress
 * 2. retry scheduled
 * 3. not logged in (cloud only)
 * 4. not enabled
 * 5. permission denied (local only)
 * 6. continuous failures
 * 7. success
 * 8. never synced (default)
 */
export function BackupStatusRow({
  target,
  status,
  onLogin,
  onRestorePermission,
  onClickError
}: BackupStatusRowProps) {
  // Target icon and label
  const TargetIcon = target === 'cloud' ? Cloud : HardDrive
  const targetLabel = target === 'cloud' ? '云端备份' : '本地备份'

  // Handle null status (loading state)
  if (!status) {
    return (
      <div className="flex items-center justify-between py-1.5">
        <div className="flex items-center gap-2">
          <TargetIcon className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{targetLabel}</span>
        </div>
        <span className="text-sm text-gray-400">加载中...</span>
      </div>
    )
  }

  // Determine status display based on priority
  const renderStatus = () => {
    // 1. Syncing in progress
    if (status.syncing) {
      return (
        <span className="flex items-center gap-1.5 text-sm text-blue-600">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>同步中...</span>
        </span>
      )
    }

    // 2. Retry scheduled
    if (status.retryScheduledAt && status.retryCount > 0) {
      return (
        <span className="flex items-center gap-1.5 text-sm text-yellow-600">
          <Clock className="w-3.5 h-3.5" />
          <span>等待重试 (第{status.retryCount}次) · {formatRetryWait(status.retryScheduledAt)}</span>
        </span>
      )
    }

    // 3. Not logged in (cloud only)
    if (target === 'cloud' && !status.loggedIn) {
      return (
        <button
          onClick={onLogin}
          className="flex items-center gap-1.5 text-sm text-yellow-600 hover:text-yellow-700 cursor-pointer transition-colors"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>未登录 · 点击登录</span>
        </button>
      )
    }

    // 4. Not enabled
    if (!status.enabled) {
      return (
        <span className="flex items-center gap-1.5 text-sm text-gray-400">
          <span>未启用</span>
        </span>
      )
    }

    // 5. Permission denied (local only)
    if (target === 'local' && status.permissionStatus === 'denied') {
      return (
        <button
          onClick={onRestorePermission}
          className="flex items-center gap-1.5 text-sm text-yellow-600 hover:text-yellow-700 cursor-pointer transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>权限丢失 · 点击修复</span>
        </button>
      )
    }

    // 6. Continuous failures (error state)
    if (status.error && status.retryCount >= 3) {
      return (
        <button
          onClick={onClickError}
          className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 cursor-pointer transition-colors"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>备份失败 · 点击查看</span>
        </button>
      )
    }

    // 7. Success (has lastSyncTime)
    if (status.lastSyncTime) {
      return (
        <span className="flex items-center gap-1.5 text-sm text-green-600">
          <Check className="w-3.5 h-3.5" />
          <span>已同步 · {formatRelativeTime(status.lastSyncTime)}</span>
        </span>
      )
    }

    // 8. Never synced (default)
    return (
      <span className="text-sm text-gray-400">
        {formatRelativeTime(null)}
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <TargetIcon className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{targetLabel}</span>
      </div>
      {renderStatus()}
    </div>
  )
}