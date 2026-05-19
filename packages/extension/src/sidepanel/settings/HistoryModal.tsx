// packages/extension/src/sidepanel/settings/HistoryModal.tsx
import { useState } from 'react'
import { History, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import type { BackupVersion } from '@/lib/sync/file-sync'

interface HistoryModalProps {
  open: boolean
  onClose: () => void
  versions: BackupVersion[]
  loading: boolean
  error: string | null
  onRestore: (filename: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * Format backup time to readable string
 */
function formatBackupTime(isoTime: string): string {
  if (!isoTime) return '未知时间'
  const date = new Date(isoTime)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Get relative time description
 */
function getRelativeTime(isoTime: string): string {
  if (!isoTime) return ''
  const date = new Date(isoTime)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  if (diffHours < 24) return `${diffHours} 小时前`
  if (diffDays < 7) return `${diffDays} 天前`
  return ''
}

/**
 * HistoryModal - Display backup versions and allow restore
 *
 * Shows a list of backup files with timestamps and counts.
 * User can click a version to see restore confirmation.
 */
export function HistoryModal({
  open,
  onClose,
  versions,
  loading,
  error,
  onRestore
}: HistoryModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<BackupVersion | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  // Load versions when modal opens (only when user closes and reopens)
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Only load if not already open (prevents duplicate calls when parent sets open=true)
      // Parent component calls onLoadVersions when opening modal via button click
    } else {
      // Reset state on close
      setSelectedVersion(null)
      setShowConfirm(false)
      setRestoreError(null)
    }
    if (!isOpen) onClose()
  }

  // Handle version selection
  const handleSelectVersion = (version: BackupVersion) => {
    setSelectedVersion(version)
    setShowConfirm(true)
  }

  // Handle restore confirmation
  const handleConfirmRestore = async () => {
    if (!selectedVersion) return

    setRestoreLoading(true)
    setRestoreError(null)

    try {
      const result = await onRestore(selectedVersion.filename)
      if (result.success) {
        setShowConfirm(false)
        setSelectedVersion(null)
        onClose()
      } else {
        setRestoreError(result.error || '恢复失败')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Restore failed:', err)
      setRestoreError('恢复失败，请重试')
    } finally {
      setRestoreLoading(false)
    }
  }

  // Cancel restore confirmation
  const handleCancelConfirm = () => {
    setShowConfirm(false)
    setRestoreError(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            备份历史
          </DialogTitle>
          <DialogDescription>
            选择一个备份版本进行恢复，恢复将替换当前数据
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {loading && (
          <div className="py-8 text-center text-gray-500">
            加载中...
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="py-8 text-center">
            <div className="text-red-600 mb-3">{error}</div>
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        )}

        {/* Empty state (no error) */}
        {!loading && !error && versions.length === 0 && (
          <div className="py-8 text-center text-gray-500">
            暂无备份历史记录
          </div>
        )}

        {/* Version list */}
        {!loading && !showConfirm && versions.length > 0 && (
          <div className="space-y-2">
            {versions.map((version) => (
              <button
                key={version.filename}
                onClick={() => handleSelectVersion(version)}
                className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors text-left"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {version.isLatest ? '当前版本' : getRelativeTime(version.backupTime) || formatBackupTime(version.backupTime)}
                  </span>
                  {version.isLatest && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">最新</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mb-1">
                  {formatBackupTime(version.backupTime)}
                </div>
                <div className="text-xs text-gray-600">
                  {version.promptCount} 条提示词 / {version.categoryCount} 个分类
                  {version.temporaryPromptCount > 0 && (
                    <span className="ml-2 text-blue-600">
                      / {version.temporaryPromptCount} 条临时库
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Restore confirmation */}
        {showConfirm && selectedVersion && (
          <div className="space-y-4">
            {/* Warning */}
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">恢复将替换当前所有数据</p>
                <p>恢复前会自动备份当前数据，恢复后可从历史记录找回</p>
              </div>
            </div>

            {/* Selected version info */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-900 mb-1">
                将恢复到此版本：
              </div>
              <div className="text-xs text-blue-700">
                {formatBackupTime(selectedVersion.backupTime)}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {selectedVersion.promptCount} 条提示词 / {selectedVersion.categoryCount} 个分类
                {selectedVersion.temporaryPromptCount > 0 && (
                  <span className="ml-2">
                    / {selectedVersion.temporaryPromptCount} 条临时库
                  </span>
                )}
              </div>
            </div>

            {/* Error message */}
            {restoreError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm text-red-800">{restoreError}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleCancelConfirm} disabled={restoreLoading}>
                取消
              </Button>
              <Button onClick={handleConfirmRestore} disabled={restoreLoading}>
                <RotateCcw className="w-4 h-4" />
                {restoreLoading ? '恢复中...' : '确认恢复'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Close button for version list */}
        {!loading && !showConfirm && versions.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}