/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Handles positioning, animation, and scroll behavior
 * Auto-adapts position to stay within viewport boundaries
 */

import { useEffect, useRef, useState } from 'react'
import type { Prompt, Category } from '../../shared/types'

interface DropdownContainerProps {
  prompts: Prompt[]
  categories: Category[]
  onSelect: (prompt: Prompt) => void
  isOpen: boolean
  selectedPromptId: string | null
  onAddPrompt: () => void
  onImport: () => void
}

interface DropdownPosition {
  expandUp: boolean  // true = expand upward from button top, false = expand downward from button bottom
  left: number
  maxHeight: number
}

/**
 * Calculate optimal dropdown position to stay within viewport
 * Priority: expand upward from trigger button, adjust if needed
 */
function calculateDropdownPosition(): DropdownPosition {
  // Dropdown dimensions
  const dropdownWidth = 280
  const dropdownMaxHeight = 320
  const gap = 4
  const padding = 8

  // Viewport dimensions
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Get host element (trigger button container) position
  const host = document.getElementById('lovart-injector-host')
  if (!host) {
    return { expandUp: true, left: 0, maxHeight: dropdownMaxHeight }
  }

  const hostRect = host.getBoundingClientRect()

  // Calculate horizontal position - stay within viewport
  let leftPos = 0  // Relative to host (left-aligned by default)

  // If dropdown would overflow right edge, shift left
  const absoluteRight = hostRect.left + dropdownWidth
  if (absoluteRight > viewportWidth - padding) {
    // Shift so right edge aligns with viewport right edge (relative to host)
    const overflow = absoluteRight - viewportWidth + padding
    leftPos = -overflow
  }

  // Ensure left edge doesn't go negative (absolute position)
  const absoluteLeft = hostRect.left + leftPos
  if (absoluteLeft < padding) {
    leftPos = padding - hostRect.left
  }

  // Calculate vertical position - prefer upward expansion
  const spaceAbove = hostRect.top - padding
  const spaceBelow = viewportHeight - hostRect.bottom - padding

  // Determine expansion direction and max height
  let expandUp = true
  let maxHeight = dropdownMaxHeight

  // If not enough space above, try below
  if (spaceAbove < dropdownMaxHeight + gap) {
    if (spaceBelow >= dropdownMaxHeight + gap) {
      // Expand below instead
      expandUp = false
      maxHeight = dropdownMaxHeight
    } else {
      // Both directions constrained - pick the larger space and limit height
      if (spaceAbove >= spaceBelow) {
        // Expand upward with limited height
        expandUp = true
        maxHeight = spaceAbove - gap
      } else {
        // Expand downward with limited height
        expandUp = false
        maxHeight = spaceBelow - gap
      }
    }
  }

  return { expandUp, left: leftPos, maxHeight: Math.max(maxHeight, 150) }
}

export function DropdownContainer({
  prompts,
  categories,
  onSelect,
  isOpen,
  selectedPromptId,
  onAddPrompt,
  onImport,
}: DropdownContainerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({
    expandUp: true,
    left: 0,
    maxHeight: 320,
  })

  // Calculate position when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const newPosition = calculateDropdownPosition()
      setPosition(newPosition)
    }
  }, [isOpen])

  // Recalculate on resize/scroll
  useEffect(() => {
    if (!isOpen) return

    const handleReposition = () => {
      setPosition(calculateDropdownPosition())
    }

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, { passive: true })

    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition)
    }
  }, [isOpen])

  if (!isOpen) return null

  /**
   * Truncate preview text to ~50 chars (D-06)
   */
  const truncatePreview = (content: string): string => {
    if (content.length <= 50) return content
    return content.substring(0, 50) + '...'
  }

  // Limit displayed prompts for large datasets
  const MAX_DISPLAY_PROMPTS = 100
  const displayPrompts = prompts.slice(0, MAX_DISPLAY_PROMPTS)
  const hasMore = prompts.length > MAX_DISPLAY_PROMPTS

  // Build dynamic style based on expansion direction
  // When expandUp=true: bottom aligned to button top (with gap), dropdown expands upward
  // When expandUp=false: top aligned to button bottom (with gap), dropdown expands downward
  const gap = 4
  const buttonHeight = 44
  const dropdownStyle: React.CSSProperties = {
    left: position.left,
    maxHeight: position.maxHeight,
    // expandUp: bottom = buttonHeight + gap (dropdown bottom sits just above button)
    // expandDown: top = buttonHeight + gap (dropdown top sits just below button)
    top: position.expandUp ? 'auto' : buttonHeight + gap,
    bottom: position.expandUp ? buttonHeight + gap : 'auto',
  }

  return (
    <div
      ref={dropdownRef}
      className="dropdown-container open"
      style={dropdownStyle}
    >
      {prompts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-message">暂无提示词</div>
          <div className="empty-subtext">点击浏览器工具栏图标打开管理面板</div>
          <div className="empty-state-actions">
            <button className="empty-state-btn" onClick={onAddPrompt}>
              新增提示词
            </button>
            <button className="empty-state-btn" onClick={onImport}>
              导入数据
            </button>
          </div>
        </div>
      ) : (
        <>
          {categories.map((category) => {
            const categoryPrompts = displayPrompts.filter(
              (p) => p.categoryId === category.id
            )

            if (categoryPrompts.length === 0) return null

            return (
              <div key={category.id} className="category-group">
                <div className="category-header">
                  {category.name} ({categoryPrompts.length})
                </div>
                {categoryPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className={`prompt-item${selectedPromptId === prompt.id ? ' selected' : ''}`}
                    onMouseDown={(e) => {
                      // CRITICAL: Prevent focus transfer to dropdown item
                      // This keeps the cursor position intact in the Lovart input
                      // onClick will still fire, but focus remains on the input
                      e.preventDefault()
                    }}
                    onClick={() => onSelect(prompt)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(prompt)
                      }
                    }}
                  >
                    <div className="prompt-name">{prompt.name}</div>
                    <div className="prompt-preview">
                      {truncatePreview(prompt.content)}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {hasMore && (
            <div className="more-prompts-hint">
              显示前{MAX_DISPLAY_PROMPTS}条，共 {prompts.length} 条提示词
            </div>
          )}
          <div className="dropdown-footer">
            <button className="dropdown-footer-btn" onClick={onImport}>
              导入
            </button>
            <button className="dropdown-footer-btn primary" onClick={onAddPrompt}>
              新增
            </button>
          </div>
        </>
      )}
    </div>
  )
}