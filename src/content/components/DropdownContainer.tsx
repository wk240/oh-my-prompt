/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Uses React Portal to render to document.body, escaping overflow:hidden
 * Positioned above the trigger button, right-aligned
 */

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Prompt, Category } from '../../shared/types'
import type { ResourcePrompt, ResourceCategory } from '../../shared/types'
import { truncateText, sortCategoriesByOrder, sortPromptsByOrder, sortProviderCategoriesByOrder } from '../../shared/utils'
import { Sparkles, Palette, Shapes, ArrowUpRight, X, Settings, FolderOpen, Layers, Sparkle, Brush, GripVertical, Database, ArrowLeft } from 'lucide-react'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { NetworkPromptCard } from './NetworkPromptCard'
import { ProviderCategoryItem } from './ProviderCategoryItem'
import { LoadMoreButton } from './LoadMoreButton'
import { PromptPreviewModal } from './PromptPreviewModal'
import { CategorySelectDialog } from './CategorySelectDialog'
import { ToastNotification } from './ToastNotification'
import { usePromptStore } from '../../lib/store'
import { getResourcePrompts, getResourceCategories } from '../../lib/resource-library'

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
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #171717;
    }

    #${PORTAL_ID} .dropdown-header-logo {
      width: 16px;
      height: 16px;
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
      justify: center;
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

    #${PORTAL_ID} .dropdown-item-drag-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify: center;
      cursor: grab;
      color: #64748B;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 100;
      pointer-events: auto;
      background: #ffffff;
      border-radius: 3px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    #${PORTAL_ID} .dropdown-item:hover .dropdown-item-drag-handle,
    #${PORTAL_ID} .dropdown-item-drag-handle:hover {
      opacity: 1;
      visibility: visible;
    }

    #${PORTAL_ID} .dropdown-item-drag-handle:active {
      cursor: grabbing;
    }

    #${PORTAL_ID} .dropdown-item.dragging {
      opacity: 0.5;
      background: #f8f8f8;
    }

    #${PORTAL_ID} .dropdown-item-icon-wrapper {
      position: relative;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify: center;
      flex-shrink: 0;
    }

    #${PORTAL_ID} .dropdown-item-icon {
      width: 16px;
      height: 16px;
      color: #171717;
      transition: opacity 0.15s ease;
    }

    #${PORTAL_ID} .dropdown-item:hover .dropdown-item-icon {
      opacity: 0;
    }

    #${PORTAL_ID} .sidebar-category-drag-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify: center;
      cursor: grab;
      color: #64748B;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 100;
      pointer-events: auto;
      background: #f8f8f8;
      border-radius: 3px;
    }

    #${PORTAL_ID} .sidebar-category-item:hover .sidebar-category-drag-handle,
    #${PORTAL_ID} .sidebar-category-drag-handle:hover {
      opacity: 1;
      visibility: visible;
    }

    #${PORTAL_ID} .sidebar-category-drag-handle:active {
      cursor: grabbing;
    }

    #${PORTAL_ID} .sidebar-category-icon-wrapper {
      position: relative;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify: center;
      flex-shrink: 0;
    }

    #${PORTAL_ID} .sidebar-category-icon {
      width: 14px;
      height: 14px;
      color: #64748B;
      transition: opacity 0.15s ease;
    }

    #${PORTAL_ID} .sidebar-category-item.selected .sidebar-category-icon {
      color: #A16207;
    }

    #${PORTAL_ID} .sidebar-category-item:hover .sidebar-category-icon {
      opacity: 0;
    }

    /* Resource library styles */

    #${PORTAL_ID} .network-prompt-cards-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    #${PORTAL_ID} .network-prompt-card:hover {
      background: #f8f8f8;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }

    #${PORTAL_ID} .network-prompt-card:focus {
      outline: 2px solid #A16207;
      outline-offset: 2px;
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

// Sortable category item component
function SortableCategoryItem({
  category,
  isSelected,
  onSelect,
  showDragHandle,
  IconComponent,
}: {
  category: Category
  isSelected: boolean
  onSelect: (categoryId: string) => void
  showDragHandle: boolean
  IconComponent: React.ComponentType<{ className?: string }>
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sidebar-category-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(category.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(category.id)
        }
      }}
    >
      <div className="sidebar-category-icon-wrapper">
        {showDragHandle && (
          <div className="sidebar-category-drag-handle" {...attributes} {...listeners}>
            <GripVertical style={{ width: 12, height: 12 }} />
          </div>
        )}
        <IconComponent className="sidebar-category-icon" />
      </div>
      <span>{category.name}</span>
    </div>
  )
}

