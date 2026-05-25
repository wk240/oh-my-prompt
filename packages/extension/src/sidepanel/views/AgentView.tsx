/**
 * AgentView - Agent prompt generation interface
 * User inputs description + optional reference image
 * Agent generates detailed prompt based on template
 */

import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import type { AgentTemplateCategory, Category, GeneralAgentGenerateResult, ProviderConfig } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, ArrowUpRight, ArrowLeft } from 'lucide-react'
import { ToastNotification } from '@/sidepanel/components/ToastNotification'
import { isAgentConfigUsable } from '@/lib/agent-config-availability'
import { getCachedAuthState } from '@/lib/cloud-sync/auth-service'

// Lazy load dialog component
const CategorySelectDialog = lazy(() => import('@/content/components/CategorySelectDialog').then(m => ({ default: m.CategorySelectDialog })))

const AGENT_SECTION_ROWS: Array<{ key: keyof GeneralAgentGenerateResult['sections']; label: string }> = [
  { key: 'subject', label: '主体' },
  { key: 'style', label: '风格' },
  { key: 'lighting', label: '光影' },
  { key: 'colors', label: '色彩' },
  { key: 'composition', label: '构图' },
  { key: 'materials', label: '材质' },
  { key: 'mood', label: '氛围' },
  { key: 'negativePrompt', label: '负面' },
]

interface AgentViewProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string  // Pre-filled from Content Script
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
  onInsert?: (text: string) => Promise<void>
  onOpenSettings?: () => void
}

