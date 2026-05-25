# 侧边栏"我的"Tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集中账号/API配置到"我的"tab，一处登录全局可用，弱化其他位置的登录按钮。

**Architecture:** SettingsView 新增 `mine` tab 替代 `vision` tab，MineView 组件整合账号状态、官方服务、第三方API配置、功能开关四个区块。其他位置登录按钮改为跳转到"我的"tab。

**Tech Stack:** React, TypeScript, Zustand, Chrome Extension APIs, Supabase Auth

---

## 文件结构

| 文件 | 负责内容 |
|------|----------|
| `sidepanel/views/MineView.tsx` | 新增：账号状态、官方服务、第三方API、功能开关 |
| `sidepanel/views/SettingsView.tsx` | 修改：tab列表从 sync/vision/import-export 改为 sync/import-export/mine |
| `sidepanel/SidePanelApp.tsx` | 修改：新增 sidepanelIntent='mine' 处理 |
| `sidepanel/settings/BackupStatusRow.tsx` | 修改：未登录按钮弱化为文字跳转 |
| `sidepanel/settings/BackupSection.tsx` | 修改：传递 onNavigateToMine prop |
| `sidepanel/views/AgentView.tsx` | 修改：登录提示弱化为文字跳转 |
| `sidepanel/views/EcommerceView.tsx` | 修改：登录提示弱化为文字跳转 |
| `sidepanel/settings/VisionSection.tsx` | 删除：功能已迁移到 MineView |

---

### Task 1: 创建 MineView 组件基础结构

**Files:**
- Create: `packages/extension/src/sidepanel/views/MineView.tsx`

- [ ] **Step 1: 创建 MineView.tsx 文件骨架**

```tsx
// packages/extension/src/sidepanel/views/MineView.tsx
import { useState, useEffect } from 'react'
import { User, LogIn, LogOut, Check, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { ProviderConfig, CloudAuthState } from '@oh-my-prompt/shared/types'
import { getAuthState } from '@/lib/cloud-sync/auth-service'
import { clearSupabaseClient } from '@/lib/cloud-sync/supabase-client'
import { WEB_APP_URL } from '@/lib/config'
import { OfficialVisionCard } from '@/popup/components/OfficialVisionCard'
import { CollapsibleSection } from '@/popup/components/CollapsibleSection'
import { ProviderSelect } from '@/popup/components/ProviderSelect'
import { ModelSelect } from '@/popup/components/ModelSelect'
import { SavedConfigsList } from '@/popup/components/SavedConfigsList'
import { loadSupportedProviders, groupProvidersByType } from '@/lib/provider-data'
import type { Provider, ProviderGroup } from '@oh-my-prompt/shared/types'

export default function MineView() {
  // Auth state
  const [authState, setAuthState] = useState<CloudAuthState | null>(null)
  
  // Vision/API states
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([])
  const [visionEnabled, setVisionEnabled] = useState(true)
  
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
  
  // TODO: Implement helper functions and render in next steps
  return (
    <div className="w-full p-4 space-y-4">
      {/* Placeholder - will implement in next tasks */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">MineView - 待实现</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 添加 loadConfigs 和 loadVisionSetting 函数**

```tsx
// 在 MineView.tsx 的 useEffect 之后添加

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
```

- [ ] **Step 3: 提交基础骨架**

```bash
git add packages/extension/src/sidepanel/views/MineView.tsx
git commit -m "feat: add MineView component skeleton for account/API management"
```

---

### Task 2: 实现账号状态区块

**Files:**
- Modify: `packages/extension/src/sidepanel/views/MineView.tsx`

- [ ] **Step 1: 添加登录/退出处理函数**

```tsx
// 在 loadVisionSetting 之后添加

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

