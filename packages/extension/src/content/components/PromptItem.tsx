/**
 * PromptItem - Prompt entry with name and description
 * Handles selection state and keyboard interaction
 */

import type { Prompt } from '../../shared/types'
import { truncateText } from '../../shared/utils'

interface PromptItemProps {
  prompt: Prompt
  isSelected: boolean
  onClick: () => void
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

  const displayText = prompt.description
    ? truncateText(prompt.description, 50)
    : truncateText(prompt.content, 50)

  return (
    <div
      className={`prompt-item${isSelected ? ' selected' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="prompt-name">{prompt.name}</div>
      <div className="prompt-preview">{displayText}</div>
    </div>
  )
}