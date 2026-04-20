/**
 * PromptPreviewModal - Modal overlay for full prompt content display
 * Portal-rendered modal with escape/overlay close
 */

import { createPortal } from 'react-dom'
import { useEffect, useCallback } from 'react'
import { X, Bookmark } from 'lucide-react'
import type { ResourcePrompt } from '../../shared/types'

interface PromptPreviewModalProps {
  prompt: ResourcePrompt
  isOpen: boolean
  onClose: () => void
  onCollect?: () => void
}

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

export function PromptPreviewModal({ prompt, isOpen, onClose, onCollect }: PromptPreviewModalProps) {
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

  // Render to same Portal container as dropdown
  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="modal-overlay"
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
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '400px',
          maxHeight: '480px',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          zIndex: 2147483647,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #E5E5E5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#171717' }}>
            {prompt.name}
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
              color: '#171717',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {/* Content */}
        <div style={{
          padding: '16px',
          maxHeight: '320px',
          overflow: 'auto',
          fontSize: '12px',
          color: '#171717',
          lineHeight: '1.4',
        }}>
          {prompt.content}
        </div>
        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #E5E5E5',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {/* Source info */}
          <div style={{ fontSize: '10px', color: '#64748B' }}>
            来源: {prompt.sourceCategory || 'Unknown'}
          </div>
          {/* Active "收藏" button */}
          <button
            onClick={() => onCollect?.()}
            aria-label="收藏提示词"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 16px',
              background: '#1890ff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Bookmark style={{ width: 14, height: 14 }} />
            收藏
          </button>
        </div>
      </div>
    </>,
    getPortalContainer()
  )
}