// Import signOut at top of file
import { signOut } from '@/lib/cloud-sync/auth-service'
```

- [ ] **Step 2: 实现账号状态区 UI**

```tsx
// 替换 MineView 的 return 部分

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
                {authState.subscription?.tier && (
                  <span className="ml-2 text-xs text-amber-600">· {authState.subscription.tier === 'pro' ? '会员' : authState.subscription.tier}</span>
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
    
    {/* 其他区块将在后续任务实现 */}
  </div>
)
```

- [ ] **Step 3: 提交账号状态区块**

```bash
git add packages/extension/src/sidepanel/views/MineView.tsx
git commit -m "feat: add account status section to MineView"
```

---

### Task 3: 实现官方服务区块

**Files:**
- Modify: `packages/extension/src/sidepanel/views/MineView.tsx`

- [ ] **Step 1: 添加激活官方API函数**

```tsx
// 在 handleLogout 之后添加

const officialConfigId = 'omp-official-default'

const handleActivateOfficial = async () => {
  setLoading(true)
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
```

- [ ] **Step 2: 实现官方服务区 UI（登录后显示）**

```tsx
// 在账号状态区 div 之后添加

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
```

- [ ] **Step 3: 提交官方服务区块**

```bash
git add packages/extension/src/sidepanel/views/MineView.tsx
git commit -m "feat: add official service section to MineView"
```

---

### Task 4: 实现功能开关区块

**Files:**
- Modify: `packages/extension/src/sidepanel/views/MineView.tsx`

- [ ] **Step 1: 添加功能开关处理函数**

```tsx
// 在 handleActivateOfficial 之后添加

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
```

- [ ] **Step 2: 实现功能开关区 UI**

```tsx
// 在官方服务区之后添加（或在账号状态区之后，如果未登录）

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
```

- [ ] **Step 3: 提交功能开关区块**

```bash
git add packages/extension/src/sidepanel/views/MineView.tsx
git commit -m "feat: add vision toggle section to MineView"
```

---

### Task 5: 实现第三方API配置区块

**Files:**
- Modify: `packages/extension/src/sidepanel/views/MineView.tsx`

- [ ] **Step 1: 添加快速配置和自定义配置的状态变量**

```tsx
// 在 MineView 的 state 定义部分添加

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

// Edit/Delete dialog states
const [editDialogOpen, setEditDialogOpen] = useState(false)
const [editingConfig, setEditingConfig] = useState<ProviderConfig | null>(null)
const [editApiKey, setEditApiKey] = useState('')
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null)

// Collapsible state
const [showThirdPartyConfig, setShowThirdPartyConfig] = useState(false)
```

- [ ] **Step 2: 添加 auto-select model effect**

```tsx
// 在 useEffect 之后添加

useEffect(() => {
  if (selectedProvider?.models.length) {
    setSelectedModel(selectedProvider.models[0].id)
  }
}, [selectedProvider])
```

- [ ] **Step 3: 添加权限请求函数**

```tsx
// 在 handleVisionToggle 之后添加

async function requestApiHostPermission(baseUrl: string): Promise<boolean> {
  try {
    const url = new URL(baseUrl)
    const origin = url.origin + '/*'
    const hasPermission = await chrome.permissions.contains({ origins: [origin] })
    if (hasPermission) return true
    const granted = await chrome.permissions.request({ origins: [origin] })
    return granted
  } catch (error) {
    console.warn('[Oh My Prompt] API permission request failed:', error)
    return false
  }
}
```

- [ ] **Step 4: 添加保存配置函数**

```tsx
// 在 requestApiHostPermission 之后添加

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
    setError('API域名访问权限未授予')
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
      setError(response.error || '保存失败')
    }
  } catch (err) {
    setError('保存失败')
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
    setError('API域名访问权限未授予')
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
      setError(response.error || '保存失败')
    }
  } catch (err) {
    setError('保存失败')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 5: 添加激活/编辑/删除函数**

```tsx
// 在 handleSaveCustomConfig 之后添加

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
```

- [ ] **Step 6: 实现第三方API配置区 UI**

```tsx
// 在功能开关区之后添加

{/* 第三方API配置区 - 功能开启后显示 */}
{visionEnabled && (
  <CollapsibleSection
    title="第三方 API 配置"
    defaultExpanded={configs.filter(c => c.apiFormat !== 'omp_official').length === 0}
    hint={configs.length > 0 ? `已有 ${configs.length} 个配置` : '配置后可使用 Agent 和图片转提示词'}
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
          <Button onClick={handleSaveCustomConfig} disabled={loading} className="w-full h-10">
            <Check className="w-4 h-4" />
            {loading ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>

    {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
    {success && <p className="text-sm text-green-600 mt-4">{success}</p>}
  </CollapsibleSection>
)}
```

- [ ] **Step 7: 添加已保存配置列表**

```tsx
// 在第三方API配置区之后添加

{/* 已保存配置列表 */}
{visionEnabled && configs.length > 0 && (
  <SavedConfigsList
    configs={configs}
    activeConfigId={activeConfigId}
    onActivate={handleActivate}
    onDelete={handleDeleteClick}
    onEdit={handleEdit}
  />
)}
```

- [ ] **Step 8: 添加 Dialog 组件**

需要导入 Dialog 组件并在 return 最后添加：

```tsx
// 在 imports 添加
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/popup/components/ui/tabs'
import { ExternalLink } from 'lucide-react'

// 在 return 的最后添加（在最后一个 </div> 之前）

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
```

- [ ] **Step 9: 提交第三方API配置区块**

```bash
git add packages/extension/src/sidepanel/views/MineView.tsx
git commit -m "feat: add third-party API config section to MineView"
```

---

### Task 6: 修改 SettingsView Tab 结构

**Files:**
- Modify: `packages/extension/src/sidepanel/views/SettingsView.tsx`

- [ ] **Step 1: 修改 tab 类型定义和 labels**

```tsx
// 修改 SettingsView.tsx

// 当前第17行
type SettingsTab = 'sync' | 'vision' | 'import-export'

// 改为
type SettingsTab = 'sync' | 'import-export' | 'mine'

// 当前第19-23行
const tabLabels: Record<SettingsTab, string> = {
  sync: '同步与备份',
  vision: '图片转提示词',
  'import-export': '导入导出'
}

// 改为
const tabLabels: Record<SettingsTab, string> = {
  sync: '同步与备份',
  'import-export': '导入导出',
  mine: '我的'
}
```

- [ ] **Step 2: 修改 lazy imports**

```tsx
// 当前第6-11行
const VisionSection = lazy(() =>
  import('../settings/VisionSection').then(m => ({ default: m.VisionSection }))
)
const ImportExportSection = lazy(() =>
  import('../settings/ImportExportSection').then(m => ({ default: m.ImportExportSection }))
)

// 改为
const ImportExportSection = lazy(() =>
  import('../settings/ImportExportSection').then(m => ({ default: m.ImportExportSection }))
)
const MineView = lazy(() =>
  import('./MineView').then(m => ({ default: m.default }))
)
```

- [ ] **Step 3: 修改 tab 内容渲染**

```tsx
// 当前第61-75行
<div className="flex-1 w-full overflow-y-auto">
  <div className={activeTab === 'sync' ? 'block' : 'hidden'}>
    <BackupSection />
  </div>
  <div className={activeTab === 'vision' ? 'block' : 'hidden'}>
    <Suspense fallback={<LoadingSpinner className="py-8" />}>
      <VisionSection />
    </Suspense>
  </div>
  <div className={activeTab === 'import-export' ? 'block' : 'hidden'}>
    <Suspense fallback={<LoadingSpinner className="py-8" />}>
      <ImportExportSection />
    </Suspense>
  </div>
</div>

// 改为
<div className="flex-1 w-full overflow-y-auto">
  <div className={activeTab === 'sync' ? 'block' : 'hidden'}>
    <BackupSection />
  </div>
  <div className={activeTab === 'import-export' ? 'block' : 'hidden'}>
    <Suspense fallback={<LoadingSpinner className="py-8" />}>
      <ImportExportSection />
    </Suspense>
  </div>
  <div className={activeTab === 'mine' ? 'block' : 'hidden'}>
    <Suspense fallback={<LoadingSpinner className="py-8" />}>
      <MineView />
    </Suspense>
  </div>
</div>
```

- [ ] **Step 4: 提交 SettingsView 修改**

```bash
git add packages/extension/src/sidepanel/views/SettingsView.tsx
git commit -m "feat: replace vision tab with mine tab in SettingsView"
```

---

### Task 7: 实现 sidepanelIntent='mine' 跳转机制

**Files:**
- Modify: `packages/extension/src/sidepanel/SidePanelApp.tsx`
- Modify: `packages/extension/src/sidepanel/views/SettingsView.tsx`

- [ ] **Step 1: 修改 SettingsView 接收 intent 并跳转到 mine tab**

```tsx
// 在 SettingsView.tsx 添加 useEffect 处理 sidepanelIntent

// 在 SettingsView 组件内添加（第26行 setActiveTab 之前）

useEffect(() => {
  // Check for mine intent on mount
  chrome.storage.session.get('sidepanelIntent', (result) => {
    if (result.sidepanelIntent === 'mine') {
      setActiveTab('mine')
      chrome.storage.session.remove('sidepanelIntent')
    }
  })

  // Listen for storage changes
  const handleStorageChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === 'session' && changes.sidepanelIntent?.newValue === 'mine') {
      setActiveTab('mine')
      chrome.storage.session.remove('sidepanelIntent')
    }
  }
  chrome.storage.onChanged.addListener(handleStorageChange)
  return () => chrome.storage.onChanged.removeListener(handleStorageChange)
}, [])
```

- [ ] **Step 2: 提交 SettingsView intent 处理**

```bash
git add packages/extension/src/sidepanel/views/SettingsView.tsx
git commit -m "feat: add sidepanelIntent handling for mine tab navigation"
```

---

### Task 8: 弱化 BackupStatusRow 登录按钮

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/BackupStatusRow.tsx`
- Modify: `packages/extension/src/sidepanel/settings/BackupSection.tsx`

- [ ] **Step 1: 添加 onNavigateToMine prop 到 BackupStatusRow**

```tsx
// 修改 BackupStatusRow.tsx interface

interface BackupStatusRowProps {
  target: 'cloud' | 'local'
  status: BackupTargetStatus | null
  onLogin?: () => void
  onRestorePermission?: () => void
  onClickError?: () => void
  onNavigateToMine?: () => void  // 新增
}
```

- [ ] **Step 2: 修改未登录状态渲染**

```tsx
// 修改 BackupStatusRow.tsx renderStatus 函数中的未登录分支

// 当前第98-108行
if (target === 'cloud' && !status.loggedIn) {
  return (
    <button
      onClick={onLogin}
      className="flex items-center gap-1.5 text-sm text-yellow-600 hover:text-yellow-700 cursor-pointer transition-colors"
    >
      <LogIn className="w-3.5 h-3.5" />
      <span>未登录 · 点击登录</span>
    </button>
  )
}

// 改为
if (target === 'cloud' && !status.loggedIn) {
  return (
    <span
      onClick={onNavigateToMine}
      className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
    >
      未登录
    </span>
  )
}
```

- [ ] **Step 3: 在 BackupSection 传递 onNavigateToMine**

```tsx
// 修改 BackupSection.tsx

// 添加 navigate to mine 函数（在 handleLogout 之后）
const handleNavigateToMine = () => {
  chrome.storage.session.set({ sidepanelIntent: 'mine' })
}

// 修改 BackupStatusRow 调用（第577-590行）
<BackupStatusRow
  target="cloud"
  status={status?.cloud ?? null}
  onLogin={handleLogin}  // 保留，但不再用于未登录状态
  onClickError={() => setShowMoreOptions(true)}
  onNavigateToMine={handleNavigateToMine}  // 新增
/>
```

- [ ] **Step 4: 提交 BackupStatusRow 弱化修改**

```bash
git add packages/extension/src/sidepanel/settings/BackupStatusRow.tsx packages/extension/src/sidepanel/settings/BackupSection.tsx
git commit -m "feat: weaken login button to text link in BackupStatusRow"
```

---

### Task 9: 弱化 AgentView 登录提示

**Files:**
- Modify: `packages/extension/src/sidepanel/views/AgentView.tsx`

- [ ] **Step 1: 添加 handleNavigateToMine 函数**

```tsx
// 在 AgentView.tsx 的 state 定义之后添加

const handleNavigateToMine = () => {
  chrome.storage.session.set({ sidepanelIntent: 'mine' })
  onOpenSettings?.()  // 打开 settings view
}
```

- [ ] **Step 2: 修改未配置提示 UI**

```tsx
// 修改 AgentView.tsx 第205-231行的 Setup Guide 部分

// 当前
{hasConfig === false && (
  <div className="flex flex-col items-center justify-center flex-1 px-6 py-8 text-center">
    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
      <Settings className="w-6 h-6 text-amber-600" />
    </div>
    <h3 className="text-sm font-medium text-gray-900 mb-1">尚未配置 API</h3>
    <p className="text-xs text-gray-500 mb-5 leading-relaxed">
      使用 Agent 生成提示词前，需要登录官方服务或配置第三方 API
    </p>
    <div className="flex flex-col gap-2 w-full max-w-[240px]">
      <button
        onClick={() => window.open(`${WEB_APP_URL}/auth/login?source=extension`, '_blank')}
        className="..."
      >
        <LogIn className="w-4 h-4" />
        登录官方服务
      </button>
      <button
        onClick={() => onOpenSettings?.()}
        className="..."
      >
        <Settings className="w-4 h-4" />
        配置第三方 API
      </button>
    </div>
  </div>
)}

// 改为
{hasConfig === false && (
  <div className="flex flex-col items-center justify-center flex-1 px-6 py-8 text-center">
    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
      <Settings className="w-6 h-6 text-amber-600" />
    </div>
    <h3 className="text-sm font-medium text-gray-900 mb-2">尚未配置 API</h3>
    <p className="text-xs text-gray-500 leading-relaxed">
      使用 Agent 生成提示词前，请先
      <button
        onClick={handleNavigateToMine}
        className="text-blue-600 hover:underline mx-1"
      >
        登录或配置API
      </button>
    </p>
  </div>
)}
```

- [ ] **Step 3: 移除不再需要的 LogIn import**

```tsx
// 从 lucide-react import 中移除 LogIn（如果不再使用）

import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings } from 'lucide-react'
```

- [ ] **Step 4: 提交 AgentView 弱化修改**

```bash
git add packages/extension/src/sidepanel/views/AgentView.tsx
git commit -m "feat: weaken login prompt to text link in AgentView"
```

---

### Task 10: 弱化 EcommerceView 登录提示

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 添加 handleNavigateToMine 函数**

```tsx
// 在 EcommerceView.tsx 的 state 定义之后添加

