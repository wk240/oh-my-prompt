// packages/extension/src/sidepanel/settings/MergePreviewModal.tsx
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'

/**
 * MergePreviewData - Data structure for merge preview
 *
 * Contains counts for cloud/local/merged data, change details,
 * and item-level diff information.
 */
export interface MergePreviewData {
  cloudCount: { prompts: number; categories: number; temporaryPrompts: number }
  localCount: { prompts: number; categories: number; temporaryPrompts: number }
  mergedCount: { prompts: number; categories: number; temporaryPrompts: number }
  changes: {
    addToLocal: number    // New items from cloud to add locally
    addToCloud: number    // New local items to upload
    updateToLocal: number // Cloud items newer than local
    updateToCloud: number // Local items newer than cloud
    conflicts: number     // Items with same updatedAt timestamp
  }
  cloudOnlyItems?: {
    prompts: Array<{ id: string; name: string; updatedAt?: number }>
    categories: Array<{ id: string; name: string; updatedAt?: number }>
    temporaryPrompts: Array<{ id: string; name: string; updatedAt?: number }>
  }
  localOnlyItems?: {
    prompts: Array<{ id: string; name: string; updatedAt?: number }>
    categories: Array<{ id: string; name: string; updatedAt?: number }>
    temporaryPrompts: Array<{ id: string; name: string; updatedAt?: number }>
  }
  conflicts?: Array<{ type: 'prompt' | 'category' | 'temporaryPrompt'; cloud: { id: string; name: string; updatedAt?: number }; local: { id: string; name: string; updatedAt?: number } }>
}

interface MergePreviewModalProps {
  open: boolean
  onClose: () => void
  preview: MergePreviewData | null
  onConfirm: () => void
  loading?: boolean
}

/**
 * Format updatedAt timestamp to readable date string
 */
