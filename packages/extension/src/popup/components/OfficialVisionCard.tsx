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
        <p className="text-sm text-gray-600 mb-3">会员专享 Vision API，无需配置 API Key</p>
        <button
          onClick={onLogin}
          className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition"
        >
          登录后使用
        </button>
      </div>
    )
  }

  // State: logged in but not member
  if (!subscription || subscription.planType === 'free') {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <span className="text-sm text-yellow-600 flex items-center gap-1">
            需要升级
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-3">会员专享 Vision API，无需配置 API Key</p>
        <button
          onClick={onUpgrade}
          className="w-full py-2.5 rounded-md font-medium text-sm bg-yellow-500/10 text-yellow-700 border border-yellow-500/30 hover:bg-yellow-500/20 transition"
        >
          升级 Pro 会员
        </button>
      </div>
    )
  }

  // Get quota info from subscription
  const quota = subscription.optimizationQuota || { remaining: 0, limit: 50 }
  const plan = subscription.planType
  const isPro = plan === 'pro'
  const isTeam = plan === 'team'

  // Badge color
  const badgeClass = isTeam
    ? 'bg-gradient-to-r from-purple-400 to-purple-600 text-white'
    : 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900'

  // State: quota exhausted
  if (quota.remaining <= 0) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
              {isTeam ? 'Team' : 'Pro'}
            </span>
            <span className="text-sm text-red-500">0/{quota.limit} 次</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">本月额度已用完，下月自动恢复</p>
        <button
          disabled
          className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-100 text-gray-400 cursor-not-allowed"
        >
          额度已耗尽
        </button>
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
            {isTeam ? 'Team' : 'Pro'}
          </span>
          <span className="text-sm text-gray-500">
            剩余 <span className="text-cyan-500 font-medium">{quota.remaining}</span>/{quota.limit} 次
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-3">会员专享 Vision API，无需配置 API Key</p>
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