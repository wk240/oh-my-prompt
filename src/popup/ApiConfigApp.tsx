// src/popup/ApiConfigApp.tsx
import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './components/ui/dialog'
import { Check, X, ExternalLink } from 'lucide-react'
import { MessageType } from '../shared/messages'
import type { ProviderConfig, Provider, ProviderGroup } from '../shared/types'
import { loadSupportedProviders, groupProvidersByType } from '../lib/provider-data'
import { ProviderSelect } from './components/ProviderSelect'
import { ModelSelect } from './components/ModelSelect'
import { SavedConfigsList } from './components/SavedConfigsList'

/**
 * Request host permission for API endpoint
 * Must be called in user-interaction context (popup/settings page)
 */
async function requestApiHostPermission(baseUrl: string): Promise<boolean> {
  try {
    const url = new URL(baseUrl)
    const origin = url.origin + '/*'

    // Check if already granted
    const hasPermission = await chrome.permissions.contains({ origins: [origin] })
    if (hasPermission) {
      return true
    }

    // Request permission - shows Chrome's permission dialog
    const granted = await chrome.permissions.request({ origins: [origin] })
    return granted
  } catch (error) {
    console.error('[Oh My Prompt] Permission request error:', error)
    return false
  }
}

function ApiConfigApp() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Quick config state
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  // Custom config state
  const [customApiFormat, setCustomApiFormat] = useState<'anthropic_messages' | 'chat_completions'>('chat_completions')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customName, setCustomName] = useState('')

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ProviderConfig | null>(null)
  const [editApiKey, setEditApiKey] = useState('')

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null)

  // Load providers and configs on mount
  useEffect(() => {
    const loadedProviders = loadSupportedProviders()
    setProviders(loadedProviders)
    setProviderGroups(groupProvidersByType(loadedProviders))
    loadConfigs()
  }, [])

  // Auto-select first model when provider changes
  useEffect(() => {
    if (selectedProvider?.models.length) {
      setSelectedModel(selectedProvider.models[0].id)
    }
  }, [selectedProvider])

  const loadConfigs = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS })
      if (response.success && response.data) {
        setConfigs(response.data.configs)
        setActiveConfigId(response.data.activeConfigId)
      }
      setError(null)
    } catch (err) {
      setError('获取配置失败')
      console.error('[Oh My Prompt] GET_PROVIDER_CONFIGS error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveQuickConfig = async () => {
    setError(null)
    setSuccess(null)

    if (!selectedProvider) {
      setError('请选择服务商')
      return
    }
    if (!apiKey.trim()) {
      setError('API Key 不能为空')
      return
    }

    const endpoint = selectedProvider.apiEndpoint

    const permissionGranted = await requestApiHostPermission(endpoint)
    if (!permissionGranted) {
      setError('API域名访问权限未授予，请点击"允许"以使用该API')
      return
    }

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.ADD_PROVIDER_CONFIG,
        payload: {
          providerId: selectedProvider.id,
          providerName: selectedProvider.nameCn || selectedProvider.name,
          apiKey: apiKey.trim(),
          apiEndpoint: endpoint,
          apiFormat: selectedProvider.apiFormat,
          selectedModel: selectedModel
        }
      })

      if (response.success) {
        setSuccess('配置已保存')
        setApiKey('')
        await loadConfigs()
      } else {
        setError(response.error || '保存配置失败')
      }
    } catch (err) {
      setError('保存配置失败')
      console.error('[Oh My Prompt] ADD_PROVIDER_CONFIG error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCustomConfig = async () => {
    setError(null)
    setSuccess(null)

    if (!customEndpoint.trim()) {
      setError('API 地址不能为空')
      return
    }
    if (!customEndpoint.startsWith('https://')) {
      setError('API 地址必须使用 HTTPS')
      return
    }
    if (!customApiKey.trim()) {
      setError('API Key 不能为空')
      return
    }
    if (!customModel.trim()) {
      setError('模型名称不能为空')
      return
    }

    const permissionGranted = await requestApiHostPermission(customEndpoint.trim())
    if (!permissionGranted) {
      setError('API域名访问权限未授予，请点击"允许"以使用该API')
      return
    }

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.ADD_PROVIDER_CONFIG,
        payload: {
          providerId: 'custom',
          providerName: customName.trim() || '自定义配置',
          apiKey: customApiKey.trim(),
          apiEndpoint: customEndpoint.trim(),
          apiFormat: customApiFormat,
          selectedModel: customModel.trim(),
          isCustom: true
        }
      })

      if (response.success) {
        setSuccess('配置已保存')
        setCustomEndpoint('')
        setCustomApiKey('')
        setCustomModel('')
        setCustomName('')
        await loadConfigs()
      } else {
        setError(response.error || '保存配置失败')
      }
    } catch (err) {
      setError('保存配置失败')
      console.error('[Oh My Prompt] ADD_PROVIDER_CONFIG error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleActivate = async (id: string) => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_ACTIVE_CONFIG,
        payload: { id }
      })
      if (response.success) {
        setActiveConfigId(id)
        setSuccess('已切换到此配置')
      } else {
        setError(response.error || '切换失败')
      }
    } catch (err) {
      setError('切换失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (config: ProviderConfig) => {
    setEditingConfig(config)
    setEditApiKey('')
    setEditDialogOpen(true)
  }

  const handleEditSave = async () => {
    if (!editingConfig) return

    setError(null)
    if (!editApiKey.trim()) {
      setError('请输入新的 API Key')
      return
    }

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.UPDATE_PROVIDER_CONFIG,
        payload: {
          id: editingConfig.id,
          updates: { apiKey: editApiKey.trim() }
        }
      })
      if (response.success) {
        setSuccess('配置已更新')
        setEditDialogOpen(false)
        await loadConfigs()
      } else {
        setError(response.error || '更新失败')
      }
    } catch (err) {
      setError('更新失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingConfigId(id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingConfigId) return

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.DELETE_PROVIDER_CONFIG,
        payload: { id: deletingConfigId }
      })
      if (response.success) {
        setSuccess('配置已删除')
        setDeleteDialogOpen(false)
        await loadConfigs()
      } else {
        setError(response.error || '删除失败')
      }
    } catch (err) {
      setError('删除失败')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => window.close()

  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-[520px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h1 className="text-base font-semibold text-gray-900">视觉AI配置</h1>
            {configs.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">
                选择服务商快速配置，或自定义 API 参数
              </p>
            )}
          </div>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Intro for first-time users */}
        {configs.length === 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-600">
              <p className="font-medium text-gray-700 mb-1">什么是视觉AI？</p>
              <p>视觉AI能「看懂」图片内容，自动分析风格、元素、配色等，生成对应的提示词描述。</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="p-4">
          <Tabs defaultValue="quick">
            <TabsList className="w-full">
              <TabsTrigger value="quick" className="flex-1">快速配置</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">自定义配置</TabsTrigger>
            </TabsList>

            <TabsContent value="quick">
              <div className="space-y-3 mt-3">
                <ProviderSelect
                  providers={providers}
                  groups={providerGroups}
                  value={selectedProvider}
                  onChange={setSelectedProvider}
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
                  <label className="text-sm font-medium text-gray-700 block mb-1">API密钥</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                  {selectedProvider?.apiKeyUrl && (
                    <a
                      href={selectedProvider.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1"
                    >
                      获取 API Key <ExternalLink style={{ width: 12, height: 12 }} />
                    </a>
                  )}
                </div>
                <Button onClick={handleSaveQuickConfig} disabled={loading || !selectedProvider}>
                  <Check style={{ width: 16, height: 16 }} />
                  {loading ? '保存中...' : '保存配置'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="custom">
              <div className="space-y-3 mt-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">配置名称</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="我的自定义配置"
                    className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">API 格式</label>
                  <select
                    value={customApiFormat}
                    onChange={(e) => setCustomApiFormat(e.target.value as typeof customApiFormat)}
                    className="w-full px-3 py-2 border border-gray-200 rounded bg-white focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  >
                    <option value="anthropic_messages">Anthropic 格式</option>
                    <option value="chat_completions">OpenAI 格式</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">API地址</label>
                  <input
                    type="text"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">模型名称</label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="gpt-4o, qwen-vl-max 等"
                    className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">API密钥</label>
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                </div>
                <Button onClick={handleSaveCustomConfig} disabled={loading}>
                  <Check style={{ width: 16, height: 16 }} />
                  {loading ? '保存中...' : '保存配置'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Error/Success messages */}
          {error && <p className="text-sm text-red-500 mt-3" role="alert">{error}</p>}
          {success && <p className="text-sm text-green-600 mt-3">{success}</p>}

          {/* Saved configs */}
          <SavedConfigsList
            configs={configs}
            activeConfigId={activeConfigId}
            onActivate={handleActivate}
            onDelete={handleDeleteClick}
            onEdit={handleEdit}
          />

          {/* Hint */}
          <div className="text-xs text-gray-500 pt-3 space-y-1">
            <p>推荐服务商：Anthropic Claude、阿里云百炼、DeepSeek</p>
            <p>所有配置仅存储在本地，不会上传到云端</p>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>编辑配置</DialogTitle>
            <DialogDescription>
              更新 {editingConfig?.providerName} 的 API Key
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 block mb-1">新的 API Key</label>
            <input
              type="password"
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
              placeholder="输入新的 API Key..."
              className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleEditSave} disabled={loading}>{loading ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>此操作将删除此配置，是否继续？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={loading}>
              {loading ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ApiConfigApp