const handleNavigateToMine = () => {
  chrome.storage.session.set({ sidepanelIntent: 'mine' })
  onOpenSettings?.()
}
```

- [ ] **Step 2: 查找并修改未配置提示 UI**

```tsx
// 查找 EcommerceView.tsx 中类似的 Setup Guide 部分
// 结构与 AgentView 类似，修改为相同的简化版本

{hasConfig === false && (
  <div className="flex flex-col items-center justify-center flex-1 px-6 py-8 text-center">
    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
      <Settings className="w-6 h-6 text-amber-600" />
    </div>
    <h3 className="text-sm font-medium text-gray-900 mb-2">尚未配置 API</h3>
    <p className="text-xs text-gray-500 leading-relaxed">
      使用电商套图生成前，请先
      <button
        onClick={handleNavigateToMine}
        className="text-blue-600 hover:underline mx-1"
      >
        登录或配置API
      </button>
    </p>
  </div>
)}
```

- [ ] **Step 3: 提交 EcommerceView 弱化修改**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "feat: weaken login prompt to text link in EcommerceView"
```

---

### Task 11: 删除 VisionSection.tsx

**Files:**
- Delete: `packages/extension/src/sidepanel/settings/VisionSection.tsx`

- [ ] **Step 1: 删除 VisionSection.tsx 文件**

