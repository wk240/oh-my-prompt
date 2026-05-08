import { useState, useEffect } from 'react'
import {
  getSyncStatus,
  enableSync,
  disableSync,
  changeSyncFolder,
  manualSync,
  getBackupVersions,
  restoreFromBackup,
  restorePermission
} from '@/lib/sync/sync-manager'
import type { SyncStatus, ExistingBackupInfo } from '@/lib/sync/sync-manager'
import type { BackupVersion } from '@/lib/sync/file-sync'
import { MessageType } from '@/shared/messages'
import { BackupStatusCard } from './components/BackupStatusCard'
import { VersionCard } from './components/VersionCard'
import { RestoreDialog } from './components/RestoreDialog'
import { Button } from '@/popup/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/popup/components/ui/dialog'
import { History, ChevronDown, ChevronUp } from 'lucide-react'

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

export function BackupSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<BackupVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; version: BackupVersion | null }>({ open: false, version: null })
  const [backupBeforeRestore, setBackupBeforeRestore] = useState(true)
  const [loadBackupDialog, setLoadBackupDialog] = useState<{ open: boolean; info: ExistingBackupInfo | null }>({ open: false, info: null })

  useEffect(() => {
    loadStatus()
  }, [])

  // Load versions when history section is expanded
  useEffect(() => {
    if (status?.hasFolder && status.permissionStatus === 'granted' && showHistory) {
      loadVersions()
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

  const loadVersions = async () => {
    setVersionsLoading(true)
    const result = await getBackupVersions()
    setVersions(result.versions)
    if (result.error) {
      setError(result.error)
    }
    setVersionsLoading(false)
  }

  const handleSelectFolder = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    const result = await enableSync()
    setLoading(false)

    if (result.success) {
      // Check if there's an existing backup to load
      if (result.existingBackup?.hasBackup) {
        setLoadBackupDialog({ open: true, info: result.existingBackup })
        await loadStatus()
      } else {
        setSuccess('备份已启用')
        await loadStatus()
        // Refresh history list if visible
        if (showHistory) {
          loadVersions()
        }
      }
    } else {
      // Permission error on existing folder - auto trigger new folder selection
      if (result.error?.includes('权限') || result.error?.includes('更换文件夹')) {
        const changeResult = await changeSyncFolder()
        if (changeResult.success) {
          if (changeResult.existingBackup?.hasBackup) {
            setLoadBackupDialog({ open: true, info: changeResult.existingBackup })
            await loadStatus()
          } else {
            setSuccess('文件夹已更换，备份已启用')
            await loadStatus()
          }
        } else {
          setError(changeResult.error || '选择文件夹失败')
        }
      } else {
        setError(result.error || '选择文件夹失败')
      }
    }
  }

  const handleLoadBackupConfirm = async () => {
    if (!loadBackupDialog.info) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    // Load from the latest backup file (omps-latest.json)
    const result = await restoreFromBackup('omps-latest.json', false)
    setLoading(false)

    if (result.success) {
      setSuccess('已加载备份文件')
      setLoadBackupDialog({ open: false, info: null })
      await loadStatus()
      // Refresh history list
      setShowHistory(true)
      loadVersions()
      // Notify content script to refresh data
      try {
        await chrome.runtime.sendMessage({ type: MessageType.REFRESH_DATA })
      } catch (err) {
        console.warn('[Oh My Prompt] Failed to notify refresh:', err)
      }
    } else {
      setError(result.error || '加载备份失败')
    }
  }

  const handleSkipLoadBackup = async () => {
    setLoadBackupDialog({ open: false, info: null })
    setSuccess('备份已启用')
    // Refresh history list if visible
    if (showHistory) {
      loadVersions()
    }
  }

  const handleBackupNow = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const result = await manualSync()
    setLoading(false)

    if (result.success) {
      setSuccess(result.createdNewBackup ? '备份成功' : '内容无变更')
      await loadStatus()
      // Refresh history list if visible
      if (showHistory) {
        loadVersions()
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
      // Check if there's an existing backup to load
      if (result.existingBackup?.hasBackup) {
        setLoadBackupDialog({ open: true, info: result.existingBackup })
        await loadStatus()
        // Refresh history list with new folder's backups
        if (showHistory) {
          loadVersions()
        }
      } else {
        setSuccess('文件夹已更换')
        await loadStatus()
        // Refresh history list with new folder's backups
        if (showHistory) {
          loadVersions()
        }
      }
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

  const handleRestorePermission = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const result = await restorePermission()
    setLoading(false)

    if (result.success) {
      setSuccess('权限已恢复，备份已同步')
      await loadStatus()
      // Refresh history list if visible
      if (showHistory) {
        loadVersions()
      }
    } else {
      // If permission denied or other error, show change folder option
      if (result.error?.includes('拒绝') || result.error?.includes('重新选择')) {
        setError('权限被拒绝，请更换文件夹')
      } else {
        setError(result.error || '恢复权限失败')
      }
    }
  }

  const handleShowHistory = async () => {
    const newShowHistory = !showHistory
    setShowHistory(newShowHistory)
    if (newShowHistory) {
      loadVersions()
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
      loadVersions()
      // Notify content script to refresh data
      try {
        await chrome.runtime.sendMessage({ type: MessageType.REFRESH_DATA })
      } catch (err) {
        console.warn('[Oh My Prompt] Failed to notify refresh:', err)
      }
    } else {
      setError(result.error || '恢复失败')
    }
  }

  return (
    <div className="w-full space-y-4 p-4">
      {/* Status Card */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-4">本地备份</h3>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        {/* Success message */}
        {success && (
          <p className="text-sm text-green-600 mb-4">{success}</p>
        )}

        <BackupStatusCard
          status={status}
          loading={loading}
          onSelectFolder={handleSelectFolder}
          onBackupNow={handleBackupNow}
          onChangeFolder={handleChangeFolder}
          onRestorePermission={handleRestorePermission}
          onDisable={handleDisable}
        />

        {/* Tip */}
        <p className="text-xs text-gray-500 mt-4">
          提示：扩展卸载后数据仍可从此文件夹恢复
        </p>
      </div>

      {/* History Versions - only show when folder configured and permission granted */}
      {status?.hasFolder && status.permissionStatus === 'granted' && (
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <button
            onClick={handleShowHistory}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <History className="w-4 h-4" />
              历史版本
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              {showHistory ? (
                <>
                  收起
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  展开
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </span>
          </button>

          {showHistory && (
            <div className="mt-4 space-y-2">
              {versionsLoading ? (
                <span className="text-sm text-gray-500 py-2">加载中...</span>
              ) : versions.length === 0 ? (
                <span className="text-sm text-gray-500 py-2">暂无历史版本</span>
              ) : (
                versions.map((v) => (
                  <VersionCard
                    key={v.filename}
                    version={v}
                    loading={loading}
                    onRestore={handleRestoreClick}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Restore confirmation dialog */}
      <RestoreDialog
        open={restoreDialog.open}
        version={restoreDialog.version}
        loading={loading}
        backupBeforeRestore={backupBeforeRestore}
        onBackupBeforeRestoreChange={setBackupBeforeRestore}
        onConfirm={handleRestoreConfirm}
        onCancel={() => setRestoreDialog({ open: false, version: null })}
      />

      {/* Load existing backup dialog */}
      <Dialog open={loadBackupDialog.open} onOpenChange={(open) => setLoadBackupDialog({ open, info: loadBackupDialog.info })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>发现备份文件</DialogTitle>
            <DialogDescription>
              该文件夹中已有备份文件，是否加载？
            </DialogDescription>
          </DialogHeader>

          {loadBackupDialog.info && (
            <div className="p-3 bg-gray-50 rounded text-sm">
              <div className="font-medium text-gray-900">
                {loadBackupDialog.info.promptCount} 个提示词 · {loadBackupDialog.info.categoryCount} 个分类
              </div>
              {loadBackupDialog.info.backupTime && (
                <div className="text-gray-500 mt-1">
                  备份时间：{formatTimestamp(new Date(loadBackupDialog.info.backupTime).getTime())}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 p-2 mt-2 bg-blue-50 rounded text-sm text-blue-800">
            <span>💡</span>
            <span>加载后将替换当前数据</span>
          </div>

          <DialogFooter className="py-3 pt-2">
            <Button variant="outline" onClick={handleSkipLoadBackup}>
              跳过
            </Button>
            <Button onClick={handleLoadBackupConfirm} disabled={loading}>
              {loading ? '恢复中...' : '恢复备份'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}