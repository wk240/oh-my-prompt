/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Uses React Portal to render to document.body, escaping overflow:hidden
 * Positioned above the trigger button, right-aligned
 */

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Prompt, Category, StorageSchema } from '../../shared/types'
import type { ResourcePrompt, ResourceCategory, UpdateStatus } from '../../shared/types'
import { truncateText, sortCategoriesByOrder, sortPromptsByOrder, sortProviderCategoriesByOrder, sortResourcePromptsByCategoryOrder } from '../../shared/utils'
import { Sparkles, Palette, Shapes, ArrowUpRight, FolderOpen, Layers, Sparkle, Brush, GripVertical, Database, ArrowLeft, Sun, Frame, Paintbrush, Image, RefreshCw, ArrowUpCircle, Plus, Pencil, Trash2, Download, Upload, ExternalLink } from 'lucide-react'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { NetworkPromptCard } from './NetworkPromptCard'
import { ProviderCategoryItem } from './ProviderCategoryItem'
import { PromptPreviewModal } from './PromptPreviewModal'
import { CategorySelectDialog } from './CategorySelectDialog'
import { ToastNotification } from './ToastNotification'
import { Tooltip } from './Tooltip'
import { UpdateGuideModal } from './UpdateGuideModal'
import { CategoryEditModal } from './CategoryEditModal'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { PromptEditModal } from './PromptEditModal'
import { usePromptStore } from '../../lib/store'
import { getResourcePrompts, getResourceCategories } from '../../lib/resource-library'
import { MessageType } from '../../shared/messages'
import { readImportFile, mergeImportData } from '../../lib/import-export'

interface DropdownContainerProps {
  prompts: Prompt[]
  categories: Category[]
  onSelect: (prompt: Prompt) => void
  onInjectResource?: (prompt: ResourcePrompt) => void  // Inject resource prompt directly
  onRefresh?: () => Promise<{ success: boolean; backupSuccess: boolean; error?: string }>  // Refresh data from storage
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
const PORTAL_ID = 'oh-my-prompt-script-dropdown-portal'

// Get or create portal container with styles
function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID

