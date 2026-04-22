/**
 * NetworkPromptCard - Card component for displaying resource library prompts
 * 2-column grid layout with previewImage thumbnail
 * Features: collect button (bottom-right), inject button (bottom-right corner)
 */

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

export function NetworkPromptCard({ prompt, onClick, onInject, onCollect, isCollected = false }: NetworkPromptCardProps) {
  // Handle button clicks - stop propagation to prevent card click
  const handleInjectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onInject?.()
  }

  const handleCollectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCollect?.()
  }

  return (
    <div
      className="network-prompt-card"
      onClick={onClick}
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