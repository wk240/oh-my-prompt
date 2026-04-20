import { useState, useEffect } from 'react'
import { getSyncStatus, enableSync, disableSync, changeSyncFolder, manualSync } from '../lib/sync/sync-manager'
import type { SyncStatus } from '../lib/sync/sync-manager'
import { Button } from './components/ui/button'
import { Check, FolderOpen, RefreshCw, X } from 'lucide-react'

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

function getSourceTabId(): number | null {
  const params = new URLSearchParams(window.location.search)
  const tabId = params.get('sourceTabId')
  return tabId ? parseInt(tabId, 10) : null
}

function BackupApp() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const currentStatus = await getSyncStatus()
      setStatus(currentStatus)
      setError(null)
    } catch (err) {
      setError('获取状态失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    const result = await enableSync()
    setLoading(false)

    if (result.success) {
      setSuccess('备份已启用')
      await loadStatus()
      await handleCloseWithRefreshDelayed()
    } else {
      setError(result.error || '选择文件夹失败')
    }
  }

  const handleBackupNow = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const result = await manualSync()
    setLoading(false)

    if (result.success) {
      setSuccess('备份成功')
      await loadStatus()
      await handleCloseWithRefreshDelayed()
    } else {
      setError(result.error || '备份失败')
    }
  }

  const handleCloseWithRefreshDelayed = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const sourceTabId = getSourceTabId()
    if (sourceTabId) {
      try {
        await chrome.runtime.sendMessage({ type: 'REFRESH_DATA' })
        await chrome.tabs.sendMessage(sourceTabId, { type: 'REFRESH_DATA' })
      } catch (err) {
        console.warn('[Oh My Prompt Script] Failed to notify source tab:', err)
      }
    }
    window.close()
  }

  const handleChangeFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    const result = await changeSyncFolder()
    setLoading(false)

    if (result.success) {
      setSuccess('文件夹已更换')
      await loadStatus()
    } else {
      setError(result.error || '更换文件夹失败')
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    await disableSync()
    setLoading(false)
    await loadStatus()
  }

  if (!status) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <span className="text-muted-foreground text-base">加载中...</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h1 className="text-base font-semibold text-gray-900">本地备份设置</h1>
            {!status.hasFolder && (
              <p className="text-sm text-gray-500 mt-1">
                选择文件夹以启用备份，数据变更时自动同步
              </p>
            )}
          </div>
          <button
            onClick={() => window.close()}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Status row */}
          {status.hasFolder && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">状态</span>
              <span className={`text-sm flex items-center gap-1 ${status.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                {status.enabled && <Check style={{ width: 14, height: 14 }} />}
                {status.enabled ? '已启用' : '同步已禁用'}
              </span>
            </div>
          )}

          {/* Folder name */}
          {status.hasFolder && status.folderName && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">备份文件夹</span>
              <span className="text-sm text-gray-500 truncate max-w-[200px]">
                {status.folderName}
              </span>
            </div>
          )}

          {/* Last sync time */}
          {status.enabled && status.lastSyncTime && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">上次备份</span>
              <span className="text-sm text-gray-500">
                {formatTimestamp(status.lastSyncTime)}
              </span>
            </div>
          )}

          {/* Description for disabled state */}
          {status.hasFolder && !status.enabled && (
            <p className="text-sm text-gray-500">
              文件夹已保存，启用后将自动复用之前的文件夹。
            </p>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Success message */}
          {success && (
            <p className="text-sm text-green-600">{success}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            {!status.hasFolder ? (
              <Button onClick={handleSelectFolder} disabled={loading}>
                <FolderOpen style={{ width: 16, height: 16 }} />
                {loading ? '处理中...' : '选择文件夹并启用'}
              </Button>
            ) : !status.enabled ? (
              <>
                <Button onClick={handleSelectFolder} disabled={loading}>
                  {loading ? '处理中...' : '启用备份'}
                </Button>
                <Button variant="outline" onClick={handleChangeFolder} disabled={loading}>
                  更换文件夹
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleBackupNow} disabled={loading}>
                  <RefreshCw style={{ width: 16, height: 16 }} />
                  {loading ? '备份中...' : '立即备份'}
                </Button>
                <Button variant="outline" onClick={handleChangeFolder} disabled={loading}>
                  更换文件夹
                </Button>
                <Button variant="ghost" onClick={handleDisable} disabled={loading}>
                  禁用
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-gray-500 pt-2">
            提示：扩展卸载后数据仍可从此文件夹恢复
          </p>
        </div>
      </div>
    </div>
  )
}

export default BackupApp