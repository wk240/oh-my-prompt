/**
 * TriggerButton - "Select Prompt" trigger button
 * Uses host element attributes to trigger tooltip outside Shadow DOM
 */

import { useRef } from 'react'

interface TriggerButtonProps {
  isOpen: boolean
  onClick: () => void
}

export function TriggerButton({ isOpen, onClick }: TriggerButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  // Update tooltip visibility via host element attribute
  const handleMouseEnter = () => {
    const host = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
    if (host) host.setAttribute('data-tooltip-show', 'true')
  }

  const handleMouseLeave = () => {
    const host = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
    if (host) host.setAttribute('data-tooltip-show', 'false')
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`trigger-button${isOpen ? ' open' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-label="Oh, My Prompt"
      aria-expanded={isOpen}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className="trigger-icon icon"
        aria-hidden="true"
      >
        <path
          d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"
          fill="currentColor"
        />
      </svg>
    </button>
  )
}