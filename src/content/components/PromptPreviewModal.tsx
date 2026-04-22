/**
 * PromptPreviewModal - Modal overlay for full prompt content display
 * Portal-rendered modal with escape/overlay close
 * Footer: left 1/3 collect button, right 2/3 inject button
 */

import { createPortal } from 'react-dom'
import { useEffect, useCallback } from 'react'
import { X, Bookmark, ArrowUpRight } from 'lucide-react'
import type { ResourcePrompt } from '../../shared/types'

interface PromptPreviewModalProps {
  prompt: ResourcePrompt
  isOpen: boolean
  onClose: () => void
  onCollect?: () => void
  onInject?: () => void // Inject callback
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

export function PromptPreviewModal({ prompt, isOpen, onClose, onCollect, onInject }: PromptPreviewModalProps) {
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

  // Handle inject click - close modal and call inject callback
  const handleInject = useCallback(() => {
    onInject?.()
    onClose()
  }, [onInject, onClose])

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
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: '1',
              minWidth: '0',
            }}>
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
          {/* Author attribution */}
          {prompt.author && (
            <a
              href={prompt.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '11px',
                fontWeight: 400,
                color: '#737373',
                textDecoration: 'none',
              }}
            >
              来源: {prompt.author}
            </a>
          )}
        </div>
        {/* Preview Image */}
        {prompt.previewImage && (
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #E5E5E5',
          }}>
            <img
              src={prompt.previewImage}
              alt={prompt.name}
              style={{
                width: '100%',
                maxHeight: '200px',
                objectFit: 'cover',
                borderRadius: '8px',
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        )}
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
          gap: '12px',
        }}>
          {/* Left 1/3: 收藏 button */}
          <button
            onClick={() => onCollect?.()}
            aria-label="收藏提示词"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 12px',
              background: '#ffffff',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#171717',
              cursor: 'pointer',
              flex: '1',
              minWidth: '0',
            }}
          >
            <Bookmark style={{ width: 14, height: 14 }} />
            收藏
          </button>
          {/* Right 2/3: 插入 button */}
          <button
            onClick={handleInject}
            aria-label="插入提示词"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 12px',
              background: '#171717',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: 'pointer',
              flex: '2',
              minWidth: '0',
            }}
          >
            <ArrowUpRight style={{ width: 14, height: 14 }} />
            插入
          </button>
        </div>
      </div>
    </>,
    getPortalContainer()
  )
}