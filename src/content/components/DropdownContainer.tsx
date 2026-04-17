/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Uses React Portal to render to document.body, escaping overflow:hidden
 * Positioned above the trigger button, right-aligned
 */

import { useRef, useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageType } from '../../shared/messages'
import type { Prompt, Category } from '../../shared/types'
import { Sparkles, Palette, Shapes, ArrowUpRight, X, Settings, FolderOpen, Layers, Sparkle, Brush } from 'lucide-react'

interface DropdownContainerProps {
  prompts: Prompt[]
  categories: Category[]
  onSelect: (prompt: Prompt) => void
  isOpen: boolean
  selectedPromptId: string | null
  onClose?: () => void
  isLoading?: boolean
}

interface DropdownPosition {
  top: number
  right: number
  isStickyTop: boolean // 是否吸顶模式
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

// Portal container ID
const PORTAL_ID = 'prompt-script-dropdown-portal'

// Get or create portal container with styles
function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID

    // Inject styles for dropdown (since we're rendering outside Shadow DOM)
    const style = document.createElement('style')
    style.id = 'prompt-script-dropdown-styles'
    style.textContent = getDropdownStyles()
    document.head.appendChild(style)

    document.body.appendChild(container)
  }
  return container
}

// Dropdown styles (inline for portal - renders outside Shadow DOM)
function getDropdownStyles(): string {
  return `
    #${PORTAL_ID} .dropdown-container {
      position: fixed;
      width: 480px;
      max-height: 600px;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      box-sizing: border-box;
      z-index: 2147483647;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
    }

    #${PORTAL_ID} .dropdown-sidebar {
      width: 120px;
      background: #f8f8f8;
      border-right: 1px solid #E5E5E5;
      display: flex;
      flex-direction: column;
      padding: 12px 0;
      border-radius: 12px 0 0 12px;
    }

    #${PORTAL_ID} .sidebar-categories {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }

    #${PORTAL_ID} .sidebar-category-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: transparent;
      border: none;
      border-radius: 0;
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: #171717;
      cursor: pointer;
      transition: background 0.15s ease;
      width: 100%;
      overflow: hidden;
    }

    #${PORTAL_ID} .sidebar-category-item span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    #${PORTAL_ID} .sidebar-category-item:hover {
      background: #f0f0f0;
    }

    #${PORTAL_ID} .sidebar-category-item.selected {
      background: #ffffff;
      color: #A16207;
      border-left: 2px solid #A16207;
    }

    #${PORTAL_ID} .sidebar-category-icon {
      width: 14px;
      height: 14px;
      color: #64748B;
    }

    #${PORTAL_ID} .sidebar-category-item.selected .sidebar-category-icon {
      color: #A16207;
    }

    #${PORTAL_ID} .dropdown-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 0 12px 12px 0;
    }

    #${PORTAL_ID} .dropdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #E5E5E5;
    }

    #${PORTAL_ID} .dropdown-header-title {
      font-size: 10px;
      font-weight: 600;
      color: #64748B;
      letter-spacing: 1px;
    }

    #${PORTAL_ID} .dropdown-header-actions {
      display: flex;
      gap: 8px;
    }

    #${PORTAL_ID} .dropdown-settings,
    #${PORTAL_ID} .dropdown-close {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
      color: #171717;
    }

    #${PORTAL_ID} .dropdown-settings:hover,
    #${PORTAL_ID} .dropdown-close:hover {
      background: #f8f8f8;
    }

    #${PORTAL_ID} .dropdown-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }

    #${PORTAL_ID} .dropdown-items {
      display: flex;
      flex-direction: column;
    }

    #${PORTAL_ID} .dropdown-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #E5E5E5;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    #${PORTAL_ID} .dropdown-item:hover {
      background: #f8f8f8;
    }

    #${PORTAL_ID} .dropdown-item.last {
      border-bottom: none;
    }

    #${PORTAL_ID} .dropdown-item.selected {
      background: #fef3e2;
    }

    #${PORTAL_ID} .dropdown-item-icon {
      width: 16px;
      height: 16px;
      color: #171717;
    }

    #${PORTAL_ID} .dropdown-item-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #${PORTAL_ID} .dropdown-item-name {
      font-size: 12px;
      font-weight: 500;
      color: #171717;
    }

    #${PORTAL_ID} .dropdown-item-preview {
      font-size: 10px;
      color: #64748B;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${PORTAL_ID} .dropdown-item-arrow {
      width: 12px;
      height: 12px;
      color: #171717;
    }

    #${PORTAL_ID} .empty-state {
      padding: 24px;
      text-align: center;
    }

    #${PORTAL_ID} .empty-message {
      font-size: 12px;
      color: #64748B;
    }

    #${PORTAL_ID} .dropdown-content::-webkit-scrollbar,
    #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar {
      width: 6px;
    }

    #${PORTAL_ID} .dropdown-content::-webkit-scrollbar-track,
    #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar-track {
      background: transparent;
    }

    #${PORTAL_ID} .dropdown-content::-webkit-scrollbar-thumb,
    #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    #${PORTAL_ID} .dropdown-content::-webkit-scrollbar-thumb:hover,
    #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}

// Category icon mapping for sidebar
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  all: FolderOpen,
  design: Sparkle,
  style: Brush,
  other: Layers,
}

export function DropdownContainer({
  prompts,
  categories: propCategories,
  onSelect,
  isOpen,
  selectedPromptId,
  onClose,
  isLoading = false,
}: DropdownContainerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, right: 0, isStickyTop: false })
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')

  const dropdownGap = 8
  const dropdownMaxHeight = 600

  // Calculate position relative to trigger button with viewport boundary check
  useEffect(() => {
    if (!isOpen) return

    const calculatePosition = () => {
      const hostElement = document.querySelector('[data-testid="prompt-script-trigger"]')
      if (!hostElement) return

      const rect = hostElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth

      // Position dropdown above the button, right edge aligned to button's left edge
      const rightPos = viewportWidth - rect.left
      const preferredTopPos = rect.top - dropdownGap

      // Check if dropdown would exceed viewport top when positioned above button
      // Dropdown height is max 600px, translateY(-100%) means bottom of dropdown at preferredTopPos
      const dropdownBottom = preferredTopPos
      const dropdownTop = dropdownBottom - dropdownMaxHeight

      // If dropdown top would be above viewport top, use sticky top positioning
      const isStickyTop = dropdownTop < 0

      setPosition({
        top: isStickyTop ? 0 : preferredTopPos,
        right: rightPos,
        isStickyTop
      })
    }

    calculatePosition()

    const handleReposition = () => calculatePosition()
    window.addEventListener('scroll', handleReposition, { passive: true })
    window.addEventListener('resize', handleReposition)

    return () => {
      window.removeEventListener('scroll', handleReposition)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, dropdownGap, dropdownMaxHeight])

  // Use passed categories or fallback to default logic
  const categories = useMemo(() => {
    const allCategory: Category = { id: 'all', name: '全部分类', order: 0 }
    if (propCategories.length > 0) {
      return [allCategory, ...propCategories.sort((a, b) => a.order - b.order)]
    }
    // Fallback: infer from prompts if no categories passed
    const uniqueCategoryIds = [...new Set(prompts.map((p) => p.categoryId))]
    const cats: Category[] = [allCategory]
    uniqueCategoryIds.forEach((catId) => {
      const existing = DEFAULT_CATEGORIES.find((c) => c.id === catId)
      cats.push(existing || { id: catId, name: catId, order: 99 })
    })
    return cats
  }, [propCategories, prompts])

  // Filter prompts by selected category
  const filteredPrompts = useMemo(() => {
    if (selectedCategoryId === 'all') return prompts
    return prompts.filter((p) => p.categoryId === selectedCategoryId)
  }, [prompts, selectedCategoryId])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const hostElement = document.querySelector('[data-testid="prompt-script-trigger"]')
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          hostElement && !hostElement.contains(e.target as Node)) {
        onClose?.()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const truncatePreview = (content: string): string => {
    if (content.length <= 40) return content
    return content.substring(0, 40) + '...'
  }

  const dropdownStyle: React.CSSProperties = {
    top: position.top,
    right: position.right,
    // Only translateY(-100%) when not sticky at top (normal positioning above button)
    transform: position.isStickyTop ? 'none' : 'translateY(-100%)',
  }

  // Open settings page via background worker (bypasses ad blockers)
  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: MessageType.OPEN_SETTINGS })
    onClose?.()
  }

  // Get category icon
  const getCategoryIcon = (categoryId: string) => {
    return CATEGORY_ICON_MAP[categoryId] || Layers
  }

  return createPortal(
    <div
      ref={dropdownRef}
      className="dropdown-container"
      style={dropdownStyle}
    >
      {/* Left Sidebar - Categories */}
      <div className="dropdown-sidebar">
        <div className="sidebar-categories">
          {categories.map((category) => {
            const IconComponent = getCategoryIcon(category.id)
            return (
              <button
                key={category.id}
                className={`sidebar-category-item ${selectedCategoryId === category.id ? 'selected' : ''}`}
                onClick={() => setSelectedCategoryId(category.id)}
                aria-label={category.name}
              >
                <IconComponent className="sidebar-category-icon" />
                <span>{category.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="dropdown-main">
        {/* Header */}
        <div className="dropdown-header">
          <span className="dropdown-header-title">PROMPTS</span>
          <div className="dropdown-header-actions">
            <button
              className="dropdown-settings"
              onClick={handleOpenSettings}
              aria-label="设置"
            >
              <Settings style={{ width: 14, height: 14 }} />
            </button>
            <button
              className="dropdown-close"
              onClick={onClose}
              aria-label="关闭"
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="dropdown-content">
          {isLoading ? (
            <div className="empty-state">
              <div className="empty-message">加载中...</div>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-message">
                {selectedCategoryId === 'all' ? '暂无提示词，请点击设置添加' : '该分类暂无提示词'}
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
                    <IconComponent className="dropdown-item-icon" />
                    <div className="dropdown-item-text">
                      <span className="dropdown-item-name">{prompt.name}</span>
                      <span className="dropdown-item-preview">{truncatePreview(prompt.content)}</span>
                    </div>
                    <ArrowUpRight className="dropdown-item-arrow" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    getPortalContainer()
  )
}