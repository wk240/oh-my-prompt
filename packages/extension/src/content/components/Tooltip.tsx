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

const TOOLTIP_ID = 'oh-my-prompt-tooltip-container'

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
    const viewportWidth = window.innerWidth

    // Calculate ideal left position (centered on trigger)
    let leftPos = rect.left + rect.width / 2

    // Boundary detection: ensure tooltip doesn't exceed viewport
    const halfWidth = maxWidth / 2
    const minLeft = halfWidth + 8 // 8px margin from left edge
    const maxLeft = viewportWidth - halfWidth - 8 // 8px margin from right edge

    // Clamp position to viewport bounds
    if (leftPos < minLeft) {
      leftPos = minLeft
    } else if (leftPos > maxLeft) {
      leftPos = maxLeft
    }

    if (placement === 'top') {
      setPosition({
        top: rect.top - tooltipOffset,
        left: leftPos,
      })
    } else {
      setPosition({
        top: rect.bottom + tooltipOffset,
        left: leftPos,
      })
    }
  }, [placement, maxWidth])

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

  // Global mouse tracking as fallback - ensures tooltip closes even if mouseleave event is lost
  useEffect(() => {
    if (!isVisible || !triggerRef.current) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const margin = 5 // 5px margin to allow slight movement outside
      const isOutside = e.clientX < rect.left - margin ||
                        e.clientX > rect.right + margin ||
                        e.clientY < rect.top - margin ||
                        e.clientY > rect.bottom + margin
      if (isOutside) {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
    }
  }, [isVisible])

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