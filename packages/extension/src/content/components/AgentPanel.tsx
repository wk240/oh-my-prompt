/**
 * AgentPanel - Agent prompt generation UI for Content Script dropdown
 * Inline-styled, Portal-rendered (same pattern as DropdownContainer)
 * Feature-parity with sidepanel/AgentView.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import type { AgentTemplateCategory, Category } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload } from 'lucide-react'
import { getAgentTemplate } from '../../lib/agent-templates'
import { showToast } from './ToastNotification'
import { CategorySelectDialog } from './CategorySelectDialog'

interface AgentPanelProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
}

export function AgentPanel({
  selectedTemplate,
  extractedText,
  categories,
  onSave
}: AgentPanelProps) {
  const [inputText, setInputText] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  const template = getAgentTemplate(selectedTemplate)

  // Pre-fill extracted text
  useEffect(() => {
    if (extractedText) {
      setInputText(extractedText)
    }
  }, [extractedText])

  // Handle image upload
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
      setImageData(e.target?.result as string)
    }
    reader.onerror = () => showToast('图片读取失败')
    reader.readAsDataURL(file)
  }, [])

  const handleRemoveImage = useCallback(() => setImageData(null), [])

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!inputText.trim() || isLoading) return
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
  }, [inputText, imageData, selectedTemplate, isLoading])

  // Handle copy
  const handleCopy = useCallback(async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [result])

  // Handle save
  const handleSave = useCallback((categoryId: string) => {
    if (!result) return
    onSave(result, categoryId, selectedTemplate)
    setShowSaveDialog(false)
    showToast('已保存到分类')
  }, [result, selectedTemplate, onSave])

  const handleRetry = useCallback(() => handleGenerate(), [handleGenerate])
  const isGenerateDisabled = !inputText.trim() || isLoading

  return (
    <div className="agent-panel">
      {/* Input */}
      <div className="agent-panel-section">
        <label style={{ fontSize: 12, fontWeight: 500, color: '#171717', display: 'block', marginBottom: 6 }}>
          描述你想要生成的图像<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
        </label>
        <textarea
          className="agent-panel-textarea"
          placeholder="例如：一款极简风格的蓝牙耳机，白色背景，产品主体突出..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isLoading}
          rows={4}
        />
      </div>

      {/* Image upload */}
      <div className="agent-panel-section">
        <label style={{ fontSize: 12, fontWeight: 500, color: '#171717', display: 'block', marginBottom: 6 }}>参考图片（可选）</label>
        {imageData ? (
          <div className="agent-panel-image-preview">
            <img src={imageData} alt="参考图片" className="agent-panel-image-thumb" />
            <button className="agent-panel-image-remove" onClick={handleRemoveImage} aria-label="移除图片">
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        ) : (
          <div className="agent-panel-upload">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="agent-panel-file-input"
              disabled={isLoading}
            />
            <div className="agent-panel-upload-content">
              <Upload style={{ width: 16, height: 16, color: '#64748B' }} />
              <span style={{ fontSize: 11, color: '#64748B' }}>上传参考图片</span>
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        className={`agent-panel-generate-btn ${isGenerateDisabled ? 'disabled' : ''}`}
        onClick={handleGenerate}
        disabled={isGenerateDisabled}
      >
        {isLoading ? (
          <>
            <Loader2 className="agent-panel-spinner" />
            <span>生成中...</span>
          </>
        ) : (
          <>
            <Sparkles style={{ width: 14, height: 14 }} />
            <span>生成提示词</span>
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="agent-panel-error">
          <AlertTriangle style={{ width: 14, height: 14, color: '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#B91C1C', flex: 1 }}>{error}</span>
          <button className="agent-panel-error-retry" onClick={handleRetry}>
            <RefreshCw style={{ width: 12, height: 12 }} />
            <span>重试</span>
          </button>
        </div>
      )}

      {/* Result */}
      {result && !error && (
        <div className="agent-panel-result">
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>生成的提示词</div>
          <div className="agent-panel-result-content">{result}</div>
          <div className="agent-panel-result-actions">
            <button className="agent-panel-action-btn" onClick={handleCopy} title="复制">
              <Copy style={{ width: 14, height: 14 }} />
            </button>
            <button className="agent-panel-action-btn" onClick={() => setShowSaveDialog(true)} title="保存到库">
              <Bookmark style={{ width: 14, height: 14 }} />
            </button>
            <button className="agent-panel-action-btn" onClick={handleRetry} disabled={isLoading} title="重新生成">
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {/* Save dialog */}
      <CategorySelectDialog
        categories={categories}
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onConfirm={handleSave}
      />
    </div>
  )
}
