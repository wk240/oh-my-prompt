// src/popup/components/SavedConfigsList.tsx
import { useState } from 'react'
import type { ProviderConfig, Provider, ProviderGroup, CloudAuthState } from '@oh-my-prompt/shared/types'
import { ConfigCard } from './ConfigCard'
import { ThirdPartyApiDialog } from './ThirdPartyApiDialog'
import { Button } from './ui/button'
import { Check } from 'lucide-react'

interface SavedConfigsListProps {
  configs: ProviderConfig[]
  activeConfigId: string | null
  onActivate: (id: string) => void
  onActivateOfficial: () => void
  onDelete: (id: string) => void
  onEdit: (config: ProviderConfig) => void
  providers: Provider[]
  providerGroups: ProviderGroup[]
  loading: boolean
  onSaveQuickConfig: (provider: Provider, model: string, apiKey: string) => Promise<void>
  onSaveCustomConfig: (name: string, format: 'anthropic_messages' | 'chat_completions', endpoint: string, model: string, apiKey: string) => Promise<void>
  error: string | null
  success: string | null
  authState: CloudAuthState | null
}

export function SavedConfigsList({
  configs,
  activeConfigId,
  onActivate,
  onActivateOfficial,
  onDelete,
  onEdit,
  providers,
  providerGroups,
  loading,
  onSaveQuickConfig,
  onSaveCustomConfig,
  error,
  success,
  authState
}: SavedConfigsListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const officialConfigId = 'omp-official-default'
  const isOfficialActive = activeConfigId === officialConfigId
  const isLoggedIn = authState?.status === 'logged_in'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-gray-700">API配置切换</h2>
        <button
          onClick={() => setDialogOpen(true)}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          第三方API配置
        </button>
      </div>

      {/* 官方服务卡片 */}
      <div className="mb-2">
        <div className={`p-3 border rounded-lg ${isOfficialActive ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  Oh My Prompt 官方服务
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">
                {isLoggedIn ? '专业视觉模型' : '需要登录使用'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                官方服务
              </p>
            </div>

            <div className="flex items-center gap-1">
              {isLoggedIn && !isOfficialActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onActivateOfficial}
                  disabled={loading}
                  className="h-7 px-2"
                  title="激活官方服务"
                >
                  <Check style={{ width: 14, height: 14 }} />
                </Button>
              )}
              {isLoggedIn && isOfficialActive && (
                <span className="text-xs text-purple-600 font-medium">已激活</span>
              )}
              {!isLoggedIn && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onActivateOfficial}
                  disabled={loading}
                  className="h-7 px-2 text-xs"
                  title="登录后使用官方服务"
                >
                  登录使用
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 第三方配置列表 */}
      {configs.filter(c => c.id !== officialConfigId).length > 0 ? (
        <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
          {configs.filter(c => c.id !== officialConfigId).map(config => (
            <ConfigCard
              key={config.id}
              config={config}
              isActive={config.id === activeConfigId}
              onActivate={() => onActivate(config.id)}
              onDelete={() => onDelete(config.id)}
              onEdit={() => onEdit(config)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">暂无第三方配置，点击"第三方API配置"添加。</p>
      )}

      <ThirdPartyApiDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        providers={providers}
        providerGroups={providerGroups}
        loading={loading}
        onSaveQuickConfig={onSaveQuickConfig}
        onSaveCustomConfig={onSaveCustomConfig}
        error={error}
        success={success}
      />
    </div>
  )
}