function formatDate(timestamp?: number): string {
  if (!timestamp) return '无时间记录'
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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

  const hasCloudOnly = preview.cloudOnlyItems && (
    preview.cloudOnlyItems.prompts.length > 0 ||
    preview.cloudOnlyItems.categories.length > 0 ||
    preview.cloudOnlyItems.temporaryPrompts.length > 0
  )

  const hasLocalOnly = preview.localOnlyItems && (
    preview.localOnlyItems.prompts.length > 0 ||
    preview.localOnlyItems.categories.length > 0 ||
    preview.localOnlyItems.temporaryPrompts.length > 0
  )

  const hasConflicts = preview.conflicts && preview.conflicts.length > 0

  const hasAnyChanges = preview.changes.addToLocal > 0 ||
    preview.changes.addToCloud > 0 ||
    preview.changes.updateToLocal > 0 ||
    preview.changes.updateToCloud > 0 ||
    preview.changes.conflicts > 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto p-6">
        <DialogHeader className="pb-4">
          <DialogTitle>合并预览</DialogTitle>
          <DialogDescription>以下是将执行的合并操作，请确认后继续</DialogDescription>
        </DialogHeader>

        {/* Counts comparison */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">云端数据</span>
            <span>{preview.cloudCount.prompts} 条 prompts / {preview.cloudCount.categories} 个分类</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">本地数据</span>
            <span>{preview.localCount.prompts} 条 prompts / {preview.localCount.categories} 个分类</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-3">
            <span className="font-medium">合并后</span>
            <span className="font-medium">{preview.mergedCount.prompts} 条 / {preview.mergedCount.categories} 个</span>
          </div>
        </div>

        {/* Changes summary */}
        <div className="space-y-3 py-4">
          <h4 className="text-sm font-medium text-gray-700">变更汇总</h4>
          <ul className="text-sm text-gray-600 space-y-2">
            {preview.changes.addToLocal > 0 && (
              <li className="flex items-center gap-2">
                <span className="text-blue-500">+</span>
                从云端新增 {preview.changes.addToLocal} 条到本地
              </li>
            )}
            {preview.changes.addToCloud > 0 && (
              <li className="flex items-center gap-2">
                <span className="text-green-500">+</span>
                上传 {preview.changes.addToCloud} 条本地独有数据到云端
              </li>
            )}
            {preview.changes.updateToLocal > 0 && (
              <li className="flex items-center gap-2">
                <span className="text-orange-500">~</span>
                更新 {preview.changes.updateToLocal} 条为云端最新版本
              </li>
            )}
            {preview.changes.updateToCloud > 0 && (
              <li className="flex items-center gap-2">
                <span className="text-purple-500">~</span>
                {preview.changes.updateToCloud} 条本地版本较新（合并后将上传到云端）
              </li>
            )}
            {preview.changes.conflicts > 0 && (
              <li className="flex items-center gap-2">
                <span className="text-red-500">!</span>
                {preview.changes.conflicts} 条冲突（时间戳相同，将保留云端版本）
              </li>
            )}
            {!hasAnyChanges && (
              <li className="text-gray-400">无变更 - 数据完全同步</li>
            )}
          </ul>
        </div>

        {/* Cloud-only items detail */}
        {hasCloudOnly && (
          <div className="space-y-3 pb-4">
            <h4 className="text-sm font-medium text-gray-700">云端独有（将添加到本地）</h4>
            <div className="text-sm text-gray-600 space-y-2 max-h-32 overflow-y-auto bg-blue-50 p-3 rounded">
              {preview.cloudOnlyItems!.prompts.map(p => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                  <span className="text-xs text-gray-400">{formatDate(p.updatedAt)}</span>
                </div>
              ))}
              {preview.cloudOnlyItems!.categories.map(c => (
                <div key={c.id} className="flex justify-between">
                  <span className="truncate max-w-[200px]" title={c.name}>{c.name}</span>
                  <span className="text-xs text-gray-400">{formatDate(c.updatedAt)}</span>
                </div>
              ))}
              {preview.cloudOnlyItems!.temporaryPrompts.map(p => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                  <span className="text-xs text-gray-400">{formatDate(p.updatedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local-only items detail */}
        {hasLocalOnly && (
          <div className="space-y-3 pb-4">
            <h4 className="text-sm font-medium text-gray-700">本地独有（将上传到云端）</h4>
            <div className="text-sm text-gray-600 space-y-2 max-h-32 overflow-y-auto bg-green-50 p-3 rounded">
              {preview.localOnlyItems!.prompts.map(p => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                  <span className="text-xs text-gray-400">{formatDate(p.updatedAt)}</span>
                </div>
              ))}
              {preview.localOnlyItems!.categories.map(c => (
                <div key={c.id} className="flex justify-between">
                  <span className="truncate max-w-[200px]" title={c.name}>{c.name}</span>
                  <span className="text-xs text-gray-400">{formatDate(c.updatedAt)}</span>
                </div>
              ))}
              {preview.localOnlyItems!.temporaryPrompts.map(p => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate max-w-[200px]" title={p.name}>{p.name}</span>
                  <span className="text-xs text-gray-400">{formatDate(p.updatedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conflicts detail */}
        {hasConflicts && (
          <div className="space-y-3 pb-4">
            <h4 className="text-sm font-medium text-red-700">冲突项目（时间戳相同）</h4>
            <div className="text-sm text-gray-600 space-y-2 max-h-32 overflow-y-auto bg-red-50 p-3 rounded">
              {preview.conflicts!.map((c, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="truncate max-w-[180px]" title={c.cloud.name}>
                    {c.type === 'prompt' ? '📝' : c.type === 'category' ? '📁' : '🌟'} {c.cloud.name}
                  </span>
                  <span className="text-xs text-red-500">需手动确认</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm} disabled={loading || !hasAnyChanges}>
            {loading ? '合并中...' : hasAnyChanges ? '确认合并' : '无需合并'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}