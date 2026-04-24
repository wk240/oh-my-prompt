/**
 * NetworkPromptCard - Card component for displaying resource library prompts
 * 2-column grid layout with previewImage thumbnail
 * Features: collect button (bottom-right), inject button (bottom-right corner)
 * Hover preview: shows full image after 500ms delay, follows mouse cursor
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Bookmark } from 'lucide-react'
import type { ResourcePrompt } from '../../shared/types'
import { truncateText } from '../../shared/utils'
import { Tooltip } from './Tooltip'

interface NetworkPromptCardProps {
  prompt: ResourcePrompt
  onClick: () => void
  onInject?: () => void
  onCollect?: () => void
  isCollected?: boolean
}

// D-06: Fallback placeholder SVG for failed image loads
const FALLBACK_IMAGE_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"%3E%3Crect fill="%23f0f0f0" width="120" height="80"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="10" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E'

// Hover preview delay in milliseconds
const HOVER_PREVIEW_DELAY = 500

// Preview offset from mouse cursor (left-top direction)
const PREVIEW_OFFSET = 16

// Preview image max dimensions (1.5x larger for better visibility)
const PREVIEW_MAX_WIDTH = 720
const PREVIEW_MAX_HEIGHT = 480

export function NetworkPromptCard({ prompt, onClick, onInject, onCollect, isCollected = false }: NetworkPromptCardProps) {
  // Hover preview state
  const [showPreview, setShowPreview] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Handle mouse enter - start 500ms timer
  const handleMouseEnter = () => {
    if (prompt.previewImage) {
      hoverTimerRef.current = setTimeout(() => {
        setShowPreview(true)
      }, HOVER_PREVIEW_DELAY)
    }
  }

  // Handle mouse move - track position for preview positioning
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  // Handle mouse leave - cancel timer and hide preview
  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setShowPreview(false)
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
    }
  }, [])

  // Handle button clicks - stop propagation to prevent card click
  const handleInjectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onInject?.()
  }

  const handleCollectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCollect?.()
  }

  // Preview portal element - render to body to escape Shadow DOM/container constraints
  // Position: left-top of mouse cursor with offset gap
  // Auto-stick to top if preview would exceed viewport top boundary
  // Auto-stick to left if preview would exceed viewport left boundary

  // Calculate if preview top would exceed viewport
  // Preview height is approximately PREVIEW_MAX_HEIGHT + padding (32px)
  const previewHeight = PREVIEW_MAX_HEIGHT + 32 + 16 // max height + padding + extra
  const previewWidth = PREVIEW_MAX_WIDTH + 32 + 16 // max width + padding + extra
  const previewTopPosition = mousePos.y - PREVIEW_OFFSET - previewHeight
  const previewLeftPosition = mousePos.x - PREVIEW_OFFSET - previewWidth
  const shouldStickToTop = previewTopPosition < 0
  const shouldStickToLeft = previewLeftPosition < 0

  const previewElement = showPreview && prompt.previewImage ? (
    <div
      style={{
        position: 'fixed',
        // 左侧超出时：吸附到左侧边界；否则显示在鼠标左侧
        left: shouldStickToLeft ? PREVIEW_OFFSET : mousePos.x - PREVIEW_OFFSET,
        // 顶部超出时：吸附到顶部边界；否则显示在鼠标上方
        top: shouldStickToTop ? PREVIEW_OFFSET : mousePos.y - PREVIEW_OFFSET,
        // transform调整：左侧超出时只translateY；顶部超出时只translateX；都超出时不transform
        transform: shouldStickToLeft && shouldStickToTop
          ? 'none'
          : shouldStickToLeft
            ? 'translateY(-100%)'
            : shouldStickToTop
              ? 'translateX(-100%)'
              : 'translate(-100%, -100%)',
        zIndex: 2147483647, // Maximum z-index to ensure visibility
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
        src={prompt.previewImage}
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

  return (
    <div
      ref={cardRef}
      className="network-prompt-card"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        width: 'calc(50% - 6px)', // D-04: 2-column with 12px gap
        padding: '12px',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'background 0.15s, box-shadow 0.15s',
        boxSizing: 'border-box',
        position: 'relative', // For absolute positioned buttons
      }}
    >
      {/* Preview rendered via portal to document.body */}
      {previewElement && createPortal(previewElement, document.body)}
      {/* Collect button - bottom right, left of inject */}
      <Tooltip content={isCollected ? '已收藏' : '收藏'}>
        <button
          onClick={handleCollectClick}
          aria-label={isCollected ? '已收藏' : '收藏'}
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '40px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isCollected ? '#171717' : '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          <Bookmark style={{ width: 12, height: 12, color: isCollected ? '#ffffff' : '#171717', fill: isCollected ? '#171717' : 'none' }} />
        </button>
      </Tooltip>

      {/* Inject button - bottom right corner */}
      <Tooltip content="一键注入">
        <button
          onClick={handleInjectClick}
          aria-label="一键注入"
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '1px solid #E5E5E5',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
        >
          <ArrowUpRight style={{ width: 12, height: 12, color: '#171717' }} />
        </button>
      </Tooltip>

      {/* D-04: Thumbnail (120x80px per UI-SPEC) */}
      {prompt.previewImage && (
        <img
          src={prompt.previewImage}
          alt={prompt.name}
          style={{
            width: '100%',
            height: '80px',
            objectFit: 'cover',
            borderRadius: '6px',
          }}
          onError={(e) => {
            // D-06: Fallback placeholder on load error
            e.currentTarget.src = FALLBACK_IMAGE_SVG
          }}
        />
      )}
      {/* D-04: Name with tooltip */}
      <Tooltip content={prompt.name}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#171717', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncateText(prompt.name, 30)}
        </div>
      </Tooltip>
      {/* D-04: ProviderCategory tag with tooltip */}
      <Tooltip content={prompt.description || prompt.content}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: '#64748B',
            marginTop: '4px',
            padding: '4px 8px',
            background: '#f0f0f0',
            borderRadius: '4px',
            display: 'inline-block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {prompt.sourceCategory || 'Unknown'}
        </div>
      </Tooltip>
      {/* Author attribution */}
      {prompt.author && (
        <a
          href={prompt.authorUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: '#737373',
            marginTop: '4px',
            display: 'block',
            textDecoration: 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          by {prompt.author}
        </a>
      )}
    </div>
  )
}