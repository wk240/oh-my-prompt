import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Check, X, RefreshCw, Settings, Minimize2, Maximize2, Copy } from 'lucide-react'
import { MessageType } from '@/shared/messages'
import type { VisionApiErrorPayload, VisionApiResultData, InsertPromptPayload, SaveTemporaryPromptPayload } from '@/shared/types'

/**
 * VisionModal state machine
 */
type VisionModalState =
  | 'loading'      // API call in progress
  | 'success'      // Prompt preview, awaiting confirmation
  | 'error'        // Error display
  | 'confirming'   // Processing confirmation
  | 'feedback'     // Success feedback before auto-close

type TabType = 'zh' | 'en' | 'json'

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
 * Get language preference from storage (sync read)
 */
function getStoredLanguagePreference(): 'zh' | 'en' {
  try {
    const stored = localStorage.getItem('omps_language_preference')
    return stored === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

/**
 * VisionModal - In-page modal for image-to-prompt conversion
 * Supports: API call, prompt preview with 3-Tab layout (中文/英文/JSON), insertion/clipboard
 * Note: API configuration is handled in settings.html (opened via OPEN_SETTINGS_PAGE)
 */
function VisionModal({ imageUrl, tabId, onClose }: VisionModalProps) {
  const [state, setState] = useState<VisionModalState>('loading')
  const [fullData, setFullData] = useState<VisionApiResultData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [errorAction, setErrorAction] = useState<'settings' | 'retry' | 'close'>('close')
  const [retryCount, setRetryCount] = useState(0)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')
  const [isLovartPage, setIsLovartPage] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('zh')
  const [languagePreference, setLanguagePreference] = useState<'zh' | 'en'>('zh')

  // Draggable & minimizable state
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 500, y: 20 }) // Position from left/top
  const [expandedPosition, setExpandedPosition] = useState({ x: window.innerWidth - 500, y: 20 }) // Store position when expanded
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  // Modal dimensions
  const EXPANDED_WIDTH = 480
  const MINIMIZED_WIDTH = 200

  /**
   * Check if current page is Lovart and get language preference
   */
  useEffect(() => {
    const lovartPattern = /^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/
    setIsLovartPage(lovartPattern.test(window.location.href))

    // Get stored language preference and set default tab
    const pref = getStoredLanguagePreference()
    setLanguagePreference(pref)
    setActiveTab(pref)
  }, [])

  /**
   * Start API call on mount
   */
  useEffect(() => {
    requestApiCall(0)
  }, [])

  /**
   * Get current prompt based on active tab
   */
  const getCurrentPrompt = useCallback(() => {
    if (!fullData) return ''
    if (activeTab === 'zh') return fullData.zh.prompt
    if (activeTab === 'en') return fullData.en.prompt
    // JSON tab - return formatted JSON as prompt
    return JSON.stringify(fullData.json_prompt, null, 2)
  }, [fullData, activeTab])

  /**
   * Request Vision API call via service worker (uses host_permissions for CORS bypass)
   */
  const requestApiCall = useCallback(async (count: number) => {
    setState('loading')
    setRetryCount(count)
    setFullData(null)

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
        const fullDataResult = response.data.fullData as VisionApiResultData | undefined
        if (fullDataResult) {
          setFullData(fullDataResult)
          // Set default tab based on language preference
          setActiveTab(languagePreference)
        } else {
          // Fallback: if fullData not available, create minimal structure
          const fallbackData: VisionApiResultData = {
            zh: { prompt: response.data.prompt || '', analysis: '' },
            en: { prompt: response.data.prompt || '', analysis: '' },
            zh_style_tags: [],
            en_style_tags: [],
            json_prompt: {
              subject: '',
              action_pose: '',
              details_appearance: '',
              environment_background: '',
              lighting_atmosphere: '',
              style_camera: '',
              colors: [],
              materials: [],
              aspect_ratio: ''
            },
            confidence: 0.5
          }
          setFullData(fallbackData)
        }
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
  }, [imageUrl, languagePreference])

  /**
   * Handle retry
   */
  const handleRetry = () => {
    requestApiCall(retryCount + 1)
  }

  /**
   * Open settings page for API configuration
   */
  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: MessageType.OPEN_SETTINGS_PAGE })
    onClose()
  }

  /**
   * Handle confirmation - insert/copy + save + feedback
   */
  const handleConfirm = async () => {
    const currentPrompt = getCurrentPrompt()
    if (!currentPrompt || !fullData) {
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
            prompt: currentPrompt,
            tabId: tabId
          } as InsertPromptPayload
        })

        insertSuccess = response?.success === true

        if (!insertSuccess) {
          clipboardSuccess = await copyToClipboard(currentPrompt)
        }
      } catch (error) {
        console.error('[Oh My Prompt] INSERT_PROMPT error:', error)
        clipboardSuccess = await copyToClipboard(currentPrompt)
      }
    } else {
      clipboardSuccess = await copyToClipboard(currentPrompt)
    }

    // Step 2: Save to '临时' category with bilingual content
    const promptName = generatePromptName(fullData.zh.prompt)

    try {
      await chrome.runtime.sendMessage({
        type: MessageType.SAVE_TEMPORARY_PROMPT,
        payload: {
          name: promptName,
          content: fullData.zh.prompt,
          contentEn: fullData.en.prompt,
          imageUrl: imageUrl,
          styleTags: fullData.zh_style_tags
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
  }

  /**
   * Handle minimize - adjust position to keep right edge fixed
   */
  const handleMinimize = useCallback(() => {
    // Store current expanded position
    setExpandedPosition(position)
    // Calculate new position: shift left by (expandedWidth - minimizedWidth)
    // This keeps the right edge at the same position
    const newLeft = position.x + (EXPANDED_WIDTH - MINIMIZED_WIDTH)
    setPosition({ x: newLeft, y: position.y })
    setIsMinimized(true)
  }, [position])

  /**
   * Handle expand - restore to original expanded position
   */
  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    // Restore to stored expanded position
    setPosition(expandedPosition)
  }, [expandedPosition])

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

  /**
   * Drag handlers - mouse down on header starts drag (both minimized and expanded)
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  /**
   * Render JSON prompt as key-value list
   */
  const renderJsonPrompt = () => {
    if (!fullData) return null
    const jsonPrompt = fullData.json_prompt
    const baselineKeys = [
      'subject', 'action_pose', 'details_appearance', 'environment_background',
      'lighting_atmosphere', 'style_camera', 'colors', 'materials', 'aspect_ratio'
    ]

    return (
      <div className="json-details">
        {baselineKeys.map(key => {
          const value = jsonPrompt[key]
          if (!value) return null
          const displayValue = Array.isArray(value) ? value.join(', ') : String(value)
          return (
            <div className="json-row" key={key}>
              <span className="json-key">{key}:</span>
              <span className="json-value">{displayValue}</span>
            </div>
          )
        })}
        {/* Additional fields */}
        {Object.keys(jsonPrompt)
          .filter(key => !baselineKeys.includes(key))
          .map(key => {
            const value = jsonPrompt[key]
            if (!value) return null
            const displayValue = typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)
            return (
              <div className="json-row" key={key}>
                <span className="json-key">{key}:</span>
                <span className="json-value">{displayValue}</span>
              </div>
            )
          })}
      </div>
    )
  }

  /**
   * Render style tags as chips
   */
  const renderStyleTags = (tags: string[]) => {
    if (!tags || tags.length === 0) return null
    return (
      <div className="style-tags">
        {tags.map((tag, index) => (
          <span className="style-tag" key={index}>{tag}</span>
        ))}
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className={`modal-card ${isMinimized ? 'minimized' : ''}`}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        {/* Header - always draggable */}
        <div
          className="modal-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: 'grab' }}
        >
          <>
            <img className="modal-logo-icon" src={chrome.runtime.getURL('assets/icon-128.png')} alt="Oh My Prompt" />
            <span className="modal-brand">
              {state === 'loading' ? '分析中...' : 'Oh My Prompt'}
            </span>
          </>
          <div className="modal-header-actions">
            {isMinimized ? (
              <>
                <button className="modal-action-btn" onClick={onClose} aria-label="关闭">
                  <X />
                </button>
                <button
                  className="modal-action-btn"
                  onClick={handleExpand}
                  aria-label="放大"
                >
                  <Maximize2 />
                </button>
              </>
            ) : (
              <button
                className="modal-action-btn"
                onClick={handleMinimize}
                aria-label="缩小"
              >
                <Minimize2 />
              </button>
            )}
          </div>
        </div>

        {/* Content - only show when not minimized */}
        {!isMinimized && (
          <div className="modal-content">
            {/* Loading state */}
            {state === 'loading' && (
              <div className="loading-view">
                <Loader2 className="loading-spinner" />
                <p className="loading-text">正在分析图片...</p>
              </div>
            )}

            {/* Success state - 3-Tab layout (footer moved outside for fixed positioning) */}
            {state === 'success' && fullData && (
              <div className="success-view">
                {/* Tab content */}
                <div className="tab-content">
                  {/* Chinese tab */}
                  {activeTab === 'zh' && (
                    <div className="prompt-tab">
                      <div className="prompt-preview">{fullData.zh.prompt}</div>
                      {fullData.zh.analysis && (
                        <div className="analysis-section">
                          <p className="analysis-label">分析说明:</p>
                          <p className="analysis-text">{fullData.zh.analysis}</p>
                        </div>
                      )}
                      {renderStyleTags(fullData.zh_style_tags)}
                    </div>
                  )}

                  {/* English tab */}
                  {activeTab === 'en' && (
                    <div className="prompt-tab">
                      <div className="prompt-preview">{fullData.en.prompt}</div>
                      {fullData.en.analysis && (
                        <div className="analysis-section">
                          <p className="analysis-label">Analysis:</p>
                          <p className="analysis-text">{fullData.en.analysis}</p>
                        </div>
                      )}
                      {renderStyleTags(fullData.en_style_tags)}
                    </div>
                  )}

                  {/* JSON tab */}
                  {activeTab === 'json' && (
                    <div className="json-tab">
                      {renderJsonPrompt()}
                    </div>
                  )}
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
              </div>
            )}

            {/* Error state */}
            {state === 'error' && (
              <div className="error-view">
                <p className="error-message" role="alert">{errorMessage}</p>
                <div className="action-buttons">
                  {errorAction === 'settings' && (
                    <button className="btn btn-primary" onClick={handleOpenSettings}>
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
        )}

        {/* Fixed footer - only show in success state when not minimized */}
        {!isMinimized && state === 'success' && fullData && (
          <div className="modal-footer">
            <div className="tab-buttons">
              <button
                className={`tab-btn ${activeTab === 'zh' ? 'active' : ''}`}
                onClick={() => setActiveTab('zh')}
              >
                中
              </button>
              <button
                className={`tab-btn ${activeTab === 'en' ? 'active' : ''}`}
                onClick={() => setActiveTab('en')}
              >
                英文
              </button>
              <button
                className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
                onClick={() => setActiveTab('json')}
              >
                JSON
              </button>
            </div>
            <button className="btn btn-primary" onClick={handleConfirm}>
              <Copy />
              复制并暂存
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisionModal