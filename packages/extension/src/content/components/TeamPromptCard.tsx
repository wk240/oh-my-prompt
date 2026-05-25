/**
 * TeamPromptCard - Card component for displaying team library prompts
 * Compact layout similar to NetworkPromptCard, with save/copy/inject actions
 */

import { ArrowUpRight, Bookmark, Copy } from 'lucide-react'
import type { TeamPrompt } from '@oh-my-prompt/shared/types'
import { truncateText } from '@oh-my-prompt/shared/utils'
import { Tooltip } from './Tooltip'

interface TeamPromptCardProps {
  prompt: TeamPrompt
  onClick: () => void        // Preview in modal
  onInject?: () => void      // Insert to input
  onSave?: () => void        // Save to personal library
  onCopy?: () => void        // Copy to clipboard
  language?: 'zh' | 'en'
}

export function TeamPromptCard({
  prompt,
  onClick,
  onInject,
  onSave,
  onCopy,
  language = 'zh'
}: TeamPromptCardProps) {
  const displayName = language === 'en' && prompt.nameEn ? prompt.nameEn : prompt.name
  const displayDescription = language === 'en' && prompt.descriptionEn ? prompt.descriptionEn : prompt.description

  return (
    <div
      className="team-prompt-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {/* Name */}
      <Tooltip content={displayName}>
        <div className="team-prompt-card-name">
          {truncateText(displayName, 30)}
        </div>
      </Tooltip>

      {/* Description tag */}
      <Tooltip content={displayDescription || prompt.content}>
        <div className="team-prompt-card-category">
          {truncateText(displayDescription || prompt.content, 30)}
        </div>
      </Tooltip>

      {/* Team name source */}
      {prompt.teamName && (
        <div className="team-prompt-card-source">
          来自: {prompt.teamName}
        </div>
      )}

      {/* Action buttons */}
      <div className="team-prompt-card-actions">
        <Tooltip content="保存到个人库">
          <button
            className="team-prompt-card-btn save"
            onClick={(e) => { e.stopPropagation(); onSave?.() }}
            aria-label="保存到个人库"
          >
            <Bookmark style={{ width: 12, height: 12 }} />
          </button>
        </Tooltip>

        <Tooltip content="复制">
          <button
            className="team-prompt-card-btn"
            onClick={(e) => { e.stopPropagation(); onCopy?.() }}
            aria-label="复制"
          >
            <Copy style={{ width: 12, height: 12 }} />
          </button>
        </Tooltip>

        <Tooltip content="一键注入">
          <button
            className="team-prompt-card-btn"
            onClick={(e) => { e.stopPropagation(); onInject?.() }}
            aria-label="一键注入"
          >
            <ArrowUpRight style={{ width: 12, height: 12 }} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}