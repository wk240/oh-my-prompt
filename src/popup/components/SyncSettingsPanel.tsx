import { useState, useEffect } from 'react'
import { getSyncStatus, enableSync, disableSync, manualSync, changeSyncFolder } from '../../lib/sync/sync-manager'
import type { SyncStatus } from '../../lib/sync/sync-manager'
import { Button } from './ui/button'

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

export function SyncSettingsPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    const currentStatus = await getSyncStatus()
    setStatus(currentStatus)
  }

  const handleEnable = async () => {
    setLoading(true)
    setError(null)
    const result = await enableSync()
    setLoading(false)

    if (result.success) {
      await loadStatus()
    } else {
      setError(result.error || '启用失败')
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    await disableSync()
    setLoading(false)
    await loadStatus()
  }

  const handleManualSync = async () => {
    setLoading(true)
    setError(null)
    const result = await manualSync()
    setLoading(false)

    if (result.success) {
      await loadStatus()
    } else {
      setError(result.error || '同步失败')
    }
  }

  const handleChangeFolder = async () => {
    setLoading(true)
    setError(null)
    const result = await changeSyncFolder()
    setLoading(false)

    if (result.success) {
      await loadStatus()
    } else {
      setError(result.error || '更换文件夹失败')
    }
  }

  if (!status) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="p-4 border-b">
      <h3 className="text-sm font-medium mb-3">本地备份同步</h3>

      <div className="space-y-3">
        {status.enabled ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm">状态</span>
              <span className="text-sm text-green-600">已启用</span>
            </div>

            {status.folderName && (
              <div className="flex items-center justify-between">
                <span className="text-sm">备份文件夹</span>
                <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                  {status.folderName}
                </span>
              </div>
            )}

            {status.lastSyncTime && (
              <div className="flex items-center justify-between">
                <span className="text-sm">最后同步</span>
                <span className="text-sm text-muted-foreground">
                  {formatTimestamp(status.lastSyncTime)}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSync}
                disabled={loading}
              >
                立即同步
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleChangeFolder}
                disabled={loading}
              >
                更换文件夹
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisable}
                disabled={loading}
              >
                禁用
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {status.hasFolder
                ? '同步已禁用，但文件夹已保存。启用后将自动复用之前的文件夹。'
                : '启用自动备份到本地文件夹，数据变更时自动同步。'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnable}
              disabled={loading}
            >
              {status.hasFolder ? '启用同步' : '选择文件夹并启用'}
            </Button>
            {status.hasFolder && status.folderName && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleChangeFolder}
                disabled={loading}
              >
                更换文件夹
              </Button>
            )}
          </>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <p className="text-xs text-muted-foreground">
          提示：扩展卸载后数据仍可从此文件夹恢复
        </p>
      </div>
    </div>
  )
}

export default SyncSettingsPanel