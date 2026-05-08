/**
 * ChatGPTButton - ChatGPT平台风格触发按钮
 * 高度36px，宽度36px
 */

import { useState } from 'react'

interface ChatGPTButtonProps {
  inputElement: HTMLElement
  isOpen: boolean
  onClick: () => void
}

export function ChatGPTButton({ isOpen, onClick }: ChatGPTButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

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

  const handleMouseEnter = () => {
    setIsHovered(true)
    const host = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
    if (host) host.setAttribute('data-tooltip-show', 'true')
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    const host = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
    if (host) host.setAttribute('data-tooltip-show', 'false')
  }

  return (
    <button
      className="chatgpt-trigger-button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-label="Oh, My Prompt"
      aria-expanded={isOpen}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        backgroundColor: isHovered ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
        border: 'none',
        borderRadius: '20px',
        color: '#171717',
        cursor: 'pointer',
        transition: 'background-color 150ms',
        boxShadow: 'none',
        padding: '0',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
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