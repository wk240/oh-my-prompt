/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Uses React Portal to render to document.body, escaping overflow:hidden
 * Positioned above the trigger button, right-aligned
 */

import { useRef, useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageType } from '../../shared/messages'
import type { Prompt, Category } from '../../shared/types'
import { Sparkles, Palette, Shapes, ArrowUpRight, X, ChevronDown, FolderOpen, Settings } from 'lucide-react'

interface DropdownContainerProps {
  prompts: Prompt[]
  onSelect: (prompt: Prompt) => void
  isOpen: boolean
  selectedPromptId: string | null
  onClose?: () => void
}

interface DropdownPosition {
  top: number
  right: number
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
      width: 360px;
      max-height: 400px;
      overflow-y: auto;
      overflow-x: hidden;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      padding: 16px;
      box-sizing: border-box;
      z-index: 2147483647;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #${PORTAL_ID} .dropdown-items {
      display: flex;
      flex-direction: column;
    }

    #${PORTAL_ID} .dropdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid #E5E5E5;
      margin-bottom: 12px;
    }

    #${PORTAL_ID} .dropdown-header-left {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 0;
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
      border: 1px solid #171717;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
      color: #171717;
    }

    #${PORTAL_ID} .dropdown-settings:hover,
    #${PORTAL_ID} .dropdown-close:hover {
      background: #f8f8f8;
    }

    #${PORTAL_ID} .category-selector {
      position: relative;
      display: flex;
      align-items: center;
    }

    #${PORTAL_ID} .category-selector-button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: #f8f8f8;
      border: 1px solid #E5E5E5;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      color: #171717;
      transition: background 0.15s ease, border-color 0.15s ease;
      white-space: nowrap;
    }

    #${PORTAL_ID} .category-selector-button:hover {
      background: #f0f0f0;
      border-color: #d0d0d0;
    }

    #${PORTAL_ID} .category-icon {
      color: #64748B;
      width: 12px;
      height: 12px;
    }

    #${PORTAL_ID} .category-name {
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${PORTAL_ID} .category-chevron {
      color: #64748B;
      width: 12px;
      height: 12px;
      transition: transform 0.15s ease;
    }

    #${PORTAL_ID} .category-chevron.open {
      transform: rotate(180deg);
    }

    #${PORTAL_ID} .category-menu {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      min-width: 120px;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      z-index: 1000;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #${PORTAL_ID} .category-menu-item {
      display: block;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      border-radius: 4px;
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: #171717;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;
    }

    #${PORTAL_ID} .category-menu-item:hover {
      background: #f8f8f8;
    }

    #${PORTAL_ID} .category-menu-item.selected {
      background: #fef3e2;
      color: #A16207;
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

    #${PORTAL_ID} .dropdown-container::-webkit-scrollbar {
      width: 6px;
    }

    #${PORTAL_ID} .dropdown-container::-webkit-scrollbar-track {
      background: transparent;
    }

    #${PORTAL_ID} .dropdown-container::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    #${PORTAL_ID} .dropdown-container::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }
  `
}

export function DropdownContainer({
  prompts,
  onSelect,
  isOpen,
  selectedPromptId,
  onClose,
}: DropdownContainerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, right: 0 })
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false)
  const categoryMenuRef = useRef<HTMLDivElement>(null)

  const dropdownGap = 8

  // Calculate position relative to trigger button
  useEffect(() => {
    if (!isOpen) return

    const calculatePosition = () => {
      const hostElement = document.querySelector('[data-testid="prompt-script-trigger"]')
      if (!hostElement) return

      const rect = hostElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth

      // Position dropdown above the button, right-aligned
      const rightPos = viewportWidth - rect.right
      const topPos = rect.top - dropdownGap

      setPosition({ top: topPos, right: rightPos })
    }

    calculatePosition()

    const handleReposition = () => calculatePosition()
    window.addEventListener('scroll', handleReposition, { passive: true })
    window.addEventListener('resize', handleReposition)

    return () => {
      window.removeEventListener('scroll', handleReposition)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, dropdownGap])

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

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) || categories[0]

  const dropdownStyle: React.CSSProperties = {
    top: position.top,
    right: position.right,
    transform: 'translateY(-100%)',
  }

  // Open settings page via background worker (bypasses ad blockers)
  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: MessageType.OPEN_SETTINGS })
    onClose?.()
  }

  return createPortal(
    <div
      ref={dropdownRef}
      className="dropdown-container"
      style={dropdownStyle}
    >
      {/* Header with Category Selector */}
      <div className="dropdown-header">
        <div className="dropdown-header-left">
          <span className="dropdown-header-title">PROMPTS</span>
          <div className="category-selector" ref={categoryMenuRef}>
            <button
              className="category-selector-button"
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              aria-label="选择分类"
            >
              <FolderOpen className="category-icon" />
              <span className="category-name">{selectedCategory.name}</span>
              <ChevronDown className={`category-chevron ${isCategoryMenuOpen ? 'open' : ''}`} />
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
        <div className="dropdown-header-actions">
          <button
            className="dropdown-settings"
            onClick={handleOpenSettings}
            aria-label="设置"
          >
            <Settings style={{ width: 12, height: 12 }} />
          </button>
          <button
            className="dropdown-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X style={{ width: 12, height: 12 }} />
          </button>
        </div>
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
    </div>,
    getPortalContainer()
  )
}