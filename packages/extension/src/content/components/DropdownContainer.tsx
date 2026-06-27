/**
 * DropdownContainer - Main dropdown wrapper with Lovart-native styling
 * Uses React Portal to render to document.body, escaping overflow:hidden
 * Positioned above the trigger button, right-aligned
 */

import { useRef, useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import type { Prompt, Category, GeneralAgentGenerateResult, TeamInfo } from '@oh-my-prompt/shared/types'
import type { TeamPrompt } from '@oh-my-prompt/shared/types'
import type { AgentTemplateCategory } from '@oh-my-prompt/shared/types/agent'
import type { ResourcePrompt, ResourceCategory, UpdateStatus } from '@oh-my-prompt/shared/types'
import { truncateText, sortCategoriesByOrder, sortPromptsByOrder, sortProviderCategoriesByOrder, sortResourcePromptsByCategoryOrder } from '@oh-my-prompt/shared/utils'
import { Sparkles, Palette, Shapes, ArrowUpRight, FolderOpen, Layers, Sparkle, Brush, GripVertical, Database, ArrowLeft, Sun, Frame, Paintbrush, Image, ArrowUpCircle, Plus, Pencil, Trash2, House, AlertTriangle, Settings, Clock, Copy, Users, Loader2, Share2, Bot } from 'lucide-react'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { NetworkPromptCard } from './NetworkPromptCard'
import { TeamPromptCard } from './TeamPromptCard'
import { ProviderCategoryItem } from './ProviderCategoryItem'
import { CategorySelectDialog } from './CategorySelectDialog'
import { TeamShareDialog } from './TeamShareDialog'
import { showToast } from './ToastNotification'
import { Tooltip } from './Tooltip'
import { AgentPanel } from './AgentPanel'
import { EcommercePanel } from './EcommercePanel'
import type { EcommercePersistedState } from './EcommercePanel'
import { getAgentTemplates, getAgentTemplate } from '../../lib/agent-templates'
// Lazy load Modal components - only loaded when user opens them
const PromptPreviewModal = lazy(() => import('./PromptPreviewModal').then(m => ({ default: m.PromptPreviewModal })))
const UpdateGuideModal = lazy(() => import('./UpdateGuideModal').then(m => ({ default: m.UpdateGuideModal })))
const CategoryEditModal = lazy(() => import('./CategoryEditModal').then(m => ({ default: m.CategoryEditModal })))
const DeleteConfirmModal = lazy(() => import('./DeleteConfirmModal').then(m => ({ default: m.DeleteConfirmModal })))
const PromptEditModal = lazy(() => import('./PromptEditModal').then(m => ({ default: m.PromptEditModal })))
import { usePromptStore } from '../../lib/store'
import { getResourcePrompts, getResourceCategories } from '../../lib/resource-library'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { clearImageUrlCache, isFolderConfigured, downloadImageFromUrl } from '../../lib/sync/image-sync'
import { deletePromptImageAsset, normalizePromptImageBlob, savePromptImageAsset } from '../../lib/sync/image-asset-service'
import { clearLoadQueue } from '../../lib/sync/image-loader-queue'
import { clearSupabaseClient } from '../../lib/cloud-sync/supabase-client'
import { PromptThumbnail } from './PromptThumbnail'
import { PORTAL_ID, STYLE_ID, DROPDOWN_STYLES } from '../styles/dropdown-styles'

interface DropdownContainerProps {
  prompts: Prompt[]
  categories: Category[]
  onSelect: (prompt: Prompt) => void
  onInjectResource?: (prompt: ResourcePrompt) => void  // Inject resource prompt directly
  onInsertText?: (text: string) => void  // Insert plain text into input field
  isOpen: boolean
  selectedPromptId: string | null
  onClose?: () => void
  isLoading?: boolean
  savedScrollPosition?: number  // Scroll position to restore when opening
  onScrollPositionChange?: (position: number) => void  // Notify parent of scroll position changes
}

interface DropdownPosition {
  top: number
  right?: number
  left?: number
  isStickyTop: boolean // 是否吸顶模式
  isStickyLeft: boolean // 是否吸左模式
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

// Ensure styles are injected only once
function ensureStylesInjected(): void {
  // Check if styles already exist, avoid duplicate injection
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = DROPDOWN_STYLES
  document.head.appendChild(style)
}

// Get or create portal container with styles (optimized)
function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    // Ensure styles are injected before creating container
    ensureStylesInjected()

    container = document.createElement('div')
    container.id = PORTAL_ID
    document.body.appendChild(container)
  }
  return container
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
  onCopy,
  onShare,
  onThumbnailClick,
}: {
  prompt: Prompt
  isLast: boolean
  isSelected: boolean
  onSelect: (prompt: Prompt) => void
  showDragHandle: boolean
  onEdit: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  onCopy: (prompt: Prompt) => void
  onShare?: (prompt: Prompt) => void  // Share to team
  onThumbnailClick?: (prompt: Prompt) => void  // Click on thumbnail to open preview
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
      className={`dropdown-item${isSelected ? ' selected' : ''}${isLast ? ' last' : ''}${isDragging ? ' dragging' : ''}${(prompt.imageId || prompt.localImage || prompt.remoteImageUrl) ? ' dropdown-item-with-thumbnail' : ''}`}
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
      {/* Icon wrapper with drag handle - left side */}
      <div className="dropdown-item-icon-wrapper">
        {showDragHandle && (
          <div className="dropdown-item-drag-handle" {...attributes} {...listeners}>
            <GripVertical style={{ width: 12, height: 12 }} />
          </div>
        )}
        <IconComponent className="dropdown-item-icon" />
      </div>
      {/* Thumbnail - 60x40 image preview, lazy-loaded with Intersection Observer */}
      {(prompt.imageId || prompt.localImage || prompt.remoteImageUrl) && (
        <PromptThumbnail
          prompt={prompt}
          relativePath={prompt.localImage}
          promptName={prompt.name}
          onClick={onThumbnailClick ? () => onThumbnailClick(prompt) : undefined}
        />
      )}
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
        <Tooltip content="复制">
          <button
            className="prompt-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              onCopy(prompt)
            }}
            aria-label="复制提示词"
          >
            <Copy style={{ width: 14, height: 14 }} />
          </button>
        </Tooltip>
        {onShare && (
          <Tooltip content="分享到团队">
            <button
              className="prompt-action-btn share"
              onClick={(e) => {
                e.stopPropagation()
                onShare(prompt)
              }}
              aria-label="分享到团队"
            >
              <Share2 style={{ width: 14, height: 14 }} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="编辑">
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
        </Tooltip>
        <Tooltip content="删除">
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
        </Tooltip>
      </div>
    </div>
  )
}

