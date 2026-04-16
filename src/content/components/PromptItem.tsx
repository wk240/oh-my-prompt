/**
 * PromptItem - Prompt entry with name and preview
 * Handles selection state and keyboard interaction
 */

import type { Prompt } from '../../shared/types'

interface PromptItemProps {
  prompt: Prompt
  isSelected: boolean
  onClick: () => void
}

/**
 * Truncate preview text to ~50 chars (D-06)
 */
function truncatePreview(content: string): string {
  if (content.length <= 50) return content
  return content.substring(0, 50) + '...'
}

export function PromptItem({ prompt, isSelected, onClick }: PromptItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClick()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={`prompt-item${isSelected ? ' selected' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="prompt-name">{prompt.name}</div>
      <div className="prompt-preview">
        {truncatePreview(prompt.content)}
      </div>
    </div>
  )
}