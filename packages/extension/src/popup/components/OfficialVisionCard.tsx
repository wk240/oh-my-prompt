// packages/extension/src/popup/components/OfficialVisionCard.tsx
import { Star, ExternalLink } from 'lucide-react'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

interface OfficialVisionCardProps {
  authState: CloudAuthState | null
  isActive: boolean
  onActivate: () => void
  onLogin: () => void
  onUpgrade: () => void
}

export function OfficialVisionCard({
  authState,
  isActive,
  onActivate,
  onLogin,
  onUpgrade
}: OfficialVisionCardProps) {
  const { status, subscription } = authState || {}

  // State: loading (authState is null before async call completes)
  if (!authState) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <span className="text-sm text-gray-400">加载中...</span>
        </div>
        <p className="text-sm text-gray-600 mb-3">专业视觉模型，无需配置 API Key</p>
        <button
          disabled
          className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-100 text-gray-400 cursor-not-allowed"
        >
          请稍候...
        </button>
      </div>
    )
  }

  // State: not logged in
  if (status === 'not_logged_in') {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <span className="text-sm text-red-500 flex items-center gap-1">
            需要登录
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-3">专业视觉模型，无需配置 API Key</p>
        <button
          onClick={onLogin}
          className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-900 text-white hover:bg-gray-800 transition"
        >
          登录后使用
        </button>
      </div>
    )
  }

  // Get quota info from subscription
  // Dynamic limit based on plan type (team=200, pro/free=50)
  const planLimits: Record<string, number> = { free: 50, pro: 50, team: 200 }
  const plan = subscription?.planType || 'free'
  const quota = subscription?.officialApiQuota ?? subscription?.optimizationQuota ?? { remaining: 0, limit: planLimits[plan] || 50 }
  const isTeam = plan === 'team'
  const isFree = plan === 'free'

  // Badge color
  const badgeClass = isTeam
    ? 'bg-gradient-to-r from-purple-400 to-purple-600 text-white'
    : isFree
      ? 'bg-gradient-to-r from-emerald-300 to-cyan-400 text-gray-900'
      : 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900'
  const badgeText = isTeam ? 'Team' : isFree ? 'Free Trial' : 'Pro'

  // State: quota exhausted
  if (quota.remaining <= 0) {
    const exhaustedCopy = isFree ? '试用额度已用完，升级 Pro 后可继续使用' : '本月额度已用完，下月自动恢复'
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
              {badgeText}
            </span>
            <span className="text-sm text-red-500">0/{quota.limit} 次</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">{exhaustedCopy}</p>
        <button
          onClick={isFree ? onUpgrade : undefined}
          disabled={!isFree}
          className={`w-full py-2.5 rounded-md font-medium text-sm transition ${
            isFree
              ? 'bg-yellow-500/10 text-yellow-700 border border-yellow-500/30 hover:bg-yellow-500/20'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isFree ? '升级 Pro 会员' : '额度已耗尽'}
        </button>
        {!isFree && (
          <p className="text-xs text-center mt-2">
            <a
              href="https://oh-my-prompt.com/subscription"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-500 underline inline-flex items-center gap-1"
            >
              升级 Team 获取更多额度 <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        )}
      </div>
    )
  }

  // State: active member with quota
  return (
    <div className={`p-4 rounded-lg border ${isActive ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
            {badgeText}
          </span>
          <span className="text-sm text-gray-500">
            剩余 <span className="text-cyan-500 font-medium">{quota.remaining}</span>/{quota.limit} 次
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-3">专业视觉模型，无需配置 API Key</p>
      <button
        onClick={onActivate}
        className={`w-full py-2.5 rounded-md font-medium text-sm transition ${
          isActive
            ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900'
            : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
        }`}
      >
        {isActive ? (
          <span className="flex items-center justify-center gap-1">
            <Star className="w-4 h-4 fill-current" />
            已激活
          </span>
        ) : (
          '切换到此配置'
        )}
      </button>
    </div>
  )
}
