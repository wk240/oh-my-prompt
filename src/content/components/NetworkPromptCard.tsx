/**
 * NetworkPromptCard - Card component for displaying resource library prompts
 * 2-column grid layout with previewImage thumbnail
 */

import type { ResourcePrompt } from '../../shared/types'
import { truncateText } from '../../shared/utils'
import { Tooltip } from './Tooltip'

interface NetworkPromptCardProps {
  prompt: ResourcePrompt
  onClick: () => void
}

// D-06: Fallback placeholder SVG for failed image loads
const FALLBACK_IMAGE_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"%3E%3Crect fill="%23f0f0f0" width="120" height="80"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="10" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E'

export function NetworkPromptCard({ prompt, onClick }: NetworkPromptCardProps) {
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
      }}
    >
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
    </div>
  )
}