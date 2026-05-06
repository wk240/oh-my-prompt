/**
 * LovartButton - Lovart-native styled trigger button
 * Extracts Lovart visual styles at runtime for UI coordination
 * Uses host element attributes to trigger tooltip outside Shadow DOM
 */

import { useState, useEffect } from 'react'
import {
  extractLovartButtonStyle,
  getLovartIconColor,
  DEFAULT_STYLE,
  type LovartStyleConfig,
} from '../../style-extractor'

interface LovartButtonProps {
  inputElement: HTMLElement
  isOpen: boolean
  onClick: () => void
}

export function LovartButton({ isOpen, onClick }: LovartButtonProps) {
  const [style, setStyle] = useState<LovartStyleConfig>(DEFAULT_STYLE)
  const [iconColor, setIconColor] = useState<string>(DEFAULT_STYLE.color)
  const [isActive, setIsActive] = useState(false)

  // Extract Lovart styles on mount
  useEffect(() => {
    const extractedStyle = extractLovartButtonStyle()
    setStyle(extractedStyle)

    const extractedColor = getLovartIconColor()
    setIconColor(extractedColor)
  }, [])

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

  // Compute background color based on hover/active state
  const getBackgroundColor = (isHovered: boolean) => {
    if (isActive) return style.activeBackgroundColor
    if (isHovered) return style.hoverBackgroundColor
    return style.backgroundColor
  }

  // Update tooltip visibility via host element attribute (external tooltip mechanism)
  const handleMouseEnter = () => {
    const host = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
    if (host) host.setAttribute('data-tooltip-show', 'true')
  }

  const handleMouseLeave = () => {
    const host = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
    if (host) host.setAttribute('data-tooltip-show', 'false')
    setIsActive(false)
  }

  return (
    <LovartButtonInner
      isOpen={isOpen}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      style={style}
      iconColor={iconColor}
      getBackgroundColor={getBackgroundColor}
    />
  )
}

// Inner component to track hover state for background color
function LovartButtonInner({
  isOpen,
  onClick,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  style,
  iconColor,
  getBackgroundColor,
}: {
  isOpen: boolean
  onClick: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onMouseDown: () => void
  onMouseUp: () => void
  style: LovartStyleConfig
  iconColor: string
  getBackgroundColor: (isHovered: boolean) => string
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      className="lovart-trigger-button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => {
        setIsHovered(true)
        onMouseEnter()
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        onMouseLeave()
      }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      role="button"
      tabIndex={0}
      aria-label="Oh, My Prompt"
      aria-expanded={isOpen}
      style={{
        width: '32px',
        height: '32px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: getBackgroundColor(isHovered),
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        color: iconColor,
        cursor: 'pointer',
        border: 'none',
        transition: 'background-color 150ms',
      }}
    >
      <svg
        width="18"
        height="18"
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