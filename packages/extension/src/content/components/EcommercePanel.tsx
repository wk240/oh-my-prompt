/**
 * EcommercePanel - Ecommerce multi-prompt generation UI for Content Script dropdown
 * Inline-styled, Portal-rendered (same pattern as AgentPanel)
 * Supports product image upload, platform/market/language selectors,
 * selling points with AI write, structure config (smart/custom),
 * and structured multi-prompt result view
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import type {
  AgentTemplateCategory,
  EcommercePlatform,
  EcommerceMarket,
  EcommerceLanguage,
  EcommerceAspectRatio,
  EcommerceConfig,
  EcommerceCustomCounts,
  EcommerceGenerateResult,
  Category,
  ProviderConfig,
} from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, LogIn, ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react'
import { showToast } from './ToastNotification'
import { CategorySelectDialog } from './CategorySelectDialog'
import { WEB_APP_URL } from '../../lib/config'
import { parseEcommerceGenerateResult } from '@/lib/ecommerce-result-parser'
import { formatEcommercePromptBundle } from '@/lib/ecommerce-prompt-bundle'
import { isAgentConfigUsable } from '@/lib/agent-config-availability'
import { getCachedAuthState } from '@/lib/cloud-sync/auth-service'
import ecommerceConfigData from '@/data/ecommerce-config.json'

interface EcommerceReferenceImage {
  id: string
  dataUrl: string
  name: string
}

const MAX_REFERENCE_IMAGES = 6
const MAX_REFERENCE_IMAGE_SIZE = 5 * 1024 * 1024

export interface EcommercePersistedState {
  productImages: EcommerceReferenceImage[]
  platform: string
  market: string
  language: string
  aspectRatio: string
  sellingPoints: string
  setStructure: 'smart' | 'custom'
  customCounts: EcommerceCustomCounts
  result: EcommerceGenerateResult | null
  generationConfigSnapshot: EcommerceConfig | null
  expandedPromptIndexes: number[]
  viewMode: 'form' | 'result'
}

const DEFAULT_PERSISTED_STATE: EcommercePersistedState = {
  productImages: [],
  platform: 'amazon',
  market: 'china',
  language: 'zh',
  aspectRatio: '1:1',
  sellingPoints: '',
  setStructure: 'smart',
  customCounts: { whiteBg: 1, scene: 2, sellingPoint: 2, other: 2 },
  result: null,
  generationConfigSnapshot: null,
  expandedPromptIndexes: [],
  viewMode: 'form',
}

interface EcommercePanelProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
  onInsert?: (text: string) => void
  persistedState?: EcommercePersistedState
  onPersistStateChange?: (state: EcommercePersistedState) => void
}

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

const DETAIL_ROWS: Array<{ key: keyof NonNullable<EcommerceGenerateResult['prompts'][number]['details']>; label: string }> = [
  { key: 'subject', label: '主体' },
  { key: 'scene', label: '场景' },
  { key: 'composition', label: '构图' },
  { key: 'lighting', label: '光影' },
  { key: 'style', label: '风格' },
  { key: 'sellingPoint', label: '卖点' },
  { key: 'parameters', label: '参数' },
]

function getConfigLabel(options: ConfigOption[], id: string): string {
  return options.find(option => option.id === id)?.name || id
}

export function EcommercePanel({
  selectedTemplate,
  extractedText,
  categories,
  onSave,
  onInsert,
  persistedState,
  onPersistStateChange,
}: EcommercePanelProps) {
  const initState = persistedState ?? DEFAULT_PERSISTED_STATE
  // Form state
  const [productImages, setProductImages] = useState<EcommerceReferenceImage[]>(initState.productImages)
  const [platform, setPlatform] = useState<EcommercePlatform>(initState.platform as EcommercePlatform)
  const [market, setMarket] = useState<EcommerceMarket>(initState.market as EcommerceMarket)
  const [language, setLanguage] = useState<EcommerceLanguage>(initState.language as EcommerceLanguage)
  const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>(initState.aspectRatio as EcommerceAspectRatio)
  const [sellingPoints, setSellingPoints] = useState(initState.sellingPoints)
  const [setStructure, setSetStructure] = useState<'smart' | 'custom'>(initState.setStructure)
  const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>(initState.customCounts)

  // UI state
  const [isAiWriting, setIsAiWriting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'form' | 'result'>(initState.viewMode)
  const [result, setResult] = useState<EcommerceGenerateResult | null>(initState.result)
  const [generationConfigSnapshot, setGenerationConfigSnapshot] = useState<EcommerceConfig | null>(initState.generationConfigSnapshot)
  const [expandedPromptIndexes, setExpandedPromptIndexes] = useState<Set<number>>(() => new Set(initState.expandedPromptIndexes))
  const [error, setError] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null) // null = checking
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savePromptIndex, setSavePromptIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Helper to build persisted state snapshot
  const buildPersistedState = useCallback((): EcommercePersistedState => ({
    productImages, platform, market, language, aspectRatio,
    sellingPoints, setStructure, customCounts, result, generationConfigSnapshot,
    expandedPromptIndexes: Array.from(expandedPromptIndexes), viewMode,
  }), [productImages, platform, market, language, aspectRatio, sellingPoints, setStructure, customCounts, result, generationConfigSnapshot, expandedPromptIndexes, viewMode])

  // Persist state to parent whenever it changes
  useEffect(() => {
    onPersistStateChange?.(buildPersistedState())
  }, [buildPersistedState, onPersistStateChange])

  // Pre-fill selling points from extracted text
  useEffect(() => {
    if (extractedText?.trim()) {
      setSellingPoints(prev => prev.trim() ? prev : extractedText)
    }
  }, [extractedText])

  // Check if provider config exists on mount
  useEffect(() => {
    const refreshConfigAvailability = async () => {
      try {
        const [response, authState] = await Promise.all([
          chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS }),
          getCachedAuthState()
        ])
        if (response?.success && response?.data) {
          const { configs, activeConfigId } = response.data as { configs: ProviderConfig[]; activeConfigId: string | null }
          setHasConfig(isAgentConfigUsable(configs, activeConfigId, authState.status === 'logged_in'))
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
        Promise.all([
          chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS }),
          getCachedAuthState()
        ])
          .then(([response, authState]) => {
            if (response?.success && response?.data) {
              const { configs, activeConfigId } = response.data as { configs: ProviderConfig[]; activeConfigId: string | null }
              setHasConfig(isAgentConfigUsable(configs, activeConfigId, authState.status === 'logged_in'))
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

  // Handle product image upload
  const readImageFile = useCallback((file: File): Promise<EcommerceReferenceImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result
        if (typeof dataUrl === 'string') {
          resolve({ id: crypto.randomUUID(), dataUrl, name: file.name })
          return
        }
        reject(new Error('图片读取失败'))
      }
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
  }, [])

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    try {
      const remainingSlots = MAX_REFERENCE_IMAGES - productImages.length
      if (remainingSlots <= 0) {
        showToast('最多上传 6 张参考图')
        return
      }

      if (files.length > remainingSlots) {
        showToast('最多上传 6 张参考图')
      }

      const acceptedFiles = files.slice(0, remainingSlots)
      const images: EcommerceReferenceImage[] = []

      for (const file of acceptedFiles) {
        if (!file.type.startsWith('image/')) {
          showToast('请上传图片文件')
          continue
        }
        if (file.size > MAX_REFERENCE_IMAGE_SIZE) {
          showToast('单张图片不能超过 5MB')
          continue
        }
        images.push(await readImageFile(file))
      }

      if (images.length > 0) {
        setProductImages(prev => [...prev, ...images].slice(0, MAX_REFERENCE_IMAGES))
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '图片读取失败'
      showToast(errorMessage)
    } finally {
      event.target.value = ''
    }
  }, [productImages.length, readImageFile])

  const handleRemoveImage = useCallback((imageId: string) => {
    setProductImages(prev => prev.filter(image => image.id !== imageId))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // AI write selling points
  const handleAiWrite = useCallback(async () => {
    if (isAiWriting || productImages.length === 0) return
    setIsAiWriting(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_ECOMMERCE_AI_WRITE,
        payload: {
          imageDataList: productImages.map(image => image.dataUrl),
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
  }, [isAiWriting, productImages, platform, language])

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
    if (productImages.length === 0) {
      showToast('请先上传参考图片')
      return
    }
    setIsLoading(true)
    setError(null)
    setResult(null)
    setViewMode('form')

    try {
      const configSnapshot = buildEcommerceConfig()
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_GENERATE,
        payload: {
          inputText: sellingPoints,
          productImages: productImages.map(image => image.dataUrl),
          templateCategory: 'ecommerce',
          ecommerceConfig: configSnapshot,
        },
      })
      if (!response?.success) {
        throw new Error(response?.error || '生成失败')
      }

      const data = response.data

      const parsed = parseEcommerceGenerateResult(data, configSnapshot.aspectRatio)

      if (parsed.ok) {
        setResult(parsed.result)
        setGenerationConfigSnapshot(configSnapshot)
        setExpandedPromptIndexes(new Set())
        setViewMode('result')
      } else {
        setError(parsed.error)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败'
      if (errorMessage.startsWith('NO_CONFIG:')) {
        setError('请先配置 API 或登录官方服务')
      } else if (errorMessage.startsWith('NOT_LOGGED_IN:')) {
        setError('请先登录会员账号')
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
  }, [isLoading, productImages, sellingPoints, buildEcommerceConfig])

  const getPromptBundle = useCallback(() => {
    if (!result || !generationConfigSnapshot) return ''
    return formatEcommercePromptBundle(result, generationConfigSnapshot)
  }, [result, generationConfigSnapshot])

  const togglePromptDetails = useCallback((index: number) => {
    setExpandedPromptIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  // Handle copy single prompt
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [])

  // Handle copy all prompts
  const handleCopyAll = useCallback(async () => {
    const bundle = getPromptBundle()
    if (!bundle) return
    try {
      await navigator.clipboard.writeText(bundle)
      showToast('已复制全部提示词')
    } catch {
      showToast('复制失败')
    }
  }, [getPromptBundle])

  const handleInsertAll = useCallback(() => {
    const bundle = getPromptBundle()
    if (!bundle) return
    if (!onInsert) {
      showToast('当前页面暂不可直接插入')
      return
    }
    onInsert(bundle)
    showToast('已插入全部提示词')
  }, [getPromptBundle, onInsert])

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
  }, [savePromptIndex, result, selectedTemplate, onSave])

  // Handle regenerate: go back to form and auto-trigger
  const handleRegenerate = useCallback(() => {
    setViewMode('form')
    setResult(null)
    // Auto-trigger after state settles
    setTimeout(() => handleGenerate(), 0)
  }, [handleGenerate])

  // Handle back to form
  const handleBackToForm = useCallback(() => {
    setViewMode('form')
  }, [])

  // Custom counts adjustment
  const adjustCount = useCallback((key: keyof EcommerceCustomCounts, delta: number) => {
    setCustomCounts(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min(10, prev[key] + delta)),
    }))
  }, [])

  const isGenerateDisabled = productImages.length === 0 || !sellingPoints.trim() || isLoading

  // Counter row configuration
  const counterRows: Array<{ key: keyof EcommerceCustomCounts; label: string; desc: string; aiTag?: boolean }> = [
    { key: 'whiteBg', label: '白底图', desc: '纯白背景商品图' },
    { key: 'scene', label: '场景图', desc: '生活场景展示', aiTag: true },
    { key: 'sellingPoint', label: '卖点图', desc: '核心卖点展示', aiTag: true },
    { key: 'other', label: '其他图', desc: '细节/对比/尺寸等' },
  ]

  return (
    <div className="ecommerce-panel">
      {/* Setup Guide - shown when no provider config available */}
      {hasConfig === false && viewMode === 'form' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Settings style={{ width: 24, height: 24, color: '#A16207' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#171717', marginBottom: 4 }}>尚未配置 API</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, marginBottom: 20 }}>使用电商套图生成前，需要登录官方服务或配置第三方 API</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 240 }}>
            <button
              onClick={() => window.open(`${WEB_APP_URL}/auth/login?source=extension`, '_blank')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 16px', background: '#171717', color: 'white', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              <LogIn style={{ width: 16, height: 16 }} />
              登录官方服务
            </button>
            <button
              onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL_FOR_SETTINGS })}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 16px', background: 'white', color: '#374151', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid #E5E7EB', cursor: 'pointer' }}
            >
              <Settings style={{ width: 16, height: 16 }} />
              配置第三方 API
            </button>
          </div>
        </div>
      )}

      {/* Main Form - shown when config exists or still checking */}
      {(hasConfig === true || hasConfig === null) && viewMode === 'form' && (
        <>
          {/* Product reference images */}
          <div className="ecommerce-panel-section">
            <div className="ecommerce-panel-reference-header">
              <label className="ecommerce-panel-label">
                参考图片<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
              </label>
              <span className="ecommerce-panel-reference-count">{productImages.length}/{MAX_REFERENCE_IMAGES}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: 'none' }}
              disabled={isLoading || productImages.length >= MAX_REFERENCE_IMAGES}
            />
            <div className="ecommerce-panel-reference-grid">
              {productImages.map(image => (
                <div key={image.id} className="ecommerce-panel-reference-thumb" title={image.name}>
                  <img src={image.dataUrl} alt={image.name} className="ecommerce-panel-reference-img" />
                  <button
                    type="button"
                    className="ecommerce-panel-reference-remove"
                    onClick={() => handleRemoveImage(image.id)}
                    aria-label="移除图片"
                    disabled={isLoading}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
              {productImages.length < MAX_REFERENCE_IMAGES && (
                <button
                  type="button"
                  className="ecommerce-panel-reference-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  aria-label="上传参考图片"
                >
                  <Upload style={{ width: 16, height: 16 }} />
                </button>
              )}
            </div>
            <div className="ecommerce-panel-reference-hint">最多 6 张，单张 5MB 以内</div>
          </div>

          {/* Selectors: Platform + Market */}
          <div className="ecommerce-panel-section">
            <label className="ecommerce-panel-label">平台与市场</label>
            <div className="ecommerce-panel-select-row">
              <div className="ecommerce-panel-select-wrapper">
                <span className="ecommerce-panel-select-label">电商平台</span>
                <select
                  className="ecommerce-panel-select"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as EcommercePlatform)}
                  disabled={isLoading}
                >
                  {config.platforms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="ecommerce-panel-select-wrapper">
                <span className="ecommerce-panel-select-label">目标市场</span>
                <select
                  className="ecommerce-panel-select"
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
          <div className="ecommerce-panel-section">
            <div className="ecommerce-panel-select-row">
              <div className="ecommerce-panel-select-wrapper">
                <span className="ecommerce-panel-select-label">输出语言</span>
                <select
                  className="ecommerce-panel-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as EcommerceLanguage)}
                  disabled={isLoading}
                >
                  {config.languages.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="ecommerce-panel-select-wrapper">
                <span className="ecommerce-panel-select-label">图片比例</span>
                <select
                  className="ecommerce-panel-select"
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
          <div className="ecommerce-panel-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="ecommerce-panel-label">
                卖点描述<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
              </label>
              <button
                className="ecommerce-panel-ai-write-btn ecommerce-panel-ai-write-btn-inline"
                onClick={handleAiWrite}
                disabled={isAiWriting || productImages.length === 0}
              >
                {isAiWriting ? (
                  <>
                    <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
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
            <textarea
              className="ecommerce-panel-textarea"
              placeholder="描述商品核心卖点，例如：无线蓝牙耳机、主动降噪、30小时续航..."
              value={sellingPoints}
              onChange={(e) => setSellingPoints(e.target.value)}
              disabled={isLoading}
              rows={4}
            />
          </div>

          {/* Structure Config: Smart vs Custom */}
          <div className="ecommerce-panel-section">
            <label className="ecommerce-panel-label">套图结构</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Smart card */}
              <div
                className={`ecommerce-panel-structure-card ${setStructure === 'smart' ? 'active' : ''}`}
                onClick={() => setSetStructure('smart')}
              >
                <div className="ecommerce-panel-structure-card-header">
                  <div className={`ecommerce-panel-structure-card-checkbox ${setStructure === 'smart' ? 'checked' : ''}`}>
                    &#10003;
                  </div>
                  <div>
                    <div className="ecommerce-panel-structure-card-title">智能配图</div>
                    <div className="ecommerce-panel-structure-card-desc">AI 自动规划套图数量与类型</div>
                  </div>
                </div>
              </div>

              {/* Custom card */}
              <div
                className={`ecommerce-panel-structure-card ${setStructure === 'custom' ? 'active' : ''}`}
                onClick={() => setSetStructure('custom')}
              >
                <div className="ecommerce-panel-structure-card-header">
                  <div className={`ecommerce-panel-structure-card-checkbox ${setStructure === 'custom' ? 'checked' : ''}`}>
                    &#10003;
                  </div>
                  <div>
                    <div className="ecommerce-panel-structure-card-title">自定义配图</div>
                    <div className="ecommerce-panel-structure-card-desc">手动设置各类型图片数量</div>
                  </div>
                </div>
                <div className="ecommerce-panel-structure-card-body">
                  {counterRows.map(row => (
                    <div key={row.key} className="ecommerce-panel-counter-row">
                      <span className="ecommerce-panel-counter-label">{row.label}</span>
                      <span className="ecommerce-panel-counter-desc">{row.desc}</span>
                      {row.aiTag && <span className="ecommerce-panel-counter-ai-tag">AI</span>}
                      <div className="ecommerce-panel-counter-controls">
                        <button
                          className="ecommerce-panel-counter-btn"
                          onClick={(e) => { e.stopPropagation(); adjustCount(row.key, -1) }}
                          disabled={customCounts[row.key] <= 0}
                        >
                          -
                        </button>
                        <span className="ecommerce-panel-counter-value">{customCounts[row.key]}</span>
                        <button
                          className="ecommerce-panel-counter-btn"
                          onClick={(e) => { e.stopPropagation(); adjustCount(row.key, 1) }}
                          disabled={customCounts[row.key] >= 10}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            className="ecommerce-panel-generate-btn"
            onClick={handleGenerate}
            disabled={isGenerateDisabled}
          >
            {isLoading ? (
              <>
                <span className="ecommerce-panel-spinner" />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <Sparkles style={{ width: 14, height: 14 }} />
                <span>生成套图提示词</span>
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="ecommerce-panel-error">
              <AlertTriangle style={{ width: 14, height: 14, color: '#dc2626', flexShrink: 0, marginRight: 8 }} />
              <span style={{ flex: 1 }}>{error}</span>
              <button
                className="ecommerce-panel-action-btn"
                onClick={handleGenerate}
                style={{ marginLeft: 8 }}
              >
                <RefreshCw style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Result View - full-screen overlay */}
      {viewMode === 'result' && result && (
        <div className="ecommerce-panel-result-view">
          <div className="ecommerce-panel-result-header">
            <button className="ecommerce-panel-result-back-btn" onClick={handleBackToForm} aria-label="返回表单">
              <ArrowLeft style={{ width: 16, height: 16 }} />
            </button>
            <span className="ecommerce-panel-result-title">套图生成结果</span>
            <span className="ecommerce-panel-result-count">共 {result.prompts.length} 张</span>
          </div>

          <div className="ecommerce-panel-result-body">
            {generationConfigSnapshot && (
              <div className="ecommerce-panel-result-summary">
                <span>平台：{getConfigLabel(config.platforms, generationConfigSnapshot.platform)}</span>
                <span>市场：{getConfigLabel(config.markets, generationConfigSnapshot.market)}</span>
                <span>语言：{getConfigLabel(config.languages, generationConfigSnapshot.language)}</span>
                <span>比例：{generationConfigSnapshot.aspectRatio}</span>
                <span>结构：{generationConfigSnapshot.setStructure === 'custom' ? '自定义配图' : '智能配图'}</span>
              </div>
            )}

            {result.prompts.map((p, i) => {
              const isExpanded = expandedPromptIndexes.has(i)
              const detailRows = DETAIL_ROWS.filter(row => p.details?.[row.key])
              const detailId = `ecommerce-panel-prompt-details-${i}`
              return (
                <div key={`${p.type}-${i}`} className="ecommerce-panel-result-card">
                  <div className="ecommerce-panel-result-card-header">
                    <span className="ecommerce-panel-result-type-tag">{p.type}</span>
                    <span className="ecommerce-panel-result-ratio">{p.aspectRatio}</span>
                  </div>
                  <div className="ecommerce-panel-result-text">{p.prompt}</div>
                  {detailRows.length > 0 && (
                    <button
                      className="ecommerce-panel-details-toggle"
                      onClick={() => togglePromptDetails(i)}
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                    >
                      {isExpanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                      <span>{isExpanded ? '收起详情' : '展开详情'}</span>
                    </button>
                  )}
                  {isExpanded && (
                    <div id={detailId} className="ecommerce-panel-details">
                      {detailRows.map(row => (
                        <div key={row.key} className="ecommerce-panel-detail-row">
                          <span className="ecommerce-panel-detail-label">{row.label}</span>
                          <span className="ecommerce-panel-detail-value">{p.details?.[row.key]}</span>
                        </div>
                      ))}
                      <div className="ecommerce-panel-detail-row ecommerce-panel-detail-row-full">
                        <span className="ecommerce-panel-detail-label">完整提示词</span>
                        <span className="ecommerce-panel-detail-value">{p.prompt}</span>
                      </div>
                    </div>
                  )}
                  <div className="ecommerce-panel-result-actions">
                    {onInsert && (
                      <button
                        className="ecommerce-panel-action-btn ecommerce-panel-insert-btn"
                        onClick={() => { onInsert(p.prompt); showToast('已插入提示词') }}
                        title="插入到输入框"
                        aria-label="插入到输入框"
                      >
                        <ArrowUpRight style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                    <button
                      className="ecommerce-panel-action-btn"
                      onClick={() => handleCopy(p.prompt)}
                      title="复制"
                      aria-label="复制"
                    >
                      <Copy style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      className="ecommerce-panel-action-btn"
                      onClick={() => handleSavePrompt(i)}
                      title="保存到库"
                      aria-label="保存到库"
                    >
                      <Bookmark style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="ecommerce-panel-result-footer">
            <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleRegenerate} disabled={isLoading}>
              {isLoading ? '生成中...' : '重新生成'}
            </button>
            <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleCopyAll}>
              复制全部
            </button>
            <button className="ecommerce-panel-result-footer-btn-primary" onClick={handleInsertAll}>
              插入全部
            </button>
          </div>
        </div>
      )}

      {/* Save dialog */}
      <CategorySelectDialog
        categories={categories}
        isOpen={showSaveDialog}
        onClose={() => { setShowSaveDialog(false); setSavePromptIndex(null) }}
        onConfirm={handleSaveConfirm}
      />
    </div>
  )
}
