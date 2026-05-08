import { RotateCcw } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import type { BackupVersion } from '@/lib/sync/file-sync'

function formatTime(backupTime: string): string {
  if (!backupTime) return '未知时间'
  const date = new Date(backupTime)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface VersionCardProps {
  version: BackupVersion
  loading: boolean
  onRestore: (version: BackupVersion) => void
}

export function VersionCard({ version, loading, onRestore }: VersionCardProps) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg border bg-gray-50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 truncate">
            {formatTime(version.backupTime)}
          </span>
          {version.isLatest && (
            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
              最新版本
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {version.promptCount} 条提示词 · {version.categoryCount} 个分类
        </div>
      </div>
      {!version.isLatest && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRestore(version)}
          disabled={loading}
          className="ml-2"
        >
          <RotateCcw className="w-4 h-4" />
          恢复
        </Button>
      )}
    </div>
  )
}