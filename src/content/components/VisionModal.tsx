import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Check, X, RefreshCw, Settings, Minimize2, Maximize2, Copy } from 'lucide-react'
import { MessageType } from '@/shared/messages'
import type { VisionApiErrorPayload, VisionApiResultData, SaveTemporaryPromptPayload } from '@/shared/types'
import { useTaskQueueStore } from '@/content/core/task-queue-store'
import type { QueueTask } from '@/content/core/task-queue-manager'

/**
 * VisionModal state machine
 */
type VisionModalState =
  | 'loading'      // API call in progress
  | 'success'      // Prompt preview, awaiting confirmation
  | 'error'        // Error display
  | 'confirming'   // Processing confirmation
  | 'feedback'     // Success feedback before auto-close

type LanguageType = 'zh' | 'en'
type FormatType = 'natural' | 'json'

interface VisionModalProps {
  onClose: () => void
}

/**
 * Generate prompt name from title or content
 * Uses title if available, otherwise first 30 chars + timestamp
 */
function generatePromptName(prompt: string, title?: string): string {
  if (title) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return `${title} (${timestamp})`
  }
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
 *
 * Subscribe mode: Component subscribes to useTaskQueueStore for task list
 * manages selectedTaskId internally for switching content
 */
function VisionModal({ onClose }: VisionModalProps) {
  // Subscribe to task queue store
  const tasks = useTaskQueueStore(state => state.tasks)
  // Note: updateTask, removeTask will be used in Task 6 for task management

  // Internal selected task ID state (will be used for task switching in Task 6)
  const [selectedTaskId] = useState<string | null>(null)

  // Derive selected task from tasks
  const selectedTask: QueueTask | undefined = selectedTaskId
    ? tasks.find(t => t.id === selectedTaskId)
    : tasks[0] // Default to first task if no selection

  // Derive imageUrl from selected task
  const imageUrl = selectedTask?.imageUrl || ''

  const [state, setState] = useState<VisionModalState>('loading')
  const [fullData, setFullData] = useState<VisionApiResultData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [errorAction, setErrorAction] = useState<'settings' | 'retry' | 'close'>('close')
  const [retryCount, setRetryCount] = useState(0)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')
  const [language, setLanguage] = useState<LanguageType>('zh')
  const [format, setFormat] = useState<FormatType>('natural')

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
   * Get language preference from storage on mount
   */
  useEffect(() => {
    const pref = getStoredLanguagePreference()
    setLanguage(pref)
  }, [])

  /**
   * Start API call on mount
   */
  useEffect(() => {
    requestApiCall(0)
  }, [])

  /**
   * Get current prompt based on language and format
   */
  const getCurrentPrompt = useCallback(() => {
    if (!fullData) return ''
    if (format === 'natural') {
      return language === 'zh' ? fullData.zh.prompt : fullData.en.prompt
    }
    // JSON format - use zh_json or en_json if available, fallback to json_prompt
    if (language === 'zh' && fullData.zh_json) {
      return JSON.stringify(fullData.zh_json, null, 2)
    }
    if (language === 'en' && fullData.en_json) {
      return JSON.stringify(fullData.en_json, null, 2)
    }
    // Fallback to legacy json_prompt
    return JSON.stringify(fullData.json_prompt, null, 2)
  }, [fullData, language, format])

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
        } else {
          // Fallback: if fullData not available, create minimal structure
          const fallbackData: VisionApiResultData = {
            zh: { title: '', prompt: response.data.prompt || '', analysis: '' },
            en: { title: '', prompt: response.data.prompt || '', analysis: '' },
            zh_style_tags: [],
            en_style_tags: [],
            zh_json: {
              主体: '',
              动作姿态: '',
              细节外观: '',
              环境背景: '',
              光影氛围: '',
              风格镜头: '',
              色彩: [],
              材质: [],
              宽高比: ''
            },
            en_json: {
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
  }, [imageUrl])

  /**
   * Handle retry
   */
  const handleRetry = () => {
    requestApiCall(retryCount + 1)
  }

  /**
   * Open API config page via service worker (content script cannot use chrome.tabs)
   */
  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: MessageType.OPEN_API_CONFIG_PAGE })
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

    // Step 1: Copy to clipboard (Lovart insertion removed - use clipboard only)
    const clipboardSuccess = await copyToClipboard(currentPrompt)

    // Step 2: Save to '临时' category with bilingual content and image
    // Always save Chinese as primary content, English as contentEn (regardless of current selection)
    const contentToSave = format === 'json'
      ? (fullData.zh_json ? JSON.stringify(fullData.zh_json, null, 2) : JSON.stringify(fullData.json_prompt, null, 2))
      : fullData.zh.prompt
    const contentEnToSave = format === 'json'
      ? (fullData.en_json ? JSON.stringify(fullData.en_json, null, 2) : JSON.stringify(fullData.json_prompt, null, 2))
      : fullData.en.prompt

    // Use title for name if available (generate both Chinese and English names)
    const zhTitle = fullData.zh.title || undefined
    const enTitle = fullData.en.title || undefined
    const zhPromptContent = format === 'json'
      ? (fullData.zh_json ? JSON.stringify(fullData.zh_json) : JSON.stringify(fullData.json_prompt))
      : fullData.zh.prompt
    const enPromptContent = format === 'json'
      ? (fullData.en_json ? JSON.stringify(fullData.en_json) : JSON.stringify(fullData.json_prompt))
      : fullData.en.prompt
    const promptName = generatePromptName(zhPromptContent, zhTitle)
    const promptNameEn = generatePromptName(enPromptContent, enTitle)
    let localImageSaved = false

    console.log('[Oh My Prompt] VisionModal: Saving to temporary library, imageUrl:', imageUrl?.substring(0, 50) + '...')

    try {
      const saveResponse = await chrome.runtime.sendMessage({
        type: MessageType.SAVE_TEMPORARY_PROMPT,
        payload: {
          name: promptName,
          nameEn: promptNameEn,
          content: contentToSave,
          contentEn: contentEnToSave,
          description: fullData.zh.analysis,
          descriptionEn: fullData.en.analysis,
          imageUrl: imageUrl,
          styleTags: fullData.zh_style_tags
        } as SaveTemporaryPromptPayload
      })
      console.log('[Oh My Prompt] VisionModal: Save response:', saveResponse)
      localImageSaved = saveResponse?.data?.localImageSaved === true
    } catch (saveError) {
      console.error('[Oh My Prompt] Save to temporary failed:', saveError)
    }

    // Step 3: Show feedback
    let feedback = ''
    const imageStatus = localImageSaved ? '图片已保存' : '图片URL已记录'
    if (clipboardSuccess) {
      feedback = `已复制到剪贴板，已保存到临时库 (${imageStatus})`
    } else {
      feedback = `复制失败，请手动粘贴。已保存到临时库 (${imageStatus})`
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
   * Render JSON prompt as key-value list (supports bilingual JSON)
   */
  const renderJsonPrompt = () => {
    if (!fullData) return null

    // Use zh_json or en_json based on language, fallback to json_prompt
    const jsonPrompt = language === 'zh' && fullData.zh_json
      ? fullData.zh_json
      : language === 'en' && fullData.en_json
        ? fullData.en_json
        : fullData.json_prompt

    // Chinese baseline keys
    const zhBaselineKeys = ['主体', '动作姿态', '细节外观', '环境背景', '光影氛围', '风格镜头', '色彩', '材质', '宽高比']
    // English baseline keys
    const enBaselineKeys = ['subject', 'action_pose', 'details_appearance', 'environment_background', 'lighting_atmosphere', 'style_camera', 'colors', 'materials', 'aspect_ratio']

    // Detect which baseline keys to use based on actual keys in jsonPrompt
    const hasZhKeys = Object.keys(jsonPrompt).some(k => zhBaselineKeys.includes(k))
    const baselineKeys = hasZhKeys ? zhBaselineKeys : enBaselineKeys

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

  // Copy state for prompt copy button
  const [isPromptCopied, setIsPromptCopied] = useState(false)

  /**
   * Copy current prompt to clipboard
   */
  const handleCopyPrompt = useCallback(async () => {
    const currentPrompt = getCurrentPrompt()
    if (!currentPrompt) return

    const success = await copyToClipboard(currentPrompt)
    if (success) {
      setIsPromptCopied(true)
      setTimeout(() => setIsPromptCopied(false), 1500)
    }
  }, [getCurrentPrompt])

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

            {/* Success state - language + format toggle layout */}
            {state === 'success' && fullData && (
              <div className="success-view">
                {/* Prompt section */}
                <div className="prompt-section">
                </div>
                {/* Content based on format */}
                <div className="tab-content">
                  {/* Natural language format */}
                  {format === 'natural' && (
                    <div className="prompt-tab">
                      {/* Chinese natural language */}
                      {language === 'zh' && (
                        <>
                          {fullData.zh.title && (
                            <div className="prompt-title">{fullData.zh.title}</div>
                          )}
                          <div className="prompt-preview-wrapper">
                            <div className="prompt-preview">
                              <p className="prompt-label">提示词:</p>
                              {fullData.zh.prompt}
                            </div>
                            <button
                              className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                              onClick={handleCopyPrompt}
                              aria-label="复制提示词"
                            >
                              {isPromptCopied ? <Check /> : <Copy />}
                            </button>
                          </div>
                          {fullData.zh.analysis && (
                            <div className="analysis-section">
                              <p className="analysis-label">分析说明:</p>
                              <p className="analysis-text">{fullData.zh.analysis}</p>
                            </div>
                          )}
                          {renderStyleTags(fullData.zh_style_tags)}
                        </>
                      )}
                      {/* English natural language */}
                      {language === 'en' && (
                        <>
                          {fullData.en.title && (
                            <div className="prompt-title">{fullData.en.title}</div>
                          )}
                          <div className="prompt-preview-wrapper">
                            <div className="prompt-preview">
                              <p className="prompt-label">Prompt:</p>
                              {fullData.en.prompt}
                            </div>
                            <button
                              className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                              onClick={handleCopyPrompt}
                              aria-label="Copy prompt"
                            >
                              {isPromptCopied ? <Check /> : <Copy />}
                            </button>
                          </div>
                          {fullData.en.analysis && (
                            <div className="analysis-section">
                              <p className="analysis-label">Analysis:</p>
                              <p className="analysis-text">{fullData.en.analysis}</p>
                            </div>
                          )}
                          {renderStyleTags(fullData.en_style_tags)}
                        </>
                      )}
                    </div>
                  )}

                  {/* JSON format */}
                  {format === 'json' && (
                    <div className="json-tab">
                      <div className="prompt-preview-wrapper">
                        {renderJsonPrompt()}
                        <button
                          className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                          onClick={handleCopyPrompt}
                          aria-label="复制JSON"
                        >
                          {isPromptCopied ? <Check /> : <Copy />}
                        </button>
                      </div>
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
                <button className="close-session-btn" onClick={onClose}>
                  关闭本次会话
                </button>
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
            <div className="toggle-groups">
              {/* Language toggle */}
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${language === 'zh' ? 'active' : ''}`}
                  onClick={() => setLanguage('zh')}
                >
                  中
                </button>
                <button
                  className={`toggle-btn ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                >
                  EN
                </button>
              </div>
              {/* Format toggle */}
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${format === 'natural' ? 'active' : ''}`}
                  onClick={() => setFormat('natural')}
                >
                  自然语言
                </button>
                <button
                  className={`toggle-btn ${format === 'json' ? 'active' : ''}`}
                  onClick={() => setFormat('json')}
                >
                  JSON
                </button>
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleConfirm}>
              暂存到OMP
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisionModal