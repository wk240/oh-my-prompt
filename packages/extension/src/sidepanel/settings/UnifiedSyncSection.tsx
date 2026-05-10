import { useState, useEffect, useCallback } from 'react'
import {
  Cloud,
  HardDrive,
  RefreshCw,
  Download,
  Upload,
  FolderOpen,
  AlertTriangle,
  Check,
  X,
  LogIn,
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw
} from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/popup/components/ui/dialog'
import type { UnifiedSyncStatus } from '@/lib/sync/types'
import type { BackupVersion } from '@/lib/sync/file-sync'
import { createSyncOrchestrator } from '@/lib/sync'
import type { SyncOrchestrator } from '@/lib/sync/orchestrator'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { getBackupVersions, restoreFromBackup } from '@/lib/sync/sync-manager'

const POLL_INTERVAL = 10000 // 10 seconds

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return '从未'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Status indicator component
 * Shows green/yellow/red indicator based on sync status
 */
function StatusIndicator({ status }: { status: 'green' | 'yellow' | 'red' | 'gray' }) {
  const colorMap = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400'
  }

  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorMap[status]}`} />
  )
}

/**
 * UnifiedSyncSection - Unified Cloud Sync and Local Backup UI
 *
 * Features:
 * - Cloud Sync status with login prompt, manual sync, restore from cloud
 * - Local Backup status with folder selection, backup now
 * - Pending upload warning for local-only items
 * - Polls status every 10 seconds
 */
export function UnifiedSyncSection() {
  const [status, setStatus] = useState<UnifiedSyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [orchestrator] = useState<SyncOrchestrator>(() => createSyncOrchestrator())
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Backup history states
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<BackupVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; version: BackupVersion | null }>({ open: false, version: null })
  const [backupBeforeRestore, setBackupBeforeRestore] = useState(true)

  // Load status on mount and poll every 10 seconds
  const loadStatus = useCallback(async () => {
    try {
      const currentStatus = await orchestrator.getStatus()
      setStatus(currentStatus)
      setError(null)
    } catch (err) {
      console.error('[Oh My Prompt] Failed to load sync status:', err)
      setError('获取状态失败')
    }
  }, [orchestrator])

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [loadStatus])

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

  // Load versions when history section is expanded
  useEffect(() => {
    if (status?.localEnabled && status.permissionStatus === 'granted' && showHistory) {
      loadVersions()
    }
  }, [status, showHistory])

  const loadVersions = async () => {
    setVersionsLoading(true)
    const result = await getBackupVersions()
    setVersions(result.versions)
    if (result.error) {
      setError(result.error)
    }
    setVersionsLoading(false)
  }

  const handleRestore = async () => {
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
      if (showHistory) {
        loadVersions()
      }
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

  function formatBackupTime(backupTime: string): string {
    if (!backupTime) return '未知时间'
    const date = new Date(backupTime)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Handle manual cloud sync
   */
  const handleManualSync = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Get current storage data
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
      if (!response?.success || !response.data) {
        setError('获取数据失败')
        setLoading(false)
        return
      }

      const data = response.data
      const backupData = {
        prompts: data.userData?.prompts || [],
        categories: data.userData?.categories || [],
        temporaryPrompts: data.temporaryPrompts || [],
        timestamp: Date.now()
      }

      await orchestrator.triggerSync(backupData)
      setSuccess('同步成功')
      await loadStatus()
    } catch (err) {
      console.error('[Oh My Prompt] Manual sync failed:', err)
      setError('同步失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle download and merge from cloud
   */
  const handleDownloadAndMerge = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await orchestrator.downloadAndMerge()

      if (result.localOnlyItems.prompts.length > 0 ||
          result.localOnlyItems.categories.length > 0 ||
          result.localOnlyItems.temporaryPrompts.length > 0) {
        // Show upload dialog for local-only items
        setShowUploadDialog(true)
      } else {
        setSuccess('下载成功')
      }

      await loadStatus()

      // Notify content script to refresh data
      try {
        await chrome.runtime.sendMessage({ type: MessageType.REFRESH_DATA })
      } catch (err) {
        console.warn('[Oh My Prompt] Failed to notify refresh:', err)
      }
    } catch (err) {
      console.error('[Oh My Prompt] Download and merge failed:', err)
      setError('下载失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle upload local-only items
   */
  const handleUploadLocalOnly = async () => {
    setUploading(true)
    setError(null)

    try {
      await orchestrator.uploadLocalOnlyItems()
      setSuccess('上传成功')
      setShowUploadDialog(false)
      await loadStatus()
    } catch (err) {
      console.error('[Oh My Prompt] Upload local-only failed:', err)
      setError('上传失败')
    } finally {
      setUploading(false)
    }
  }

  /**
   * Open login page for cloud sync
   */
  const handleLogin = () => {
    // Open web app login page
    const WEB_APP_URL = 'https://oh-my-prompt.com'
    chrome.tabs.create({ url: `${WEB_APP_URL}/login` })
  }

  // Compute status colors
  const getCloudStatusColor = (): 'green' | 'yellow' | 'red' | 'gray' => {
    if (!status) return 'gray'
    if (!status.cloudLoggedIn) return 'gray'
    if (status.cloudError) return 'red'
    if (status.pendingCloudSync || status.pendingUpload) return 'yellow'
    return 'green'
  }

  const getLocalStatusColor = (): 'green' | 'yellow' | 'red' | 'gray' => {
    if (!status) return 'gray'
    if (!status.localEnabled) return 'gray'
    if (status.localError) return 'red'
    if (status.hasUnsyncedChanges) return 'yellow'
    if (status.permissionStatus !== 'granted') return 'yellow'
    return 'green'
  }

  // Count local-only items
  const localOnlyCount = status?.localOnlyItems
    ? (status.localOnlyItems.promptIds.length +
       status.localOnlyItems.categoryIds.length +
       status.localOnlyItems.temporaryPromptIds.length)
    : 0

  return (
    <div className="w-full space-y-4 p-4">
      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
          <X className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-800">{success}</span>
        </div>
      )}

      {/* Cloud Sync Section */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Cloud className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-medium text-gray-900">云端同步</h3>
          <StatusIndicator status={getCloudStatusColor()} />
        </div>

        {!status ? (
          <div className="flex items-center justify-center py-4">
            <span className="text-sm text-gray-500">加载中...</span>
          </div>
        ) : !status.cloudLoggedIn ? (
          // Not logged in - show login prompt
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              登录后可启用云端同步，跨设备同步数据
            </p>
            <Button
              onClick={handleLogin}
              className="w-full h-10"
            >
              <LogIn className="w-4 h-4" />
              登录
            </Button>
          </div>
        ) : (
          // Logged in - show status and actions
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">状态</span>
              <span className="text-sm flex items-center gap-1.5 text-green-600">
                <Check className="w-4 h-4" />
                已登录
              </span>
            </div>

            {status.lastCloudSyncTime && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">上次同步</span>
                <span className="text-sm text-gray-500">
                  {formatTimestamp(status.lastCloudSyncTime)}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleManualSync}
                disabled={loading}
                size="sm"
                className="flex-1 h-9"
              >
                <Upload className="w-4 h-4" />
                {loading ? '同步中...' : '上传到云端'}
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadAndMerge}
                disabled={loading}
                size="sm"
                className="flex-1 h-9"
              >
                <Download className="w-4 h-4" />
                {loading ? '下载中...' : '下载到本地'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Local Backup Section */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">本地备份</h3>
          <StatusIndicator status={getLocalStatusColor()} />
        </div>

        {!status ? (
          <div className="flex items-center justify-center py-4">
            <span className="text-sm text-gray-500">加载中...</span>
          </div>
        ) : !status.localEnabled ? (
          // No folder configured
          <div className="space-y-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              选择文件夹以启用本地备份，扩展卸载后数据仍可从此恢复
            </p>
            <Button
              onClick={() => {
                // Use existing sync-manager function
                import('@/lib/sync/sync-manager').then(({ enableSync }) => {
                  setLoading(true)
                  enableSync().then(result => {
                    setLoading(false)
                    if (result.success) {
                      setSuccess('备份已启用')
                      loadStatus()
                    } else {
                      setError(result.error || '选择文件夹失败')
                    }
                  })
                })
              }}
              disabled={loading}
              className="w-full h-10"
            >
              <FolderOpen className="w-4 h-4" />
              {loading ? '处理中...' : '选择文件夹'}
            </Button>
          </div>
        ) : (
          // Folder configured - show status and actions
          <div className="space-y-3">
            {status.folderName && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">备份文件夹</span>
                <span className="text-sm text-gray-500 truncate max-w-[140px]" title={status.folderName}>
                  {status.folderName}
                </span>
              </div>
            )}

            {status.lastLocalSyncTime && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">上次备份</span>
                <span className="text-sm text-gray-500">
                  {formatTimestamp(status.lastLocalSyncTime)}
                </span>
              </div>
            )}

            {status.permissionStatus && status.permissionStatus !== 'granted' && (
              <div className="p-2 bg-yellow-50 rounded border border-yellow-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  {status.permissionStatus === 'denied'
                    ? '文件夹权限被拒绝'
                    : '需要重新授权文件夹权限'}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  import('@/lib/sync/sync-manager').then(({ manualSync }) => {
                    setLoading(true)
                    manualSync().then(result => {
                      setLoading(false)
                      if (result.success) {
                        setSuccess(result.createdNewBackup ? '备份成功' : '内容无变更')
                        loadStatus()
                        if (showHistory) {
                          loadVersions()
                        }
                      } else {
                        setError(result.error || '备份失败')
                      }
                    })
                  })
                }}
                disabled={loading || status.permissionStatus !== 'granted'}
                size="sm"
                className="flex-1 h-9"
              >
                <RefreshCw className="w-4 h-4" />
                {loading ? '备份中...' : '立即备份'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  import('@/lib/sync/sync-manager').then(({ changeSyncFolder }) => {
                    setLoading(true)
                    changeSyncFolder().then(result => {
                      setLoading(false)
                      if (result.success) {
                        setSuccess('文件夹已更换')
                        loadStatus()
                      } else {
                        setError(result.error || '更换文件夹失败')
                      }
                    })
                  })
                }}
                disabled={loading}
                size="sm"
                className="h-9"
              >
                更换
              </Button>
            </div>

            {/* Backup history section */}
            {status.permissionStatus === 'granted' && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full justify-start text-gray-600 hover:text-gray-900"
                >
                  <History className="w-4 h-4" />
                  备份历史
                  {showHistory ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                </Button>

                {showHistory && (
                  <div className="mt-2 space-y-2">
                    {versionsLoading ? (
                      <div className="text-sm text-gray-500 text-center py-2">加载中...</div>
                    ) : versions.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-2">暂无备份历史</div>
                    ) : (
                      versions.map(version => (
                        <div key={version.filename} className="flex items-center justify-between p-2 rounded-lg border bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700 truncate">
                                {formatBackupTime(version.backupTime)}
                              </span>
                              {version.isLatest && (
                                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                  最新版本
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {version.promptCount} 条提示词 · {version.categoryCount} 个分类
                              {version.temporaryPromptCount > 0 && ` · ${version.temporaryPromptCount} 个临时提示词`}
                            </div>
                          </div>
                          {!version.isLatest && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRestoreDialog({ open: true, version })}
                              disabled={loading}
                              className="ml-2"
                            >
                              <RotateCcw className="w-4 h-4" />
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
        )}
      </div>

      {/* Pending Upload Warning */}
      {status?.pendingUpload && localOnlyCount > 0 && (
        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-yellow-800">
                发现 {localOnlyCount} 个本地独有的数据未上传到云端
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUploadDialog(true)}
                className="h-9 border-yellow-400 text-yellow-700 hover:bg-yellow-100"
              >
                查看并上传
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Info text */}
      <p className="text-xs text-gray-500 px-1">
        云端同步会在数据变更时自动触发，本地备份仅在配置文件夹后生效
      </p>

      {/* Upload Local-Only Items Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>本地独有数据</DialogTitle>
            <DialogDescription>
              以下数据仅存在于本地，是否上传到云端？
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-gray-50 rounded text-sm space-y-2">
            {status?.localOnlyItems?.promptIds && status.localOnlyItems.promptIds.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">提示词</span>
                <span className="text-gray-900">{status.localOnlyItems.promptIds.length} 个</span>
              </div>
            )}
            {status?.localOnlyItems?.categoryIds && status.localOnlyItems.categoryIds.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">分类</span>
                <span className="text-gray-900">{status.localOnlyItems.categoryIds.length} 个</span>
              </div>
            )}
            {status?.localOnlyItems?.temporaryPromptIds && status.localOnlyItems.temporaryPromptIds.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">临时提示词</span>
                <span className="text-gray-900">{status.localOnlyItems.temporaryPromptIds.length} 个</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm text-blue-800">
            <span>💡</span>
            <span>上传后云端将包含完整数据</span>
          </div>

          <DialogFooter className="py-3 pt-2">
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              取消
            </Button>
            <Button onClick={handleUploadLocalOnly} disabled={uploading}>
              {uploading ? '上传中...' : '上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Dialog */}
      <Dialog open={restoreDialog.open} onOpenChange={(isOpen) => !isOpen && setRestoreDialog({ open: false, version: null })}>
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
                {formatBackupTime(restoreDialog.version.backupTime)}
              </div>
              <div className="text-gray-500 mt-1">
                {restoreDialog.version.promptCount} 个提示词 · {restoreDialog.version.categoryCount} 个分类
                {restoreDialog.version.temporaryPromptCount > 0 && (
                  <span> · {restoreDialog.version.temporaryPromptCount} 个临时提示词</span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <span>此操作将完全替换当前数据</span>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={backupBeforeRestore}
              onChange={(e) => setBackupBeforeRestore(e.target.checked)}
              className="rounded border-gray-300"
            />
            恢复前先备份当前数据
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog({ open: false, version: null })}>
              取消
            </Button>
            <Button onClick={handleRestore} disabled={loading}>
              {loading ? '恢复中...' : '确认恢复'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}