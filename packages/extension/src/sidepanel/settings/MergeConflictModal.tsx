import { useState } from 'react'
import { AlertTriangle, CheckCircle, Merge, Replace } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/popup/components/ui/dialog'
import { Button } from '@/popup/components/ui/button'
import { formatBackupTime } from './utils/format-backup-time'

interface MergeConflictModalProps {
  open: boolean
  onClose: () => void
  currentData: { promptCount: number; categoryCount: number }
  backupData: { promptCount: number; categoryCount: number; backupTime: string }
  onMerge: () => Promise<MergeResult>
  onReplace: () => Promise<{ success: boolean; error?: string }>
}

export interface MergeResult {
  success: boolean
  addedCount: number
  updatedCount: number
  addedCategories: number
  error?: string
}

export function MergeConflictModal({
  open,
  onClose,
  currentData,
  backupData,
  onMerge,
  onReplace,
}: MergeConflictModalProps) {
  const [processing, setProcessing] = useState(false)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !processing) {
      setMergeResult(null)
      setShowResult(false)
      setError(null)
      onClose()
    }
  }

  const handleMerge = async () => {
    setProcessing(true)
    setError(null)
    try {
      const result = await onMerge()
      if (result.success) {
        setMergeResult(result)
        setShowResult(true)
      } else {
        setError(result.error || '合并失败')
      }
    } catch (err) {
      setError('合并失败，请重试')
    } finally {
      setProcessing(false)
    }
  }

  const handleReplace = async () => {
    setProcessing(true)
    setError(null)
    try {
      const result = await onReplace()
      if (result.success) {
        handleOpenChange(false)
      } else {
        setError(result.error || '替换失败')
      }
    } catch (err) {
      setError('替换失败，请重试')
    } finally {
      setProcessing(false)
    }
  }

  // Mode 2: Result Summary (after successful merge)
  if (showResult && mergeResult) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              合并完成
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-md bg-green-50 p-4 border border-green-200">
            <div className="space-y-1 text-sm text-green-800">
              {mergeResult.addedCount > 0 && (
                <p>新增 {mergeResult.addedCount} 条提示词</p>
              )}
              {mergeResult.addedCategories > 0 && (
                <p>新增 {mergeResult.addedCategories} 个分类</p>
              )}
              {mergeResult.updatedCount > 0 && (
                <p>更新 {mergeResult.updatedCount} 条提示词（保留最新修改）</p>
              )}
              {mergeResult.addedCount === 0 &&
                mergeResult.addedCategories === 0 &&
                mergeResult.updatedCount === 0 && (
                  <p>数据已同步，无新增或更新</p>
                )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Mode 1: Conflict Selection
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            数据冲突处理
          </DialogTitle>
          <DialogDescription>
            当前存储已有数据，备份文件中也包含数据。请选择处理方式。
          </DialogDescription>
        </DialogHeader>

        {/* Data comparison */}
        <div className="space-y-3">
          <div className="rounded-md bg-gray-50 p-3 border border-gray-200">
            <p className="text-sm font-medium text-gray-700">当前数据</p>
            <p className="text-xs text-gray-500 mt-1">
              {currentData.promptCount} 条提示词，{currentData.categoryCount} 个分类
            </p>
          </div>

          <div className="rounded-md bg-blue-50 p-3 border border-blue-200">
            <p className="text-sm font-medium text-blue-700">备份数据</p>
            <p className="text-xs text-blue-500 mt-1">
              {backupData.promptCount} 条提示词，{backupData.categoryCount} 个分类
            </p>
            <p className="text-xs text-blue-400 mt-1">
              备份时间：{formatBackupTime(backupData.backupTime)}
            </p>
          </div>
        </div>

        {/* Explanation */}
        <div className="rounded-md bg-yellow-50 p-3 border border-yellow-200">
          <p className="text-sm text-yellow-800">
            <strong>合并数据：</strong>保留当前数据，将备份中不存在的新数据添加进来，已存在的数据保留最新修改。
          </p>
          <p className="text-sm text-yellow-800 mt-2">
            <strong>替换数据：</strong>清除当前所有数据，完全使用备份文件中的数据。
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-3 border border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button
            variant="default"
            onClick={handleMerge}
            disabled={processing}
            className="flex items-center gap-2"
          >
            <Merge className="h-4 w-4" />
            {processing ? '处理中...' : '合并数据（推荐）'}
          </Button>
          <Button
            variant="destructive"
            onClick={handleReplace}
            disabled={processing}
            className="flex items-center gap-2"
          >
            <Replace className="h-4 w-4" />
            {processing ? '处理中...' : '替换数据'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}