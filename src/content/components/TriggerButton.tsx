/**
 * TriggerButton - Lightning icon button to toggle dropdown
 * Positioned left of Lovart input with WCAG touch target size
 */

interface TriggerButtonProps {
  isOpen: boolean
  onClick: () => void
  lovartIconColor: string
}

export function TriggerButton({ isOpen, onClick, lovartIconColor }: TriggerButtonProps) {
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
      aria-label="插入预设提示词"
      aria-expanded={isOpen}
      title="Lovart Prompt Injector"
    >
      {/* Lightning bolt SVG icon (D-03) */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: lovartIconColor }}
      >
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </button>
  )
}