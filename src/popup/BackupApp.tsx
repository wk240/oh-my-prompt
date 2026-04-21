import { useState, useEffect } from 'react'
import { getSyncStatus, enableSync, disableSync, changeSyncFolder, manualSync, getBackupVersions, restoreFromBackup } from '../lib/sync/sync-manager'
import type { SyncStatus } from '../lib/sync/sync-manager'
import type { BackupVersion } from '../lib/sync/file-sync'
import { Button } from './components/ui/button'
import { Check, FolderOpen, RefreshCw, X, History, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './components/ui/dialog'

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function BackupApp() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(true)
  const [versions, setVersions] = useState<BackupVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; version: BackupVersion | null }>({ open: false, version: null })
  const [backupBeforeRestore, setBackupBeforeRestore] = useState(true)

  useEffect(() => {
    loadStatus()
  }, [])

  // Load versions when status is ready and history is shown
  useEffect(() => {
    if (status?.hasFolder && status?.enabled && showHistory && versions.length === 0) {
      setVersionsLoading(true)
      getBackupVersions().then((result) => {
        setVersions(result.versions)
        if (result.error) {
          setError(result.error)
        }
        setVersionsLoading(false)
      })
    }
  }, [status, showHistory])

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
      // Refresh history list if visible
      if (showHistory) {
        const versionsResult = await getBackupVersions()
        setVersions(versionsResult.versions)
      }
    } else {
      // Permission error on existing folder - auto trigger new folder selection
      if (result.error?.includes('权限') || result.error?.includes('更换文件夹')) {
        const changeResult = await changeSyncFolder()
        if (changeResult.success) {
          setSuccess('文件夹已更换，备份已启用')
          await loadStatus()
        } else {
          setError(changeResult.error || '选择文件夹失败')
        }
      } else {
        setError(result.error || '选择文件夹失败')
      }
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
      // Refresh history list if visible
      if (showHistory) {
        const versionsResult = await getBackupVersions()
        setVersions(versionsResult.versions)
      }
    } else {
      // Permission lost - auto trigger folder selection
      if (result.error?.includes('权限') || result.error?.includes('重新选择')) {
        await handleChangeFolder()
      } else {
        setError(result.error || '备份失败')
      }
    }
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

  const handleShowHistory = async () => {
    setShowHistory(!showHistory)
    if (!showHistory) {
      setVersionsLoading(true)
      const result = await getBackupVersions()
      setVersions(result.versions)
      if (result.error) {
        setError(result.error)
      }
      setVersionsLoading(false)
    }
  }

  const handleRestoreClick = (version: BackupVersion) => {
    setRestoreDialog({ open: true, version })
    setBackupBeforeRestore(true)
  }

  const handleRestoreConfirm = async () => {
    if (!restoreDialog.version) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    const result = await restoreFromBackup(restoreDialog.version.filename, backupBeforeRestore)
    setLoading(false)

    if (result.success) {
      setSuccess('恢复成功')
      setRestoreDialog({ open: false, version: null })
      await loadStatus()
      // Refresh history list
      setShowHistory(true)
      const versionsResult = await getBackupVersions()
      setVersions(versionsResult.versions)
      // Notify content script to refresh data
      try {
        await chrome.runtime.sendMessage({ type: 'REFRESH_DATA' })
      } catch (err) {
        console.warn('[Oh My Prompt Script] Failed to notify refresh:', err)
      }
    } else {
      setError(result.error || '恢复失败')
    }
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

        {/* History versions section */}
        {status.hasFolder && status.enabled && (
          <div className="border-t border-gray-200">
            <button
              onClick={handleShowHistory}
              className="w-full p-3 flex items-center justify-between hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <History style={{ width: 16, height: 16 }} />
                查看历史版本
              </span>
              <span className="text-xs text-gray-500">
                {showHistory ? '收起' : '展开'}
              </span>
            </button>

            {showHistory && (
              <div className="p-3 bg-gray-50 max-h-[260px] overflow-y-auto">
                {versionsLoading ? (
                  <span className="text-sm text-gray-500">加载中...</span>
                ) : versions.length === 0 ? (
                  <span className="text-sm text-gray-500">暂无历史版本</span>
                ) : (
                  versions.map((v) => (
                    <div
                      key={v.filename}
                      className="flex items-center justify-between p-2 bg-white rounded border border-gray-100 mb-2 last:mb-0"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-900">
                          {v.isLatest ? '最新版本' : formatTimestamp(new Date(v.backupTime).getTime())}
                        </div>
                        <div className="text-xs text-gray-500">
                          {v.promptCount} 个提示词 · {v.categoryCount} 个分类
                        </div>
                      </div>
                      {!v.isLatest && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreClick(v)}
                          disabled={loading}
                        >
                          <RotateCcw style={{ width: 14, height: 14 }} />
                          恢复
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Restore confirmation dialog */}
      <Dialog open={restoreDialog.open} onOpenChange={(open) => setRestoreDialog({ open, version: restoreDialog.version })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认恢复</DialogTitle>
            <DialogDescription>
              将从以下版本恢复数据：
            </DialogDescription>
          </DialogHeader>

          {restoreDialog.version && (
            <div className="p-3 bg-gray-50 rounded text-sm">
              <div className="font-medium text-gray-900">
                {formatTimestamp(new Date(restoreDialog.version.backupTime).getTime())}
              </div>
              <div className="text-gray-500 mt-1">
                {restoreDialog.version.promptCount} 个提示词 · {restoreDialog.version.categoryCount} 个分类
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded text-sm text-yellow-800">
            <span>⚠️</span>
            <span>此操作将完全替换当前数据</span>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={backupBeforeRestore}
              onChange={(e) => setBackupBeforeRestore(e.target.checked)}
              className="rounded"
            />
            恢复前先备份当前数据
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog({ open: false, version: null })}>
              取消
            </Button>
            <Button onClick={handleRestoreConfirm} disabled={loading}>
              {loading ? '恢复中...' : '确认恢复'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default BackupApp