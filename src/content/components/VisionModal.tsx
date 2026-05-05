import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Check, X, RefreshCw, Minimize2, Maximize2, Copy } from 'lucide-react'
import type { VisionApiResultData } from '@/shared/types'
import { MessageType } from '@/shared/messages'
import { useTaskQueueStore } from '@/content/core/task-queue-store'
import type { QueueTask } from '@/content/core/task-queue-manager'
import { TaskQueueManager } from '@/content/core/task-queue-manager'
import TaskListItem from './TaskListItem'

type LanguageType = 'zh' | 'en'
type FormatType = 'natural' | 'json'

interface VisionModalProps {
  onClose: () => void
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
 * VisionModal - Left-right layout modal for multi-task prompt conversion
 * Left: Task list with thumbnails and status
 * Right: Prompt preview based on selected task
 *
 * Subscribe mode: Component subscribes to useTaskQueueStore for task list
 * manages selectedTaskId internally for switching content
 */
function VisionModal({ onClose }: VisionModalProps) {
  // Subscribe to task queue store
  const tasks = useTaskQueueStore(state => state.tasks)
  const getStats = useTaskQueueStore(state => state.getStats)

  // Task queue manager instance
  const taskQueueManager = TaskQueueManager.getInstance()

  // Internal selected task ID state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Derive selected task from tasks
  const selectedTask: QueueTask | undefined = selectedTaskId
    ? tasks.find(t => t.id === selectedTaskId)
    : tasks[0] // Default to first task if no selection

  // Language and format toggles
  const [language, setLanguage] = useState<LanguageType>('zh')
  const [format, setFormat] = useState<FormatType>('natural')

  // Draggable & minimizable state
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 620, y: 20 })
  const [expandedPosition, setExpandedPosition] = useState({ x: window.innerWidth - 620, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  // Modal dimensions
  const EXPANDED_WIDTH = 600
  const MINIMIZED_WIDTH = 200

  // Copy state for prompt copy button
  const [isPromptCopied, setIsPromptCopied] = useState(false)

  /**
   * Get language preference from storage on mount
   */
  useEffect(() => {
    const pref = getStoredLanguagePreference()
    setLanguage(pref)
  }, [])

  /**
   * Read settings.visionDefaultFormat on mount
   */
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings?.visionDefaultFormat) {
        setFormat(response.data.settings.visionDefaultFormat)
      }
    })
  }, [])

  /**
   * Auto-select first task when tasks change
   */
  useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id)
    }
    // If selected task was removed, switch to first task
    if (selectedTaskId && !tasks.find(t => t.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0]?.id || null)
    }
  }, [tasks, selectedTaskId])

  /**
   * Handle ESC key - close and clear all tasks
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        taskQueueManager.clearAll()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, taskQueueManager])

  /**
   * Drag handlers - mouse down on header starts drag
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
   * Handle minimize - adjust position to keep right edge fixed
   */
  const handleMinimize = useCallback(() => {
    setExpandedPosition(position)
    const newLeft = position.x + (EXPANDED_WIDTH - MINIMIZED_WIDTH)
    setPosition({ x: newLeft, y: position.y })
    setIsMinimized(true)
  }, [position])

  /**
   * Handle expand - restore to original expanded position
   */
  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    setPosition(expandedPosition)
  }, [expandedPosition])

  /**
   * Get current prompt based on language and format
   */
  const getCurrentPrompt = useCallback(() => {
    const result = selectedTask?.result
    if (!result) return ''

    if (format === 'natural') {
      return language === 'zh' ? result.zh.prompt : result.en.prompt
    }

    // JSON format
    if (language === 'zh' && result.zh_json) {
      return JSON.stringify(result.zh_json, null, 2)
    }
    if (language === 'en' && result.en_json) {
      return JSON.stringify(result.en_json, null, 2)
    }
    return JSON.stringify(result.json_prompt, null, 2)
  }, [selectedTask?.result, language, format])

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

  /**
   * Retry failed task
   */
  const handleRetry = useCallback(() => {
    if (selectedTaskId) {
      taskQueueManager.retryTask(selectedTaskId)
    }
  }, [selectedTaskId, taskQueueManager])

  /**
   * Remove failed task
   */
  const handleRemoveTask = useCallback(() => {
    if (selectedTaskId) {
      taskQueueManager.removeTask(selectedTaskId)
    }
  }, [selectedTaskId, taskQueueManager])

  /**
   * Handle format change - sync to settings
   */
  const handleFormatChange = useCallback((newFormat: FormatType) => {
    setFormat(newFormat)
    // Sync to settings via SET_SETTINGS_ONLY
    chrome.runtime.sendMessage({
      type: MessageType.SET_SETTINGS_ONLY,
      payload: { settings: { visionDefaultFormat: newFormat } }
    })
  }, [])

  /**
   * Render JSON prompt as key-value list
   */
  const renderJsonPrompt = (result: VisionApiResultData) => {
    const jsonPrompt = language === 'zh' && result.zh_json
      ? result.zh_json
      : language === 'en' && result.en_json
        ? result.en_json
        : result.json_prompt

    const zhBaselineKeys = ['主体', '动作姿态', '细节外观', '环境背景', '光影氛围', '风格镜头', '色彩', '材质', '宽高比']
    const enBaselineKeys = ['subject', 'action_pose', 'details_appearance', 'environment_background', 'lighting_atmosphere', 'style_camera', 'colors', 'materials', 'aspect_ratio']

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

  /**
   * Render right content based on selected task status
   */
  const renderRightContent = () => {
    // No task selected
    if (!selectedTask) {
      return (
        <div className="loading-view">
          <p className="loading-text">暂无任务</p>
        </div>
      )
    }

    const { status, result, error } = selectedTask

    // Pending status
    if (status === 'pending') {
      return (
        <div className="loading-view">
          <Loader2 className="loading-spinner" />
          <p className="loading-text">等待分析中...</p>
        </div>
      )
    }

    // Running status
    if (status === 'running') {
      return (
        <div className="loading-view">
          <Loader2 className="loading-spinner" />
          <p className="loading-text">正在分析图片...</p>
        </div>
      )
    }

    // Failed status
    if (status === 'failed') {
      return (
        <div className="error-view">
          <p className="error-message" role="alert">{error || '分析失败'}</p>
          <div className="action-buttons">
            <button className="btn btn-primary" onClick={handleRetry}>
              <RefreshCw />
              重试
            </button>
            <button className="btn btn-outline" onClick={handleRemoveTask}>
              <X />
              移除
            </button>
          </div>
        </div>
      )
    }

    // Success status - show prompt preview
    if (status === 'success' && result) {
      return (
        <div className="success-view">
          {/* Title */}
          {language === 'zh' && result.zh.title && (
            <div className="prompt-title">{result.zh.title}</div>
          )}
          {language === 'en' && result.en.title && (
            <div className="prompt-title">{result.en.title}</div>
          )}

          {/* Content based on format */}
          <div className="tab-content">
            {format === 'natural' && (
              <div className="prompt-tab">
                {language === 'zh' && (
                  <>
                    <div className="prompt-preview-wrapper">
                      <div className="prompt-preview">
                        <p className="prompt-label">提示词:</p>
                        {result.zh.prompt}
                      </div>
                      <button
                        className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                        onClick={handleCopyPrompt}
                        aria-label="复制提示词"
                      >
                        {isPromptCopied ? <Check /> : <Copy />}
                      </button>
                    </div>
                    {result.zh.analysis && (
                      <div className="analysis-section">
                        <p className="analysis-label">分析说明:</p>
                        <p className="analysis-text">{result.zh.analysis}</p>
                      </div>
                    )}
                    {renderStyleTags(result.zh_style_tags)}
                  </>
                )}
                {language === 'en' && (
                  <>
                    <div className="prompt-preview-wrapper">
                      <div className="prompt-preview">
                        <p className="prompt-label">Prompt:</p>
                        {result.en.prompt}
                      </div>
                      <button
                        className={`prompt-copy-btn ${isPromptCopied ? 'copied' : ''}`}
                        onClick={handleCopyPrompt}
                        aria-label="Copy prompt"
                      >
                        {isPromptCopied ? <Check /> : <Copy />}
                      </button>
                    </div>
                    {result.en.analysis && (
                      <div className="analysis-section">
                        <p className="analysis-label">Analysis:</p>
                        <p className="analysis-text">{result.en.analysis}</p>
                      </div>
                    )}
                    {renderStyleTags(result.en_style_tags)}
                  </>
                )}
              </div>
            )}

            {format === 'json' && (
              <div className="json-tab">
                <div className="prompt-preview-wrapper">
                  {renderJsonPrompt(result)}
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

          {/* Save status indicator */}
          {selectedTask.savedToTemporary && (
            <p className="feedback-text" style={{ color: '#22c55e', fontSize: '12px', marginTop: '8px' }}>
              已自动保存到临时库
            </p>
          )}
          {selectedTask.saveError && (
            <p className="feedback-text" style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>
              保存失败: {selectedTask.saveError}
            </p>
          )}
        </div>
      )
    }

    // Unknown status fallback
    return (
      <div className="loading-view">
        <p className="loading-text">未知状态</p>
      </div>
    )
  }

  /**
   * Render minimized status stats
   */
  const renderMinimizedStats = () => {
    const stats = getStats()
    const parts: string[] = []

    if (stats.success > 0) parts.push(`${stats.success}✓`)
    if (stats.failed > 0) parts.push(`${stats.failed}✗`)
    if (stats.running > 0) parts.push(`${stats.running}⟳`)

    return parts.join(' / ') || '无任务'
  }

  /**
   * Determine header brand text based on task status
   */
  const getHeaderBrandText = () => {
    if (isMinimized) return renderMinimizedStats()

    // Check if any task is running
    if (tasks.some(t => t.status === 'running')) {
      return '分析中...'
    }

    return 'Oh My Prompt'
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
            <span className="modal-brand">{getHeaderBrandText()}</span>
          </>
          <div className="modal-header-actions">
            {isMinimized ? (
              <>
                <button className="modal-action-btn" onClick={() => {
                  taskQueueManager.clearAll()
                  onClose()
                }} aria-label="关闭">
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
          <div className="modal-body">
            {/* Left sidebar - task list */}
            <div className="task-sidebar">
              <div className="task-list-container">
                {tasks.map(task => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            </div>

            {/* Right content area */}
            <div className="task-content">
              <div className="task-content-inner">
                {renderRightContent()}
              </div>

              {/* Footer - only show in success state with result */}
              {selectedTask?.status === 'success' && selectedTask.result && (
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
                        onClick={() => handleFormatChange('natural')}
                      >
                        自然语言
                      </button>
                      <button
                        className={`toggle-btn ${format === 'json' ? 'active' : ''}`}
                        onClick={() => handleFormatChange('json')}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <button className="btn btn-outline" onClick={handleCopyPrompt}>
                    <Copy />
                    复制
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisionModal