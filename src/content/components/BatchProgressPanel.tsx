/**
 * BatchProgressPanel - Multi-task progress panel
 * Shows task list with overall stats and global actions
 */

import { useCallback, useState, useRef, useEffect } from 'react'
import { Minimize2, Maximize2, X, Trash2, RefreshCw } from 'lucide-react'
import TaskCard from './TaskCard'
import { useTaskQueueStore } from '@/content/core/task-queue-store'
import { TaskQueueManager } from '@/content/core/task-queue-manager'
import Toast from './Toast'

// Panel dimensions
const EXPANDED_WIDTH = 400
const MINIMIZED_WIDTH = 200

function BatchProgressPanel() {
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 20 })
  const [expandedPosition, setExpandedPosition] = useState({ x: window.innerWidth - 420, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const dragOffset = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  const tasks = useTaskQueueStore(state => state.tasks)
  const isPanelOpen = useTaskQueueStore(state => state.isPanelOpen)
  const setPanelOpen = useTaskQueueStore(state => state.setPanelOpen)
  const stats = useTaskQueueStore(state => state.getStats())

  const queueManager = TaskQueueManager.getInstance()

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
   * Handle expand - restore position
   */
  const handleExpand = useCallback(() => {
    setIsMinimized(false)
    setPosition(expandedPosition)
  }, [expandedPosition])

  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    const runningCount = stats.running
    if (runningCount > 0) {
      // Abort all running tasks and clear
      queueManager.clearAll()
    }
    setPanelOpen(false)
  }, [stats.running, queueManager, setPanelOpen])

  /**
   * Handle task removal
   */
  const handleRemoveTask = useCallback((taskId: string) => {
    queueManager.removeTask(taskId)
  }, [queueManager])

  /**
   * Handle task retry
   */
  const handleRetryTask = useCallback((taskId: string) => {
    queueManager.retryTask(taskId)
  }, [queueManager])

  /**
   * Clear all completed tasks
   */
  const handleClearCompleted = useCallback(() => {
    queueManager.clearCompleted()
  }, [queueManager])

  /**
   * Retry all failed tasks
   */
  const handleRetryAllFailed = useCallback(() => {
    const failedCount = stats.failed
    if (failedCount > 0) {
      tasks.filter(t => t.status === 'failed').forEach(t => {
        queueManager.retryTask(t.id)
      })
      setToastMessage(`正在重试 ${failedCount} 个失败任务`)
      setShowToast(true)
    }
  }, [tasks, stats.failed, queueManager])

  /**
   * Drag handlers
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
      // Save expanded position when dragging ends in expanded state
      if (!isMinimized) {
        setExpandedPosition(position)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isMinimized, position])

  /**
   * Handle ESC key to close
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  /**
   * Close toast handler
   */
  const handleCloseToast = useCallback(() => {
    setShowToast(false)
  }, [])

  if (!isPanelOpen) return null

  return (
    <div className="panel-overlay">
      <div
        ref={modalRef}
        className={`panel-card ${isMinimized ? 'minimized' : ''}`}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        {/* Header */}
        <div
          className="panel-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: 'grab' }}
        >
          <img
            className="panel-logo"
            src={chrome.runtime.getURL('assets/icon-128.png')}
            alt="Oh My Prompt"
          />
          <span className="panel-brand">
            {isMinimized ? `${stats.success}✓ / ${stats.failed}✗ / ${stats.running}⟳` : 'Oh My Prompt'}
          </span>
          <div className="panel-header-actions">
            {isMinimized ? (
              <>
                <button className="header-btn" onClick={handleClose} title="关闭">
                  <X size={14} />
                </button>
                <button className="header-btn" onClick={handleExpand} title="展开">
                  <Maximize2 size={14} />
                </button>
              </>
            ) : (
              <button className="header-btn" onClick={handleMinimize} title="最小化">
                <Minimize2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Stats bar (only when not minimized) */}
        {!isMinimized && (
          <div className="panel-stats">
            <span>进度: {stats.success}成功 / {stats.failed}失败 / {stats.running}进行中</span>
          </div>
        )}

        {/* Task list (only when not minimized) */}
        {!isMinimized && (
          <div className="panel-content">
            {tasks.length === 0 ? (
              <div className="empty-state">暂无任务</div>
            ) : (
              <div className="task-list">
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onRemove={handleRemoveTask}
                    onRetry={handleRetryTask}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer actions (only when not minimized) */}
        {!isMinimized && tasks.length > 0 && (
          <div className="panel-footer">
            <button className="footer-btn" onClick={handleRetryAllFailed} disabled={stats.failed === 0}>
              <RefreshCw size={14} />
              重试失败
            </button>
            <button className="footer-btn" onClick={handleClearCompleted} disabled={stats.success === 0 && stats.failed === 0}>
              <Trash2 size={14} />
              清除已完成
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {showToast && (
        <Toast
          message={toastMessage}
          onClose={handleCloseToast}
        />
      )}
    </div>
  )
}

/**
 * Get CSS styles for BatchProgressPanel
 * These styles are injected via Shadow DOM in BatchPanelManager
 */
export function getBatchPanelStyles(): string {
  return `
    /* Panel overlay */
    .panel-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      pointer-events: none;
      z-index: 2147483647;
    }

    /* Panel card */
    .panel-card {
      position: fixed;
      width: 400px;
      max-height: 500px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .panel-card.minimized {
      width: 200px;
      max-height: 60px;
    }

    /* Header */
    .panel-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #E5E5E5;
      gap: 8px;
      user-select: none;
    }

    .panel-card.minimized .panel-header {
      border-bottom: none;
    }

    .panel-logo {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .panel-brand {
      font-size: 12px;
      font-weight: 600;
      color: #171717;
      flex: 1;
    }

    .panel-header-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .header-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
      transition: background 0.15s ease;
    }

    .header-btn:hover {
      background: #f8f8f8;
    }

    /* Stats bar */
    .panel-stats {
      padding: 10px 16px;
      font-size: 13px;
      color: #64748B;
      background: #f8f8f8;
    }

    /* Content area */
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .empty-state {
      text-align: center;
      padding: 32px;
      color: #9CA3AF;
      font-size: 14px;
    }

    /* Task list */
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* TaskCard */
    .task-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: #f8f8f8;
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .task-card:hover {
      background: #f0f0f0;
    }

    .task-card.expanded {
      background: #ffffff;
      border: 1px solid #E5E5E5;
    }

    /* Thumbnail */
    .task-thumbnail {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
      border-radius: 6px;
      overflow: hidden;
      background: #E5E5E5;
    }

    .task-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumbnail-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #9CA3AF;
    }

    /* Content */
    .task-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    /* Status */
    .task-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-icon {
      flex-shrink: 0;
    }

    .status-icon.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .status-text {
      font-size: 13px;
      font-weight: 500;
      color: #171717;
    }

    .result-preview {
      font-size: 12px;
      color: #64748B;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .error-message {
      font-size: 12px;
      color: #ef4444;
    }

    /* Progress bar */
    .progress-bar {
      width: 60px;
      height: 4px;
      background: #E5E5E5;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #171717;
      animation: progress-pulse 1.5s ease-in-out infinite;
    }

    @keyframes progress-pulse {
      0% { width: 20%; }
      50% { width: 80%; }
      100% { width: 20%; }
    }

    /* Expanded details */
    .task-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px;
      border-top: 1px solid #E5E5E5;
    }

    /* Prompt preview with copy */
    .prompt-preview-wrapper {
      position: relative;
    }

    .prompt-preview {
      background: #f8f8f8;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      padding: 10px;
      font-size: 13px;
      color: #171717;
      max-height: 100px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .copy-btn {
      position: absolute;
      bottom: 6px;
      right: 6px;
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #E5E5E5;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
      transition: all 0.15s ease;
    }

    .copy-btn:hover {
      background: #ffffff;
    }

    .copy-btn.copied {
      color: #22c55e;
    }

    /* Toggle groups */
    .toggle-groups {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .toggle-group {
      display: flex;
      gap: 2px;
      background: #f0f0f0;
      padding: 3px;
      border-radius: 6px;
    }

    .toggle-btn {
      padding: 5px 10px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #64748B;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toggle-btn:hover {
      color: #171717;
    }

    .toggle-btn.active {
      background: #ffffff;
      color: #171717;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    /* Actions */
    .task-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex-shrink: 0;
    }

    .action-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #E5E5E5;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
      transition: all 0.15s ease;
    }

    .action-btn:hover {
      background: #f8f8f8;
      color: #171717;
    }

    .action-btn.retry:hover {
      color: #22c55e;
    }

    .action-btn.remove:hover {
      color: #ef4444;
    }

    /* Footer */
    .panel-footer {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      border-top: 1px solid #E5E5E5;
      gap: 8px;
    }

    .footer-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #171717;
      background: #ffffff;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .footer-btn:hover {
      background: #f8f8f8;
    }

    .footer-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Scrollbar */
    .panel-content::-webkit-scrollbar,
    .prompt-preview::-webkit-scrollbar {
      width: 6px;
    }

    .panel-content::-webkit-scrollbar-track,
    .prompt-preview::-webkit-scrollbar-track {
      background: transparent;
    }

    .panel-content::-webkit-scrollbar-thumb,
    .prompt-preview::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    .panel-content::-webkit-scrollbar-thumb:hover,
    .prompt-preview::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}

export default BatchProgressPanel