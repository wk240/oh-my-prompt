/**
 * PromptPreviewModal - Modal overlay for full prompt content display
 * Portal-rendered modal with escape/overlay close
 * Footer: left 1/3 collect button, right 2/3 inject button
 * Image hover preview: shows full image after 500ms delay
 */

import { createPortal } from 'react-dom'
import { useEffect, useCallback, useState, useRef } from 'react'
import { X, Bookmark, ArrowUpRight, Languages, Pencil } from 'lucide-react'
import type { ResourcePrompt, Prompt } from '../../shared/types'

interface PromptPreviewModalProps {
  prompt: ResourcePrompt | Prompt  // Changed: support both types
  isOpen: boolean
  onClose: () => void
  onCollect?: () => void           // Only for resource prompts
  onInject?: (language: 'zh' | 'en') => void // Inject callback with language
  globalLanguage?: 'zh' | 'en' // Global preference for initial state
  onEdit?: () => void              // NEW: for user prompts
  isUserPrompt?: boolean           // NEW: flag to distinguish type
}

/**
 * Type guard to check if prompt is a ResourcePrompt
 * ResourcePrompt has previewImage and/or author fields that Prompt doesn't have
 */
function isResourcePrompt(prompt: ResourcePrompt | Prompt): prompt is ResourcePrompt {
  return 'previewImage' in prompt || 'author' in prompt
}

const PORTAL_ID = 'oh-my-prompt-dropdown-portal'

// Hover preview delay and dimensions (1.5x larger for better visibility)
const HOVER_PREVIEW_DELAY = 500
const PREVIEW_OFFSET = 16
const PREVIEW_MAX_WIDTH = 720
const PREVIEW_MAX_HEIGHT = 480

// Fallback placeholder SVG
const FALLBACK_IMAGE_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"%3E%3Crect fill="%23f0f0f0" width="120" height="80"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="10" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E'

function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID
    document.body.appendChild(container)
  }
  return container
}

