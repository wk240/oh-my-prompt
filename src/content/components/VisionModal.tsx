import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, X, RefreshCw, Settings } from 'lucide-react'
import { MessageType } from '@/shared/messages'
import { VISION_API_CONFIG_STORAGE_KEY } from '@/shared/constants'
import type { VisionApiConfig, VisionApiErrorPayload, InsertPromptPayload, SaveTemporaryPromptPayload } from '@/shared/types'

/**
 * VisionModal state machine
 */
type VisionModalState =
  | 'loading'      // API call in progress
  | 'configuring'  // Show API config form
  | 'success'      // Prompt preview, awaiting confirmation
  | 'error'        // Error display
  | 'confirming'   // Processing confirmation
  | 'feedback'     // Success feedback before auto-close

interface VisionModalProps {
  imageUrl: string
  tabId?: number
  onClose: () => void
}

/**
 * Generate prompt name from content
 * Uses first 30 chars + timestamp for uniqueness
 */
function generatePromptName(prompt: string): string {
  const firstLine = prompt.split('\n')[0] || prompt
  const truncated = firstLine.substring(0, 30).trim()
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${truncated}... (${timestamp})`
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Clipboard copy failed:', error)
    return false
  }
}

/**
 * VisionModal - In-page modal for image-to-prompt conversion
 * Supports: API call, configuration, prompt preview, insertion/clipboard
 */
function VisionModal({ imageUrl, tabId, onClose }: VisionModalProps) {
  const [state, setState] = useState<VisionModalState>('loading')
  const [prompt, setPrompt] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [errorAction, setErrorAction] = useState<'reconfigure' | 'retry' | 'close'>('close')
  const [retryCount, setRetryCount] = useState(0)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')
  const [isLovartPage, setIsLovartPage] = useState(false)

  // API config form state
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')

  /**
   * Check if current page is Lovart
   */
  useEffect(() => {
    const lovartPattern = /^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/
    setIsLovartPage(lovartPattern.test(window.location.href))
  }, [])

  /**
   * Start API call on mount
   */
  useEffect(() => {
    requestApiCall(0)
  }, [])

  /**
   * Request Vision API call via service worker (uses host_permissions for CORS bypass)
   */
  const requestApiCall = useCallback(async (count: number) => {
    setState('loading')
    setRetryCount(count)

    // Debug log
    console.log('[Oh My Prompt] requestApiCall: imageUrl=', imageUrl, 'retryCount=', count)

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.VISION_API_CALL,
        payload: { imageUrl, retryCount: count }
      })

      console.log('[Oh My Prompt] Vision API response:', response)

      if (!response) {
        setErrorMessage('服务响应异常')
        setErrorAction('retry')
        setState('error')
        return
      }

      if (response.success) {
        setPrompt(response.data.prompt)
        setState('success')
      } else {
        const error = response.error as VisionApiErrorPayload | undefined
        setErrorMessage(error?.message || '发生未知错误')
        setErrorAction(error?.action || 'close')
        setState('error')
      }
    } catch (err) {
      console.error('[Oh My Prompt] Vision API call error:', err)
      setErrorMessage('请求失败，请重试')
      setErrorAction('retry')
      setState('error')
    }
  }, [imageUrl])

  /**
   * Handle retry
   */
  const handleRetry = () => {
    requestApiCall(retryCount + 1)
  }

  /**
   * Handle reconfigure - show config form
   * Loads existing config from storage for editing
   */
  const handleReconfigure = async () => {
    setState('configuring')

    // Load existing config from storage to populate form
    try {
      const result = await chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
      const existingConfig = result[VISION_API_CONFIG_STORAGE_KEY] as VisionApiConfig | undefined
      if (existingConfig) {
        setApiBaseUrl(existingConfig.baseUrl || '')
        setApiKey(existingConfig.apiKey || '')
        setModelName(existingConfig.modelName || '')
      }
    } catch (error) {
      console.error('[Oh My Prompt] Load existing config error:', error)
      // Keep form empty if load fails
    }
  }

  /**
   * Save API config and retry
   */
  const handleSaveConfig = async () => {
    if (!apiBaseUrl || !apiKey || !modelName) {
      setErrorMessage('请填写所有配置项')
      return
    }

    try {
      // Save config directly to storage (default to OpenAI format)
      const configWithTimestamp: VisionApiConfig = {
        baseUrl: apiBaseUrl,
        apiKey: apiKey,
        modelName: modelName,
        apiFormat: 'openai', // Default format for most third-party APIs
        configuredAt: Date.now()
      }
      await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: configWithTimestamp })

      // Config saved, retry API call
      requestApiCall(0)
    } catch (error) {
      console.error('[Oh My Prompt] Save API config error:', error)
      setErrorMessage('配置保存失败')
    }
  }

  /**
   * Handle confirmation - insert/copy + save + feedback
   */
  const handleConfirm = async () => {
    if (!prompt) {
      setState('error')
      setErrorMessage('没有可用的提示词')
      setErrorAction('close')
      return
    }

    setState('confirming')

    // Step 1: Insert to Lovart or copy to clipboard
    let insertSuccess = false
    let clipboardSuccess = false

    if (isLovartPage && tabId) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: MessageType.INSERT_PROMPT,
          payload: {
            prompt: prompt,
            tabId: tabId
          } as InsertPromptPayload
        })

        insertSuccess = response?.success === true

        if (!insertSuccess) {
          clipboardSuccess = await copyToClipboard(prompt)
        }
      } catch (error) {
        console.error('[Oh My Prompt] INSERT_PROMPT error:', error)
        clipboardSuccess = await copyToClipboard(prompt)
      }
    } else {
      clipboardSuccess = await copyToClipboard(prompt)
    }

    // Step 2: Save to '临时' category
    const promptName = generatePromptName(prompt)

    try {
      await chrome.runtime.sendMessage({
        type: MessageType.SAVE_TEMPORARY_PROMPT,
        payload: {
          name: promptName,
          content: prompt,
          imageUrl: imageUrl
        } as SaveTemporaryPromptPayload
      })
    } catch (saveError) {
      console.error('[Oh My Prompt] Save to temporary failed:', saveError)
    }

    // Step 3: Show feedback
    let feedback = ''
    if (insertSuccess) {
      feedback = '已插入Lovart输入框，已保存到临时分类'
    } else if (clipboardSuccess) {
      feedback = '已复制到剪贴板，已保存到临时分类'
    } else {
      feedback = '插入失败，请手动粘贴。已保存到临时分类'
    }

    setFeedbackMessage(feedback)
    setState('feedback')

    // Step 4: Auto-close after 1 second
    setTimeout(() => {
      onClose()
    }, 1000)
  }

  /**
   * Handle ESC key
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="modal-card">
        {/* Header */}
        <div className="modal-header">
          <h1 className="modal-title">图片转提示词</h1>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <X />
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {/* Loading state */}
          {state === 'loading' && (
            <div className="loading-view">
              <Loader2 className="loading-spinner" />
              <p className="loading-text">正在分析图片...</p>
            </div>
          )}

          {/* Configuring state - API config form */}
          {state === 'configuring' && (
            <div className="config-view">
              <p className="config-description">
                首次使用需要配置 Vision AI API。请填写以下信息：
              </p>
              <div className="config-form">
                <div className="config-field">
                  <label className="config-label">API Base URL</label>
                  <input
                    type="text"
                    className="config-input"
                    placeholder="OpenAI: https://api.openai.com/v1/chat/completions | Anthropic: https://api.anthropic.com"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                  />
                </div>
                <div className="config-field">
                  <label className="config-label">API Key</label>
                  <input
                    type="password"
                    className="config-input"
                    placeholder="输入您的 API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <div className="config-field">
                  <label className="config-label">Model Name</label>
                  <input
                    type="text"
                    className="config-input"
                    placeholder="例如: gpt-4-vision-preview"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                  />
                </div>
              </div>
              <div className="action-buttons">
                <button className="btn btn-primary" onClick={handleSaveConfig}>
                  <Check />
                  保存并继续
                </button>
                <button className="btn btn-outline" onClick={onClose}>
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Success state - prompt preview */}
          {state === 'success' && (
            <div className="success-view">
              <p className="success-label">生成的提示词：</p>
              <div className="prompt-preview">{prompt}</div>
              <div className="action-buttons">
                <button className="btn btn-primary" onClick={handleConfirm}>
                  <Check />
                  确认
                </button>
                <button className="btn btn-outline" onClick={onClose}>
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Confirming state */}
          {state === 'confirming' && (
            <div className="loading-view">
              <Loader2 className="loading-spinner" />
              <p className="loading-text">正在处理...</p>
            </div>
          )}

          {/* Feedback state */}
          {state === 'feedback' && (
            <div className="feedback-view">
              <div className="feedback-success">
                <Check />
                <p className="feedback-text">{feedbackMessage}</p>
              </div>
              <p className="feedback-hint">弹窗将在1秒后自动关闭</p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="error-view">
              <p className="error-message" role="alert">{errorMessage}</p>
              <div className="action-buttons">
                {errorAction === 'reconfigure' && (
                  <button className="btn btn-primary" onClick={handleReconfigure}>
                    <Settings />
                    配置API
                  </button>
                )}
                {errorAction === 'retry' && (
                  <button className="btn btn-primary" onClick={handleRetry}>
                    <RefreshCw />
                    重试
                  </button>
                )}
                <button className="btn btn-outline" onClick={onClose}>
                  <X />
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VisionModal