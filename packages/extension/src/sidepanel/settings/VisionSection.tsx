// src/sidepanel/settings/VisionSection.tsx
import { useState, useEffect } from 'react'
import { Button } from '@/popup/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/popup/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/popup/components/ui/dialog'
import { Check, ExternalLink, Sparkles } from 'lucide-react'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { ProviderConfig, Provider, ProviderGroup, CloudAuthState } from '@oh-my-prompt/shared/types'
import { loadSupportedProviders, groupProvidersByType } from '@/lib/provider-data'
import { ProviderSelect } from '@/popup/components/ProviderSelect'
import { ModelSelect } from '@/popup/components/ModelSelect'
import { SavedConfigsList } from '@/popup/components/SavedConfigsList'
import { OfficialVisionCard } from '@/popup/components/OfficialVisionCard'
import { CollapsibleSection } from '@/popup/components/CollapsibleSection'
import { getAuthState } from '@/lib/cloud-sync/auth-service'
import { WEB_APP_URL } from '@/lib/config'

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
    // Note: DOMException is thrown if called without user gesture context
    const granted = await chrome.permissions.request({ origins: [origin] })
    return granted
  } catch (error) {
    // DOMException expected when no user gesture (e.g., auto-triggered on load)
    console.warn('[Oh My Prompt] API permission request failed:', error instanceof Error ? error.name : String(error))
    return false
  }
}

export function VisionSection() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Vision feature toggle state
  const [visionEnabled, setVisionEnabled] = useState(true)

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

  // Official Vision API state
  const [authState, setAuthState] = useState<CloudAuthState | null>(null)
  const officialConfigId = 'omp-official-default'  // Fixed ID for official config

  // Load providers and configs on mount
  useEffect(() => {
    const loadedProviders = loadSupportedProviders()
    setProviders(loadedProviders)
    setProviderGroups(groupProvidersByType(loadedProviders))
    loadConfigs()
    loadVisionSetting()
  }, [])

  // Load auth state on mount
  useEffect(() => {
    getAuthState().then(setAuthState)
  }, [])

  // Load vision enabled setting from storage
  const loadVisionSetting = async () => {
    chrome.storage.local.get('prompt_script_data', (result) => {
      if (result.prompt_script_data?.settings?.visionEnabled !== undefined) {
        setVisionEnabled(result.prompt_script_data.settings.visionEnabled)
      }
    })
  }

  // Handle vision toggle
  const handleVisionToggle = async (enabled: boolean) => {
    setVisionEnabled(enabled)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_SETTINGS_ONLY,
        payload: { settings: { visionEnabled: enabled } }
      })
      if (response.success) {
        setSuccess(enabled ? '转提示词功能已开启' : '转提示词功能已关闭')
      } else {
        setError('设置保存失败')
        setVisionEnabled(!enabled) // Revert on error
      }
    } catch (err) {
      setError('设置保存失败')
      setVisionEnabled(!enabled) // Revert on error
    }
  }

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

  const handleActivateOfficial = async () => {
    setLoading(true)
    try {
      // Try to activate official config
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_ACTIVE_CONFIG,
        payload: { id: officialConfigId }
      })

      if (response.success) {
        setActiveConfigId(officialConfigId)
        setSuccess('已激活官方 Vision API')
      } else {
        // If config doesn't exist, create it first
        const createResponse = await chrome.runtime.sendMessage({
          type: MessageType.ADD_PROVIDER_CONFIG,
          payload: {
            id: officialConfigId,
            providerId: 'oh-my-prompt-official',
            providerName: 'Oh My Prompt 官方',
            apiKey: '',  // No API key for official
            apiEndpoint: WEB_APP_URL + '/api/vision',
            apiFormat: 'omp_official',
            selectedModel: 'auto',
            isCustom: false,
            requiresAuth: true
          }
        })

        if (createResponse.success) {
          setActiveConfigId(officialConfigId)
          setSuccess('已激活官方 Vision API')
          await loadConfigs()
        } else {
          setError(createResponse.error || '激活失败')
        }
      }
    } catch (err) {
      setError('激活失败')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = () => {
    window.open(WEB_APP_URL + '/auth/login', '_blank')
  }

  const handleUpgrade = () => {
    window.open(WEB_APP_URL + '/subscription', '_blank')
  }

  return (
    <div className="w-full space-y-4 p-4">
      {/* Feature Toggle */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <div>
              <p className="font-medium text-gray-900">转提示词功能</p>
              <p className="text-sm text-gray-500">鼠标悬停图片时显示转换按钮</p>
            </div>
          </div>
          <button
            onClick={() => handleVisionToggle(!visionEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              visionEnabled ? 'bg-gray-900' : 'bg-gray-200'
            }`}
            role="switch"
            aria-checked={visionEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                visionEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Official Vision API Card */}
      {visionEnabled && (
        <OfficialVisionCard
          authState={authState}
          isActive={activeConfigId === officialConfigId}
          onActivate={handleActivateOfficial}
          onLogin={handleLogin}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Third-party API Configuration (collapsible) */}
      {visionEnabled && (
        <CollapsibleSection
          title="第三方 API 配置"
          defaultExpanded={false}
          hint={configs.filter(c => c.apiFormat !== 'omp_official').length > 0 ? `已有 ${configs.filter(c => c.apiFormat !== 'omp_official').length} 个配置` : undefined}
        >
          <Tabs defaultValue="quick">
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
                  <label className="text-sm font-medium text-gray-700 block mb-2">API密钥</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                <Button onClick={handleSaveQuickConfig} disabled={loading || !selectedProvider} className="w-full h-10">
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
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">API 格式</label>
                  <select
                    value={customApiFormat}
                    onChange={(e) => setCustomApiFormat(e.target.value as typeof customApiFormat)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-md bg-white focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-md focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={loading}
                  />
                </div>
                <Button onClick={handleSaveCustomConfig} disabled={loading} className="w-full h-10">
                  <Check className="w-4 h-4" />
                  {loading ? '保存中...' : '保存配置'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Error/Success messages */}
          {error && <p className="text-sm text-red-500 mt-4" role="alert">{error}</p>}
          {success && <p className="text-sm text-green-600 mt-4">{success}</p>}

          {/* Saved configs - filter out official config */}
          <SavedConfigsList
            configs={configs.filter(c => c.apiFormat !== 'omp_official')}
            activeConfigId={activeConfigId}
            onActivate={handleActivate}
            onDelete={handleDeleteClick}
            onEdit={handleEdit}
          />

          {/* Hint */}
          <div className="text-xs text-gray-500 pt-4 border-t border-gray-100 mt-4">
            <p>所有配置仅存储在本地</p>
          </div>
        </CollapsibleSection>
      )}

      {/* Disabled state hint */}
      {!visionEnabled && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
          <p className="text-sm text-gray-500">转提示词功能已关闭，开启后可配置 API</p>
        </div>
      )}

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