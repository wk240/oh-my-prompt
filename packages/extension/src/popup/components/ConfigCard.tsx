// src/popup/components/ConfigCard.tsx
import { Check, Trash2, Edit2, Star } from 'lucide-react'
import { Button } from './ui/button'
import type { ProviderConfig } from '@oh-my-prompt/shared/types'

interface ConfigCardProps {
  config: ProviderConfig
  isActive: boolean
  onActivate: () => void
  onDelete: () => void
  onEdit: () => void
}

export function ConfigCard({ config, isActive, onActivate, onDelete, onEdit }: ConfigCardProps) {
  const isOfficial = config.apiFormat === 'omp_official'

  return (
    <div className={`p-3 border rounded-lg ${
      isActive
        ? isOfficial
          ? 'border-cyan-400 bg-cyan-50'
          : 'border-green-500 bg-green-50'
        : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isActive && (
              <Star style={{ width: 14, height: 14 }} className={isOfficial ? 'text-cyan-600 fill-cyan-600' : 'text-green-600 fill-green-600'} />
            )}
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {config.providerName}
            </h3>
            {isOfficial && config.requiresAuth && (
              <span className="bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900 px-1.5 py-0.5 rounded text-xs font-semibold">
                Pro
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {isOfficial ? '专业视觉模型' : config.selectedModel}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isOfficial ? '官方服务' : new Date(config.configuredAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onActivate}
              className="h-7 px-2"
              title="激活此配置"
            >
              <Check style={{ width: 14, height: 14 }} />
            </Button>
          )}
          {!isOfficial && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="h-7 px-2"
                title="编辑配置"
              >
                <Edit2 style={{ width: 14, height: 14 }} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-7 px-2 text-red-500 hover:text-red-600"
                title="删除配置"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}