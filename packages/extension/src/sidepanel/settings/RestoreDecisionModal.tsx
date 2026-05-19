// packages/extension/src/sidepanel/settings/RestoreDecisionModal.tsx
import { AlertTriangle, RotateCcw, FolderOpen } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import type { ExistingBackupInfo } from '@/lib/sync/sync-manager'
import { formatBackupTime } from './utils/format-backup-time'

interface RestoreDecisionModalProps {
  open: boolean
  onClose: () => void
  onRestore: () => void
  onContinue: () => void
  onReselect: () => void
  existingBackup: ExistingBackupInfo
}

/**
 * RestoreDecisionModal - Ask user how to handle existing backup in selected folder
 *
 * When user selects a folder that already contains backup data,
 * this modal presents three options:
 * 1. Restore the backup (replace current data)
 * 2. Continue using the folder (overwrite backup with current data)
 * 3. Reselect a different folder
 */
export function RestoreDecisionModal({
  open,
  onClose,
  onRestore,
  onContinue,
  onReselect,
  existingBackup
}: RestoreDecisionModalProps) {
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            此文件夹已有备份数据
          </DialogTitle>
          <DialogDescription>
            请选择如何处理此文件夹中的备份数据
          </DialogDescription>
        </DialogHeader>

        {/* Backup info section */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-sm font-medium text-blue-900 mb-2">
            现有备份信息
          </div>
          <div className="text-xs text-blue-700 space-y-1">
            <div>提示词数量: {existingBackup.promptCount ?? 0} 条</div>
            <div>分类数量: {existingBackup.categoryCount ?? 0} 个</div>
            <div>临时库数量: {existingBackup.temporaryPromptCount ?? 0} 条</div>
            <div>备份时间: {formatBackupTime(existingBackup.backupTime)}</div>
          </div>
        </div>

        {/* Warning section */}
        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">注意</p>
            <p className="mt-1">选择"继续使用此文件夹"将用当前数据覆盖现有备份，备份数据将丢失。</p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button onClick={onRestore} className="w-full sm:w-auto">
            <RotateCcw className="w-4 h-4" />
            恢复备份数据
          </Button>
          <Button variant="outline" onClick={onContinue} className="w-full sm:w-auto">
            继续使用此文件夹
          </Button>
          <Button variant="ghost" className="w-full sm:w-auto text-gray-600" onClick={onReselect}>
            <FolderOpen className="w-4 h-4" />
            重新选择文件夹
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}