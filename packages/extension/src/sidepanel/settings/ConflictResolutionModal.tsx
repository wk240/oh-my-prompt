import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/popup/components/ui/dialog'

interface ConflictItem {
  type: 'prompt' | 'category'
  cloud: { id: string; name?: string; content?: string; updatedAt?: number }
  local: { id: string; name?: string; content?: string; updatedAt?: number }
}

interface ConflictResolutionModalProps {
  open: boolean
  onClose: () => void
  conflict: ConflictItem | null
  onResolve: (choice: 'cloud' | 'local' | 'both') => void
  loading?: boolean
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '未知时间'
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function ConflictResolutionModal({ open, onClose, conflict, onResolve, loading }: ConflictResolutionModalProps) {
  const [choice, setChoice] = useState<'cloud' | 'local' | 'both' | null>(null)

  if (!conflict) return null

  const typeName = conflict.type === 'prompt' ? '提示词' : '分类'
  const name = conflict.cloud.name || conflict.local.name || '未命名'

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>⚠️ 冲突：{typeName} "{name}"</DialogTitle>
        </DialogHeader>

        {/* Cloud version */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">云端版本</span>
            <span className="text-xs text-blue-600">{formatDate(conflict.cloud.updatedAt)}</span>
          </div>
          <p className="text-sm text-blue-900 line-clamp-3">
            {conflict.cloud.content || conflict.cloud.name}
          </p>
        </div>

        {/* Local version */}
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-800">本地版本</span>
            <span className="text-xs text-green-600">{formatDate(conflict.local.updatedAt)}</span>
          </div>
          <p className="text-sm text-green-900 line-clamp-3">
            {conflict.local.content || conflict.local.name}
          </p>
        </div>

        {/* Resolution options */}
        <div className="space-y-2">
          <Button variant={choice === 'cloud' ? 'default' : 'outline'} onClick={() => setChoice('cloud')} className="w-full justify-start">
            保留云端版本
          </Button>
          <Button variant={choice === 'local' ? 'default' : 'outline'} onClick={() => setChoice('local')} className="w-full justify-start">
            保留本地版本
          </Button>
          <Button variant={choice === 'both' ? 'default' : 'outline'} onClick={() => setChoice('both')} className="w-full justify-start">
            保留两者（创建副本）
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>取消合并</Button>
          <Button onClick={() => choice && onResolve(choice)} disabled={!choice || loading}>
            {loading ? '处理中...' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}