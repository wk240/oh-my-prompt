/**
 * Tooltip - Floating tooltip with Portal rendering
 * Supports position placement relative to trigger element
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactNode
  placement?: 'top' | 'bottom'
  delay?: number
  maxWidth?: number
}

const TOOLTIP_ID = 'oh-my-prompt-script-tooltip-container'

// Get or create tooltip portal container
function getTooltipContainer(): HTMLElement {
  let container = document.getElementById(TOOLTIP_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = TOOLTIP_ID
    document.body.appendChild(container)
  }
  return container
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 300,
  maxWidth = 480,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<number | null>(null)

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipOffset = 8

    if (placement === 'top') {
      setPosition({
        top: rect.top - tooltipOffset,
        left: rect.left + rect.width / 2,
      })
    } else {
      setPosition({
        top: rect.bottom + tooltipOffset,
        left: rect.left + rect.width / 2,
      })
    }
  }, [placement])

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      calculatePosition()
      setIsVisible(true)
    }, delay)
  }, [delay, calculatePosition])

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          style={{
            position: 'fixed',
            top: placement === 'top' ? position.top : position.top,
            left: position.left,
            transform: placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            padding: '8px 12px',
            background: '#171717',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 500,
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            maxWidth: `${maxWidth}px`,
            wordWrap: 'break-word',
            lineHeight: '1.5',
            zIndex: 2147483647,
            pointerEvents: 'none',
          }}
        >
          {content}
        </div>,
        getTooltipContainer()
      )}
    </>
  )
}