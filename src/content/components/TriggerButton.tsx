/**
 * TriggerButton - "Select Prompt" trigger with accent dot
 * Positioned left of input
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
      title="Oh My Prompt Script"
    >
      <svg
        className="trigger-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"
          fill="currentColor"
          fillOpacity="0.9"
        />
      </svg>
    </button>
  )
}