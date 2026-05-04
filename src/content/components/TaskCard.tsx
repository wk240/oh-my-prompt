/**
 * TaskCard - Individual task display in BatchProgressPanel
 * Success: Full prompt display with copy button at bottom
 * Failed/Running: Compact single-row layout
 */

import { useState, useCallback } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
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
   * Render success state - full prompt display
   */
  const renderSuccessCard = () => (
    <div className="task-card-success">
      {/* Top row: thumbnail + status + remove button */}
      <div className="task-header-row">
        <div className="task-thumbnail-small">
          {task.thumbnailUrl ? (
            <img src={task.thumbnailUrl} alt="Task" loading="lazy" />
          ) : task.imageUrl ? (
            <img src={task.imageUrl} alt="Task" loading="lazy" />
          ) : (
            <div className="thumbnail-placeholder">无图片</div>
          )}
        </div>
        <div className="task-status-row">
          <Check className="status-icon" size={16} style={{ color: '#22c55e' }} />
          <span className="status-text">完成</span>
          {task.savedToTemporary ? (
            <span className="save-status success">已保存到临时库</span>
          ) : task.saveError ? (
            <span className="save-status error">{task.saveError}</span>
          ) : (
            <span className="save-status pending">保存中...</span>
          )}
        </div>
        <div className="task-header-actions">
          <button className="text-btn remove-btn" onClick={() => onRemove(task.id)}>
            移除
          </button>
        </div>
      </div>

      {/* Prompt area - full width */}
      <div className="prompt-display">
        {getCurrentPrompt()}
      </div>

      {/* Bottom row: language/format toggle + copy button */}
      <div className="task-footer-row">
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
              自然
            </button>
            <button
              className={`toggle-btn ${format === 'json' ? 'active' : ''}`}
              onClick={() => setFormat('json')}
            >
              JSON
            </button>
          </div>
        </div>
        <button
          className={`copy-btn-main ${isCopied ? 'copied' : ''}`}
          onClick={handleCopy}
        >
          {isCopied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  )

  /**
   * Render compact state - pending/running/failed
   */
  const renderCompactCard = () => (
    <div className="task-card-compact">
      <div className="task-thumbnail-small">
        {task.thumbnailUrl ? (
          <img src={task.thumbnailUrl} alt="Task" loading="lazy" />
        ) : task.imageUrl ? (
          <img src={task.imageUrl} alt="Task" loading="lazy" />
        ) : (
          <div className="thumbnail-placeholder">无图片</div>
        )}
      </div>
      <div className="task-status-row">
        {renderStatusIcon()}
      </div>
      <div className="task-compact-actions">
        {task.status === 'failed' && (
          <button className="text-btn retry-btn" onClick={() => onRetry(task.id)}>
            重试
          </button>
        )}
        <button className="text-btn remove-btn" onClick={() => onRemove(task.id)}>
          移除
        </button>
      </div>
    </div>
  )

  /**
   * Render status icon for compact view
   */
  const renderStatusIcon = () => {
    switch (task.status) {
      case 'pending':
        return (
          <>
            <span className="status-dot pending" />
            <span className="status-text">等待中</span>
          </>
        )
      case 'running':
        return (
          <>
            <Loader2 className="status-icon spinning" size={16} />
            <span className="status-text">分析中...</span>
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          </>
        )
      case 'failed':
        return (
          <>
            <X className="status-icon" size={16} style={{ color: '#ef4444' }} />
            <span className="status-text">失败</span>
            <span className="error-text">{task.error || '未知错误'}</span>
          </>
        )
      default:
        return null
    }
  }

  // Render based on status
  if (task.status === 'success') {
    return renderSuccessCard()
  }
  return renderCompactCard()
}

export default TaskCard