    // Inject styles for dropdown (since we're rendering outside Shadow DOM)
    const style = document.createElement('style')
    style.id = 'oh-my-prompt-script-dropdown-styles'
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
      width: 640px;
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
      width: 160px;
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
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    #${PORTAL_ID} .dropdown-action-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: #ffffff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
      color: #171717;
      box-sizing: border-box;
    }

    #${PORTAL_ID} .dropdown-action-btn:hover {
      background: #f8f8f8;
    }

    #${PORTAL_ID} .dropdown-action-btn.refreshing {
      cursor: wait;
    }

    #${PORTAL_ID} .dropdown-action-btn.refreshing svg {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

    /* Update notification banner styles */
    #${PORTAL_ID} .update-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #fff3cd;
      border-bottom: 1px solid #ffc107;
    }

    #${PORTAL_ID} .update-banner-text {
      font-size: 11px;
      color: #856404;
      flex: 1;
    }

    #${PORTAL_ID} .update-banner-link {
      font-size: 11px;
      color: #d97706;
      font-weight: 500;
      cursor: pointer;
      text-decoration: underline;
    }

    #${PORTAL_ID} .update-banner-link:hover {
      color: #b45309;
    }

    #${PORTAL_ID} .update-banner-close {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #856404;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
    }

    #${PORTAL_ID} .update-banner-close:hover {
      color: #533b04;
    }

    #${PORTAL_ID} .version-badge {
      font-size: 10px;
      color: #64748B;
      font-weight: 400;
      margin-left: 4px;
    }

    #${PORTAL_ID} .update-latest-tip {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 4px;
      padding: 4px 8px;
      white-space: nowrap;
      z-index: 10;
    }

    /* CRUD action buttons */
    #${PORTAL_ID} .sidebar-add-category-btn {
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
      color: #A16207;
      cursor: pointer;
      transition: background 0.15s ease;
      width: 100%;
    }

    #${PORTAL_ID} .sidebar-add-category-btn:hover {
      background: #f0f0f0;
    }

    #${PORTAL_ID} .category-action-buttons {
      position: absolute;
      top: 50%;
      right: 8px;
      transform: translateY(-50%);
      display: flex;
      gap: 4px;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 100;
    }

    #${PORTAL_ID} .sidebar-category-item:hover .category-action-buttons {
      opacity: 1;
      visibility: visible;
    }

    #${PORTAL_ID} .category-action-btn {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
    }

    #${PORTAL_ID} .category-action-btn:hover {
      background: #f8f8f8;
      color: #171717;
    }

    #${PORTAL_ID} .category-action-btn.delete:hover {
      color: #dc2626;
      border-color: #fecaca;
    }

    #${PORTAL_ID} .prompt-action-buttons {
      position: absolute;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      display: flex;
      gap: 4px;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 100;
      background: #ffffff;
      padding: 4px 8px;
      borderRadius: 4px;
      boxShadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    #${PORTAL_ID} .dropdown-item:hover .prompt-action-buttons {
      opacity: 1;
      visibility: visible;
    }

    #${PORTAL_ID} .prompt-action-btn {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: #64748B;
    }

    #${PORTAL_ID} .prompt-action-btn:hover {
      background: #f8f8f8;
      color: #171717;
    }

    #${PORTAL_ID} .prompt-action-btn.delete:hover {
      color: #dc2626;
    }

    /* FAB add prompt button */
    #${PORTAL_ID} .fab-add-prompt {
      position: absolute;
      bottom: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #171717;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: background 0.15s ease, transform 0.15s ease;
      z-index: 50;
    }

    #${PORTAL_ID} .fab-add-prompt:hover {
      background: #404040;
      transform: scale(1.05);
    }
  `
}

// Category icon mapping for sidebar
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  // Built-in categories
  'cat-quality': Sparkles,     // 质量与细节
  'cat-style': Palette,        // 艺术风格
  'cat-lighting': Sun,         // 光影效果
  'cat-composition': Frame,    // 构图视角
  'cat-color': Paintbrush,     // 色彩配色
  'cat-theme': Image,          // 主题场景
  'cat-medium': Layers,        // 媒介材质
  // Resource library and special categories
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
  onEdit,
  onDelete,
}: {
  category: Category
  isSelected: boolean
  onSelect: (categoryId: string) => void
  showDragHandle: boolean
  IconComponent: React.ComponentType<{ className?: string }>
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
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
    position: 'relative' as const,
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
      <Tooltip content={category.name}>
        <span>{category.name}</span>
      </Tooltip>
      {/* Edit/Delete buttons */}
      <div className="category-action-buttons">
        <button
          className="category-action-btn"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(category)
          }}
          aria-label="编辑分类"
        >
          <Pencil style={{ width: 12, height: 12 }} />
        </button>
        <button
          className="category-action-btn delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(category)
          }}
          aria-label="删除分类"
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </div>
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
  onEdit,
  onDelete,
}: {
  prompt: Prompt
  isLast: boolean
  isSelected: boolean
  onSelect: (prompt: Prompt) => void
  showDragHandle: boolean
  onEdit: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
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
    position: 'relative' as const,
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
        <Tooltip content={prompt.name}>
          <span className="dropdown-item-name">{prompt.name}</span>
        </Tooltip>
        <Tooltip content={prompt.description || prompt.content}>
          <span className="dropdown-item-preview">{truncateText(prompt.description || prompt.content, 40)}</span>
        </Tooltip>
      </div>
      <ArrowUpRight className="dropdown-item-arrow" />
      {/* Edit/Delete buttons */}
      <div className="prompt-action-buttons">
        <button
          className="prompt-action-btn"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(prompt)
          }}
          aria-label="编辑提示词"
        >
          <Pencil style={{ width: 14, height: 14 }} />
        </button>
        <button
          className="prompt-action-btn delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(prompt)
          }}
          aria-label="删除提示词"
        >
          <Trash2 style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

export function DropdownContainer({
  prompts,
  categories: propCategories,
  onSelect,
  onInjectResource,
  onRefresh,
  isOpen,
  selectedPromptId,
  onClose,
  isLoading = false,
}: DropdownContainerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
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

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Update notification state
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [showLatestTip, setShowLatestTip] = useState(false)
  const [isUpdateGuideOpen, setIsUpdateGuideOpen] = useState(false)

  // CRUD modal states
  const [isCategoryAddModalOpen, setIsCategoryAddModalOpen] = useState(false)
  const [isCategoryEditModalOpen, setIsCategoryEditModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isDeleteCategoryModalOpen, setIsDeleteCategoryModalOpen] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)

  const [isPromptAddModalOpen, setIsPromptAddModalOpen] = useState(false)
  const [isPromptEditModalOpen, setIsPromptEditModalOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [isDeletePromptModalOpen, setIsDeletePromptModalOpen] = useState(false)
  const [deletingPrompt, setDeletingPrompt] = useState<Prompt | null>(null)

  // Fetch update status when dropdown opens
  useEffect(() => {
    if (!isOpen) return
    chrome.runtime.sendMessage({ type: MessageType.GET_UPDATE_STATUS }, (response) => {
      if (response?.success && response.data) {
        setUpdateStatus(response.data)
      }
    })
  }, [isOpen])

  // Manual update check handler
  const handleCheckUpdate = useCallback(() => {
    chrome.runtime.sendMessage({ type: MessageType.CHECK_UPDATE }, (response) => {
      if (response?.success && response.data) {
        const status = response.data as UpdateStatus
        setUpdateStatus(status)
        if (!status.hasUpdate) {
          setShowLatestTip(true)
          setTimeout(() => setShowLatestTip(false), 3000)
        }
      }
    })
  }, [])

  // Clear update notification
  const handleDismissUpdate = useCallback(() => {
    chrome.runtime.sendMessage({ type: MessageType.CLEAR_UPDATE_STATUS }, () => {
      setUpdateStatus(null)
    })
  }, [])

  // Handle refresh with loading state
  const handleRefreshClick = useCallback(async () => {
    if (isRefreshing || !onRefresh) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, onRefresh])

  // Check if a resource prompt is already collected
  const isPromptCollected = useCallback((resourcePrompt: ResourcePrompt): boolean => {
    return localPrompts.some(p => p.content === resourcePrompt.content)
  }, [localPrompts])

  // Handle quick collect from card (skip modal)
  const handleQuickCollect = useCallback((resourcePrompt: ResourcePrompt) => {
    setSelectedResourcePrompt(resourcePrompt)
    setIsCategoryDialogOpen(true)
  }, [])

  // Handle inject from card (direct injection)
  const handleInjectFromCard = useCallback((resourcePrompt: ResourcePrompt) => {
    if (onInjectResource) {
      onInjectResource(resourcePrompt)
      setToastMessage('已注入提示词')
      setTimeout(() => setToastMessage(null), 2000)
    }
  }, [onInjectResource])

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
      console.error('[Oh My Prompt Script] No target category for collect')
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
      const hostElement = document.querySelector('[data-testid="oh-my-prompt-script-trigger"]')
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

  const showDragHandles = filteredPrompts.length >= 2

  // Filter resource prompts by category
  const filteredResourcePrompts = useMemo(() => {
    const prompts = selectedResourceCategoryId === 'all'
      ? resourcePrompts
      : resourcePrompts.filter(p => p.categoryId === selectedResourceCategoryId || p.sourceCategory === selectedResourceCategoryId)

    // Sort by category order in "全部" view, otherwise keep original order
    return selectedResourceCategoryId === 'all'
      ? sortResourcePromptsByCategoryOrder(prompts, resourceCategories)
      : prompts
  }, [resourcePrompts, selectedResourceCategoryId, resourceCategories])

  const paginatedResourcePrompts = useMemo(() => {
    return filteredResourcePrompts.slice(0, loadedCount)
  }, [filteredResourcePrompts, loadedCount])

  // Reset pagination on resource category change
  useEffect(() => {
    if (isResourceLibrary) {
      setLoadedCount(50)
    }
  }, [selectedResourceCategoryId, isResourceLibrary])

  // Infinite scroll handler - load more when scrolling near bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!isResourceLibrary) return

    const target = e.currentTarget
    const scrollTop = target.scrollTop
    const scrollHeight = target.scrollHeight
    const clientHeight = target.clientHeight

    // Load more when within 100px of bottom
    const threshold = 100
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold

    if (isNearBottom && loadedCount < filteredResourcePrompts.length) {
      setLoadedCount(prev => Math.min(prev + 50, filteredResourcePrompts.length))
    }
  }, [isResourceLibrary, loadedCount, filteredResourcePrompts.length])

  // Handle drag end for prompt reorder (supports global sorting in 'all' category)
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = filteredPrompts.findIndex(p => p.id === active.id)
      const newIndex = filteredPrompts.findIndex(p => p.id === over.id)
      const newOrder = [...filteredPrompts]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, filteredPrompts[oldIndex])

      // Global sorting: update order for all prompts based on new position
      const updatedPrompts = localPrompts.map((prompt) => {
        const newIndexInOrder = newOrder.map(p => p.id).indexOf(prompt.id)
        if (newIndexInOrder !== -1) {
          return {
            ...prompt,
            order: newIndexInOrder
          }
        }
        return prompt
      })
      setLocalPrompts(updatedPrompts)

      try {
        await chrome.runtime.sendMessage({
          type: 'SET_STORAGE',
          payload: {
            version: '1.0.0',
            userData: { prompts: updatedPrompts, categories: localCategories },
            settings: { showBuiltin: true, syncEnabled: false }
          }
        })
      } catch (error) {
        console.error('[Oh My Prompt Script] Failed to reorder prompts:', error)
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
            version: '1.0.0',
            userData: { prompts: localPrompts, categories: updatedCategories },
            settings: { showBuiltin: true, syncEnabled: false }
          }
        })
      } catch (error) {
        console.error('[Oh My Prompt Script] Failed to reorder categories:', error)
      }
    }
  }

  // CRUD handlers for categories
  const handleAddCategory = useCallback((name: string) => {
    usePromptStore.getState().addCategory(name)
    setToastMessage('分类已添加')
    setTimeout(() => setToastMessage(null), 2000)
  }, [])

  const handleUpdateCategory = useCallback((name: string) => {
    if (!editingCategory) return
    usePromptStore.getState().updateCategory(editingCategory.id, name)
    setEditingCategory(null)
    setToastMessage('分类已更新')
    setTimeout(() => setToastMessage(null), 2000)
  }, [editingCategory])

  const handleDeleteCategory = useCallback(() => {
    if (!deletingCategory) return
    usePromptStore.getState().deleteCategory(deletingCategory.id)
    // Update local state
    setLocalCategories(prev => prev.filter(c => c.id !== deletingCategory.id))
    setLocalPrompts(prev => prev.filter(p => p.categoryId !== deletingCategory.id))
    // If deleted category was selected, switch to 'all'
    if (selectedCategoryId === deletingCategory.id) {
      setSelectedCategoryId('all')
    }
    setDeletingCategory(null)
    setToastMessage('分类已删除')
    setTimeout(() => setToastMessage(null), 2000)
  }, [deletingCategory, selectedCategoryId])

  // CRUD handlers for prompts
  const handleAddPrompt = useCallback((data: { name: string; description?: string; content: string; categoryId: string }) => {
    usePromptStore.getState().addPrompt({
      name: data.name,
      description: data.description,
      content: data.content,
      categoryId: data.categoryId,
      order: localPrompts.filter(p => p.categoryId === data.categoryId).length,
    })
    setToastMessage('提示词已添加')
    setTimeout(() => setToastMessage(null), 2000)
  }, [localPrompts])

  const handleUpdatePrompt = useCallback((data: { name: string; description?: string; content: string; categoryId: string }) => {
    if (!editingPrompt) return
    usePromptStore.getState().updatePrompt(editingPrompt.id, {
      name: data.name,
      description: data.description,
      content: data.content,
      categoryId: data.categoryId,
    })
    setEditingPrompt(null)
    setToastMessage('提示词已更新')
    setTimeout(() => setToastMessage(null), 2000)
  }, [editingPrompt])

  const handleDeletePrompt = useCallback(() => {
    if (!deletingPrompt) return
    usePromptStore.getState().deletePrompt(deletingPrompt.id)
    setLocalPrompts(prev => prev.filter(p => p.id !== deletingPrompt.id))
    setDeletingPrompt(null)
    setToastMessage('提示词已删除')
    setTimeout(() => setToastMessage(null), 2000)
  }, [deletingPrompt])

  // Export handler - send message to background worker (chrome.downloads only works in background)
  const handleExport = useCallback(async () => {
    const version = chrome.runtime.getManifest().version
    const data: StorageSchema = {
      version,
      userData: { prompts: localPrompts, categories: localCategories },
      settings: { showBuiltin: true, syncEnabled: false }
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.EXPORT_DATA, payload: data })
      if (response?.success) {
        setToastMessage('导出成功')
      } else {
        setToastMessage(response?.error || '导出失败')
      }
      setTimeout(() => setToastMessage(null), 2000)
    } catch (error) {
      setToastMessage('导出失败')
      setTimeout(() => setToastMessage(null), 2000)
    }
  }, [localPrompts, localCategories])

  // Import handler
  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const result = await readImportFile(file)

      if (result.valid && result.data) {
        const merged = mergeImportData(
          { prompts: localPrompts, categories: localCategories },
          result.data.userData
        )

        // Update local state
        setLocalPrompts(merged.prompts)
        setLocalCategories(merged.categories)

        // Update store and save to storage
        usePromptStore.setState({
          prompts: merged.prompts,
          categories: merged.categories,
          selectedCategoryId: 'all'
        })
        await usePromptStore.getState().saveToStorage()

        setToastMessage(`导入成功：新增 ${merged.addedCount} 条，跳过 ${merged.skippedCount} 条重复`)
        setTimeout(() => setToastMessage(null), 2000)
      } else {
        setToastMessage(result.error || '导入失败')
        setTimeout(() => setToastMessage(null), 2000)
      }
    }

    input.click()
  }, [localPrompts, localCategories])

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

      const hostElement = document.querySelector('[data-testid="oh-my-prompt-script-trigger"]')
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
                        onEdit={(cat) => {
                          setEditingCategory(cat)
                          setIsCategoryEditModalOpen(true)
                        }}
                        onDelete={(cat) => {
                          setDeletingCategory(cat)
                          setIsDeleteCategoryModalOpen(true)
                        }}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
              {/* Add category button */}
              <button
                className="sidebar-add-category-btn"
                onClick={() => setIsCategoryAddModalOpen(true)}
                aria-label="添加分类"
              >
                <Plus style={{ width: 14, height: 14 }} />
                <span>添加分类</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dropdown-main">
        <div className="dropdown-header">
          <span className="dropdown-header-title">
            <img className="dropdown-header-logo" src={chrome.runtime.getURL('assets/icon-128.png')} alt="Oh My Prompt Script" />
            Oh My Prompt Script
            <span className="version-badge">v{chrome.runtime.getManifest().version}</span>
          </span>
          <div className="dropdown-header-actions">
            <Tooltip content={updateStatus?.hasUpdate ? `新版本 ${updateStatus.latestVersion} 可用` : '检查更新'} placement="bottom">
              <button
                className="dropdown-action-btn"
                style={updateStatus?.hasUpdate ? { color: '#FF5722' } : {}}
                onClick={updateStatus?.hasUpdate ? () => setIsUpdateGuideOpen(true) : handleCheckUpdate}
                aria-label={updateStatus?.hasUpdate ? '查看更新引导' : '检查更新'}
              >
                <ArrowUpCircle style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            {/* "Already latest" tip */}
            {showLatestTip && (
              <div className="update-latest-tip">
                <span style={{ fontSize: 11, color: '#16a34a' }}>已是最新版本</span>
              </div>
            )}
            <Tooltip content="备份数据" placement="bottom">
              <button
                className={`dropdown-action-btn ${isRefreshing ? 'refreshing' : ''}`}
                onClick={handleRefreshClick}
                aria-label="备份数据"
                disabled={isRefreshing}
              >
                <RefreshCw style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="导入" placement="bottom">
              <button
                className="dropdown-action-btn"
                onClick={handleImport}
                aria-label="导入"
              >
                <Upload style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="导出" placement="bottom">
              <button
                className="dropdown-action-btn"
                onClick={handleExport}
                aria-label="导出"
              >
                <Download style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="访问官网" placement="bottom">
              <a
                className="dropdown-action-btn"
                href="https://oh-my-prompt.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="访问官网"
              >
                <ExternalLink style={{ width: 14, height: 14 }} />
              </a>
            </Tooltip>
          </div>
        </div>

        {/* Update notification banner */}
        {updateStatus?.hasUpdate && (
          <div className="update-banner">
            <ArrowUpCircle style={{ width: 14, height: 14, color: '#856404' }} />
            <span className="update-banner-text">新版本 {updateStatus.latestVersion} 可用</span>
            <span
              className="update-banner-link"
              onClick={() => setIsUpdateGuideOpen(true)}
            >
              查看更新引导
            </span>
            <span className="update-banner-close" onClick={handleDismissUpdate}>×</span>
          </div>
        )}

        <div className="dropdown-content" ref={scrollContainerRef} onScroll={handleScroll}>
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
              <div className="network-prompt-cards-grid">
                {paginatedResourcePrompts.map((prompt) => (
                  <NetworkPromptCard
                    key={prompt.id}
                    prompt={prompt}
                    onClick={() => {
                      setSelectedResourcePrompt(prompt)
                      setIsModalOpen(true)
                    }}
                    onInject={() => handleInjectFromCard(prompt)}
                    onCollect={() => handleQuickCollect(prompt)}
                    isCollected={isPromptCollected(prompt)}
                  />
                ))}
              </div>
            )
          ) : filteredPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-message">
                {selectedCategoryId === 'all' ? '暂无提示词，点击下方按钮添加' : '该分类暂无提示词'}
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
                      onEdit={(p) => {
                        setEditingPrompt(p)
                        setIsPromptEditModalOpen(true)
                      }}
                      onDelete={(p) => {
                        setDeletingPrompt(p)
                        setIsDeletePromptModalOpen(true)
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
        {/* FAB add prompt button */}
        {!isResourceLibrary && (
          <button
            className="fab-add-prompt"
            onClick={() => setIsPromptAddModalOpen(true)}
            aria-label="添加提示词"
          >
            <Plus style={{ width: 18, height: 18 }} />
          </button>
        )}
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
        onInject={() => {
          if (onInjectResource) {
            onInjectResource(selectedResourcePrompt)
            setToastMessage('已注入提示词')
            setTimeout(() => setToastMessage(null), 2000)
          }
        }}
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
    {/* Update guide modal */}
    <UpdateGuideModal
      status={updateStatus}
      isOpen={isUpdateGuideOpen}
      onClose={() => setIsUpdateGuideOpen(false)}
    />
    {/* Category CRUD modals */}
    <CategoryEditModal
      isOpen={isCategoryAddModalOpen}
      onClose={() => setIsCategoryAddModalOpen(false)}
      mode="add"
      onConfirm={handleAddCategory}
    />
    <CategoryEditModal
      isOpen={isCategoryEditModalOpen}
      onClose={() => {
        setIsCategoryEditModalOpen(false)
        setEditingCategory(null)
      }}
      mode="edit"
      initialName={editingCategory?.name || ''}
      onConfirm={handleUpdateCategory}
    />
    <DeleteConfirmModal
      isOpen={isDeleteCategoryModalOpen}
      onClose={() => {
        setIsDeleteCategoryModalOpen(false)
        setDeletingCategory(null)
      }}
      itemName={deletingCategory?.name || ''}
      itemType="category"
      onConfirm={handleDeleteCategory}
    />
    {/* Prompt CRUD modals */}
    <PromptEditModal
      isOpen={isPromptAddModalOpen}
      onClose={() => setIsPromptAddModalOpen(false)}
      mode="add"
      categories={sortableCategories}
      defaultCategoryId={selectedCategoryId !== 'all' ? selectedCategoryId : undefined}
      onConfirm={handleAddPrompt}
    />
    <PromptEditModal
      isOpen={isPromptEditModalOpen}
      onClose={() => {
        setIsPromptEditModalOpen(false)
        setEditingPrompt(null)
      }}
      mode="edit"
      prompt={editingPrompt ?? undefined}
      categories={sortableCategories}
      onConfirm={handleUpdatePrompt}
    />
    <DeleteConfirmModal
      isOpen={isDeletePromptModalOpen}
      onClose={() => {
        setIsDeletePromptModalOpen(false)
        setDeletingPrompt(null)
      }}
      itemName={deletingPrompt?.name || ''}
      itemType="prompt"
      onConfirm={handleDeletePrompt}
    />
  </>,
    getPortalContainer()
  )
}