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
} from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, LogIn, ArrowLeft } from 'lucide-react'
import { showToast } from './ToastNotification'
import { CategorySelectDialog } from './CategorySelectDialog'
import { WEB_APP_URL } from '../../lib/config'
import ecommerceConfigData from '@/data/ecommerce-config.json'

interface EcommercePanelProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
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

const DEFAULT_CUSTOM_COUNTS: EcommerceCustomCounts = {
  whiteBg: 1,
  scene: 2,
  sellingPoint: 2,
  other: 2,
}

export function EcommercePanel({
  selectedTemplate,
  extractedText,
  categories,
  onSave,
}: EcommercePanelProps) {
  // Form state
  const [productImage, setProductImage] = useState<string | null>(null)
  const [productImageName, setProductImageName] = useState('')
  const [platform, setPlatform] = useState<EcommercePlatform>('amazon')
  const [market, setMarket] = useState<EcommerceMarket>('china')
  const [language, setLanguage] = useState<EcommerceLanguage>('zh')
  const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>('1:1')
  const [sellingPoints, setSellingPoints] = useState('')
  const [setStructure, setSetStructure] = useState<'smart' | 'custom'>('smart')
  const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>({ ...DEFAULT_CUSTOM_COUNTS })

  // UI state
  const [isAiWriting, setIsAiWriting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form')
  const [ecommerceResult, setEcommerceResult] = useState<EcommerceGenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null) // null = checking
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savePromptIndex, setSavePromptIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          const { configs, activeConfigId } = response.data
          setHasConfig(configs.length > 0 && activeConfigId !== null)
        } else {
          setHasConfig(false)
        }
      })
      .catch(() => setHasConfig(false))
  }, [])

  // Handle product image upload
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请上传图片文件')
      return
    }
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_IMAGE_SIZE) {
      showToast('图片大小不能超过 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setProductImage(e.target?.result as string)
      setProductImageName(file.name)
    }
    reader.onerror = () => showToast('图片读取失败')
    reader.readAsDataURL(file)
  }, [])

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
      const text = response.data?.text || response.data?.sellingPoints || ''
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
  }, [isAiWriting, productImage, platform, language])

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
    setEcommerceResult(null)
    setViewMode('form')

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
      let result: EcommerceGenerateResult | null = null

      if (data?.ecommercePrompts) {
        result = data.ecommercePrompts as EcommerceGenerateResult
      } else if (data?.prompt) {
        try {
          const parsed = JSON.parse(data.prompt)
          if (parsed?.prompts && Array.isArray(parsed.prompts)) {
            result = parsed as EcommerceGenerateResult
          } else {
            // Single prompt fallback
            result = {
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
          result = {
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

      if (result) {
        setEcommerceResult(result)
        setViewMode('result')
      } else {
        setError('生成结果为空')
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
  }, [isLoading, sellingPoints, productImage, buildEcommerceConfig, aspectRatio])

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
    if (!ecommerceResult) return
    const allText = ecommerceResult.prompts
      .map(p => `[${p.type}]\n${p.prompt}`)
      .join('\n\n---\n\n')
    try {
      await navigator.clipboard.writeText(allText)
      showToast('已复制全部提示词')
    } catch {
      showToast('复制失败')
    }
  }, [ecommerceResult])

  // Handle save single prompt
  const handleSavePrompt = useCallback((index: number) => {
    setSavePromptIndex(index)
    setShowSaveDialog(true)
  }, [])

  const handleSaveConfirm = useCallback((categoryId: string) => {
    if (savePromptIndex === null || !ecommerceResult) return
    const prompt = ecommerceResult.prompts[savePromptIndex]
    if (prompt) {
      onSave(prompt.prompt, categoryId, selectedTemplate)
      showToast('已保存到分类')
    }
    setShowSaveDialog(false)
    setSavePromptIndex(null)
  }, [savePromptIndex, ecommerceResult, selectedTemplate, onSave])

  // Handle regenerate: go back to form and auto-trigger
  const handleRegenerate = useCallback(() => {
    setViewMode('form')
    setEcommerceResult(null)
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

  const isGenerateDisabled = !sellingPoints.trim() || isLoading

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
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Settings style={{ width: 24, height: 24, color: '#7C3AED' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#171717', marginBottom: 4 }}>尚未配置 API</div>
          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, marginBottom: 20 }}>使用电商套图生成前，需要登录官方服务或配置第三方 API</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 240 }}>
            <button
              onClick={() => window.open(`${WEB_APP_URL}/auth/login`, '_blank')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 16px', background: '#7C3AED', color: 'white', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer' }}
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
          {/* Product Image Upload */}
          <div className="ecommerce-panel-section">
            <label className="ecommerce-panel-label">
              商品原图<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
            </label>
            {productImage ? (
              <div className="ecommerce-panel-upload-area">
                <div className="ecommerce-panel-upload-preview">
                  <img src={productImage} alt="商品图" className="ecommerce-panel-upload-thumb" />
                  <span className="ecommerce-panel-upload-info">{productImageName}</span>
                  <button className="ecommerce-panel-upload-remove" onClick={handleRemoveImage} aria-label="移除图片">
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="ecommerce-panel-upload-area" onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={isLoading}
                />
                <div className="ecommerce-panel-upload-placeholder">
                  <Upload style={{ width: 18, height: 18 }} />
                  <span>上传商品原图（5MB以内）</span>
                </div>
              </div>
            )}
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
            <label className="ecommerce-panel-label">
              卖点描述<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
            </label>
            <div className="ecommerce-panel-textarea-section">
              <textarea
                className="ecommerce-panel-textarea"
                placeholder="描述商品核心卖点，例如：无线蓝牙耳机、主动降噪、30小时续航..."
                value={sellingPoints}
                onChange={(e) => setSellingPoints(e.target.value)}
                disabled={isLoading}
                rows={4}
              />
              <button
                className="ecommerce-panel-ai-write-btn"
                onClick={handleAiWrite}
                disabled={isAiWriting || !productImage}
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
                <Sparkles style={{ width: 14, height: 14, marginRight: 6 }} />
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
      {viewMode === 'result' && ecommerceResult && (
        <div className="ecommerce-panel-result-view">
          {/* Header */}
          <div className="ecommerce-panel-result-header">
            <button className="ecommerce-panel-result-back-btn" onClick={handleBackToForm}>
              <ArrowLeft style={{ width: 16, height: 16 }} />
            </button>
            <span className="ecommerce-panel-result-title">套图生成结果</span>
            <span className="ecommerce-panel-result-count">
              共 {ecommerceResult.prompts.length} 张
            </span>
          </div>

          {/* Body: prompt cards */}
          <div className="ecommerce-panel-result-body">
            {ecommerceResult.prompts.map((p, i) => (
              <div key={i} className="ecommerce-panel-result-card">
                <div className="ecommerce-panel-result-card-header">
                  <span className="ecommerce-panel-result-type-tag">{p.type}</span>
                  <span style={{ fontSize: 11, color: '#A3A3A3' }}>{p.aspectRatio}</span>
                </div>
                <div className="ecommerce-panel-result-text">{p.prompt}</div>
                <div className="ecommerce-panel-result-actions">
                  <button className="ecommerce-panel-action-btn" onClick={() => handleCopy(p.prompt)} title="复制">
                    <Copy style={{ width: 14, height: 14 }} />
                  </button>
                  <button className="ecommerce-panel-action-btn" onClick={() => handleSavePrompt(i)} title="保存到库">
                    <Bookmark style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="ecommerce-panel-result-footer">
            <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleCopyAll}>
              复制全部
            </button>
            <button className="ecommerce-panel-result-footer-btn-primary" onClick={handleRegenerate} disabled={isLoading}>
              {isLoading ? '重新生成中...' : '重新生成'}
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
