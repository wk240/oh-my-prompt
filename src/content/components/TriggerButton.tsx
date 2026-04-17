/**
 * TriggerButton - "Select Prompt" trigger with accent dot
 * Positioned left of Lovart input
 */

interface TriggerButtonProps {
  isOpen: boolean
  onClick: () => void
}

export function TriggerButton({ isOpen, onClick }: TriggerButtonProps) {
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
    <button
      className={`trigger-button${isOpen ? ' open' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="选择预设提示词"
      aria-expanded={isOpen}
      title="Lovart Prompt Injector"
    >
      {/* Accent Dot */}
      <div className="trigger-dot" />
      {/* Label */}
      <span className="trigger-label">Select Prompt</span>
    </button>
  )
}