// packages/extension/src/sidepanel/views/MineView.tsx
import { useState, useEffect } from 'react'
import { User, LogIn, Check } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { ProviderConfig, CloudAuthState, Provider, ProviderGroup } from '@oh-my-prompt/shared/types'
import { getAuthState, signOut } from '@/lib/cloud-sync/auth-service'
import { clearSupabaseClient } from '@/lib/cloud-sync/supabase-client'
import { WEB_APP_URL } from '@/lib/config'
// import { OfficialVisionCard } from '@/popup/components/OfficialVisionCard' // TODO: use in render
// import { CollapsibleSection } from '@/popup/components/CollapsibleSection' // TODO: use in render
// import { ProviderSelect } from '@/popup/components/ProviderSelect' // TODO: use in render
// import { ModelSelect } from '@/popup/components/ModelSelect' // TODO: use in render
// import { SavedConfigsList } from '@/popup/components/SavedConfigsList' // TODO: use in render
import { loadSupportedProviders, groupProvidersByType } from '@/lib/provider-data'

export default function MineView() {
  // Auth state
  const [authState, setAuthState] = useState<CloudAuthState | null>(null)

  // Vision/API states
  const [_configs, setConfigs] = useState<ProviderConfig[]>([])
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  const [_providers, setProviders] = useState<Provider[]>([])
  const [_providerGroups, setProviderGroups] = useState<ProviderGroup[]>([])
  const [_visionEnabled, setVisionEnabled] = useState(true)

  // UI states
  const [loading, setLoading] = useState(false)
  const [_error, setError] = useState<string | null>(null)
  const [_success, setSuccess] = useState<string | null>(null)

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

  return (
    <div className="w-full p-4 space-y-4">
      {/* 账号状态区 */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-500" />
          </div>
          <div className="flex-1">
            {authState?.status === 'logged_in' ? (
              <>
                <p className="text-sm font-medium text-gray-900">
                  已登录
                  {authState.subscription?.planType && (
                    <span className="ml-2 text-xs text-amber-600">· {authState.subscription.planType === 'pro' ? '会员' : authState.subscription.planType}</span>
                  )}
                </p>
                <button
                  onClick={handleLogout}
                  disabled={loading}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {loading ? '退出中...' : '退出登录'}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900">未登录</p>
                <Button
                  onClick={handleLogin}
                  className="mt-2 h-8 text-xs"
                >
                  <LogIn className="w-3 h-3" />
                  登录
                </Button>
              </>
            )}
          </div>
          </div>
        </div>

      {/* 官方服务区 - 登录后显示 */}
      {authState?.status === 'logged_in' && (
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Oh My Prompt 官方服务</p>
              <p className="text-xs text-gray-500 mt-1">激活后云端备份、Agent生成、图片转提示词均可使用</p>
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

      {/* 其他区块将在后续任务实现 */}
    </div>
  )
}