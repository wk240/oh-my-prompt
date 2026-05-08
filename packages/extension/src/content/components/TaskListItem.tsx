import { Loader2, Check, X } from 'lucide-react'
import type { QueueTask } from '@/content/core/task-queue-manager'

interface TaskListItemProps {
  task: QueueTask
  isSelected: boolean
  onClick: () => void
}

/**
 * TaskListItem - Display a task in the sidebar list
 * Shows thumbnail + status icon
 */
function TaskListItem({ task, isSelected, onClick }: TaskListItemProps) {
  return (
    <div
      className={`task-list-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      aria-selected={isSelected}
    >
      {/* Thumbnail */}
      <div className="task-thumbnail">
        {task.thumbnailUrl || task.imageUrl ? (
          <img
            src={task.thumbnailUrl || task.imageUrl}
            alt="Task thumbnail"
            loading="lazy"
          />
        ) : (
          <div className="thumbnail-placeholder">无图片</div>
        )}
      </div>

      {/* Status icon - centered */}
      <div className="task-status-center">
        {task.status === 'pending' && (
          <span className="status-dot pending" />
        )}
        {task.status === 'running' && (
          <Loader2 className="status-icon spinning" size={14} />
        )}
        {task.status === 'success' && (
          <Check className="status-icon success" size={14} />
        )}
        {task.status === 'failed' && (
          <X className="status-icon failed" size={14} />
        )}
      </div>
    </div>
  )
}

export default TaskListItem