export default function AgentView({
  selectedTemplate,
  extractedText,
  categories,
  onSave,
  onInsert,
  onOpenSettings
}: AgentViewProps) {
  // State
  const [inputText, setInputText] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form')
  const [result, setResult] = useState<string | null>(null)
  const [structuredResult, setStructuredResult] = useState<GeneralAgentGenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<'settings' | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null) // null = checking

  // Navigate to Mine tab for login/config
  const handleNavigateToMine = () => {
    chrome.storage.session.set({ sidepanelIntent: 'mine' })
    onOpenSettings?.()  // Open settings view (which will show mine tab)
  }

  // Helper for toast notifications
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2000)
  }, [])

  // Pre-fill extracted text on mount
  useEffect(() => {
    if (extractedText) {
      setInputText(extractedText)
    }
  }, [extractedText])

  // Check if provider config exists
  useEffect(() => {
    const refreshConfigAvailability = async () => {
      try {
        const [response, authState] = await Promise.all([
          chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS }),
          getCachedAuthState()
        ])
        if (response?.success && response?.data) {
          const { configs, activeConfigId } = response.data as { configs: ProviderConfig[]; activeConfigId: string | null }
          setHasConfig(isAgentConfigUsable(configs, activeConfigId, authState.status === 'logged_in', authState.subscription?.officialApiQuota?.remaining))
        } else {
          setHasConfig(false)
        }
      } catch {
        setHasConfig(false)
      }
    }
    refreshConfigAvailability()
  }, [])

  // Listen for auth status updates (login/logout) to refresh config check
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: { logout?: boolean } }) => {
      if (message.type === MessageType.AUTH_STATUS_UPDATE) {
        // Re-check provider configs after auth change
        Promise.all([
          chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS }),
          getCachedAuthState()
        ])
          .then(([response, authState]) => {
            if (response?.success && response?.data) {
              const { configs, activeConfigId } = response.data as { configs: ProviderConfig[]; activeConfigId: string | null }
              setHasConfig(isAgentConfigUsable(configs, activeConfigId, authState.status === 'logged_in', authState.subscription?.officialApiQuota?.remaining))
            } else {
              setHasConfig(false)
            }
          })
          .catch(() => setHasConfig(false))
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  // Handle image upload
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('请上传图片文件')
      return
    }

    // Validate file size (5MB limit)
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_IMAGE_SIZE) {
      showToast('图片大小不能超过 5MB')
      return
    }

    // Read as data URL
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImageData(dataUrl)
    }
    reader.onerror = () => {
      showToast('图片读取失败')
    }
    reader.readAsDataURL(file)
  }, [showToast])

  // Handle remove image
  const handleRemoveImage = useCallback(() => {
    setImageData(null)
  }, [])

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!inputText.trim() || isLoading) return

    setIsLoading(true)
    setError(null)
    setErrorAction(null)
    setResult(null)
    setStructuredResult(null)
    setViewMode('form')

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_GENERATE,
        payload: {
          inputText: inputText.trim(),
          imageData,
          templateCategory: selectedTemplate
        }
      })

      if (!response?.success) {
        throw new Error(response?.error || '生成失败')
      }

      setResult(response.data.prompt)
      setStructuredResult(response.data.agentResult || null)
      setViewMode('result')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败'

      // Parse error by code prefix
      if (errorMessage.startsWith('NO_CONFIG:')) {
        setError('请先配置 API 或登录官方服务')
        setErrorAction('settings')
      } else if (errorMessage.startsWith('NOT_LOGGED_IN:')) {
        setError('请先登录会员账号')
        setErrorAction('settings')
      } else if (errorMessage.startsWith('UNSUPPORTED_FORMAT:')) {
        setError('不支持当前 API 格式')
      } else if (errorMessage === 'timeout') {
        setError('请求超时，请重试')
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }, [inputText, imageData, selectedTemplate, isLoading])

  // Handle copy result
  const handleCopy = useCallback(async () => {
    if (!result) return

    try {
      await navigator.clipboard.writeText(result)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [result, showToast])

  // Handle one-click insert result
  const handleInsert = useCallback(async () => {
    if (!result || !onInsert) return

    await onInsert(result)
  }, [result, onInsert])

  // Handle save
  const handleSave = useCallback((categoryId: string) => {
    if (!result) return

    onSave(result, categoryId, selectedTemplate)
    setShowSaveDialog(false)
    showToast('已保存到分类')
  }, [result, selectedTemplate, onSave, showToast])

  // Handle retry/regenerate (same action)
  const handleRetry = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  // Handle back to form
  const handleBackToForm = useCallback(() => {
    setViewMode('form')
  }, [])

  // Is generate button disabled
  const isGenerateDisabled = !inputText.trim() || isLoading
  const visibleSectionRows = structuredResult
    ? AGENT_SECTION_ROWS.filter(row => structuredResult.sections[row.key])
    : []

  return (
    <div className="flex flex-col h-full">
      {/* Setup Guide — shown when no provider config available */}
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
              role="link"
            >
              登录或配置API
            </button>
          </p>
        </div>
      )}

      {/* Main Agent UI — shown when config exists or still checking */}
      {(hasConfig === true || hasConfig === null) && (
      <div className={`agent-view ${viewMode === 'result' ? 'agent-view-result-mode' : ''}`}>
      {viewMode === 'form' && (
      <>
      {/* Input section */}
      <div className="agent-input-section">
        <label className="agent-input-label">
          描述你想要生成的图像<span className="agent-input-required">*</span>
        </label>
        <textarea
          className="agent-input-textarea"
          placeholder="例如：一款极简风格的蓝牙耳机，白色背景，产品主体突出..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isLoading}
          rows={4}
        />
      </div>

      {/* Image upload section */}
      <div className="agent-image-section">
        <label className="agent-input-label">参考图片（可选）</label>
        {imageData ? (
          <div className="agent-image-preview">
            <img src={imageData} alt="参考图片" className="agent-image-thumbnail" />
            <button
              className="agent-image-remove"
              onClick={handleRemoveImage}
              aria-label="移除图片"
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        ) : (
          <div className="agent-image-upload">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="agent-image-input"
              disabled={isLoading}
            />
            <div className="agent-image-upload-content">
              <Upload style={{ width: 16, height: 16, color: '#64748B' }} />
              <span className="agent-image-upload-text">上传参考图片</span>
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        className={`agent-generate-btn ${isGenerateDisabled ? 'disabled' : ''}`}
        onClick={handleGenerate}
        disabled={isGenerateDisabled}
      >
        {isLoading ? (
          <>
            <Loader2 className="agent-generate-spinner" />
            <span>生成中...</span>
          </>
        ) : (
          <>
            <Sparkles style={{ width: 14, height: 14 }} />
            <span>生成提示词</span>
          </>
        )}
      </button>

      {/* Error banner */}
      {error && (
        <div className="agent-error-banner">
          <AlertTriangle className="agent-error-icon" />
          <span className="agent-error-text">{error}</span>
          {errorAction === 'settings' && onOpenSettings && (
            <button className="agent-error-retry" onClick={() => { setError(null); setErrorAction(null); onOpenSettings() }} style={{ background: '#A16207', color: 'white' }}>
              <Settings style={{ width: 12, height: 12 }} />
              <span>去设置</span>
            </button>
          )}
          <button className="agent-error-retry" onClick={handleRetry}>
            <RefreshCw style={{ width: 12, height: 12 }} />
            <span>重试</span>
          </button>
        </div>
      )}

      </>
      )}

      {/* Result view */}
      {viewMode === 'result' && result && !error && (
        <div className="agent-result-view">
          <div className="agent-result-header">
            <button className="agent-result-back-btn" onClick={handleBackToForm} aria-label="返回表单">
              <ArrowLeft style={{ width: 16, height: 16 }} />
            </button>
            <span className="agent-result-title">提示词生成结果</span>
          </div>

          <div className="agent-result-body">
            <div className="agent-result-card">
              <div className="agent-result-card-header">
                <span className="agent-result-type-tag">完整提示词</span>
              </div>
              <div className="agent-result-text">{result}</div>
              <div className="agent-result-actions">
                {onInsert && (
                  <button className="agent-result-btn agent-result-insert-btn" onClick={handleInsert} title="插入到输入框" aria-label="插入">
                    <ArrowUpRight style={{ width: 14, height: 14 }} />
                  </button>
                )}
                <button className="agent-result-btn" onClick={handleCopy} title="复制" aria-label="复制">
                  <Copy style={{ width: 14, height: 14 }} />
                </button>
                <button className="agent-result-btn" onClick={() => setShowSaveDialog(true)} title="保存到库" aria-label="保存到库">
                  <Bookmark style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            {visibleSectionRows.length > 0 && (
              <div className="agent-result-details">
                {visibleSectionRows.map(row => (
                  <div key={row.key} className="agent-result-detail-row">
                    <span className="agent-result-detail-label">{row.label}</span>
                    <span className="agent-result-detail-value">{structuredResult?.sections[row.key]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="agent-result-footer">
            <button className="agent-result-footer-btn-secondary" onClick={handleRetry} disabled={isLoading}>
              {isLoading ? '生成中...' : '重新生成'}
            </button>
            <button className="agent-result-footer-btn-secondary" onClick={handleCopy}>
              复制
            </button>
            <button className="agent-result-footer-btn-primary" onClick={handleInsert} disabled={!onInsert}>
              插入提示词
            </button>
          </div>
        </div>
      )}

      {/* Save dialog */}
      <Suspense fallback={null}>
        <CategorySelectDialog
          categories={categories}
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onConfirm={handleSave}
        />
      </Suspense>

      {/* Toast notification */}
      {toastMessage && (
        <ToastNotification
          message={toastMessage}
          onClose={() => setToastMessage(null)}
        />
      )}
      </div>
      )}
    </div>
  )
}
