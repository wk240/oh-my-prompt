/**
 * LovartButton - Lovart-native styled trigger button
 * Extracts Lovart visual styles at runtime for UI coordination
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
  const [isHovered, setIsHovered] = useState(false)
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
  const getBackgroundColor = () => {
    if (isActive) return style.activeBackgroundColor
    if (isHovered) return style.hoverBackgroundColor
    return style.backgroundColor
  }

  return (
    <button
      className="lovart-trigger-button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setIsActive(false)
      }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
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
        backgroundColor: getBackgroundColor(),
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        color: iconColor,
        cursor: 'pointer',
        border: 'none',
        transition: 'background-color 150ms',
        position: 'relative',
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
      {isHovered && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1f1f1f',
            color: '#fff',
            fontSize: '12px',
            fontWeight: '500',
            padding: '6px 10px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          Oh, My Prompt
        </span>
      )}
    </button>
  )
}