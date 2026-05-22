/**
 * EcommerceView - Ecommerce multi-prompt generation UI for Sidepanel
 * Uses CSS classes from index.css (not Shadow DOM), ToastNotification component,
 * lazy-loaded CategorySelectDialog, and multi-image upload grid.
 */

import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react'
import type {
  AgentTemplateCategory,
  EcommercePlatform,
  EcommerceMarket,
  EcommerceLanguage,
  EcommerceAspectRatio,
  EcommerceConfig,
  EcommerceGenerateResult,
  EcommerceCustomCounts,
  Category,
  ProviderConfig,
} from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, LogIn } from 'lucide-react'
import { Tooltip } from '@/content/components/Tooltip'
import { ToastNotification } from '@/sidepanel/components/ToastNotification'
import { WEB_APP_URL } from '@/lib/config'
import ecommerceConfigData from '@/data/ecommerce-config.json'

// Lazy load dialog component
const CategorySelectDialog = lazy(() => import('@/content/components/CategorySelectDialog').then(m => ({ default: m.CategorySelectDialog })))

// Type helpers for ecommerce config JSON
interface ConfigOption {
  id: string
  name: string
  nameEn?: string
}

interface EcommerceConfigData {
  platforms: ConfigOption[]
  markets: ConfigOption[]
  languages: ConfigOption[]
  aspectRatios: ConfigOption[]
}

const config = ecommerceConfigData as EcommerceConfigData

interface EcommerceViewProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
  onOpenSettings?: () => void
}

