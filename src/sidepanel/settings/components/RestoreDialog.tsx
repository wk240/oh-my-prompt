import { AlertTriangle } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/popup/components/ui/dialog'
import type { BackupVersion } from '@/lib/sync/file-sync'

interface RestoreDialogProps {
  open: boolean
  version: BackupVersion | null
  loading: boolean
  backupBeforeRestore: boolean
  onBackupBeforeRestoreChange: (checked: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}

function formatBackupTime(backupTime: string): string {
  if (!backupTime) return ''
  const date = new Date(backupTime)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function RestoreDialog({
  open,
  version,
  loading,
  backupBeforeRestore,
  onBackupBeforeRestoreChange,
  onConfirm,
  onCancel,
}: RestoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>确认恢复</DialogTitle>
          <DialogDescription>
            将从以下版本恢复数据：
          </DialogDescription>
        </DialogHeader>

        {version && (
          <div className="p-3 bg-gray-50 rounded text-sm">
            <div className="font-medium text-gray-900">
              {formatBackupTime(version.backupTime)}
            </div>
            <div className="text-gray-500 mt-1">
              {version.promptCount} 个提示词 · {version.categoryCount} 个分类
              {version.temporaryPromptCount > 0 && (
                <span> · {version.temporaryPromptCount} 个临时提示词</span>
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
            onChange={(e) => onBackupBeforeRestoreChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          恢复前先备份当前数据
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? '恢复中...' : '确认恢复'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}