/**
 * BatchProgressPanel - Multi-task progress panel
 * Shows task list with overall stats and global actions
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
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
  // Lazy initialize position to avoid accessing window during SSR/hydration
  const [position, setPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0,
    y: 20
  }))
  const [expandedPosition, setExpandedPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0,
    y: 20
  }))
  const [isDragging, setIsDragging] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const dragOffset = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(position)

  const tasks = useTaskQueueStore(state => state.tasks)
  const isPanelOpen = useTaskQueueStore(state => state.isPanelOpen)
  const setPanelOpen = useTaskQueueStore(state => state.setPanelOpen)
  // Compute stats from tasks using useMemo - only recalculates when tasks array changes
  const stats = useMemo(() => ({
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    success: tasks.filter(t => t.status === 'success').length,
    failed: tasks.filter(t => t.status === 'failed').length
  }), [tasks])

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
    // Keep positionRef in sync with position state (for minimize/expand operations)
    positionRef.current = position
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newPosition = {
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      }
      // Update position ref for use in handleMouseUp
      positionRef.current = newPosition
      // Directly update DOM style for smooth drag (avoids React re-render on every mousemove)
      if (panelRef.current) {
        panelRef.current.style.left = `${newPosition.x}px`
        panelRef.current.style.top = `${newPosition.y}px`
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Sync state with final position
      setPosition(positionRef.current)
      // Save expanded position when dragging ends in expanded state
      if (!isMinimized) {
        setExpandedPosition(positionRef.current)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isMinimized])

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
        ref={panelRef}
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
                <button className="header-btn" onClick={handleClose} aria-label="关闭">
                  <X size={14} />
                </button>
                <button className="header-btn" onClick={handleExpand} aria-label="展开">
                  <Maximize2 size={14} />
                </button>
              </>
            ) : (
              <button className="header-btn" onClick={handleMinimize} aria-label="最小化">
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
            <button className="footer-btn" onClick={handleRetryAllFailed} disabled={stats.failed === 0} aria-label="重试所有失败任务">
              <RefreshCw size={14} />
              重试失败
            </button>
            <button className="footer-btn" onClick={handleClearCompleted} disabled={stats.success === 0 && stats.failed === 0} aria-label="清除所有已完成任务">
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

    /* === Success Card (Full Display) === */
    .task-card-success {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 8px;
    }

    .task-header-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .task-thumbnail-small {
      width: 60px;
      height: 60px;
      flex-shrink: 0;
      border-radius: 6px;
      overflow: hidden;
      background: #E5E5E5;
    }

    .task-thumbnail-small img {
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
      font-size: 11px;
      color: #9CA3AF;
    }

    .task-status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
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

    .save-status {
      font-size: 12px;
      color: #22c55e;
    }

    .save-status.error {
      color: #ef4444;
    }

    .save-status.pending {
      color: #9CA3AF;
    }

    .task-header-actions {
      display: flex;
      gap: 8px;
    }

    /* Prompt display area */
    .prompt-display {
      background: #f8f8f8;
      border: 1px solid #E5E5E5;
      border-radius: 8px;
      padding: 14px;
      font-size: 14px;
      color: #333;
      line-height: 1.5;
      min-height: 100px;
      white-space: pre-wrap;
      overflow-y: auto;
      max-height: 150px;
    }

    /* Footer row */
    .task-footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .toggle-groups {
      display: flex;
      gap: 8px;
    }

    .toggle-group {
      display: flex;
      gap: 2px;
      background: #f0f0f0;
      padding: 3px;
      border-radius: 6px;
    }

    .toggle-btn {
      padding: 6px 12px;
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

    /* === Compact Card (Pending/Running/Failed) === */
    .task-card-compact {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f8f8f8;
      border-radius: 8px;
    }

    .task-card-compact:hover {
      background: #f0f0f0;
    }

    .task-compact-actions {
      display: flex;
      gap: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.pending {
      background: #9CA3AF;
    }

    .error-text {
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

    /* === Text Buttons === */
    .text-btn {
      padding: 6px 10px;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      background: transparent;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .text-btn:hover {
      background: #f8f8f8;
      color: #171717;
    }

    .remove-btn:hover {
      color: #ef4444;
      border-color: #ef4444;
    }

    .retry-btn {
      border: 1px solid #22c55e;
      color: #22c55e;
    }

    .retry-btn:hover {
      background: #f0fdf4;
    }

    /* Copy button (main action) */
    .copy-btn-main {
      padding: 8px 16px;
      border: 1px solid #171717;
      border-radius: 6px;
      background: #ffffff;
      font-size: 13px;
      font-weight: 500;
      color: #171717;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .copy-btn-main:hover {
      background: #f8f8f8;
    }

    .copy-btn-main.copied {
      background: #22c55e;
      border-color: #22c55e;
      color: #fff;
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
    .prompt-display::-webkit-scrollbar {
      width: 6px;
    }

    .panel-content::-webkit-scrollbar-track,
    .prompt-display::-webkit-scrollbar-track {
      background: transparent;
    }

    .panel-content::-webkit-scrollbar-thumb,
    .prompt-display::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    .panel-content::-webkit-scrollbar-thumb:hover,
    .prompt-display::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}

export default BatchProgressPanel