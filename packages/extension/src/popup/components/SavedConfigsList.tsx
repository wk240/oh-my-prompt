// src/popup/components/SavedConfigsList.tsx
import { useState } from 'react'
import type { ProviderConfig, Provider, ProviderGroup } from '@oh-my-prompt/shared/types'
import { ConfigCard } from './ConfigCard'
import { ThirdPartyApiDialog } from './ThirdPartyApiDialog'

interface SavedConfigsListProps {
  configs: ProviderConfig[]
  activeConfigId: string | null
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (config: ProviderConfig) => void
  providers: Provider[]
  providerGroups: ProviderGroup[]
  loading: boolean
  onSaveQuickConfig: (provider: Provider, model: string, apiKey: string) => Promise<void>
  onSaveCustomConfig: (name: string, format: 'anthropic_messages' | 'chat_completions', endpoint: string, model: string, apiKey: string) => Promise<void>
  error: string | null
  success: string | null
}

export function SavedConfigsList({
  configs,
  activeConfigId,
  onActivate,
  onDelete,
  onEdit,
  providers,
  providerGroups,
  loading,
  onSaveQuickConfig,
  onSaveCustomConfig,
  error,
  success
}: SavedConfigsListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

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
      {configs.length > 0 ? (
        <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
          {configs.map(config => (
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
        <p className="text-xs text-gray-400">暂无配置，点击"第三方API配置"添加</p>
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