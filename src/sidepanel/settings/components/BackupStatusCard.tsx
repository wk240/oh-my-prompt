import { Check, FolderOpen, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import type { SyncStatus } from '@/lib/sync/sync-manager'

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface BackupStatusCardProps {
  status: SyncStatus | null
  loading: boolean
  onSelectFolder: () => void
  onBackupNow: () => void
  onChangeFolder: () => void
  onRestorePermission: () => void
  onDisable: () => void
}

export function BackupStatusCard({
  status,
  loading,
  onSelectFolder,
  onBackupNow,
  onChangeFolder,
  onRestorePermission,
  onDisable
}: BackupStatusCardProps) {
  // Loading state
  if (!status) {
    return (
      <div className="flex items-center justify-center py-6">
        <span className="text-sm text-gray-500">加载中...</span>
      </div>
    )
  }

  // Permission restore banner - permission needs restoration
  if (status.hasFolder && status.permissionStatus === 'prompt') {
    return (
      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-800">需要重新授权文件夹权限</span>
        </div>
        <Button
          size="sm"
          onClick={onRestorePermission}
          disabled={loading}
          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          {loading ? '处理中...' : '恢复权限'}
        </Button>
      </div>
    )
  }

  // Permission denied banner - permanently denied
  if (status.hasFolder && status.permissionStatus === 'denied') {
    return (
      <div className="p-3 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-800">文件夹权限被拒绝</span>
        </div>
        <Button
          size="sm"
          onClick={onChangeFolder}
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-700 text-white"
        >
          {loading ? '处理中...' : '更换文件夹'}
        </Button>
      </div>
    )
  }

  // No folder configured
  if (!status.hasFolder) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          选择文件夹以启用备份，数据变更时自动同步
        </p>
        <Button
          onClick={onSelectFolder}
          disabled={loading}
          className="w-full"
        >
          <FolderOpen className="w-4 h-4" />
          {loading ? '处理中...' : '选择文件夹'}
        </Button>
      </div>
    )
  }

  // Permission granted - show status info
  return (
    <div className="space-y-3">
      {/* Enabled status */}
      {status.enabled && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">状态</span>
          <span className="text-sm flex items-center gap-1 text-green-600">
            <Check className="w-4 h-4" />
            已启用
          </span>
        </div>
      )}

      {/* Folder name */}
      {status.folderName && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">备份文件夹</span>
          <span className="text-sm text-gray-500 truncate max-w-[140px]">
            {status.folderName}
          </span>
        </div>
      )}

      {/* Last sync time */}
      {status.lastSyncTime && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">上次备份</span>
          <span className="text-sm text-gray-500">
            {formatTimestamp(status.lastSyncTime)}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {status.permissionStatus === 'granted' && (
          <Button
            onClick={onBackupNow}
            disabled={loading}
            size="sm"
            className="flex-1"
          >
            <RefreshCw className="w-4 h-4" />
            {loading ? '备份中...' : '立即备份'}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onChangeFolder}
          disabled={loading}
          size="sm"
        >
          更换
        </Button>
        {status.enabled && status.permissionStatus === 'granted' && (
          <Button
            variant="ghost"
            onClick={onDisable}
            disabled={loading}
            size="sm"
          >
            禁用
          </Button>
        )}
      </div>
    </div>
  )
}