export default function EcommerceView({
  selectedTemplate,
  extractedText,
  categories,
  onSave,
  onOpenSettings
}: EcommerceViewProps) {
  // Form state
  const [productImage, setProductImage] = useState<string | null>(null)
  const [productImageName, setProductImageName] = useState('')
  const [platform, setPlatform] = useState<EcommercePlatform>('amazon')
  const [market, setMarket] = useState<EcommerceMarket>('china')
  const [language, setLanguage] = useState<EcommerceLanguage>('zh')
  const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>('1:1')
  const [sellingPoints, setSellingPoints] = useState('')
  const [setStructure, setSetStructure] = useState<'smart' | 'custom'>('smart')
  const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>({
    whiteBg: 1,
    scene: 2,
    sellingPoint: 2,
    other: 2,
  })

  // UI state
  const [isAiWriting, setIsAiWriting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form')
  const [result, setResult] = useState<EcommerceGenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<'settings' | null>(null)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savePromptIndex, setSavePromptIndex] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Helper for toast notifications
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2000)
  }, [])

  // Pre-fill selling points from extracted text
  useEffect(() => {
    if (extractedText) {
      setSellingPoints(extractedText)
    }
  }, [extractedText])

  // Check if provider config exists on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS })
      .then(response => {
        if (response?.success && response?.data) {
          const { configs, activeConfigId } = response.data as { configs: ProviderConfig[]; activeConfigId: string | null }
          setHasConfig(activeConfigId !== null && configs.some(c => c.id === activeConfigId) || configs.some(c => c.apiFormat === 'omp_official'))
        } else {
          setHasConfig(false)
        }
      })
      .catch(() => setHasConfig(false))
  }, [])

  // Listen for auth status updates (login/logout) to refresh config check
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: { logout?: boolean } }) => {
      if (message.type === MessageType.AUTH_STATUS_UPDATE) {
        chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS })
          .then(response => {
            if (response?.success && response?.data) {
              const { configs, activeConfigId } = response.data as { configs: ProviderConfig[]; activeConfigId: string | null }
              setHasConfig(activeConfigId !== null && configs.some(c => c.id === activeConfigId) || configs.some(c => c.apiFormat === 'omp_official'))
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

    if (!file.type.startsWith('image/')) {
      showToast('请上传图片文件')
      return
    }

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_IMAGE_SIZE) {
      showToast('图片大小不能超过 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setProductImage(dataUrl)
      setProductImageName(file.name)
    }
    reader.onerror = () => {
      showToast('图片读取失败')
    }
    reader.readAsDataURL(file)

    // Reset input so same file can be re-uploaded
    event.target.value = ''
  }, [showToast])

  // Handle remove image
  const handleRemoveImage = useCallback(() => {
    setProductImage(null)
    setProductImageName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // AI write selling points
  const handleAiWrite = useCallback(async () => {
    if (isAiWriting || !productImage) return
    setIsAiWriting(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_ECOMMERCE_AI_WRITE,
        payload: {
          imageData: productImage,
          platform,
          language,
        },
      })
      if (!response?.success) {
        throw new Error(response?.error || 'AI帮写失败')
      }
      const text = typeof response.data === 'string' ? response.data : (response.data?.text || response.data?.sellingPoints || '')
      if (text) {
        setSellingPoints(prev => prev ? prev + '\n' + text : text)
        showToast('AI帮写完成')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'AI帮写失败'
      showToast(errorMessage)
    } finally {
      setIsAiWriting(false)
    }
  }, [isAiWriting, productImage, platform, language, showToast])

  // Custom counts adjustment
  const adjustCount = useCallback((key: keyof EcommerceCustomCounts, delta: number) => {
    setCustomCounts(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min(10, prev[key] + delta)),
    }))
  }, [])

  // Counter row configuration
  const counterRows: Array<{ key: keyof EcommerceCustomCounts; label: string; desc: string; aiTag?: boolean }> = [
    { key: 'whiteBg', label: '白底图', desc: '纯白背景商品图' },
    { key: 'scene', label: '场景图', desc: '生活场景展示', aiTag: true },
    { key: 'sellingPoint', label: '卖点图', desc: '核心卖点展示', aiTag: true },
    { key: 'other', label: '其他图', desc: '细节/对比/尺寸等' },
  ]

  // Build ecommerce config
  const buildEcommerceConfig = useCallback((): EcommerceConfig => ({
    platform,
    market,
    language,
    aspectRatio,
    sellingPoints,
    setStructure,
    customCounts: setStructure === 'custom' ? customCounts : undefined,
  }), [platform, market, language, aspectRatio, sellingPoints, setStructure, customCounts])

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    setError(null)
    setErrorAction(null)
    setResult(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_GENERATE,
        payload: {
          inputText: sellingPoints,
          productImage: productImage || undefined,
          templateCategory: 'ecommerce',
          ecommerceConfig: buildEcommerceConfig(),
        },
      })
      if (!response?.success) {
        throw new Error(response?.error || '生成失败')
      }

      const data = response.data

      // Parse result: try ecommercePrompts first, then JSON.parse, then fallback
      let parsedResult: EcommerceGenerateResult | null = null

      if (data?.ecommercePrompts) {
        parsedResult = data.ecommercePrompts as EcommerceGenerateResult
      } else if (data?.prompt) {
        try {
          const parsed = JSON.parse(data.prompt)
          if (parsed?.prompts && Array.isArray(parsed.prompts)) {
            parsedResult = parsed as EcommerceGenerateResult
          } else {
            // Single prompt fallback
            parsedResult = {
              prompts: [{
                type: '综合',
                typeEn: 'General',
                prompt: data.prompt,
                aspectRatio,
              }],
              templateCategory: 'ecommerce',
            }
          }
        } catch {
          // Not JSON, treat as single prompt
          parsedResult = {
            prompts: [{
              type: '综合',
              typeEn: 'General',
              prompt: data.prompt,
              aspectRatio,
            }],
            templateCategory: 'ecommerce',
          }
        }
      }

      if (parsedResult) {
        setResult(parsedResult)
        setViewMode('result')  // Switch to result view on success
      } else {
        setError('生成结果为空')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败'
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
  }, [isLoading, sellingPoints, productImage, buildEcommerceConfig, aspectRatio])

  // Handle copy single prompt
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [showToast])

  // Handle copy all prompts
  const handleCopyAll = useCallback(async () => {
    if (!result) return
    const allText = result.prompts
      .map(p => `[${p.type}]\n${p.prompt}`)
      .join('\n\n---\n\n')
    try {
      await navigator.clipboard.writeText(allText)
      showToast('已复制全部提示词')
    } catch {
      showToast('复制失败')
    }
  }, [result, showToast])

  // Handle save single prompt
  const handleSavePrompt = useCallback((index: number) => {
    setSavePromptIndex(index)
    setShowSaveDialog(true)
  }, [])

  const handleSaveConfirm = useCallback((categoryId: string) => {
    if (savePromptIndex === null || !result) return
    const prompt = result.prompts[savePromptIndex]
    if (prompt) {
      onSave(prompt.prompt, categoryId, selectedTemplate)
      showToast('已保存到分类')
    }
    setShowSaveDialog(false)
    setSavePromptIndex(null)
  }, [savePromptIndex, result, selectedTemplate, onSave, showToast])

  // Handle retry/regenerate
  const handleRetry = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  // Handle insert - copy to clipboard and show toast
  const handleInsert = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制，请在输入框中粘贴')
    } catch {
      showToast('复制失败')
    }
  }, [showToast])

  // Handle back to form
  const handleBackToForm = useCallback(() => {
    setViewMode('form')
  }, [])

  // Handle regenerate: go back to form and auto-trigger
  const handleRegenerate = useCallback(() => {
    setViewMode('form')
    setResult(null)
    setTimeout(() => handleGenerate(), 0)
  }, [handleGenerate])

  // Is generate button disabled
  const isGenerateDisabled = !sellingPoints.trim() || isLoading

  return (
    <div className="flex flex-col h-full">
      {/* Setup Guide — shown when no provider config available */}
      {hasConfig === false && (
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-purple-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">尚未配置 API</h3>
          <p className="text-xs text-gray-500 mb-5 leading-relaxed">
            使用电商套图生成前，需要登录官方服务或配置第三方 API
          </p>
          <div className="flex flex-col gap-2 w-full max-w-[240px]">
            <button
              onClick={() => window.open(`${WEB_APP_URL}/auth/login?source=extension`, '_blank')}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              登录官方服务
            </button>
            <button
              onClick={() => onOpenSettings?.()}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              配置第三方 API
            </button>
          </div>
        </div>
      )}

      {/* Main Ecommerce UI — shown when config exists or still checking */}
      {(hasConfig === true || hasConfig === null) && (
      <div className="ecommerce-view">
        {/* Product Image Upload - Single image */}
        <div className="ecommerce-section">
          <label className="ecommerce-label">
            商品原图<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
          </label>
          <div className="ecommerce-image-grid">
            {productImage ? (
              <div className="ecommerce-image-slot has-image">
                <img src={productImage} alt="商品图" className="ecommerce-image-thumb" />
                <button
                  className="ecommerce-image-remove"
                  onClick={handleRemoveImage}
                  aria-label="移除图片"
                >
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </div>
            ) : (
              <div
                className="ecommerce-image-slot"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={isLoading}
                />
                <div className="ecommerce-upload-icon">
                  <Upload style={{ width: 16, height: 16 }} />
                  <span>上传商品图</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selectors: Platform + Market */}
        <div className="ecommerce-section">
          <label className="ecommerce-label">平台与市场</label>
          <div className="ecommerce-select-row">
            <div className="ecommerce-select-wrapper">
              <span className="ecommerce-select-label">电商平台</span>
              <select
                className="ecommerce-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as EcommercePlatform)}
                disabled={isLoading}
              >
                {config.platforms.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="ecommerce-select-wrapper">
              <span className="ecommerce-select-label">目标市场</span>
              <select
                className="ecommerce-select"
                value={market}
                onChange={(e) => setMarket(e.target.value as EcommerceMarket)}
                disabled={isLoading}
              >
                {config.markets.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selectors: Language + Aspect Ratio */}
        <div className="ecommerce-section">
          <div className="ecommerce-select-row">
            <div className="ecommerce-select-wrapper">
              <span className="ecommerce-select-label">输出语言</span>
              <select
                className="ecommerce-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as EcommerceLanguage)}
                disabled={isLoading}
              >
                {config.languages.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="ecommerce-select-wrapper">
              <span className="ecommerce-select-label">图片比例</span>
              <select
                className="ecommerce-select"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as EcommerceAspectRatio)}
                disabled={isLoading}
              >
                {config.aspectRatios.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selling Points Textarea with AI Write */}
        <div className="ecommerce-section">
          <label className="ecommerce-label">
            卖点描述<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
          </label>
          <div className="ecommerce-textarea-section">
            <textarea
              className="ecommerce-textarea"
              placeholder="描述商品核心卖点，例如：无线蓝牙耳机、主动降噪、30小时续航..."
              value={sellingPoints}
              onChange={(e) => setSellingPoints(e.target.value)}
              disabled={isLoading}
              rows={4}
            />
            <button
              className="ecommerce-ai-write-btn"
              onClick={handleAiWrite}
              disabled={isAiWriting || !productImage}
            >
              {isAiWriting ? (
                <>
                  <Loader2 style={{ width: 12, height: 12, animation: 'omp-spin 1s linear infinite' }} />
                  <span>分析中...</span>
                </>
              ) : (
                <>
                  <Sparkles style={{ width: 12, height: 12 }} />
                  <span>AI帮写</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Structure Config: Smart vs Custom (button toggle) */}
        <div className="ecommerce-section">
          <label className="ecommerce-label">套图结构</label>
          <div className="ecommerce-structure-row">
            <button
              className={`ecommerce-structure-option ${setStructure === 'smart' ? 'active' : ''}`}
              onClick={() => setSetStructure('smart')}
              disabled={isLoading}
            >
              智能匹配
            </button>
            <button
              className={`ecommerce-structure-option ${setStructure === 'custom' ? 'active' : ''}`}
              onClick={() => setSetStructure('custom')}
              disabled={isLoading}
            >
              自定义配置
            </button>
          </div>
        </div>

        {/* Generate Button */}
        <button
          className={`ecommerce-generate-btn ${isGenerateDisabled ? 'disabled' : ''}`}
          onClick={handleGenerate}
          disabled={isGenerateDisabled}
        >
          {isLoading ? (
            <>
              <span className="ecommerce-spinner" />
              <span>生成中...</span>
            </>
          ) : (
            <>
              <Sparkles style={{ width: 14, height: 14, marginRight: 6 }} />
              <span>生成套图提示词</span>
            </>
          )}
        </button>

        {/* Error banner */}
        {error && (
          <div className="ecommerce-error-banner">
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginRight: 8, verticalAlign: 'middle' }} />
            <span style={{ flex: 1 }}>{error}</span>
            {errorAction === 'settings' && onOpenSettings && (
              <button
                className="agent-error-retry"
                onClick={() => { setError(null); setErrorAction(null); onOpenSettings() }}
                style={{ background: '#7C3AED', color: 'white', marginLeft: 8 }}
              >
                <Settings style={{ width: 12, height: 12 }} />
                <span>去设置</span>
              </button>
            )}
            <button className="agent-error-retry" onClick={handleRetry} style={{ marginLeft: 8 }}>
              <RefreshCw style={{ width: 12, height: 12 }} />
              <span>重试</span>
            </button>
          </div>
        )}

        {/* Result section — inline display below the form */}
        {result && !error && (
          <div className="ecommerce-result-grid">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                套图生成结果（共 {result.prompts.length} 张）
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Tooltip content="复制全部">
                  <button className="ecommerce-result-btn" onClick={handleCopyAll}>
                    <Copy style={{ width: 14, height: 14 }} />
                  </button>
                </Tooltip>
                <Tooltip content="重新生成">
                  <button className="ecommerce-result-btn" onClick={handleRetry} disabled={isLoading}>
                    <RefreshCw style={{ width: 14, height: 14 }} />
                  </button>
                </Tooltip>
              </div>
            </div>
            {result.prompts.map((p, i) => (
              <div key={i} className="ecommerce-result-card">
                <div className="ecommerce-result-card-header">
                  <span className="ecommerce-result-type-tag">{p.type}</span>
                  <span style={{ fontSize: 11, color: '#A3A3A3' }}>{p.aspectRatio}</span>
                </div>
                <div className="ecommerce-result-text">{p.prompt}</div>
                <div className="ecommerce-result-actions">
                  <Tooltip content="复制">
                    <button className="ecommerce-result-btn" onClick={() => handleCopy(p.prompt)}>
                      <Copy style={{ width: 14, height: 14 }} />
                    </button>
                  </Tooltip>
                  <Tooltip content="保存到库">
                    <button className="ecommerce-result-btn" onClick={() => handleSavePrompt(i)}>
                      <Bookmark style={{ width: 14, height: 14 }} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Save dialog */}
        <Suspense fallback={null}>
          <CategorySelectDialog
            categories={categories}
            isOpen={showSaveDialog}
            onClose={() => { setShowSaveDialog(false); setSavePromptIndex(null) }}
            onConfirm={handleSaveConfirm}
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
