// src/popup/components/SavedConfigsList.tsx
import type { ProviderConfig } from '@oh-my-prompt/shared/types'
import { ConfigCard } from './ConfigCard'

interface SavedConfigsListProps {
  configs: ProviderConfig[]
  activeConfigId: string | null
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (config: ProviderConfig) => void
}

export function SavedConfigsList({ configs, activeConfigId, onActivate, onDelete, onEdit }: SavedConfigsListProps) {
  if (configs.length === 0) {
    return null
  }

  return (
    <div className="mt-4">
      <h2 className="text-sm font-medium text-gray-700 mb-2">
        已保存配置 ({configs.length})
      </h2>
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
    </div>
  )
}