export function PromptPreviewModal({
  prompt,
  isOpen,
  onClose,
  onCollect,
  onInject,
  globalLanguage = 'zh',
  onEdit,          // NEW: for user prompts
  isUserPrompt = false, // NEW: flag to distinguish type
}: PromptPreviewModalProps) {
  // Hover preview state
  const [showPreview, setShowPreview] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Image URL state for user prompts (async loading)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Local language state (defaults to global preference, but can be overridden in modal)
  const [modalLanguage, setModalLanguage] = useState<'zh' | 'en'>(globalLanguage)

  // Sync with global preference when modal opens
  useEffect(() => {
    if (isOpen) {
      setModalLanguage(globalLanguage)
    }
  }, [isOpen, globalLanguage])

  // Get display values based on modal language
  const displayName = modalLanguage === 'en' && prompt.nameEn ? prompt.nameEn : prompt.name
  const displayContent = modalLanguage === 'en' && prompt.contentEn ? prompt.contentEn : prompt.content

  // Load image URL on mount or when prompt changes
  useEffect(() => {
    if (!isOpen) {
      setImageUrl(null)
      return
    }

    let mounted = true

    async function loadImage() {
      if (isUserPrompt && prompt.localImage) {
        const { getCachedImageUrl } = await import('../../lib/sync/image-sync')
        const url = await getCachedImageUrl(prompt.localImage)
        if (mounted) {
          setImageUrl(url)
        }
      } else if (isResourcePrompt(prompt) && prompt.previewImage) {
        if (mounted) {
          setImageUrl(prompt.previewImage)
        }
      } else {
        if (mounted) {
          setImageUrl(null)
        }
      }
    }

    loadImage()

    return () => {
      mounted = false
    }
  }, [prompt, isUserPrompt, isOpen])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Cleanup timer on close
  useEffect(() => {
    if (!isOpen && hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
      setShowPreview(false)
    }
  }, [isOpen])

  // Click overlay closes modal - stop propagation to prevent dropdown close
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  // Handle inject click - close modal and call inject callback with language
  const handleInject = useCallback(() => {
    onInject?.(modalLanguage)
    onClose()
  }, [onInject, onClose, modalLanguage])

  // Handle image mouse enter - start 500ms timer
  const handleImageMouseEnter = () => {
    if (imageUrl) {
      hoverTimerRef.current = setTimeout(() => {
        setShowPreview(true)
      }, HOVER_PREVIEW_DELAY)
    }
  }

  // Handle image mouse move - track position
  const handleImageMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  // Handle image mouse leave - cancel timer and hide preview
  const handleImageMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setShowPreview(false)
  }

  if (!isOpen) return null

  // Preview element - rendered directly to body (outside portal container)
  // Auto-stick to top if preview would exceed viewport top boundary
  const previewHeight = PREVIEW_MAX_HEIGHT + 32 + 16 // max height + padding + extra
  const previewTopPosition = mousePos.y - PREVIEW_OFFSET - previewHeight
  const shouldStickToTop = previewTopPosition < 0

  const previewElement = showPreview && imageUrl ? (
    <div
      style={{
        position: 'fixed',
        left: mousePos.x - PREVIEW_OFFSET,
        top: shouldStickToTop ? PREVIEW_OFFSET : mousePos.y - PREVIEW_OFFSET,
        transform: shouldStickToTop ? 'translateX(-100%)' : 'translate(-100%, -100%)',
        zIndex: 2147483647,
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
        padding: '16px',
        maxWidth: `${PREVIEW_MAX_WIDTH + 32}px`,
        maxHeight: `${PREVIEW_MAX_HEIGHT + 32}px`,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <img
        src={imageUrl}
        alt={prompt.name}
        style={{
          maxWidth: `${PREVIEW_MAX_WIDTH}px`,
          maxHeight: `${PREVIEW_MAX_HEIGHT}px`,
          width: 'auto',
          height: 'auto',
          borderRadius: '8px',
          display: 'block',
          objectFit: 'contain',
        }}
        onError={(e) => {
          e.currentTarget.src = FALLBACK_IMAGE_SVG
        }}
      />
    </div>
  ) : null

  // Render to same Portal container as dropdown
  return createPortal(
    <>
      {/* Preview rendered directly to body */}
      {previewElement && createPortal(previewElement, document.body)}
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
          width: '560px',
          maxHeight: '640px',
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
              {displayName}
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
          {/* Author attribution - only for resource prompts */}
          {!isUserPrompt && isResourcePrompt(prompt) && prompt.author && (
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
        {/* Preview Image - with hover preview */}
        {imageUrl && (
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #E5E5E5',
          }}>
            <img
              src={imageUrl}
              alt={prompt.name}
              onMouseEnter={handleImageMouseEnter}
              onMouseMove={handleImageMouseMove}
              onMouseLeave={handleImageMouseLeave}
              style={{
                width: '100%',
                maxHeight: '200px',
                objectFit: 'cover',
                borderRadius: '8px',
                cursor: 'pointer',
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
          maxHeight: '400px',
          overflow: 'auto',
          fontSize: '13px',
          color: '#171717',
          lineHeight: '1.5',
        }}>
          {displayContent}
        </div>
        {/* Language switch toggle - aligned left, above footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #E5E5E5',
          display: 'flex',
          justifyContent: 'flex-start',
        }}>
          <button
            onClick={() => setModalLanguage(modalLanguage === 'zh' ? 'en' : 'zh')}
            aria-label={modalLanguage === 'zh' ? '切换到英文' : '切换到中文'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 0',
              width: '100px',
              background: '#E0F2FE',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#0369A1',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Languages style={{ width: 16, height: 16 }} />
            {modalLanguage === 'zh' ? 'English' : '中文'}
          </button>
        </div>
        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #E5E5E5',
          display: 'flex',
          gap: '12px',
        }}>
          {/* User prompt: Edit button; Resource prompt: Collect button */}
          {isUserPrompt ? (
            <button
              onClick={() => onEdit?.()}
              aria-label="编辑提示词"
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
              <Pencil style={{ width: 14, height: 14 }} />
              编辑
            </button>
          ) : (
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
          )}
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