// Sortable dropdown item component
function SortableDropdownItem({
  prompt,
  isLast,
  isSelected,
  onSelect,
  showDragHandle,
}: {
  prompt: Prompt
  isLast: boolean
  isSelected: boolean
  onSelect: (prompt: Prompt) => void
  showDragHandle: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prompt.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const IconComponent = ICON_MAP[prompt.categoryId === 'design' ? 'design' : prompt.categoryId === 'style' ? 'style' : 'default']

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`dropdown-item${isSelected ? ' selected' : ''}${isLast ? ' last' : ''}${isDragging ? ' dragging' : ''}`}
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
      <div className="dropdown-item-icon-wrapper">
        {showDragHandle && (
          <div className="dropdown-item-drag-handle" {...attributes} {...listeners}>
            <GripVertical style={{ width: 12, height: 12 }} />
          </div>
        )}
        <IconComponent className="dropdown-item-icon" />
      </div>
      <div className="dropdown-item-text">
        <span className="dropdown-item-name">{prompt.name}</span>
        <span className="dropdown-item-preview">{truncateText(prompt.content, 40)}</span>
      </div>
      <ArrowUpRight className="dropdown-item-arrow" />
    </div>
  )
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
  const [localPrompts, setLocalPrompts] = useState<Prompt[]>([])
  const [localCategories, setLocalCategories] = useState<Category[]>([])

  // Resource library state (loaded from local JSON)
  const [isResourceLibrary, setIsResourceLibrary] = useState(false)
  const [resourcePrompts] = useState<ResourcePrompt[]>(getResourcePrompts())
  const [resourceCategories] = useState<ResourceCategory[]>(getResourceCategories())
  const [selectedResourceCategoryId, setSelectedResourceCategoryId] = useState<string>('all')
  const [loadedCount, setLoadedCount] = useState(50)

  // Modal state for prompt preview
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedResourcePrompt, setSelectedResourcePrompt] = useState<ResourcePrompt | null>(null)

  // Category select dialog state
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Handle collect confirmation
  const handleConfirmCollect = useCallback((categoryId: string, newCategoryName?: string) => {
    if (!selectedResourcePrompt) return

    let targetCategoryId = categoryId

    if (newCategoryName && newCategoryName.trim()) {
      usePromptStore.getState().addCategory(newCategoryName.trim())
      const storeCategories = usePromptStore.getState().categories
      const newCategory = storeCategories.find(c => c.name === newCategoryName.trim())
      if (newCategory) {
        targetCategoryId = newCategory.id
      }
    }

    if (!targetCategoryId) {
      console.error('[Prompt-Script] No target category for collect')
      return
    }

    const localPrompt: Omit<Prompt, 'id'> = {
      name: selectedResourcePrompt.name,
      content: selectedResourcePrompt.content,
      categoryId: targetCategoryId,
      description: selectedResourcePrompt.description,
      order: 0,
    }

    usePromptStore.getState().addPrompt(localPrompt)

    const categoryName = usePromptStore.getState().categories.find(c => c.id === targetCategoryId)?.name || '未知分类'
    setToastMessage(`已收藏到 ${categoryName}`)
    setIsCategoryDialogOpen(false)
    setIsModalOpen(false)
    setSelectedResourcePrompt(null)
  }, [selectedResourcePrompt])

  const dropdownGap = 8
  const dropdownMaxHeight = 600

  // Sync local prompts with props
  useEffect(() => {
    setLocalPrompts(prompts)
  }, [prompts])

  // Sync local categories with props
  useEffect(() => {
    setLocalCategories(propCategories)
  }, [propCategories])

  // Calculate position relative to trigger button
  useEffect(() => {
    if (!isOpen) return

    const calculatePosition = () => {
      const hostElement = document.querySelector('[data-testid="prompt-script-trigger"]')
      if (!hostElement) return

      const rect = hostElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth

      const rightPos = viewportWidth - rect.left
      const preferredTopPos = rect.top - dropdownGap

      const dropdownBottom = preferredTopPos
      const dropdownTop = dropdownBottom - dropdownMaxHeight

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
    if (localCategories.length > 0) {
      return [allCategory, ...sortCategoriesByOrder(localCategories)]
    }
    const uniqueCategoryIds = [...new Set(prompts.map((p) => p.categoryId))]
    const cats: Category[] = [allCategory]
    uniqueCategoryIds.forEach((catId) => {
      const existing = DEFAULT_CATEGORIES.find((c) => c.id === catId)
      cats.push(existing || { id: catId, name: catId, order: 999 })
    })
    return cats
  }, [localCategories, prompts])

  // Sortable categories (excluding 'all')
  const sortableCategories = useMemo(() => {
    return categories.filter(c => c.id !== 'all')
  }, [categories])

  const showCategoryDragHandles = sortableCategories.length >= 2

  // Filter prompts by selected category
  const filteredPrompts = useMemo(() => {
    let result: Prompt[]
    if (selectedCategoryId === 'all') {
      result = localPrompts
    } else {
      result = localPrompts.filter((p) => p.categoryId === selectedCategoryId)
    }
    return sortPromptsByOrder(result)
  }, [localPrompts, selectedCategoryId])

  const showDragHandles = filteredPrompts.length >= 2 && selectedCategoryId !== 'all'

  // Filter resource prompts by category
  const filteredResourcePrompts = useMemo(() => {
    return selectedResourceCategoryId === 'all'
      ? resourcePrompts
      : resourcePrompts.filter(p => p.categoryId === selectedResourceCategoryId || p.sourceCategory === selectedResourceCategoryId)
  }, [resourcePrompts, selectedResourceCategoryId])

  const paginatedResourcePrompts = useMemo(() => {
    return filteredResourcePrompts.slice(0, loadedCount)
  }, [filteredResourcePrompts, loadedCount])

  // Reset pagination on resource category change
  useEffect(() => {
    if (isResourceLibrary) {
      setLoadedCount(50)
    }
  }, [selectedResourceCategoryId, isResourceLibrary])

  // Handle drag end for prompt reorder
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id && selectedCategoryId !== 'all') {
      const oldIndex = filteredPrompts.findIndex(p => p.id === active.id)
      const newIndex = filteredPrompts.findIndex(p => p.id === over.id)
      const newOrder = [...filteredPrompts]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, filteredPrompts[oldIndex])

      const updatedPrompts = localPrompts.map((prompt) => {
        if (prompt.categoryId === selectedCategoryId) {
          return {
            ...prompt,
            order: newOrder.map(p => p.id).indexOf(prompt.id)
          }
        }
        return prompt
      })
      setLocalPrompts(updatedPrompts)

      try {
        await chrome.runtime.sendMessage({
          type: 'SET_STORAGE',
          payload: {
            prompts: updatedPrompts,
            categories: localCategories,
            version: '1.0.0'
          }
        })
      } catch (error) {
        console.error('[Prompt-Script] Failed to reorder prompts:', error)
      }
    }
  }

  // Handle drag end for category reorder
  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const sortedCategories = sortCategoriesByOrder(localCategories)
      const oldIndex = sortedCategories.findIndex(c => c.id === active.id)
      const newIndex = sortedCategories.findIndex(c => c.id === over.id)
      const newOrder = [...sortedCategories]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, sortedCategories[oldIndex])

      const updatedCategories = localCategories.map((category) => {
        return {
          ...category,
          order: newOrder.map(c => c.id).indexOf(category.id)
        }
      })
      setLocalCategories(updatedCategories)

      try {
        await chrome.runtime.sendMessage({
          type: 'SET_STORAGE',
          payload: {
            prompts: localPrompts,
            categories: updatedCategories,
            version: '1.0.0'
          }
        })
      } catch (error) {
        console.error('[Prompt-Script] Failed to reorder categories:', error)
      }
    }
  }

  // Close dropdown when clicking outside
  // IMPORTANT: Portal container contains dropdown + modals/dialogs - all should skip detection
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      // Skip if click is inside portal container (dropdown + modals/dialogs all render there)
      const portalContainer = document.getElementById(PORTAL_ID)
      if (portalContainer && portalContainer.contains(e.target as Node)) {
        return
      }

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

  const dropdownStyle: React.CSSProperties = {
    top: position.top,
    right: position.right,
    transform: position.isStickyTop ? 'none' : 'translateY(-100%)',
  }

  // Open settings page via background worker
  const handleOpenSettings = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' })
    onClose?.()
  }

  // Get category icon
  const getCategoryIcon = (categoryId: string) => {
    return CATEGORY_ICON_MAP[categoryId] || Layers
  }

  return createPortal(
    <>
      <div
        ref={dropdownRef}
        className="dropdown-container"
        style={dropdownStyle}
      >
      <div className="dropdown-sidebar">
        <div className="sidebar-categories">
          {isResourceLibrary ? (
            <>
              {/* Back to local categories */}
              <button
                className="sidebar-category-item"
                onClick={() => setIsResourceLibrary(false)}
                aria-label="返回本地分类"
              >
                <div className="sidebar-category-icon-wrapper">
                  <ArrowLeft className="sidebar-category-icon" />
                </div>
                <span>返回</span>
              </button>
              {/* "全部" ResourceCategory entry */}
              <button
                className={`sidebar-category-item ${selectedResourceCategoryId === 'all' ? 'selected' : ''}`}
                onClick={() => setSelectedResourceCategoryId('all')}
                aria-label="全部资源提示词"
              >
                <div className="sidebar-category-icon-wrapper">
                  <Database className="sidebar-category-icon" />
                </div>
                <span>全部</span>
                <span style={{ fontSize: '12px', fontWeight: 400, color: '#64748B' }}>
                  · {resourcePrompts.length}条
                </span>
              </button>
              {/* ResourceCategory list */}
              {sortProviderCategoriesByOrder(resourceCategories).map((category) => (
                <ProviderCategoryItem
                  key={category.id}
                  category={category}
                  isSelected={selectedResourceCategoryId === category.id}
                  onSelect={setSelectedResourceCategoryId}
                />
              ))}
            </>
          ) : (
            <>
              {/* "全部" category - virtual, not sortable */}
              <button
                className={`sidebar-category-item ${selectedCategoryId === 'all' ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedCategoryId('all')
                }}
                aria-label="全部分类"
              >
                <div className="sidebar-category-icon-wrapper">
                  <FolderOpen className="sidebar-category-icon" />
                </div>
                <span>全部分类</span>
              </button>

              {/* "资源库" entry */}
              <button
                className={`sidebar-category-item ${isResourceLibrary ? 'selected' : ''}`}
                onClick={() => setIsResourceLibrary(true)}
                aria-label="资源库"
              >
                <div className="sidebar-category-icon-wrapper">
                  <Database className="sidebar-category-icon" />
                </div>
                <span>资源库</span>
              </button>

              {/* Sortable local categories */}
              <DndContext collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
                <SortableContext
                  items={sortableCategories.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortableCategories.map((category) => {
                    const IconComponent = getCategoryIcon(category.id)
                    return (
                      <SortableCategoryItem
                        key={category.id}
                        category={category}
                        isSelected={selectedCategoryId === category.id}
                        onSelect={(id) => {
                          setSelectedCategoryId(id)
                        }}
                        showDragHandle={showCategoryDragHandles}
                        IconComponent={IconComponent}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
      </div>

      <div className="dropdown-main">
        <div className="dropdown-header">
          <span className="dropdown-header-title">
            <img className="dropdown-header-logo" src={chrome.runtime.getURL('assets/icon-128.png')} alt="Prompt Script" />
            Prompt Script
          </span>
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

        <div className="dropdown-content">
          {isLoading ? (
            <div className="empty-state">
              <div className="empty-message">加载中...</div>
            </div>
          ) : isResourceLibrary ? (
            paginatedResourcePrompts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-message">
                  {resourcePrompts.length === 0
                    ? '资源库数据加载失败'
                    : '该分类暂无提示词'}
                </div>
              </div>
            ) : (
              <>
                <div className="network-prompt-cards-grid">
                  {paginatedResourcePrompts.map((prompt) => (
                    <NetworkPromptCard
                      key={prompt.id}
                      prompt={prompt}
                      onClick={() => {
                        setSelectedResourcePrompt(prompt)
                        setIsModalOpen(true)
                      }}
                    />
                  ))}
                </div>
                {filteredResourcePrompts.length > 50 && (
                  <LoadMoreButton
                    loadedCount={loadedCount}
                    totalCount={filteredResourcePrompts.length}
                    onLoadMore={() => setLoadedCount(prev => prev + 50)}
                    isLoading={false}
                  />
                )}
              </>
            )
          ) : filteredPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-message">
                {selectedCategoryId === 'all' ? '暂无提示词，请点击设置添加' : '该分类暂无提示词'}
              </div>
            </div>
          ) : (
            <div className="dropdown-items">
              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={filteredPrompts.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredPrompts.map((prompt, index) => (
                    <SortableDropdownItem
                      key={prompt.id}
                      prompt={prompt}
                      isLast={index === filteredPrompts.length - 1}
                      isSelected={selectedPromptId === prompt.id}
                      onSelect={onSelect}
                      showDragHandle={showDragHandles}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </div>
    </div>
    {/* Prompt preview modal with collect */}
    {selectedResourcePrompt && (
      <PromptPreviewModal
        prompt={selectedResourcePrompt}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedResourcePrompt(null)
        }}
        onCollect={() => setIsCategoryDialogOpen(true)}
      />
    )}
    {/* Category select dialog */}
    <CategorySelectDialog
      categories={sortableCategories}
      isOpen={isCategoryDialogOpen}
      onClose={() => setIsCategoryDialogOpen(false)}
      onConfirm={handleConfirmCollect}
    />
    {/* Toast notification */}
    {toastMessage && (
      <ToastNotification
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    )}
  </>,
    getPortalContainer()
  )
}