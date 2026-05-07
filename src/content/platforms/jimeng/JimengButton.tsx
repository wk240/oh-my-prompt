/**
 * JimengButton - 即梦平台风格触发按钮
 * 带边框，匹配即梦工具栏按钮样式
 */

import { useState } from 'react'

interface JimengButtonProps {
  inputElement: HTMLElement
  isOpen: boolean
  onClick: () => void
}

export function JimengButton({ isOpen, onClick }: JimengButtonProps) {
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

  // Update tooltip visibility via host element attribute
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
      className="jimeng-trigger-button"
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
        width: '35px',
        height: '35px',
        backgroundColor: isHovered ? 'rgba(0, 0, 0, 0.06)' : 'transparent',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        borderRadius: '8px',
        color: '#000',
        cursor: 'pointer',
        transition: 'background-color 150ms, border-color 150ms',
        boxShadow: 'none',
        padding: '0',
      }}
    >
      <svg
        width="22"
        height="22"
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