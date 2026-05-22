// packages/extension/src/sidepanel/views/MineView.tsx
import { useState, useEffect } from 'react'
import { User, LogIn, Check, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { ProviderConfig, CloudAuthState, Provider, ProviderGroup } from '@oh-my-prompt/shared/types'
import { getAuthState, signOut } from '@/lib/cloud-sync/auth-service'
import { clearSupabaseClient } from '@/lib/cloud-sync/supabase-client'
import { WEB_APP_URL } from '@/lib/config'
import { SavedConfigsList } from '@/popup/components/SavedConfigsList'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import { loadSupportedProviders, groupProvidersByType } from '@/lib/provider-data'

export default function MineView() {
  // Auth state
  const [authState, setAuthState] = useState<CloudAuthState | null>(null)

  // Vision/API states
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([])
  const [visionEnabled, setVisionEnabled] = useState(true)

  // Edit/Delete dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ProviderConfig | null>(null)
  const [editApiKey, setEditApiKey] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null)

  // UI states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Load initial data
  useEffect(() => {
    getAuthState().then(setAuthState)
    const loadedProviders = loadSupportedProviders()
    setProviders(loadedProviders)
    setProviderGroups(groupProvidersByType(loadedProviders, true)) // exclude official
    loadConfigs()
    loadVisionSetting()
  }, [])

  // Listen for auth updates
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: { logout?: boolean } }) => {
      if (message.type === MessageType.AUTH_STATUS_UPDATE) {
        if (message.payload?.logout) {
          clearSupabaseClient()
          setAuthState({ status: 'not_logged_in' })
        } else {
          getAuthState().then(setAuthState)
        }
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

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
    } finally {
      setLoading(false)
    }
  }

  const loadVisionSetting = async () => {
    chrome.storage.local.get('prompt_script_data', (result) => {
      if (result.prompt_script_data?.settings?.visionEnabled !== undefined) {
        setVisionEnabled(result.prompt_script_data.settings.visionEnabled)
      }
    })
  }

  const handleLogin = () => {
    chrome.tabs.create({ url: `${WEB_APP_URL}/auth/callback?source=extension` })
  }

  const handleLogout = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await signOut()
      if (result.success) {
        setSuccess('已退出登录')
        setAuthState({ status: 'not_logged_in' })
        await loadConfigs()
      } else {
        setError('退出失败')
      }
    } catch (err) {
      setError('退出失败')
    } finally {
      setLoading(false)
    }
  }

  const officialConfigId = 'omp-official-default'

  const handleActivateOfficial = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      // Try to activate existing config
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_ACTIVE_CONFIG,
        payload: { id: officialConfigId }
      })

      if (response.success) {
        setActiveConfigId(officialConfigId)
        setSuccess('已激活官方服务')
      } else {
        // Create if not exists
        const createResponse = await chrome.runtime.sendMessage({
          type: MessageType.ADD_PROVIDER_CONFIG,
          payload: {
            id: officialConfigId,
            providerId: 'oh-my-prompt-official',
            providerName: 'Oh My Prompt 官方',
            apiKey: '',
            apiEndpoint: WEB_APP_URL + '/api/vision',
            apiFormat: 'omp_official',
            selectedModel: 'auto',
            isCustom: false,
            requiresAuth: true
          }
        })

        if (createResponse.success) {
          setActiveConfigId(officialConfigId)
          setSuccess('已激活官方服务')
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
        setVisionEnabled(!enabled)
      }
    } catch (err) {
      setError('设置保存失败')
      setVisionEnabled(!enabled)
    }
  }

  // Permission request helper
  async function requestApiHostPermission(baseUrl: string): Promise<boolean> {
    try {
      const url = new URL(baseUrl)
      const origin = url.origin + '/*'
      const hasPermission = await chrome.permissions.contains({ origins: [origin] })
      if (hasPermission) return true
      const granted = await chrome.permissions.request({ origins: [origin] })
      return granted
    } catch (err) {
      console.warn('[Oh My Prompt] API permission request failed:', err)
      return false
    }
  }

  const handleSaveQuickConfig = async (provider: Provider, model: string, apiKey: string) => {
    setError(null)
    setSuccess(null)
    if (!apiKey.trim()) {
      setError('API Key 不能为空')
      return
    }

    const endpoint = provider.apiEndpoint
    const permissionGranted = await requestApiHostPermission(endpoint)
    if (!permissionGranted) {
      setError('API域名访问权限未授予')
      return
    }

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.ADD_PROVIDER_CONFIG,
        payload: {
          providerId: provider.id,
          providerName: provider.nameCn || provider.name,
          apiKey: apiKey.trim(),
          apiEndpoint: endpoint,
          apiFormat: provider.apiFormat,
          selectedModel: model
        }
      })
      if (response.success) {
        setSuccess('配置已保存')
        await loadConfigs()
      } else {
        setError(response.error || '保存失败')
      }
    } catch (err) {
      setError('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCustomConfig = async (name: string, format: 'anthropic_messages' | 'chat_completions', endpoint: string, model: string, apiKey: string) => {
    setError(null)
    setSuccess(null)
    if (!endpoint.trim()) {
      setError('API 地址不能为空')
      return
    }
    if (!endpoint.startsWith('https://')) {
      setError('API 地址必须使用 HTTPS')
      return
    }
    if (!apiKey.trim()) {
      setError('API Key 不能为空')
      return
    }
    if (!model.trim()) {
      setError('模型名称不能为空')
      return
    }

    const permissionGranted = await requestApiHostPermission(endpoint.trim())
    if (!permissionGranted) {
      setError('API域名访问权限未授予')
      return
    }

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.ADD_PROVIDER_CONFIG,
        payload: {
          providerId: 'custom',
          providerName: name,
          apiKey: apiKey.trim(),
          apiEndpoint: endpoint.trim(),
          apiFormat: format,
          selectedModel: model.trim(),
          isCustom: true
        }
      })
      if (response.success) {
        setSuccess('配置已保存')
        await loadConfigs()
      } else {
        setError(response.error || '保存失败')
      }
    } catch (err) {
      setError('保存失败')
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
        payload: { id: editingConfig.id, updates: { apiKey: editApiKey.trim() } }
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

  return (
    <div className="w-full p-4 space-y-4">
      {/* 账号状态区 */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        {authState?.status === 'logged_in' ? (
          <>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-semibold"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
              >
                {(authState.user?.email?.split('@')[0]?.charAt(0)?.toUpperCase() || 'U')}
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-gray-900 leading-[1.4]">
                  {authState.user?.email?.split('@')[0] || '已登录'}
                  {authState.subscription?.planType && (
                    <span className="ml-1.5 text-[11px] text-amber-600 font-medium">
                      {authState.subscription.planType === 'pro' ? '会员' : authState.subscription.planType}
                    </span>
                  )}
                </p>
                {authState.user?.email && (
                  <p className="text-[11px] text-gray-400 mt-0.5">{authState.user.email}</p>
                )}
              </div>
            </div>
            <div className="mt-2.5 flex justify-between items-center">
              <a
                href={`${WEB_APP_URL}/dashboard`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-gray-500 hover:text-gray-600 transition-colors inline-flex items-center gap-1"
              >
                进入Web端
                <ArrowRight className="w-2.5 h-2.5" />
              </a>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                {loading ? '退出中...' : '退出登录'}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">未登录</p>
              <Button
                onClick={handleLogin}
                className="mt-2 h-8 text-xs"
              >
                <LogIn className="w-3 h-3" />
                登录
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 官方服务区 - 登录后显示 */}
      {authState?.status === 'logged_in' && (
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Oh My Prompt 官方服务</p>
              <p className="text-xs text-gray-500 mt-1">登录后云端备份、Agent生成、图片转提示词均可使用</p>
            </div>
          </div>
          {activeConfigId === officialConfigId ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="w-4 h-4" />
              已激活
            </div>
          ) : (
            <Button
              onClick={handleActivateOfficial}
              disabled={loading}
              className="w-full h-9"
            >
              {loading ? '激活中...' : '激活官方服务'}
            </Button>
          )}
        </div>
      )}

      {/* 功能开关区 */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">图片转提示词</p>
              <p className="text-xs text-gray-500">鼠标悬停图片时显示转换按钮</p>
            </div>
          </div>
          <button
            onClick={() => handleVisionToggle(!visionEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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

      {/* API配置列表 */}
      {visionEnabled && (
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <SavedConfigsList
            configs={configs}
            activeConfigId={activeConfigId}
            onActivate={handleActivate}
            onDelete={handleDeleteClick}
            onEdit={handleEdit}
            providers={providers}
            providerGroups={providerGroups}
            loading={loading}
            onSaveQuickConfig={handleSaveQuickConfig}
            onSaveCustomConfig={handleSaveCustomConfig}
            error={error}
            success={success}
          />
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>编辑配置</DialogTitle>
            <DialogDescription>更新 {editingConfig?.providerName} 的 API Key</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 block mb-1">新的 API Key</label>
            <input
              type="password"
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
              placeholder="输入新的 API Key..."
              className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400"
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