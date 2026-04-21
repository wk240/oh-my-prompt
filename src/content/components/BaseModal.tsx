/**
 * BaseModal - Generic modal component for content script dropdown
 * Portal-rendered modal with escape/overlay close, reusable structure
 */

import { createPortal } from 'react-dom'
import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

const PORTAL_ID = 'oh-my-prompt-script-dropdown-portal'

function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID
    document.body.appendChild(container)
  }
  return container
}

interface BaseModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
  maxWidth?: number
}

export function BaseModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = 400,
  maxWidth = 90,
}: BaseModalProps) {
  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Click overlay closes modal - stop propagation to prevent dropdown close
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!isOpen) return null

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 2147483647,
        }}
      />
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${width}px`,
          maxWidth: `${maxWidth}vw`,
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          zIndex: 2147483647,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #E5E5E5',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#171717',
            }}>
              {title}
            </span>
            <button
              onClick={onClose}
              aria-label="关闭"
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#64748B',
                borderRadius: '4px',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
          {description && (
            <span style={{
              fontSize: '12px',
              color: '#64748B',
            }}>
              {description}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{
          padding: '16px',
          overflow: 'auto',
          flex: 1,
        }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #E5E5E5',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}>
            {footer}
          </div>
        )}
      </div>
    </>,
    getPortalContainer()
  )
}