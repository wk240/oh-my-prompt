import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './components/ui/dialog'
import { Check, X, Trash2 } from 'lucide-react'
import { MessageType } from '../shared/messages'
import type { VisionApiConfig } from '../shared/types'

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
  const [config, setConfig] = useState<VisionApiConfig | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [apiFormat, setApiFormat] = useState<'openai' | 'anthropic'>('anthropic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_API_CONFIG })
      if (response.success && response.data) {
        setConfig(response.data)
        setBaseUrl(response.data.baseUrl)
        setApiKey(response.data.apiKey)
        setModelName(response.data.modelName)
        setApiFormat(response.data.apiFormat || 'openai')
      } else {
        setConfig(null)
        setBaseUrl('')
        setApiKey('')
        setModelName('')
        setApiFormat('openai')
      }
      setError(null)
    } catch (err) {
      setError('获取配置失败')
      // SECURITY: Log error only, never apiKey (AUTH-02, T-10-02)
      console.error('[Oh My Prompt] GET_API_CONFIG error:', err)
    } finally {
      setLoading(false)
    }
  }

  const validateInputs = (): string | null => {
    const trimmedUrl = baseUrl.trim()
    const trimmedKey = apiKey.trim()
    const trimmedModel = modelName.trim()

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return 'API Base URL 必须以 http:// 或 https:// 开头'
    }
    if (!trimmedKey) {
      return 'API Key 不能为空'
    }
    if (!trimmedModel) {
      return 'Model Name 不能为空'
    }
    return null
  }

  const handleSave = async () => {
    // Clear previous messages
    setError(null)
    setSuccess(null)

    // Validate inputs
    const validationError = validateInputs()
    if (validationError) {
      setError(validationError)
      return
    }

    const trimmedUrl = baseUrl.trim()

    // Request host permission BEFORE saving config
    const permissionGranted = await requestApiHostPermission(trimmedUrl)
    if (!permissionGranted) {
      setError('API域名访问权限未授予，请点击"允许"以使用该API')
      return
    }

    setLoading(true)
    try {
      const payload: VisionApiConfig = {
        baseUrl: trimmedUrl,
        apiKey: apiKey.trim(),
        modelName: modelName.trim(),
        apiFormat: apiFormat
      }

      // SECURITY: Log baseUrl, modelName, apiFormat only, never apiKey (AUTH-02, T-10-02)

      const response = await chrome.runtime.sendMessage({
        type: MessageType.SET_API_CONFIG,
        payload
      })

      if (response.success) {
        setSuccess('配置已保存，API域名权限已授予')
        await loadConfig()
      } else {
        setError(response.error || '保存配置失败，请重试')
      }
    } catch (err) {
      setError('保存配置失败，请重试')
      // SECURITY: Log error only, never apiKey
      console.error('[Oh My Prompt] SET_API_CONFIG error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.DELETE_API_CONFIG })

      if (response.success) {
        setSuccess('配置已删除')
        setConfig(null)
        setBaseUrl('')
        setApiKey('')
        setModelName('')
        setApiFormat('openai')
        setDeleteDialogOpen(false)
      } else {
        setError(response.error || '删除配置失败')
      }
    } catch (err) {
      setError('删除配置失败')
      console.error('[Oh My Prompt] DELETE_API_CONFIG error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    window.close()
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h1 className="text-base font-semibold text-gray-900">视觉AI配置</h1>
            {!config && (
              <p className="text-sm text-gray-500 mt-1">
                配置API密钥后，可上传图片自动生成提示词
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="关闭"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* What is Vision AI? */}
        {!config && (
          <div className="px-4 pt-3 pb-2">
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-600">
              <p className="font-medium text-gray-700 mb-1">💡 什么是视觉AI？</p>
              <p>
                视觉AI能「看懂」图片内容，自动分析图片中的风格、元素、配色等，
                并生成对应的提示词描述。配置后，你在创作时上传参考图片，
                系统会自动生成匹配的提示词，无需手动描述。
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Status indicator if configured */}
          {config && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">状态</span>
              <span className="text-sm flex items-center gap-1 text-green-600">
                <Check style={{ width: 14, height: 14 }} />
                已配置
              </span>
            </div>
          )}

          {/* API Format */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              API 格式
            </label>
            <select
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value as 'openai' | 'anthropic')}
              className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-white"
              disabled={loading}
            >
              <option value="anthropic">Anthropic 格式 (Claude API)</option>
              <option value="openai">OpenAI 格式 (大多数第三方 API)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              选择 API 的请求格式。大多数第三方 API 使用 OpenAI 格式。
            </p>
          </div>

          {/* API Base URL */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              API地址
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
              className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              接口的服务地址，如阿里云百炼、OpenAI等
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              API密钥
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              在服务商后台获取的密钥，仅本地存储
            </p>
          </div>

          {/* Model Name */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              模型名称
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gpt-4o 或 qwen-vl-max"
              className="w-full px-3 py-2 border border-gray-200 rounded focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              支持图片理解的模型，如 gpt-4o、qwen-vl-max
            </p>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          {/* Success message */}
          {success && (
            <p className="text-sm text-green-600">
              {success}
            </p>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={loading}>
              <Check style={{ width: 16, height: 16 }} />
              {loading ? '保存中...' : '保存配置'}
            </Button>
            {(config || baseUrl || apiKey || modelName) && (
              <Button variant="outline" onClick={handleDeleteClick} disabled={loading}>
                <Trash2 style={{ width: 16, height: 16 }} />
                {loading ? '删除中...' : '删除配置'}
              </Button>
            )}
          </div>

          {/* Hint */}
          <div className="text-xs text-gray-500 pt-2 space-y-1">
            <p>💡 推荐服务商：阿里云百炼（国内）、OpenAI（国外）</p>
            <p>🔒 所有配置仅存储在本地，不会上传到云端</p>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              此操作将删除您的 API 配置，是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
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