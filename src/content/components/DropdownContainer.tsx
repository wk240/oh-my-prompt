/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Auto-adapts position to stay within viewport boundaries
 * Dropdown appears to the LEFT of the trigger button
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import type { Prompt, Category } from '../../shared/types'
import { Sparkles, Palette, Shapes, ArrowUpRight, X, ChevronDown, FolderOpen } from 'lucide-react'

interface DropdownContainerProps {
  prompts: Prompt[]
  onSelect: (prompt: Prompt) => void
  isOpen: boolean
  selectedPromptId: string | null
  onClose?: () => void
}

interface DropdownPosition {
  expandUp: boolean
  left: number
  maxHeight: number
}

// Dropdown appears to the LEFT of the trigger button
// So left = -dropdownWidth - gap (negative to move left)
function calculateDropdownPosition(dropdownWidth: number): DropdownPosition {
  const dropdownMaxHeight = 320
  const gap = 8
  const padding = 8

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const host = document.getElementById('lovart-injector-host')
  if (!host) {
    return { expandUp: false, left: 0, maxHeight: dropdownMaxHeight }
  }

  const hostRect = host.getBoundingClientRect()

  // Position dropdown to the LEFT of the button
  // dropdown right edge aligns with button left edge
  let leftPos = -(dropdownWidth + gap)

  // Check if dropdown would overflow left edge of viewport
  const absoluteLeft = hostRect.left + leftPos
  if (absoluteLeft < padding) {
    // Not enough space on left, position to the RIGHT of button instead
    leftPos = hostRect.width + gap

    // Check if it would overflow right edge
    const absoluteRight = hostRect.left + leftPos + dropdownWidth
    if (absoluteRight > viewportWidth - padding) {
      // Not enough space on either side, center and limit width
      leftPos = Math.max(padding - hostRect.left, -(dropdownWidth + gap))
    }
  }

  const spaceAbove = hostRect.top - padding
  const spaceBelow = viewportHeight - hostRect.bottom - padding

  let expandUp = false
  let maxHeight = dropdownMaxHeight

  // Prefer expanding down, but check space
  if (spaceBelow >= dropdownMaxHeight + gap) {
    expandUp = false
    maxHeight = dropdownMaxHeight
  } else if (spaceAbove >= dropdownMaxHeight + gap) {
    expandUp = true
    maxHeight = dropdownMaxHeight
  } else {
    // Not enough space in either direction, use the larger space
    if (spaceAbove >= spaceBelow) {
      expandUp = true
      maxHeight = Math.min(spaceAbove - gap, dropdownMaxHeight)
    } else {
      expandUp = false
      maxHeight = Math.min(spaceBelow - gap, dropdownMaxHeight)
    }
  }

  return { expandUp, left: leftPos, maxHeight: Math.max(maxHeight, 200) }
}

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  design: Sparkles,
  style: Palette,
  default: Shapes,
}

// Default categories
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'all', name: '全部分类', order: 0 },
  { id: 'design', name: '设计', order: 1 },
  { id: 'style', name: '风格', order: 2 },
  { id: 'other', name: '其他', order: 3 },
]

export function DropdownContainer({
  prompts,
  onSelect,
  isOpen,
  selectedPromptId,
  onClose,
}: DropdownContainerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({
    expandUp: false,
    left: 0,
    maxHeight: 320,
  })
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false)
  const categoryMenuRef = useRef<HTMLDivElement>(null)

  const dropdownWidth = 360

  // Get categories from prompts or use defaults
  const categories = useMemo(() => {
    const uniqueCategoryIds = [...new Set(prompts.map((p) => p.categoryId))]
    const cats: Category[] = [{ id: 'all', name: '全部分类', order: 0 }]
    uniqueCategoryIds.forEach((catId) => {
      const existing = DEFAULT_CATEGORIES.find((c) => c.id === catId)
      cats.push(existing || { id: catId, name: catId, order: 99 })
    })
    return cats
  }, [prompts])

  // Filter prompts by selected category
  const filteredPrompts = useMemo(() => {
    if (selectedCategoryId === 'all') return prompts
    return prompts.filter((p) => p.categoryId === selectedCategoryId)
  }, [prompts, selectedCategoryId])

  useEffect(() => {
    if (isOpen) {
      const newPosition = calculateDropdownPosition(dropdownWidth)
      setPosition(newPosition)
    }
  }, [isOpen, dropdownWidth])

  useEffect(() => {
    if (!isOpen) return

    const handleReposition = () => {
      setPosition(calculateDropdownPosition(dropdownWidth))
    }

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, { passive: true })

    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition)
    }
  }, [isOpen, dropdownWidth])

  // Close category menu when clicking outside
  useEffect(() => {
    if (!isCategoryMenuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setIsCategoryMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isCategoryMenuOpen])

  if (!isOpen) return null

  const truncatePreview = (content: string): string => {
    if (content.length <= 40) return content
    return content.substring(0, 40) + '...'
  }

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) || categories[0]

  const gap = 8
  const buttonHeight = 48
  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.left,
    maxHeight: position.maxHeight,
    width: dropdownWidth,
    top: position.expandUp ? 'auto' : buttonHeight + gap,
    bottom: position.expandUp ? buttonHeight + gap : 'auto',
  }

  return (
    <div
      ref={dropdownRef}
      className="dropdown-container open"
      style={dropdownStyle}
    >
      {/* Header with Category Selector */}
      <div className="dropdown-header">
        <div className="dropdown-header-left">
          <span className="dropdown-header-title">PROMPTS</span>
          {/* Category Selector */}
          <div className="category-selector" ref={categoryMenuRef}>
            <button
              className="category-selector-button"
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              aria-label="选择分类"
            >
              <FolderOpen className="category-icon w-3 h-3" />
              <span className="category-name">{selectedCategory.name}</span>
              <ChevronDown className={`category-chevron w-3 h-3 ${isCategoryMenuOpen ? 'open' : ''}`} />
            </button>
            {isCategoryMenuOpen && (
              <div className="category-menu">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`category-menu-item ${selectedCategoryId === category.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedCategoryId(category.id)
                      setIsCategoryMenuOpen(false)
                    }}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          className="dropdown-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Prompt Items */}
      {filteredPrompts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-message">
            {selectedCategoryId === 'all' ? '暂无提示词' : '该分类暂无提示词'}
          </div>
        </div>
      ) : (
        <div className="dropdown-items">
          {filteredPrompts.map((prompt, index) => {
            const IconComponent = ICON_MAP[prompt.categoryId === 'design' ? 'design' : prompt.categoryId === 'style' ? 'style' : 'default']

            return (
              <div
                key={prompt.id}
                className={`dropdown-item${selectedPromptId === prompt.id ? ' selected' : ''}${index === filteredPrompts.length - 1 ? ' last' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
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
                <IconComponent className="dropdown-item-icon w-4 h-4" />
                <div className="dropdown-item-text">
                  <span className="dropdown-item-name">{prompt.name}</span>
                  <span className="dropdown-item-preview">{truncatePreview(prompt.content)}</span>
                </div>
                <ArrowUpRight className="dropdown-item-arrow w-3 h-3" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}