export function DropdownContainer({
  prompts,
  categories: propCategories,
  onSelect,
  onInjectResource,
  onInsertText,
  isOpen,
  selectedPromptId,
  onClose: _onClose,
  isLoading = false,
  savedScrollPosition = 0,
  onScrollPositionChange,
}: DropdownContainerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const updateButtonRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, right: 0, isStickyTop: false, isStickyLeft: false })
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [localPrompts, setLocalPrompts] = useState<Prompt[]>([])
  const [localCategories, setLocalCategories] = useState<Category[]>([])

  // Drag state - track custom position when user drags
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; y: number } | null>(null)

  // Resource library state (loaded from local JSON)
  const [isResourceLibrary, setIsResourceLibrary] = useState(false)
  const [resourcePrompts, setResourcePrompts] = useState<ResourcePrompt[]>([])
  const [rawResourcePrompts] = useState<ResourcePrompt[]>(getResourcePrompts())
  const [resourceCategories] = useState<ResourceCategory[]>(getResourceCategories())
  const [selectedResourceCategoryId, setSelectedResourceCategoryId] = useState<string>('all')
  const [loadedCount, setLoadedCount] = useState(50)

  // Agent mode state
  const [agentViewMode, setAgentViewMode] = useState<'default' | 'agent'>('default')
  const [agentSelectedTemplate, setAgentSelectedTemplate] = useState<AgentTemplateCategory>('general')
  const [agentExtractedText, setAgentExtractedText] = useState<string>('')

  // Persisted state for Agent/Ecommerce panels (survives close/reopen)
  const [agentPanelState, setAgentPanelState] = useState<{ inputText: string; result: string | null; structuredResult: GeneralAgentGenerateResult | null; imageData: string | null }>({
    inputText: '', result: null, structuredResult: null, imageData: null
  })
  const [ecommercePanelState, setEcommercePanelState] = useState<EcommercePersistedState>({
    productImages: [], platform: 'amazon', market: 'china',
    language: 'zh', aspectRatio: '1:1', sellingPoints: '', setStructure: 'smart',
    customCounts: { whiteBg: 1, scene: 2, sellingPoint: 2, other: 2 },
    result: null, generationConfigSnapshot: null, expandedPromptIndexes: [], viewMode: 'form'
  })

  const handleAgentStateChange = useCallback((state: { inputText: string; result: string | null; structuredResult: GeneralAgentGenerateResult | null; imageData: string | null }) => {
    setAgentPanelState(state)
  }, [])
  const handleEcommerceStateChange = useCallback((state: EcommercePersistedState) => {
    setEcommercePanelState(state)
  }, [])

  // Listen for extracted text from Content Script (Agent mode)
  useEffect(() => {
    const handler = (message: { type: string; payload?: { inputText: string } }) => {
      if (message.type === MessageType.AGENT_EXTRACT_FROM_CS && message.payload?.inputText) {
        setAgentExtractedText(message.payload.inputText)
        setAgentViewMode('agent')
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // Language preference state (for resource library and local prompts)
  const [resourceLanguage, setResourceLanguage] = useState<'zh' | 'en'>('zh')

  // Display prompts state (transformed by language preference)
  const [displayPrompts, setDisplayPrompts] = useState<Prompt[]>([])

  // Load language preference from storage on dropdown open
  useEffect(() => {
    if (!isOpen) return
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings?.resourceLanguage) {
        setResourceLanguage(response.data.settings.resourceLanguage)
      }
      if (response?.success && response.data?.settings?.visionEnabled !== undefined) {
        setVisionEnabled(response.data.settings.visionEnabled)
      }
    })
  }, [isOpen])

  // Vision feature enabled state
  const [visionEnabled, setVisionEnabled] = useState(true)

  // Sync status for backup warning UI
  const [syncStatus, setSyncStatus] = useState<{ hasFolder: boolean; permissionStatus?: 'granted' | 'prompt' | 'denied'; hasUnsyncedChanges?: boolean; dismissedBackupWarning?: boolean } | null>(null)

  // Transform local prompts by language preference
  useEffect(() => {
    setDisplayPrompts(localPrompts.map(p => ({
      ...p,
      name: resourceLanguage === 'en' && p.nameEn ? p.nameEn : p.name,
      content: resourceLanguage === 'en' && p.contentEn ? p.contentEn : p.content,
      description: resourceLanguage === 'en' && p.descriptionEn ? p.descriptionEn : p.description,
    })))
  }, [localPrompts, resourceLanguage])

  // Filter resource prompts by language preference
  useEffect(() => {
    setResourcePrompts(rawResourcePrompts.map(p => ({
      ...p,
      name: resourceLanguage === 'en' && p.nameEn ? p.nameEn : p.name,
      content: resourceLanguage === 'en' && p.contentEn ? p.contentEn : p.content,
    })))
  }, [rawResourcePrompts, resourceLanguage])

  // Temporary prompts from store (independent storage field)
  const temporaryPrompts = usePromptStore((state) => state.temporaryPrompts)

  // Team library state
  const teamPrompts = usePromptStore((state) => state.teamPrompts)
  const teamSyncStatus = usePromptStore((state) => state.teamSyncStatus)
  const authState = usePromptStore((state) => state.authState)
  const syncTeamPrompts = usePromptStore((state) => state.syncTeamPrompts)
  const loadTeamPrompts = usePromptStore((state) => state.loadTeamPrompts)
  const loadAuthState = usePromptStore((state) => state.loadAuthState)
  const getUserTeams = usePromptStore((state) => state.getUserTeams)

  // Team syncing state
  const [teamSyncing, setTeamSyncing] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all')
  const [teams, setTeams] = useState<TeamInfo[]>([])

  const filteredTeamPrompts = useMemo(() => {
    return selectedTeamId === 'all'
      ? teamPrompts
      : teamPrompts.filter(p => p.teamId === selectedTeamId)
  }, [selectedTeamId, teamPrompts])

  // Load team prompts and auth state on mount
  useEffect(() => {
    if (isOpen) {
      loadTeamPrompts()
      loadAuthState()
    }
  }, [isOpen, loadTeamPrompts, loadAuthState])

  // Fetch teams when team category is selected
  useEffect(() => {
    if (selectedCategoryId === 'team' && authState?.status === 'logged_in') {
      getUserTeams().then((result) => {
        if (result.success && result.teams) {
          setTeams(result.teams)
        }
      })
    } else {
      setTeams([])
      setSelectedTeamId('all')
    }
  }, [selectedCategoryId, authState?.status, getUserTeams])

  useEffect(() => {
    if (selectedTeamId !== 'all' && !teams.some(team => team.id === selectedTeamId)) {
      setSelectedTeamId('all')
    }
  }, [selectedTeamId, teams])

  // Listen for auth status updates (login/logout) to refresh auth state
  // Critical: Content script's Supabase client singleton must be cleared to pick up new session
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: { logout?: boolean } }) => {
      if (message.type === MessageType.AUTH_STATUS_UPDATE) {
        // Clear Supabase client singleton to force re-read from chrome.storage.local
        clearSupabaseClient()
        // Re-load auth state from storage
        loadAuthState()
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [loadAuthState])

  // Display temporary prompts with language transformation
  const displayTemporaryPrompts = useMemo(() => {
    return temporaryPrompts.map(p => ({
      ...p,
      name: resourceLanguage === 'en' && p.nameEn ? p.nameEn : p.name,
      content: resourceLanguage === 'en' && p.contentEn ? p.contentEn : p.content,
      description: resourceLanguage === 'en' && p.descriptionEn ? p.descriptionEn : p.description,
    }))
  }, [temporaryPrompts, resourceLanguage])

  // Grouped modal states
  interface ModalStates {
    isPreview: boolean           // Resource prompt preview modal
    isUserPreview: boolean       // User prompt preview modal (thumbnail click)
    isCategoryDialog: boolean    // Category select dialog
    isTeamCategoryDialog: boolean  // Team prompt category select dialog
    isTeamShare: boolean         // Team share dialog
    isCategoryAdd: boolean       // Category add modal
    isCategoryEdit: boolean      // Category edit modal
    isCategoryDelete: boolean    // Category delete modal
    isPromptAdd: boolean         // Prompt add modal
    isPromptEdit: boolean        // Prompt edit modal
    isPromptDelete: boolean      // Prompt delete modal
    isUpdateGuide: boolean       // Update guide modal
    showLatestTip: boolean       // "Already latest" tip
    showBackupReminder: boolean  // Backup reminder banner
    showFirstBackupWarning: boolean // First-time backup warning banner
  }

  const [modalStates, setModalStates] = useState<ModalStates>({
    isPreview: false,
    isUserPreview: false,
    isCategoryDialog: false,
    isTeamCategoryDialog: false,
    isTeamShare: false,
    isCategoryAdd: false,
    isCategoryEdit: false,
    isCategoryDelete: false,
    isPromptAdd: false,
    isPromptEdit: false,
    isPromptDelete: false,
    isUpdateGuide: false,
    showLatestTip: false,
    showBackupReminder: false,
    showFirstBackupWarning: false,
  })

  // Helper methods for modal state (memoized for stable references)
  const openModal = useCallback((key: keyof ModalStates) =>
    setModalStates(prev => ({ ...prev, [key]: true })), [])
  const closeModal = useCallback((key: keyof ModalStates) =>
    setModalStates(prev => ({ ...prev, [key]: false })), [])

  // Grouped editing states
  interface EditingStates {
    resourcePrompt: ResourcePrompt | null  // Resource prompt for preview/collect
    teamPrompt: TeamPrompt | null          // Team prompt for save to personal library
    userPrompt: Prompt | null              // User prompt for preview
    category: Category | null              // Category being edited
    prompt: Prompt | null                  // Prompt being edited
    deletingCategory: Category | null      // Category being deleted
    deletingPrompt: Prompt | null          // Prompt being deleted
    sharingPrompt: Prompt | null           // Prompt being shared to team
  }

  const [editingStates, setEditingStates] = useState<EditingStates>({
    resourcePrompt: null,
    teamPrompt: null,
    userPrompt: null,
    category: null,
    prompt: null,
    deletingCategory: null,
    deletingPrompt: null,
    sharingPrompt: null,
  })

  // Helper methods for editing state (memoized for stable references)
  const setEditingItem = useCallback(<K extends keyof EditingStates>(key: K, value: EditingStates[K]) =>
    setEditingStates(prev => ({ ...prev, [key]: value })), [])
  const clearEditingItem = useCallback(<K extends keyof EditingStates>(key: K) =>
    setEditingStates(prev => ({ ...prev, [key]: null })), [])

  // Refresh/loading state (not modal-related)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  // Backup warning data states (not modal-related)
  const [backupWarningPromptCount, setBackupWarningPromptCount] = useState(0)
  const [dontShowBackupWarning, setDontShowBackupWarning] = useState(false)

  // Get update status when dropdown opens
  useEffect(() => {
    if (!isOpen) return
    chrome.runtime.sendMessage({ type: MessageType.GET_UPDATE_STATUS }, (response) => {
      if (response?.success && response.data) {
        setUpdateStatus(response.data)
      }
    })
  }, [isOpen])

  // Get sync status immediately when dropdown opens (for permission restore)
  // This must run ASAP to capture user gesture from clicking trigger button
  useEffect(() => {
    if (!isOpen) return
    chrome.runtime.sendMessage({ type: MessageType.GET_SYNC_STATUS }, (response) => {
      if (response?.success && response.data) {
        const status = response.data
        setSyncStatus(status)
        // Only show backup reminder if there's actual unsynced content
        // AND permission is either granted (sync will happen) or denied (can't sync)
        // Don't show for 'prompt' status - it's normal after extension refresh and will be restored
        if (status.hasUnsyncedChanges && status.permissionStatus !== 'prompt') {
          openModal('showBackupReminder')
        }
      }
    })
  }, [isOpen]) // Run immediately when dropdown opens

  // Poll sync status when hasUnsyncedChanges is true (waiting for permission restore + sync to complete)
  // This ensures backup reminder disappears automatically after permission is restored and sync succeeds
  useEffect(() => {
    if (!isOpen || !syncStatus?.hasUnsyncedChanges) return

    const pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ type: MessageType.GET_SYNC_STATUS }, (response) => {
        if (response?.success && response.data) {
          const newStatus = response.data
          setSyncStatus(newStatus)
          // Close backup reminder when sync succeeds (hasUnsyncedChanges becomes false)
          if (!newStatus.hasUnsyncedChanges && modalStates.showBackupReminder) {
            closeModal('showBackupReminder')
          }
        }
      })
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [isOpen, syncStatus?.hasUnsyncedChanges, modalStates.showBackupReminder])

  // Check for first-time backup warning (depends on prompts)
  useEffect(() => {
    if (!isOpen) return
    if (syncStatus && !syncStatus.hasFolder && !syncStatus.dismissedBackupWarning && localPrompts.length > 0) {
      setBackupWarningPromptCount(localPrompts.length)
      openModal('showFirstBackupWarning')
    }
  }, [isOpen, syncStatus, localPrompts.length])

  // NOTE: Folder permission restore is now handled in DropdownApp.tsx handleToggle()
  // to preserve user gesture context for sidePanel.open() (Chrome requirement)
  // The sidepanel is opened before the dropdown opens, ensuring permission is restored

  // Reset sync status when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSyncStatus(null)
    }
  }, [isOpen])

  // Manual update check handler
  const handleCheckUpdate = useCallback(() => {
    chrome.runtime.sendMessage({ type: MessageType.CHECK_UPDATE }, (response) => {
      if (response?.success && response.data) {
        const status = response.data as UpdateStatus
        setUpdateStatus(status)
        if (!status.hasUpdate) {
          openModal('showLatestTip')
          setTimeout(() => closeModal('showLatestTip'), 3000)
        }
      }
    })
  }, [])

  // Listen for sync failure events from service worker
  useEffect(() => {
    const handleSyncFailed = () => {
      openModal('showBackupReminder')
    }
    window.addEventListener('oh-my-prompt-sync-failed', handleSyncFailed)
    return () => {
      window.removeEventListener('oh-my-prompt-sync-failed', handleSyncFailed)
    }
  }, [])

  // Clear update notification
  const handleDismissUpdate = useCallback(() => {
    chrome.runtime.sendMessage({ type: MessageType.CLEAR_UPDATE_STATUS }, () => {
      setUpdateStatus(null)
    })
  }, [])

  // Handle language switch in resource library
  const handleLanguageSwitch = useCallback((lang: 'zh' | 'en') => {
    setResourceLanguage(lang)
    // Save language preference to storage only (no backup trigger)
    chrome.runtime.sendMessage({
      type: MessageType.SET_SETTINGS_ONLY,
      payload: {
        settings: { resourceLanguage: lang }
      }
    })
  }, [])

  // Check if a resource prompt is already collected
  const isPromptCollected = useCallback((resourcePrompt: ResourcePrompt): boolean => {
    return localPrompts.some(p => p.content === resourcePrompt.content)
  }, [localPrompts])

  // Handle quick collect from card (skip modal)
  const handleQuickCollect = useCallback((resourcePrompt: ResourcePrompt) => {
    setEditingItem('resourcePrompt', resourcePrompt)
    openModal('isCategoryDialog')
  }, [])

  // Handle inject from card (direct injection)
  const handleInjectFromCard = useCallback((resourcePrompt: ResourcePrompt) => {
    if (onInjectResource) {
      // Use global language preference for card direct inject
      const promptToInject = resourceLanguage === 'en' && resourcePrompt.contentEn
        ? { ...resourcePrompt, content: resourcePrompt.contentEn, name: resourcePrompt.nameEn || resourcePrompt.name }
        : resourcePrompt
      onInjectResource(promptToInject)
      showToast('已注入提示词')
    }
  }, [onInjectResource, resourceLanguage])

  // Handle team prompt injection
  const handleInjectTeamPrompt = useCallback((teamPrompt: TeamPrompt) => {
    if (onInjectResource) {
      const promptToInject = resourceLanguage === 'en' && teamPrompt.contentEn
        ? { ...teamPrompt, content: teamPrompt.contentEn, name: teamPrompt.nameEn || teamPrompt.name }
        : teamPrompt
      onInjectResource(promptToInject as ResourcePrompt)
      showToast('已注入提示词')
    }
  }, [onInjectResource, resourceLanguage])

  // Handle team prompt copy
  const handleCopyTeamPrompt = useCallback(async (teamPrompt: TeamPrompt) => {
    const contentToCopy = resourceLanguage === 'en' && teamPrompt.contentEn ? teamPrompt.contentEn : teamPrompt.content
    try {
      await navigator.clipboard.writeText(contentToCopy)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [resourceLanguage])

  // Handle save team prompt to personal library
  const handleSaveTeamPrompt = useCallback((teamPrompt: TeamPrompt) => {
    setEditingItem('teamPrompt', teamPrompt)
    openModal('isTeamCategoryDialog')
  }, [setEditingItem, openModal])

  // Handle team sync
  const handleTeamSync = useCallback(async () => {
    setTeamSyncing(true)
    const result = await syncTeamPrompts()
    setTeamSyncing(false)
    if (result.success) {
      showToast(`已同步 ${result.promptsCount || 0} 条团队提示词`)
    } else {
      showToast(result.error === 'NOT_LOGGED_IN' ? '请先登录' : '同步失败')
    }
  }, [syncTeamPrompts])

  // Handle collect confirmation - support both resource and team prompts
  const handleConfirmCollect = useCallback(async (categoryId: string, newCategoryName?: string) => {
    // Handle team prompt
    if (editingStates.teamPrompt) {
      const teamPrompt = editingStates.teamPrompt

      let targetCategoryId = categoryId

      if (newCategoryName && newCategoryName.trim()) {
        usePromptStore.getState().addCategory(newCategoryName.trim())
        const storeCategories = usePromptStore.getState().categories
        const newCategory = storeCategories.find(c => c.name === newCategoryName.trim())
        if (newCategory) {
          targetCategoryId = newCategory.id
        }
      }

      usePromptStore.getState().addPrompt({
        name: teamPrompt.name,
        nameEn: teamPrompt.nameEn,
        content: teamPrompt.content,
        contentEn: teamPrompt.contentEn,
        categoryId: targetCategoryId,
        description: teamPrompt.description,
        descriptionEn: teamPrompt.descriptionEn,
        order: 0,
      })

      const categoryName = usePromptStore.getState().categories.find(c => c.id === targetCategoryId)?.name || '未知分类'
      showToast(`已保存到 ${categoryName}`)

      closeModal('isTeamCategoryDialog')
      clearEditingItem('teamPrompt')
      return
    }

    // Handle resource prompt
    if (!editingStates.resourcePrompt) return
    const resourcePrompt = editingStates.resourcePrompt // Capture reference for async operations

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
      console.error('[Oh My Prompt] No target category for collect')
      return
    }

    // Generate prompt ID upfront for image save
    const promptId = crypto.randomUUID()
    let imageId: string | undefined = undefined
    let localImage: string | undefined = undefined

    // Auto-download and save image if folder configured and prompt has preview image
    if (resourcePrompt.previewImage) {
      const folderConfigured = await isFolderConfigured()
      if (folderConfigured) {
        try {
          const downloadResult = await downloadImageFromUrl(resourcePrompt.previewImage)
          if (downloadResult.success && downloadResult.blob) {
            const normalized = await normalizePromptImageBlob(downloadResult.blob)
            const imageResult = await savePromptImageAsset({
              promptId,
              blob: normalized.blob,
              sourceUrl: resourcePrompt.previewImage,
              canUseCloud: authState?.status === 'logged_in' && Boolean(authState.cloudSyncEnabled),
              width: normalized.width,
              height: normalized.height,
              size: normalized.size,
              hash: normalized.hash
            })
            if (imageResult.success && imageResult.localPath) {
              imageId = imageResult.imageId
              localImage = imageResult.localPath
            }
          }
        } catch (error) {
          console.warn('[Oh My Prompt] Failed to download/save resource image:', error)
          // Continue without image - user can add later
        }
      } else {
        // Folder not configured - show toast but continue
        showToast('图片未保存，请先配置备份文件夹')
      }
    }

    // Create prompt (single creation with all fields)
    const newPrompt: Prompt = {
      id: promptId,
      name: resourcePrompt.name,
      nameEn: resourcePrompt.nameEn,
      content: resourcePrompt.content,
      contentEn: resourcePrompt.contentEn,
      categoryId: targetCategoryId,
      description: resourcePrompt.description,
      descriptionEn: resourcePrompt.descriptionEn,
      order: 0,
      imageId,
      remoteImageUrl: resourcePrompt.previewImage,
      localImage,
    }

    usePromptStore.getState().addPrompt(newPrompt)

    const categoryName = usePromptStore.getState().categories.find(c => c.id === targetCategoryId)?.name || '未知分类'

    // Show success toast
    showToast(`已收藏到 ${categoryName}`)

    closeModal('isCategoryDialog')
    closeModal('isPreview')
    clearEditingItem('resourcePrompt')
  }, [authState, editingStates.teamPrompt, editingStates.resourcePrompt])

  const dropdownGap = 8
  const dropdownMaxHeight = 600
  const dropdownWidth = 640

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
      const hostElement = document.querySelector('[data-testid="oh-my-prompt-trigger"]')
      if (!hostElement) return

      const rect = hostElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth

      // 计算下拉框左边缘位置（默认右对齐触发按钮左边缘）
      const dropdownLeftEdge = rect.left - dropdownWidth

      // 检测左侧是否需要吸左
      // 条件：下拉框左边缘会超出viewport，或者按钮在页面左侧区域（viewport左50%范围内）
      // 使用宽松条件确保居中布局时也能正确吸左
      const isStickyLeft = dropdownLeftEdge < 16 || rect.left < viewportWidth * 0.5

      // 垂直位置计算
      const preferredTopPos = rect.top - dropdownGap
      const dropdownTop = preferredTopPos - dropdownMaxHeight
      const isStickyTop = dropdownTop < 0

      if (isStickyLeft) {
        // 左侧超出：吸左（左边缘贴住viewport左边缘）
        setPosition({
          top: isStickyTop ? 0 : preferredTopPos,
          left: 0,
          isStickyTop,
          isStickyLeft
        })
      } else {
        // 正常情况：右对齐触发按钮
        const rightPos = viewportWidth - rect.left
        setPosition({
          top: isStickyTop ? 0 : preferredTopPos,
          right: rightPos,
          isStickyTop,
          isStickyLeft
        })
      }
    }

    calculatePosition()

    const handleReposition = () => calculatePosition()
    window.addEventListener('scroll', handleReposition, { passive: true })
    window.addEventListener('resize', handleReposition)

    return () => {
      window.removeEventListener('scroll', handleReposition)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, dropdownGap, dropdownMaxHeight, dropdownWidth])

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

  // Filter prompts by selected category (using displayPrompts with language transformation)
  const filteredPrompts = useMemo(() => {
    let result: Prompt[]
    if (selectedCategoryId === 'all') {
      result = displayPrompts
    } else if (selectedCategoryId === 'temporary') {
      // Temporary library: use displayTemporaryPrompts (already sorted in reverse order)
      return displayTemporaryPrompts
    } else {
      result = displayPrompts.filter((p) => p.categoryId === selectedCategoryId)
    }
    return sortPromptsByOrder(result)
  }, [displayPrompts, displayTemporaryPrompts, selectedCategoryId])

  const showDragHandles = filteredPrompts.length >= 2

  // Clear image URL cache and load queue when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      clearImageUrlCache()
      clearLoadQueue()
    }
  }, [isOpen])

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
    const target = e.currentTarget
    const scrollTop = target.scrollTop

    // Notify parent of scroll position change for persistence
    if (onScrollPositionChange) {
      onScrollPositionChange(scrollTop)
    }

    // Load more for resource library when near bottom
    if (!isResourceLibrary) return

    const scrollHeight = target.scrollHeight
    const clientHeight = target.clientHeight

    // Load more when within 100px of bottom
    const threshold = 100
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold

    if (isNearBottom && loadedCount < filteredResourcePrompts.length) {
      setLoadedCount(prev => Math.min(prev + 50, filteredResourcePrompts.length))
    }
  }, [isResourceLibrary, loadedCount, filteredResourcePrompts.length, onScrollPositionChange])

  // Restore scroll position when dropdown opens
  useEffect(() => {
    if (isOpen && scrollContainerRef.current && savedScrollPosition > 0) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScrollPosition
        }
      })
    }
  }, [isOpen, savedScrollPosition])

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
      const now = Date.now()
      const updatedPrompts = localPrompts.map((prompt) => {
        const newIndexInOrder = newOrder.map(p => p.id).indexOf(prompt.id)
        if (newIndexInOrder !== -1) {
          return {
            ...prompt,
            order: newIndexInOrder,
            updatedAt: now
          }
        }
        return prompt
      })
      setLocalPrompts(updatedPrompts)

      try {
        const response = await chrome.runtime.sendMessage({
          type: MessageType.SET_STORAGE,
          payload: {
            version: '1.0.0',
            userData: { prompts: updatedPrompts, categories: localCategories }
          }
        })
        if (response?.data?.syncSuccess === false) {
          showToast('排序已保存，云端同步失败')
        }
      } catch (error) {
        console.error('[Oh My Prompt] Failed to reorder prompts:', error)
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

      const now = Date.now()
      const updatedCategories = localCategories.map((category) => {
        return {
          ...category,
          order: newOrder.map(c => c.id).indexOf(category.id),
          updatedAt: now
        }
      })
      setLocalCategories(updatedCategories)

      try {
        const response = await chrome.runtime.sendMessage({
          type: MessageType.SET_STORAGE,
          payload: {
            version: '1.0.0',
            userData: { prompts: localPrompts, categories: updatedCategories }
          }
        })
        if (response?.data?.syncSuccess === false) {
          showToast('排序已保存，云端同步失败')
        }
      } catch (error) {
        console.error('[Oh My Prompt] Failed to reorder categories:', error)
      }
    }
  }

  // CRUD handlers for categories
  const handleAddCategory = useCallback((name: string) => {
    usePromptStore.getState().addCategory(name)
    showToast('分类已添加')
  }, [])

  const handleUpdateCategory = useCallback((name: string) => {
    if (!editingStates.category) return
    usePromptStore.getState().updateCategory(editingStates.category.id, name)
    clearEditingItem('category')
    showToast('分类已更新')
  }, [editingStates.category])

  const handleDeleteCategory = useCallback(async () => {
    if (!editingStates.deletingCategory) return
    const promptsToDelete = localPrompts.filter(p => p.categoryId === editingStates.deletingCategory!.id)
    for (const prompt of promptsToDelete) {
      const imageDelete = await deletePromptImageAsset(prompt.id)
      if (!imageDelete.success) {
        showToast('图片删除失败，请检查文件夹权限')
        return
      }
    }
    usePromptStore.getState().deleteCategory(editingStates.deletingCategory.id)
    // Update local state
    setLocalCategories(prev => prev.filter(c => c.id !== editingStates.deletingCategory!.id))
    setLocalPrompts(prev => prev.filter(p => p.categoryId !== editingStates.deletingCategory!.id))
    // If deleted category was selected, switch to 'all'
    if (selectedCategoryId === editingStates.deletingCategory.id) {
      setSelectedCategoryId('all')
    }
    clearEditingItem('deletingCategory')
    showToast('分类已删除')
  }, [editingStates.deletingCategory, localPrompts, selectedCategoryId])

  // CRUD handlers for prompts
  const handleAddPrompt = useCallback((data: {
    name: string
    nameEn?: string
    description?: string
    descriptionEn?: string
    content: string
    contentEn?: string
    categoryId: string
    id?: string
    imageId?: string
    localImage?: string
    remoteImageUrl?: string
  }) => {
    usePromptStore.getState().addPrompt({
      id: data.id,
      name: data.name,
      nameEn: data.nameEn,
      description: data.description,
      descriptionEn: data.descriptionEn,
      content: data.content,
      contentEn: data.contentEn,
      categoryId: data.categoryId,
      order: localPrompts.filter(p => p.categoryId === data.categoryId).length,
      imageId: data.imageId,
      localImage: data.localImage,
      remoteImageUrl: data.remoteImageUrl,
    })
    showToast('提示词已添加')
  }, [localPrompts])

  const handleUpdatePrompt = useCallback((data: {
    name: string
    nameEn?: string
    description?: string
    descriptionEn?: string
    content: string
    contentEn?: string
    categoryId: string
    imageId?: string
    localImage?: string
    remoteImageUrl?: string
  }) => {
    if (!editingStates.prompt) return
    usePromptStore.getState().updatePrompt(editingStates.prompt.id, {
      name: data.name,
      nameEn: data.nameEn,
      description: data.description,
      descriptionEn: data.descriptionEn,
      content: data.content,
      contentEn: data.contentEn,
      categoryId: data.categoryId,
      imageId: data.imageId,
      localImage: data.localImage,
      remoteImageUrl: data.remoteImageUrl,
    })
    clearEditingItem('prompt')
    showToast('提示词已更新')
  }, [editingStates.prompt])

  const handleDeletePrompt = useCallback(async () => {
    if (!editingStates.deletingPrompt) return
    // Check if deleting a temporary prompt
    const isTemporaryPrompt = temporaryPrompts.some(p => p.id === editingStates.deletingPrompt!.id)
    if (isTemporaryPrompt) {
      // Delete from temporary library
      const imageDelete = await deletePromptImageAsset(editingStates.deletingPrompt.id)
      if (!imageDelete.success) {
        showToast('图片删除失败，请检查文件夹权限')
        return
      }
      const updatedTemporaryPrompts = temporaryPrompts.filter(p => p.id !== editingStates.deletingPrompt!.id)
      usePromptStore.setState({ temporaryPrompts: updatedTemporaryPrompts })
      // Persist via service worker (settings preserved by merge)
      chrome.runtime.sendMessage({
        type: MessageType.SET_STORAGE,
        payload: {
          version: chrome.runtime.getManifest().version,
          userData: { prompts: usePromptStore.getState().prompts, categories: usePromptStore.getState().categories },
          temporaryPrompts: updatedTemporaryPrompts
        }
      })
      setModalStates(prev => ({ ...prev, isPromptDelete: false }))
      clearEditingItem('deletingPrompt')
      showToast('提示词已删除')
      return
    }
    const imageDelete = await deletePromptImageAsset(editingStates.deletingPrompt.id)
    if (!imageDelete.success) {
      showToast('图片删除失败，请检查文件夹权限')
      return
    }
    usePromptStore.getState().deletePrompt(editingStates.deletingPrompt.id)
    setLocalPrompts(prev => prev.filter(p => p.id !== editingStates.deletingPrompt!.id))
    clearEditingItem('deletingPrompt')
    showToast('提示词已删除')
  }, [editingStates.deletingPrompt, temporaryPrompts])

  // Handle transfer temporary prompt to category
  const handleTransferTemporaryPrompt = useCallback((categoryId: string) => {
    if (!editingStates.prompt) return
    usePromptStore.getState().transferTemporaryPrompt(editingStates.prompt.id, categoryId)
    clearEditingItem('prompt')
    showToast('已转移到分类')
  }, [editingStates.prompt])

  // Handle copy prompt to clipboard
  const handleCopyPrompt = useCallback(async (prompt: Prompt) => {
    const contentToCopy = resourceLanguage === 'en' && prompt.contentEn ? prompt.contentEn : prompt.content
    try {
      await navigator.clipboard.writeText(contentToCopy)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [resourceLanguage])

  // Handle share to team
  const handleShareToTeam = useCallback((prompt: Prompt) => {
    if (!authState || authState.status !== 'logged_in') {
      showToast('请先登录后共享')
      return
    }
    setEditingItem('sharingPrompt', prompt)
    openModal('isTeamShare')
  }, [authState, setEditingItem, openModal])

  // Handle team share dialog close (memoized for TeamShareDialog)
  const handleTeamShareClose = useCallback(() => {
    closeModal('isTeamShare')
    clearEditingItem('sharingPrompt')
  }, [closeModal, clearEditingItem])

  // Handle copy resource prompt to clipboard
  const handleCopyResourcePrompt = useCallback(async (resourcePrompt: ResourcePrompt) => {
    const contentToCopy = resourceLanguage === 'en' && resourcePrompt.contentEn ? resourcePrompt.contentEn : resourcePrompt.content
    try {
      await navigator.clipboard.writeText(contentToCopy)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败')
    }
  }, [resourceLanguage])

  // Check if currently editing a temporary prompt
  const isEditingTemporaryPrompt = useMemo(() => {
    if (!editingStates.prompt) return false
    const promptId = editingStates.prompt.id
    return temporaryPrompts.some(p => p.id === promptId)
  }, [editingStates.prompt, temporaryPrompts])

  // Handle first-time backup warning actions
  const handleBackupWarningSelectFolder = useCallback(async () => {
    closeModal('showFirstBackupWarning')
    if (dontShowBackupWarning) {
      chrome.runtime.sendMessage({ type: MessageType.DISMISS_BACKUP_WARNING })
    }
    // Open sidepanel for folder selection
    chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })
  }, [dontShowBackupWarning])

  const handleBackupWarningSkip = useCallback(() => {
    closeModal('showFirstBackupWarning')
    if (dontShowBackupWarning) {
      chrome.runtime.sendMessage({ type: MessageType.DISMISS_BACKUP_WARNING })
    }
  }, [dontShowBackupWarning])

  // Drag handlers - allow user to move dropdown by dragging header
  const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
    // Only start drag from header area, not from action buttons
    if ((e.target as HTMLElement).closest('.dropdown-header-actions')) return

    const rect = dropdownRef.current?.getBoundingClientRect()
    if (!rect) return

    setIsDragging(true)
    setDragStartPosition({ x: rect.left, y: rect.top })
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handlePanelDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragOffset) return

    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y

    // Keep within viewport bounds
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const dropdownWidth = 640
    const dropdownHeight = 600

    const boundedX = Math.max(0, Math.min(newX, viewportWidth - dropdownWidth))
    const boundedY = Math.max(0, Math.min(newY, viewportHeight - dropdownHeight))

    setDragStartPosition({ x: boundedX, y: boundedY })
  }, [isDragging, dragOffset])

  const handlePanelDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Mouse move and up listeners for drag
  useEffect(() => {
    if (!isDragging) return

    document.addEventListener('mousemove', handlePanelDragMove)
    document.addEventListener('mouseup', handlePanelDragEnd)

    return () => {
      document.removeEventListener('mousemove', handlePanelDragMove)
      document.removeEventListener('mouseup', handlePanelDragEnd)
    }
  }, [isDragging, handlePanelDragMove, handlePanelDragEnd])

  if (!isOpen) {
    // When dropdown is closed, only render backup reminder banner if needed
    return createPortal(
      <>
        {modalStates.showBackupReminder && (
          <div className="backup-reminder-banner-closed">
            <AlertTriangle style={{ width: 14, height: 14, color: '#1e40af' }} />
            <span className="backup-reminder-text">本次改动尚未备份</span>
            <span
              className="backup-reminder-link"
              onClick={() => closeModal('showBackupReminder')}
            >
              已知晓
            </span>
            <span className="backup-reminder-close" onClick={() => closeModal('showBackupReminder')}>×</span>
          </div>
        )}
        <style>{`.backup-reminder-banner-closed {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          border-radius: 8px;
          font-size: 13px;
          color: #1E40AF;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .backup-reminder-banner-closed .backup-reminder-text { color: #1E40AF; }
        .backup-reminder-banner-closed .backup-reminder-link {
          color: #2563EB;
          cursor: pointer;
          font-weight: 500;
        }
        .backup-reminder-banner-closed .backup-reminder-link:hover { text-decoration: underline; }
        .backup-reminder-banner-closed .backup-reminder-close {
          cursor: pointer;
          font-size: 16px;
          color: #6B7280;
          margin-left: 4px;
        }
        `}</style>
      </>,
      document.body
    )
  }

  // Calculate dropdown style - use drag position if user has dragged, otherwise use initial position
  const dropdownStyle: React.CSSProperties = {
    // If user has dragged, use their custom position
    ...(dragStartPosition
      ? {
          top: dragStartPosition.y,
          left: dragStartPosition.x,
          right: 'auto' as const,
          transform: 'none',
        }
      : {
          top: position.top,
          transform: position.isStickyTop ? 'none' : 'translateY(-100%)',
          ...(position.isStickyLeft
            ? { left: position.left }
            : { right: position.right }
          ),
        }
    ),
    cursor: isDragging ? 'grabbing' : 'default',
    width: 640,
    height: 600,
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
          {agentViewMode === 'agent' ? (
            <>
              {/* Back to default mode */}
              <button
                className="sidebar-category-item"
                onClick={() => setAgentViewMode('default')}
                aria-label="返回"
              >
                <div className="sidebar-category-icon-wrapper">
                  <ArrowLeft className="sidebar-category-icon" />
                </div>
                <span>返回</span>
              </button>
              {/* Agent template categories */}
              {getAgentTemplates().map(template => (
                <button
                  key={template.id}
                  className={`sidebar-category-item ${agentSelectedTemplate === template.id ? 'selected' : ''}`}
                  onClick={() => setAgentSelectedTemplate(template.id)}
                >
                  <div className="sidebar-category-icon-wrapper">
                    <Bot className="sidebar-category-icon" style={{ color: agentSelectedTemplate === template.id ? '#A16207' : '#64748B' }} />
                  </div>
                  <Tooltip content={template.description} maxWidth={600}>
                    <span>{template.name}</span>
                  </Tooltip>
                </button>
              ))}
            </>
          ) : isResourceLibrary ? (
            <>
              {/* Back to local categories */}
              <button
                className="sidebar-category-item"
                onClick={() => {
                  setIsResourceLibrary(false)
                  setSelectedCategoryId('all')
                }}
                aria-label="返回本地分类"
              >
                <div className="sidebar-category-icon-wrapper">
                  <ArrowLeft className="sidebar-category-icon" />
                </div>
                <span>返回</span>
              </button>
              {/* Resource library mode: show categories */}
              <>
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
            </>
          ) : (
            <>
              <button
                className="sidebar-category-item"
                onClick={() => setAgentViewMode('agent')}
                aria-label="Agent"
              >
                <div className="sidebar-category-icon-wrapper">
                  <Bot className="sidebar-category-icon" style={{ color: '#A16207' }} />
                </div>
                <span style={{ color: '#A16207' }}>Agent</span>
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

              {/* "团队库" entry - between 资源库 and 临时库 */}
              <button
                className={`sidebar-category-item ${selectedCategoryId === 'team' ? 'selected' : ''}`}
                onClick={() => setSelectedCategoryId('team')}
                aria-label="团队库"
              >
                <div className="sidebar-category-icon-wrapper">
                  <Users className="sidebar-category-icon" style={{ color: selectedCategoryId === 'team' ? '#8b5cf6' : '#64748B' }} />
                </div>
                <span style={{ color: selectedCategoryId === 'team' ? '#8b5cf6' : undefined }}>团队库</span>
                {teamSyncStatus && (
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>
                    {teamPrompts.length}
                  </span>
                )}
              </button>

              {/* "临时库" entry - as sidebar category item */}
              <button
                className={`sidebar-category-item ${selectedCategoryId === 'temporary' ? 'selected' : ''}`}
                onClick={() => setSelectedCategoryId('temporary')}
                aria-label="临时库"
              >
                <div className="sidebar-category-icon-wrapper">
                  <Clock className="sidebar-category-icon" />
                </div>
                <span>临时库</span>
              </button>

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
                          setEditingItem('category', cat)
                          openModal('isCategoryEdit')
                        }}
                        onDelete={(cat) => {
                          setEditingItem('deletingCategory', cat)
                          openModal('isCategoryDelete')
                        }}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
              {/* Add category button */}
              <button
                className="sidebar-add-category-btn"
                onClick={() => openModal('isCategoryAdd')}
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
        <div
          ref={headerRef}
          className={`dropdown-header ${isDragging ? 'dragging' : ''}`}
          onMouseDown={handlePanelDragStart}
        >
          <span className="dropdown-header-title" style={{ cursor: 'grab' }}>
            <img className="dropdown-header-logo" src={chrome.runtime.getURL('assets/icon-128.png')} alt="Oh My Prompt" />
            Oh My Prompt
            <span className="version-badge">v{chrome.runtime.getManifest().version}</span>
          </span>
          <div className="dropdown-header-actions">
            {visionEnabled && (
              <Tooltip content="转提示词功能已开启" placement="bottom">
                <button
                  className="dropdown-action-btn"
                  style={{ color: '#a855f7' }}
                  onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })}
                  aria-label="转提示词功能已开启"
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                </button>
              </Tooltip>
            )}
            <Tooltip content={updateStatus?.hasUpdate ? `新版本 ${updateStatus.latestVersion} 可用` : '检查更新'} placement="bottom">
              <button
                ref={updateButtonRef}
                className={`dropdown-action-btn${modalStates.showLatestTip ? ' has-tip' : ''}`}
                style={updateStatus?.hasUpdate ? { color: '#FF5722' } : {}}
                onClick={updateStatus?.hasUpdate ? () => openModal('isUpdateGuide') : handleCheckUpdate}
                aria-label={updateStatus?.hasUpdate ? '查看更新引导' : '检查更新'}
              >
                <ArrowUpCircle style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <button
              className="dropdown-language-btn"
              onClick={() => handleLanguageSwitch(resourceLanguage === 'zh' ? 'en' : 'zh')}
              aria-label={resourceLanguage === 'zh' ? '切换到英文' : '切换到中文'}
            >
              {resourceLanguage === 'zh' ? '中' : 'EN'}
            </button>
            <Tooltip content="设置" placement="bottom">
              <button
                className="dropdown-action-btn"
                onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL_FOR_SETTINGS })}
                aria-label="设置"
              >
                <Settings style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="官网" placement="bottom">
              <a
                className="dropdown-action-btn"
                href="https://oh-my-prompt.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="访问官网"
              >
                <House style={{ width: 14, height: 14 }} />
              </a>
            </Tooltip>
          </div>
        </div>

        {/* Content area */}
        <>
            {/* Update notification banner */}
            {updateStatus?.hasUpdate && (
              <div className="update-banner">
                <ArrowUpCircle style={{ width: 14, height: 14, color: '#856404' }} />
                <span className="update-banner-text">新版本 {updateStatus.latestVersion} 可用</span>
                <span
                  className="update-banner-link"
                  onClick={() => openModal('isUpdateGuide')}
                >
                  查看更新引导
                </span>
                <span className="update-banner-close" onClick={handleDismissUpdate}>×</span>
              </div>
            )}

            {/* Backup reminder banner - shows after sorting changes */}
            {modalStates.showBackupReminder && (
              <div className="backup-reminder-banner">
                <AlertTriangle style={{ width: 14, height: 14, color: '#1e40af' }} />
                <span className="backup-reminder-text">本次改动尚未备份</span>
                <span
                  className="backup-reminder-link"
                  onClick={() => {
                    closeModal('showBackupReminder')
                    chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })
                  }}
                >
                  设置备份
                </span>
                <span className="backup-reminder-close" onClick={() => closeModal('showBackupReminder')}>×</span>
              </div>
            )}

            {/* First-time backup warning banner - shows on first open if no backup */}
            {modalStates.showFirstBackupWarning && (
              <div className="first-backup-warning-banner">
                <div className="first-backup-warning-header">
                  <AlertTriangle className="first-backup-warning-icon" />
                  <span className="first-backup-warning-title">数据安全提醒</span>
                </div>
                <div className="first-backup-warning-text">
                  当前有 {backupWarningPromptCount} 个提示词。<br />
                  <strong>设置备份后，数据将自动保存到您电脑的本地文件夹</strong>。<br />
                  扩展更新或重新安装后，重新选择该文件夹即可恢复数据。
                </div>
                <div className="first-backup-warning-actions">
                  <button
                    className="first-backup-warning-btn"
                    onClick={handleBackupWarningSelectFolder}
                  >
                    选择备份文件夹
                  </button>
                  <span
                    className="first-backup-warning-skip"
                    onClick={handleBackupWarningSkip}
                  >
                    稍后设置
                  </span>
                  <label className="first-backup-warning-checkbox">
                    <input
                      type="checkbox"
                      checked={dontShowBackupWarning}
                      onChange={(e) => setDontShowBackupWarning(e.target.checked)}
                      style={{ width: 12, height: 12 }}
                    />
                    不再提醒
                  </label>
                </div>
              </div>
            )}

            <div className="dropdown-content" ref={scrollContainerRef} onScroll={handleScroll}>
          {agentViewMode === 'agent' ? (
            agentSelectedTemplate === 'ecommerce' ? (
              <EcommercePanel
                selectedTemplate={agentSelectedTemplate}
                extractedText={agentExtractedText}
                categories={sortableCategories}
                onSave={(prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => {
                  const template = getAgentTemplate(templateCategory)
                  usePromptStore.getState().addPrompt({
                    name: `Agent: ${template?.name || '生成'}`,
                    content: prompt,
                    categoryId,
                    order: localPrompts.filter(p => p.categoryId === categoryId).length,
                  })
                  showToast('已保存到库')
                }}
                onInsert={onInsertText}
                persistedState={ecommercePanelState}
                onPersistStateChange={handleEcommerceStateChange}
              />
            ) : (
              <AgentPanel
                selectedTemplate={agentSelectedTemplate}
                extractedText={agentExtractedText}
                categories={sortableCategories}
                onSave={(prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => {
                  const template = getAgentTemplate(templateCategory)
                  usePromptStore.getState().addPrompt({
                    name: `Agent: ${template?.name || '生成'}`,
                    content: prompt,
                    categoryId,
                    order: localPrompts.filter(p => p.categoryId === categoryId).length,
                  })
                  showToast('已保存到库')
                }}
                onInsert={onInsertText}
                persistedInputText={agentPanelState.inputText}
                persistedResult={agentPanelState.result}
                persistedStructuredResult={agentPanelState.structuredResult}
                persistedImageData={agentPanelState.imageData}
                onPersistStateChange={handleAgentStateChange}
              />
            )
          ) : isLoading ? (
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
                    language={resourceLanguage}
                    onClick={() => {
                      // Find the original raw prompt (unmodified name/content) for the modal
                      const rawPrompt = rawResourcePrompts.find(p => p.id === prompt.id)
                      setEditingItem('resourcePrompt', rawPrompt || prompt)
                      openModal('isPreview')
                    }}
                    onInject={() => handleInjectFromCard(prompt)}
                    onCollect={() => handleQuickCollect(prompt)}
                    onCopy={() => handleCopyResourcePrompt(prompt)}
                    isCollected={isPromptCollected(prompt)}
                  />
                ))}
              </div>
            )
          ) : selectedCategoryId === 'team' ? (
            // Team library content view
            authState?.status !== 'logged_in' ? (
              // Not logged in state
              <div className="team-library-empty">
                <div className="team-library-empty-message">
                  <p>团队库需要登录后使用</p>
                  <button
                    className="team-library-empty-btn"
                    onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })}
                  >
                    前往设置登录
                  </button>
                </div>
              </div>
            ) : (
              // Team prompts grid
              <>
                {/* Team sync header */}
                <div className="team-library-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {teams.length > 0 && (
                      <select
                        value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                        style={{ fontSize: '11px', padding: '1px 4px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'white', color: '#334155', cursor: 'pointer', maxWidth: '100px' }}
                      >
                        <option value="all">全部团队</option>
                        {teams.map(team => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    )}
                    <span className="team-library-count">共 {filteredTeamPrompts.length} 条团队提示词</span>
                  </div>
                  <button
                    className="team-sync-btn"
                    onClick={handleTeamSync}
                    disabled={teamSyncing}
                  >
                    {teamSyncing ? (
                      <>
                        <Loader2 className="team-sync-spinner" style={{ width: 12, height: 12 }} />
                        同步中...
                      </>
                    ) : '同步'}
                  </button>
                </div>
                {filteredTeamPrompts.length === 0 ? (
                  <div className="team-library-empty">
                    <div className="team-library-empty-message">
                      <p>{teamPrompts.length === 0 ? '暂无团队提示词' : '该团队暂无团队提示词'}</p>
                      <button
                        className="team-library-empty-btn"
                        onClick={handleTeamSync}
                        disabled={teamSyncing}
                      >
                        {teamSyncing ? (
                          <>
                            <Loader2 className="team-sync-spinner" style={{ width: 12, height: 12 }} />
                            同步中...
                          </>
                        ) : '同步团队库'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="team-cards-grid">
                    {filteredTeamPrompts.map((prompt) => (
                      <TeamPromptCard
                        key={prompt.id}
                        prompt={prompt}
                        language={resourceLanguage}
                        onClick={() => {
                          setEditingItem('teamPrompt', prompt)
                          openModal('isPreview')
                        }}
                        onInject={() => handleInjectTeamPrompt(prompt)}
                        onSave={() => handleSaveTeamPrompt(prompt)}
                        onCopy={() => handleCopyTeamPrompt(prompt)}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          ) : filteredPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-message">
                {selectedCategoryId === 'all'
                  ? '暂无提示词，点击下方按钮添加'
                  : selectedCategoryId === 'temporary'
                    ? '暂无临时提示词'
                    : selectedCategoryId === 'team'
                      ? '暂无团队提示词'
                      : '该分类暂无提示词'}
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
                      onThumbnailClick={(p) => {
                        setEditingItem('userPrompt', p)
                        openModal('isUserPreview')
                      }}
                      onEdit={(p) => {
                        const originalPrompt = localPrompts.find(lp => lp.id === p.id) || p
                        setEditingItem('prompt', originalPrompt)
                        openModal('isPromptEdit')
                      }}
                      onDelete={(p) => {
                        setEditingItem('deletingPrompt', p)
                        openModal('isPromptDelete')
                      }}
                      onCopy={handleCopyPrompt}
                      onShare={handleShareToTeam}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
        {/* FAB add prompt button */}
            {!isResourceLibrary && selectedCategoryId !== 'temporary' && selectedCategoryId !== 'team' && agentViewMode !== 'agent' && (
              <button
                className="fab-add-prompt"
                onClick={() => openModal('isPromptAdd')}
                aria-label="添加提示词"
              >
                <Plus style={{ width: 18, height: 18 }} />
              </button>
            )}
          </>
        </div>
      </div>
    {/* Prompt preview modal with collect - handles both resource and team prompts */}
    {(editingStates.resourcePrompt || editingStates.teamPrompt) && (
      <Suspense fallback={null}>
        <PromptPreviewModal
          prompt={(editingStates.resourcePrompt || editingStates.teamPrompt)!}
          isOpen={modalStates.isPreview}
          onClose={() => {
            closeModal('isPreview')
            clearEditingItem('resourcePrompt')
            clearEditingItem('teamPrompt')
          }}
          onCollect={() => {
            if (editingStates.teamPrompt) {
              openModal('isTeamCategoryDialog')
            } else {
              openModal('isCategoryDialog')
            }
          }}
          onInject={(language) => {
            if (editingStates.teamPrompt) {
              handleInjectTeamPrompt(
                language === 'en' && editingStates.teamPrompt.contentEn
                  ? { ...editingStates.teamPrompt, content: editingStates.teamPrompt.contentEn }
                  : editingStates.teamPrompt
              )
            } else if (editingStates.resourcePrompt && onInjectResource) {
              // Keep existing resource inject code
              const promptToInject = language === 'en' && editingStates.resourcePrompt.contentEn
                ? { ...editingStates.resourcePrompt, content: editingStates.resourcePrompt.contentEn }
                : editingStates.resourcePrompt
              onInjectResource(promptToInject)
              showToast('已注入提示词')
            }
          }}
          onCopy={() => {
            if (editingStates.teamPrompt) {
              handleCopyTeamPrompt(editingStates.teamPrompt)
            } else if (editingStates.resourcePrompt) {
              handleCopyResourcePrompt(editingStates.resourcePrompt)
            }
          }}
          globalLanguage={resourceLanguage}
        />
      </Suspense>
    )}
    {/* User prompt preview modal (triggered by thumbnail click) */}
    {editingStates.userPrompt && (
      <Suspense fallback={null}>
        <PromptPreviewModal
          prompt={editingStates.userPrompt}
          isOpen={modalStates.isUserPreview}
          onClose={() => {
            closeModal('isUserPreview')
            clearEditingItem('userPrompt')
          }}
          isUserPrompt={true}
          onEdit={() => {
            closeModal('isUserPreview')
            setEditingItem('prompt', editingStates.userPrompt)
            openModal('isPromptEdit')
          }}
          onInject={(language) => {
            // For user prompts, inject using onSelect with content
            if (editingStates.userPrompt) {
              const promptToInject = {
                ...editingStates.userPrompt,
                content: language === 'en' && editingStates.userPrompt.contentEn
                  ? editingStates.userPrompt.contentEn
                  : editingStates.userPrompt.content
              }
              onSelect(promptToInject)
              closeModal('isUserPreview')
              clearEditingItem('userPrompt')
              showToast('已插入提示词')
            }
          }}
          onCopy={() => {
            if (editingStates.userPrompt) {
              handleCopyPrompt(editingStates.userPrompt)
            }
          }}
        />
      </Suspense>
    )}
    {/* Category select dialog */}
    <CategorySelectDialog
      categories={sortableCategories}
      isOpen={modalStates.isCategoryDialog}
      onClose={() => closeModal('isCategoryDialog')}
      onConfirm={handleConfirmCollect}
    />
    {/* Team prompt category select dialog */}
    <CategorySelectDialog
      categories={sortableCategories}
      isOpen={modalStates.isTeamCategoryDialog}
      onClose={() => closeModal('isTeamCategoryDialog')}
      onConfirm={handleConfirmCollect}
    />
    {/* Team share dialog */}
    {editingStates.sharingPrompt && (
      <TeamShareDialog
        prompt={editingStates.sharingPrompt}
        isOpen={modalStates.isTeamShare}
        onClose={handleTeamShareClose}
      />
    )}
    {/* "Already latest" tip - Portal rendered outside dropdown to escape overflow:hidden */}
    {modalStates.showLatestTip && updateButtonRef.current && (
      <div
        style={{
          position: 'fixed',
          top: updateButtonRef.current.getBoundingClientRect().bottom + 4,
          left: updateButtonRef.current.getBoundingClientRect().left + updateButtonRef.current.offsetWidth / 2,
          transform: 'translateX(-50%)',
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '4px',
          padding: '4px 8px',
          whiteSpace: 'nowrap',
          zIndex: 2147483647,
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 11, color: '#16a34a' }}>已是最新版本</span>
      </div>
    )}
    {/* Update guide modal */}
    <Suspense fallback={null}>
      <UpdateGuideModal
        status={updateStatus}
        isOpen={modalStates.isUpdateGuide}
        onClose={() => closeModal('isUpdateGuide')}
      />
    </Suspense>
    {/* Category CRUD modals */}
    <Suspense fallback={null}>
      <CategoryEditModal
        isOpen={modalStates.isCategoryAdd}
        onClose={() => closeModal('isCategoryAdd')}
        mode="add"
        onConfirm={handleAddCategory}
      />
      <CategoryEditModal
        isOpen={modalStates.isCategoryEdit}
        onClose={() => {
          closeModal('isCategoryEdit')
          clearEditingItem('category')
        }}
        mode="edit"
        initialName={editingStates.category?.name || ''}
        onConfirm={handleUpdateCategory}
      />
      <DeleteConfirmModal
        isOpen={modalStates.isCategoryDelete}
        onClose={() => {
          closeModal('isCategoryDelete')
          clearEditingItem('deletingCategory')
        }}
        itemName={editingStates.deletingCategory?.name || ''}
        itemType="category"
        onConfirm={handleDeleteCategory}
      />
    </Suspense>
    {/* Prompt CRUD modals */}
    <Suspense fallback={null}>
      <PromptEditModal
        isOpen={modalStates.isPromptAdd}
        onClose={() => closeModal('isPromptAdd')}
        mode="add"
        categories={sortableCategories}
        defaultCategoryId={selectedCategoryId !== 'all' ? selectedCategoryId : undefined}
        onConfirm={handleAddPrompt}
      />
      <PromptEditModal
        isOpen={modalStates.isPromptEdit}
        onClose={() => {
          closeModal('isPromptEdit')
          clearEditingItem('prompt')
        }}
        mode="edit"
        prompt={editingStates.prompt ?? undefined}
        categories={sortableCategories}
        isTemporary={isEditingTemporaryPrompt}
        onTransfer={handleTransferTemporaryPrompt}
        onConfirm={handleUpdatePrompt}
      />
      <DeleteConfirmModal
        isOpen={modalStates.isPromptDelete}
        onClose={() => {
          closeModal('isPromptDelete')
          clearEditingItem('deletingPrompt')
        }}
        itemName={editingStates.deletingPrompt?.name || ''}
        itemType="prompt"
        onConfirm={handleDeletePrompt}
      />
    </Suspense>
  </>,
    getPortalContainer()
  )
}
