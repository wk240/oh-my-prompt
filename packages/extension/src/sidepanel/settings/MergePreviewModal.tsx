// packages/extension/src/sidepanel/settings/MergePreviewModal.tsx
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'

/**
 * MergePreviewData - Data structure for merge preview
 *
 * Contains counts for cloud/local/merged data, and change details
 * for the merge operation preview.
 */
export interface MergePreviewData {
  cloudCount: { prompts: number; categories: number }
  localCount: { prompts: number; categories: number }
  mergedCount: { prompts: number; categories: number }
  changes: {
    addToLocal: number    // New items from cloud to add locally
    addToCloud: number    // New local items to upload
    updateToLocal: number // Cloud items newer than local
    updateToCloud: number // Local items newer than cloud
  }
}

interface MergePreviewModalProps {
  open: boolean
  onClose: () => void
  preview: MergePreviewData | null
  onConfirm: () => void
  loading?: boolean
}

/**
 * MergePreviewModal - Preview merge before execution
 *
 * Shows a summary of cloud vs local data counts and the specific
 * changes that will be made during merge. User must confirm before
 * the merge operation proceeds.
 */
export function MergePreviewModal({ open, onClose, preview, onConfirm, loading }: MergePreviewModalProps) {
  if (!preview) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>合并预览</DialogTitle>
          <DialogDescription>以下是将执行的合并操作，请确认后继续</DialogDescription>
        </DialogHeader>

        {/* Counts comparison */}
        <div className="p-3 bg-gray-50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">云端数据</span>
            <span>{preview.cloudCount.prompts} 条 prompts</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">本地数据</span>
            <span>{preview.localCount.prompts} 条 prompts</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="font-medium">合并后</span>
            <span className="font-medium">{preview.mergedCount.prompts} 条</span>
          </div>
        </div>

        {/* Changes detail */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">变更明细</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {preview.changes.addToLocal > 0 && <li>新增 {preview.changes.addToLocal} 条到本地</li>}
            {preview.changes.addToCloud > 0 && <li>上传 {preview.changes.addToCloud} 条到云端</li>}
            {preview.changes.updateToLocal > 0 && <li>更新 {preview.changes.updateToLocal} 条为最新版本</li>}
            {preview.changes.addToLocal === 0 &&
             preview.changes.addToCloud === 0 &&
             preview.changes.updateToLocal === 0 &&
             preview.changes.updateToCloud === 0 && (
              <li className="text-gray-400">无变更</li>
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? '合并中...' : '确认合并'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}