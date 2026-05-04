/**
 * TaskCard - Individual task display in BatchProgressPanel
 * Horizontal layout: thumbnail (80x80) + status/actions
 */

import { useState, useCallback } from 'react'
import { Check, X, RefreshCw, Loader2, Copy } from 'lucide-react'
import type { QueueTask } from '@/content/core/task-queue-manager'

type LanguageType = 'zh' | 'en'
type FormatType = 'natural' | 'json'

interface TaskCardProps {
  task: QueueTask
  onRemove: (taskId: string) => void
  onRetry: (taskId: string) => void
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

function TaskCard({ task, onRemove, onRetry }: TaskCardProps) {
  const [isCopied, setIsCopied] = useState(false)
  const [language, setLanguage] = useState<LanguageType>('zh')
  const [format, setFormat] = useState<FormatType>('natural')

  /**
   * Get current prompt based on language and format
   */
  const getCurrentPrompt = useCallback(() => {
    if (!task.result) return ''
    if (format === 'natural') {
      return language === 'zh' ? task.result.zh.prompt : task.result.en.prompt
    }
    // JSON format
    if (language === 'zh' && task.result.zh_json) {
      return JSON.stringify(task.result.zh_json, null, 2)
    }
    if (language === 'en' && task.result.en_json) {
      return JSON.stringify(task.result.en_json, null, 2)
    }
    return JSON.stringify(task.result.json_prompt, null, 2)
  }, [task.result, language, format])

  /**
   * Copy prompt to clipboard
   */
  const handleCopy = useCallback(async () => {
    const prompt = getCurrentPrompt()
    if (!prompt) return
    const success = await copyToClipboard(prompt)
    if (success) {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    }
  }, [getCurrentPrompt])

  /**
   * Render status icon and text
   */
  const renderStatus = () => {
    switch (task.status) {
      case 'pending':
        return (
          <div className="task-status pending">
            <span className="status-dot" style={{ background: '#9CA3AF' }} />
            <span className="status-text">等待中</span>
          </div>
        )
      case 'running':
        return (
          <div className="task-status running">
            <Loader2 className="status-icon spinning" size={16} />
            <span className="status-text">分析中...</span>
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          </div>
        )
      case 'success':
        return (
          <div className="task-status success">
            <Check className="status-icon" size={16} style={{ color: '#22c55e' }} />
            <span className="status-text">完成</span>
          </div>
        )
      case 'failed':
        return (
          <div className="task-status failed">
            <X className="status-icon" size={16} style={{ color: '#ef4444' }} />
            <span className="status-text">失败</span>
            <span className="error-message">{task.error || '未知错误'}</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="task-card">
      {/* Thumbnail */}
      <div className="task-thumbnail">
        {task.thumbnailUrl ? (
          <img src={task.thumbnailUrl} alt="Task" loading="lazy" />
        ) : task.imageUrl ? (
          <img src={task.imageUrl} alt="Task" loading="lazy" />
        ) : (
          <div className="thumbnail-placeholder">无图片</div>
        )}
      </div>

      {/* Status area */}
      <div className="task-content">
        {renderStatus()}

        {/* Details (success only) */}
        {task.status === 'success' && task.result && (
          <div className="task-details">
            {/* Prompt preview with copy button */}
            <div className="prompt-preview-wrapper">
              <div className="prompt-preview">
                {getCurrentPrompt()}
              </div>
              <button
                className={`copy-btn ${isCopied ? 'copied' : ''}`}
                onClick={handleCopy}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {/* Language/Format toggle at bottom */}
            <div className="toggle-groups">
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
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="task-actions">
        {/* Remove button */}
        <button className="action-btn remove" onClick={() => onRemove(task.id)}>
          <X size={14} />
        </button>

        {/* Retry (failed only) */}
        {task.status === 'failed' && (
          <button className="action-btn retry" onClick={() => onRetry(task.id)}>
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default TaskCard