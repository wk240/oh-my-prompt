// src/popup/components/ThirdPartyApiDialog.tsx
import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/popup/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/popup/components/ui/tabs'
import { ProviderSelect } from '@/popup/components/ProviderSelect'
import { ModelSelect } from '@/popup/components/ModelSelect'
import type { Provider, ProviderGroup } from '@oh-my-prompt/shared/types'

interface ThirdPartyApiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: Provider[]
  providerGroups: ProviderGroup[]
  loading: boolean
  onSaveQuickConfig: (provider: Provider, model: string, apiKey: string) => Promise<void>
  onSaveCustomConfig: (name: string, format: 'anthropic_messages' | 'chat_completions', endpoint: string, model: string, apiKey: string) => Promise<void>
  error: string | null
  success: string | null
}

export function ThirdPartyApiDialog({
  open,
  onOpenChange,
  providers,
  providerGroups,
  loading,
  onSaveQuickConfig,
  onSaveCustomConfig,
  error,
  success
}: ThirdPartyApiDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  const [customApiFormat, setCustomApiFormat] = useState<'anthropic_messages' | 'chat_completions'>('chat_completions')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customName, setCustomName] = useState('')

  const handleSaveQuick = async () => {
    if (!selectedProvider || !apiKey.trim()) return
    await onSaveQuickConfig(selectedProvider, selectedModel, apiKey.trim())
    setApiKey('')
  }

  const handleSaveCustom = async () => {
    if (!customEndpoint.trim() || !customApiKey.trim() || !customModel.trim()) return
    await onSaveCustomConfig(
      customName.trim() || '自定义配置',
      customApiFormat,
      customEndpoint.trim(),
      customModel.trim(),
      customApiKey.trim()
    )
    setCustomEndpoint('')
    setCustomApiKey('')
    setCustomModel('')
    setCustomName('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>第三方 API 配置</DialogTitle>
          <DialogDescription>配置后可使用 Agent 和图片转提示词功能</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="quick" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="quick" className="flex-1">快速配置</TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">自定义配置</TabsTrigger>
          </TabsList>

          <TabsContent value="quick">
            <div className="space-y-4 mt-4">
              <ProviderSelect
                providers={providers}
                groups={providerGroups}
                value={selectedProvider}
                onChange={(p) => {
                  setSelectedProvider(p)
                  if (p?.models.length) setSelectedModel(p.models[0].id)
                }}
                disabled={loading}
              />
              {selectedProvider && (
                <ModelSelect
                  models={selectedProvider.models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                  disabled={loading}
                />
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">API密钥</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400"
                  disabled={loading}
                />
                {selectedProvider?.apiKeyUrl && (
                  <a
                    href={selectedProvider.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
                  >
                    获取 API Key <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <Button onClick={handleSaveQuick} disabled={loading || !selectedProvider || !apiKey.trim()} className="w-full h-10">
                <Check className="w-4 h-4" />
                {loading ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="custom">
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">配置名称</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="我的自定义配置"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">API 格式</label>
                <select
                  value={customApiFormat}
                  onChange={(e) => setCustomApiFormat(e.target.value as typeof customApiFormat)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-md bg-white focus:border-gray-400"
                  disabled={loading}
                >
                  <option value="anthropic_messages">Anthropic 格式</option>
                  <option value="chat_completions">OpenAI 格式</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">API地址</label>
                <input
                  type="text"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">模型名称</label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="gpt-4o, qwen-vl-max 等"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">API密钥</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400"
                  disabled={loading}
                />
              </div>
              <Button onClick={handleSaveCustom} disabled={loading || !customEndpoint.trim() || !customApiKey.trim() || !customModel.trim()} className="w-full h-10">
                <Check className="w-4 h-4" />
                {loading ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        {success && <p className="text-sm text-green-600 mt-4">{success}</p>}
      </DialogContent>
    </Dialog>
  )
}