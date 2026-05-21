/**
 * AgentView - Agent prompt generation interface
 * User inputs description + optional reference image
 * Agent generates detailed prompt based on template
 */

import { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react'
import type { AgentTemplateCategory, Category } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload } from 'lucide-react'
import { getAgentTemplate } from '@/lib/agent-templates'
import { Tooltip } from '@/content/components/Tooltip'
import { ToastNotification } from '@/sidepanel/components/ToastNotification'

// Lazy load dialog component
const CategorySelectDialog = lazy(() => import('@/content/components/CategorySelectDialog').then(m => ({ default: m.CategorySelectDialog })))

interface AgentViewProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string  // Pre-filled from Content Script
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
}

export default function AgentView({
  selectedTemplate,
  extractedText,
  categories,
  onSave
}: AgentViewProps) {
  // State
  const [inputText, setInputText] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Ref for abort controller
  const abortControllerRef = useRef<AbortController | null>(null)

  // Get template info
  const template = getAgentTemplate(selectedTemplate)

  // Pre-fill extracted text on mount
  useEffect(() => {
    if (extractedText) {
      setInputText(extractedText)
    }
  }, [extractedText])

  // Handle image upload
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setToastMessage('请上传图片文件')
      setTimeout(() => setToastMessage(null), 2000)
      return
    }

    // Read as data URL
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImageData(dataUrl)
    }
    reader.onerror = () => {
      setToastMessage('图片读取失败')
      setTimeout(() => setToastMessage(null), 2000)
    }
    reader.readAsDataURL(file)
  }, [])

  // Handle remove image
  const handleRemoveImage = useCallback(() => {
    setImageData(null)
  }, [])

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!inputText.trim() || isLoading) return

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)
    setResult(null)

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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败'

      // Handle specific error types
      if (errorMessage === 'NO_CONFIG: 请先配置 Vision API') {
        setError('请先配置 Vision API')
      } else if (errorMessage === 'UNSUPPORTED_FORMAT: Agent 功能仅支持 Anthropic Messages 和 OpenAI Chat Completions API 格式') {
        setError('不支持当前 API 格式')
      } else if (errorMessage === 'timeout') {
        setError('请求超时，请重试')
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [inputText, imageData, selectedTemplate, isLoading])

  // Handle copy result
  const handleCopy = useCallback(async () => {
    if (!result) return

    try {
      await navigator.clipboard.writeText(result)
      setToastMessage('已复制到剪贴板')
      setTimeout(() => setToastMessage(null), 2000)
    } catch {
      setToastMessage('复制失败')
      setTimeout(() => setToastMessage(null), 2000)
    }
  }, [result])

  // Handle save
  const handleSave = useCallback((categoryId: string) => {
    if (!result) return

    onSave(result, categoryId, selectedTemplate)
    setShowSaveDialog(false)
    setToastMessage('已保存到分类')
    setTimeout(() => setToastMessage(null), 2000)
  }, [result, selectedTemplate, onSave])

  // Handle retry
  const handleRetry = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  // Handle regenerate (clear result and generate again)
  const handleRegenerate = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  // Is generate button disabled
  const isGenerateDisabled = !inputText.trim() || isLoading

  return (
    <div className="agent-view">
      {/* Header */}
      <div className="agent-header">
        <Sparkles className="agent-header-icon" />
        <span className="agent-header-title">Agent</span>
        <span className="agent-header-template">{template?.name || selectedTemplate}</span>
      </div>

      {/* Template hint card */}
      {template && (
        <div className="agent-template-hint">
          <div className="agent-template-hint-title">风格要点</div>
          <div className="agent-template-hint-keywords">
            {template.keywords.join('、')}
          </div>
        </div>
      )}

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
          <button className="agent-error-retry" onClick={handleRetry}>
            <RefreshCw style={{ width: 12, height: 12 }} />
            <span>重试</span>
          </button>
        </div>
      )}

      {/* Result section */}
      {result && !error && (
        <div className="agent-result-section">
          <div className="agent-result-label">生成的提示词</div>
          <div className="agent-result-content">{result}</div>
          <div className="agent-result-actions">
            <Tooltip content="复制">
              <button className="agent-result-btn" onClick={handleCopy}>
                <Copy style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="保存到库">
              <button className="agent-result-btn" onClick={() => setShowSaveDialog(true)}>
                <Bookmark style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="重新生成">
              <button className="agent-result-btn" onClick={handleRegenerate} disabled={isLoading}>
                <RefreshCw style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
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
  )
}