```bash
rm packages/extension/src/sidepanel/settings/VisionSection.tsx
```

- [ ] **Step 2: 提交删除**

```bash
git add -A packages/extension/src/sidepanel/settings/VisionSection.tsx
git commit -m "refactor: remove VisionSection.tsx (migrated to MineView)"
```

---

### Task 12: 运行 TypeScript 检查和开发服务器验证

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

Expected: Dev server starts successfully on port 5173

- [ ] **Step 3: 手动测试功能**

1. 打开 Chrome，加载 extension from `packages/extension/dist/`
2. 打开 Sidepanel
3. 点击"设置" → 检查 tab 是否为"同步与备份"、"导入导出"、"我的"
4. 点击"我的"tab → 检查四个区块是否正确显示
5. 点击登录按钮 → 检查是否打开 OAuth 页面
6. 在 BackupStatusRow 检查"未登录"是否为灰色文字
7. 在 AgentView 检查登录提示是否简化为文字链接

- [ ] **Step 4: 提交最终验证**

```bash
git add -A
git commit -m "test: verify MineView implementation works correctly"
```

---

## Spec Coverage 检查

| 规范要求 | 任务覆盖 |
|----------|----------|
| SettingsView 新增 mine tab | Task 6 |
| 移除 vision tab | Task 6 |
| 账号状态区 | Task 2 |
| 官方服务区 | Task 3 |
| 第三方API配置区 | Task 5 |
| 功能开关区 | Task 4 |
| BackupStatusRow 弱化 | Task 8 |
| AgentView 弱化 | Task 9 |
| EcommerceView 弱化 | Task 10 |
| VisionSection.tsx 删除 | Task 11 |
| sidepanelIntent 跳转 | Task 7 |

所有规范要求已覆盖。