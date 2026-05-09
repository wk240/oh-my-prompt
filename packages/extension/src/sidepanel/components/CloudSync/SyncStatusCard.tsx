// packages/extension/src/sidepanel/components/CloudSync/SyncStatusCard.tsx
import { Button } from '@/popup/components/ui/button'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

interface SyncStatusCardProps {
  authState: CloudAuthState | null
  loading: boolean
  syncing: boolean
  onLogin: () => void
  onUpload: () => void
  onDownload: () => void
  onLogout: () => void
}

function formatTimestamp(ts: number | undefined): string {
  if (!ts) return '从未同步'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function SyncStatusCard({
  authState,
  loading,
  syncing,
  onLogin,
  onUpload,
  onDownload,
  onLogout
}: SyncStatusCardProps) {
  if (loading) {
    return <div className="text-sm text-gray-500 py-2">检查登录状态...</div>
  }

  if (!authState || authState.status === 'not_logged_in') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          未登录，登录后可云端备份
        </p>
        <Button onClick={onLogin} className="w-full">
          登录
        </Button>
      </div>
    )
  }

  const planLabel = authState.subscription?.planType === 'pro'
    ? 'Pro 用户'
    : authState.subscription?.planType === 'team'
    ? 'Team 用户'
    : '免费用户'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <div className="font-medium text-gray-900">{authState.user?.email}</div>
          <div className="text-gray-500">{planLabel}</div>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          退出
        </button>
      </div>

      <div className="text-xs text-gray-500">
        上次同步：{formatTimestamp(authState.lastSyncAt)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onUpload}
          disabled={syncing}
          variant="outline"
        >
          {syncing ? '同步中...' : '上传到云端'}
        </Button>
        <Button
          onClick={onDownload}
          disabled={syncing}
          variant="outline"
        >
          {syncing ? '同步中...' : '下载到本地'}
        </Button>
      </div>
    </div>
  )
}