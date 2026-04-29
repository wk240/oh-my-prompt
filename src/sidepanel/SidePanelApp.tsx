/**
 * SidePanelApp - Main component for Chrome Extension Side Panel
 * Reuses core functionality from DropdownContainer adapted for side panel context
 */

import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react'
import type { Prompt, Category, StorageSchema, ResourcePrompt, UpdateStatus } from '../shared/types'
import { truncateText, sortCategoriesByOrder, sortPromptsByOrder, sortProviderCategoriesByOrder, sortResourcePromptsByCategoryOrder } from '../shared/utils'
import { Sparkles, Palette, Shapes, FolderOpen, Layers, Sparkle, Brush, GripVertical, Database, ArrowLeft, Sun, Frame, Paintbrush, Image, RefreshCw, ArrowUpCircle, Plus, Pencil, Trash2, Download, Upload, ExternalLink, ArrowUpRight, Bookmark, AlertTriangle, Settings } from 'lucide-react'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePromptStore } from '../lib/store'
import { getResourcePrompts, getResourceCategories } from '../lib/resource-library'
import { MessageType } from '../shared/messages'
import { readImportFile, mergeImportData } from '../lib/import-export'
import { Tooltip } from '../content/components/Tooltip'
import { ToastNotification } from '../content/components/ToastNotification'

// Lazy load modal components
const PromptPreviewModal = lazy(() => import('../content/components/PromptPreviewModal').then(m => ({ default: m.PromptPreviewModal })))
const UpdateGuideModal = lazy(() => import('../content/components/UpdateGuideModal').then(m => ({ default: m.UpdateGuideModal })))
const CategoryEditModal = lazy(() => import('../content/components/CategoryEditModal').then(m => ({ default: m.CategoryEditModal })))
const DeleteConfirmModal = lazy(() => import('../content/components/DeleteConfirmModal').then(m => ({ default: m.DeleteConfirmModal })))
const PromptEditModal = lazy(() => import('../content/components/PromptEditModal').then(m => ({ default: m.PromptEditModal })))
const CategorySelectDialog = lazy(() => import('../content/components/CategorySelectDialog').then(m => ({ default: m.CategorySelectDialog })))

// Icon mapping for categories
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'cat-quality': Sparkles,
  'cat-style': Palette,
  'cat-lighting': Sun,
  'cat-composition': Frame,
  'cat-color': Paintbrush,
  'cat-theme': Image,
  'cat-medium': Layers,
  all: FolderOpen,
  design: Sparkle,
  style: Brush,
  other: Layers,
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  design: Sparkles,
  style: Palette,
  default: Shapes,
}

// Fallback placeholder SVG for failed image loads
const FALLBACK_IMAGE_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40"%3E%3Crect fill="%23f0f0f0" width="60" height="40"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="8" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E'

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
        <span className="sidebar-category-name">{category.name}</span>
      </Tooltip>
      <div className="category-action-buttons">
        <button
          className="category-action-btn"
          onClick={(e) => { e.stopPropagation(); onEdit(category) }}
          aria-label="编辑分类"
        >
          <Pencil style={{ width: 12, height: 12 }} />
        </button>
        <button
          className="category-action-btn delete"
          onClick={(e) => { e.stopPropagation(); onDelete(category) }}
          aria-label="删除分类"
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </div>
    </div>
  )
}

// Sortable prompt item component
function SortablePromptItem({
  prompt,
  isSelected,
  onSelect,
  showDragHandle,
  onEdit,
  onDelete,
  isOnLovart,
}: {
  prompt: Prompt
  isSelected: boolean
  onSelect: (prompt: Prompt) => void
  showDragHandle: boolean
  onEdit: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  isOnLovart: boolean
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
      className={`prompt-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
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
      {prompt.localImage && (
        <img
          src={prompt.localImage}
          alt={prompt.name}
          className="prompt-item-thumbnail"
          onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE_SVG }}
        />
      )}
      <div className="prompt-item-icon-wrapper">
        {showDragHandle && (
          <div className="prompt-item-drag-handle" {...attributes} {...listeners}>
            <GripVertical style={{ width: 12, height: 12 }} />
          </div>
        )}
        <IconComponent className="prompt-item-icon" />
      </div>
      <div className="prompt-item-text">
        <Tooltip content={prompt.name}>
          <span className="prompt-item-name">{prompt.name}</span>
        </Tooltip>
        <Tooltip content={prompt.description || prompt.content}>
          <span className="prompt-item-preview">{truncateText(prompt.description || prompt.content, 40)}</span>
        </Tooltip>
      </div>
      {isOnLovart && <ArrowUpRight className="prompt-item-arrow" />}
      <div className="prompt-action-buttons">
        <button
          className="prompt-action-btn"
          onClick={(e) => { e.stopPropagation(); onEdit(prompt) }}
          aria-label="编辑提示词"
        >
          <Pencil style={{ width: 14, height: 14 }} />
        </button>
        <button
          className="prompt-action-btn delete"
          onClick={(e) => { e.stopPropagation(); onDelete(prompt) }}
          aria-label="删除提示词"
        >
          <Trash2 style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

// Network prompt card for resource library
function SidePanelNetworkCard({
  prompt,
  onClick,
  onInject,
  onCollect,
  isCollected,
  language,
  isOnLovart,
}: {
  prompt: ResourcePrompt
  onClick: () => void
  onInject?: () => void
  onCollect?: () => void
  isCollected?: boolean
  language: 'zh' | 'en'
  isOnLovart: boolean
}) {
  const displayName = language === 'en' && prompt.nameEn ? prompt.nameEn : prompt.name

  return (
    <div
      className="network-card"
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
      {prompt.previewImage && (
        <img
          src={prompt.previewImage}
          alt={displayName}
          className="network-card-thumbnail"
          onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE_SVG }}
        />
      )}
      <Tooltip content={displayName}>
        <div className="network-card-name">{truncateText(displayName, 20)}</div>
      </Tooltip>
      <Tooltip content={prompt.description || prompt.content}>
        <div className="network-card-category">{prompt.sourceCategory || 'Unknown'}</div>
      </Tooltip>
      {prompt.author && (
        <a
          href={prompt.authorUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="network-card-author"
        >
          by {prompt.author}
        </a>
      )}
      <div className="network-card-actions">
        <Tooltip content={isCollected ? '已收藏' : '收藏'}>
          <button
            onClick={(e) => { e.stopPropagation(); onCollect?.() }}
            className="network-card-btn collect"
            aria-label={isCollected ? '已收藏' : '收藏'}
          >
            <Bookmark style={{ width: 12, height: 12, fill: isCollected ? 'currentColor' : 'none' }} />
          </button>
        </Tooltip>
        {isOnLovart && (
          <Tooltip content="注入">
            <button
              onClick={(e) => { e.stopPropagation(); onInject?.() }}
              className="network-card-btn inject"
              aria-label="注入"
            >
              <ArrowUpRight style={{ width: 12, height: 12 }} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default function SidePanelApp() {
  // Store state
  const prompts = usePromptStore((state) => state.prompts)
  const categories = usePromptStore((state) => state.categories)
  const isLoading = usePromptStore((state) => state.isLoading)
  const loadFromStorage = usePromptStore((state) => state.loadFromStorage)

  // Local state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [isResourceLibrary, setIsResourceLibrary] = useState(false)
  const [selectedResourceCategoryId, setSelectedResourceCategoryId] = useState<string>('all')
  const [resourceLanguage, setResourceLanguage] = useState<'zh' | 'en'>('zh')
  const [loadedCount, setLoadedCount] = useState(50)

  // Input availability detection (universal - works on any page with input)
  const [isOnLovart, setIsOnLovart] = useState(false)
  const [currentTabId, setCurrentTabId] = useState<number | null>(null)

  // Modal states
  const [modalStates, setModalStates] = useState({
    isPreview: false,
    isCategoryDialog: false,
    isCategoryAdd: false,
    isCategoryEdit: false,
    isCategoryDelete: false,
    isPromptAdd: false,
    isPromptEdit: false,
    isPromptDelete: false,
    isUpdateGuide: false,
    showLatestTip: false,
    toastMessage: null as string | null,
  })

  // Editing states
  const [editingStates, setEditingStates] = useState({
    resourcePrompt: null as ResourcePrompt | null,
    category: null as Category | null,
    prompt: null as Prompt | null,
    deletingCategory: null as Category | null,
    deletingPrompt: null as Prompt | null,
  })

  // Update status
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Resource library data
  const [resourcePrompts, setResourcePrompts] = useState<ResourcePrompt[]>([])
  const rawResourcePrompts = useMemo(() => getResourcePrompts(), [])
  const resourceCategories = useMemo(() => getResourceCategories(), [])

  // Load data on mount
  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  // Load language preference
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings?.resourceLanguage) {
        setResourceLanguage(response.data.settings.resourceLanguage)
      }
    })
  }, [])

  // Transform resource prompts by language
  useEffect(() => {
    setResourcePrompts(rawResourcePrompts.map(p => ({
      ...p,
      name: resourceLanguage === 'en' && p.nameEn ? p.nameEn : p.name,
      content: resourceLanguage === 'en' && p.contentEn ? p.contentEn : p.content,
    })))
  }, [rawResourcePrompts, resourceLanguage])

  // Check current tab input availability on mount
  useEffect(() => {
    console.log('[Oh My Prompt] SidePanel: Starting input availability check')

    // Helper function to check if a URL is a special page (no content script)
    const isSpecialPage = (url: string): boolean => {
      return url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about://') || url.startsWith('chrome-extension://')
    }

    // Helper function to check input availability on a tab
    const checkInputOnTab = async (tabId: number, retries: number): Promise<boolean> => {
      console.log('[Oh My Prompt] SidePanel: Starting checkInput on tab', tabId, 'with', retries, 'retries')
      for (let i = 0; i < retries; i++) {
        try {
          if (i > 0) {
            console.log('[Oh My Prompt] SidePanel: Waiting 500ms before retry', i + 1)
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          console.log('[Oh My Prompt] SidePanel: Sending CHECK_INPUT_AVAILABILITY to tab', tabId)
          const response = await chrome.tabs.sendMessage(tabId, {
            type: MessageType.CHECK_INPUT_AVAILABILITY
          })
          console.log('[Oh My Prompt] SidePanel: Received response:', response)
          if (response?.success && response.data?.hasInput) {
            console.log('[Oh My Prompt] SidePanel: Input available!')
            return true
          }
        } catch (error) {
          console.log(`[Oh My Prompt] SidePanel: Message failed, retry ${i + 1}/${retries}`, error)
        }
      }
      return false
    }

    // First check active tab, then fallback to other tabs in the same window
    chrome.tabs.query({ active: true, currentWindow: true }, async (activeTabs) => {
      const activeTab = activeTabs[0]
      console.log('[Oh My Prompt] SidePanel: Active tab:', activeTab?.id, activeTab?.url)

      // If active tab is valid and not special page, use it
      if (activeTab?.id && activeTab?.url) {
        const isLovart = activeTab.url.includes('lovart.ai') || activeTab.url.startsWith('file://')
        if (isLovart) {
          console.log('[Oh My Prompt] SidePanel: Lovart page detected, enabling injection')
          setCurrentTabId(activeTab.id)
          setIsOnLovart(true)
          return
        }

        if (!isSpecialPage(activeTab.url)) {
          setCurrentTabId(activeTab.id)
          const hasInput = await checkInputOnTab(activeTab.id, 3)
          setIsOnLovart(hasInput)
          console.log('[Oh My Prompt] SidePanel: Input check result:', hasInput)
          return
        }
      }

      // Active tab is special page, find another tab in the same window
      console.log('[Oh My Prompt] SidePanel: Active tab is special page, searching for other tabs')
      chrome.tabs.query({ currentWindow: true }, async (allTabs) => {
        // Find first non-special page tab (excluding active tab which we already checked)
        const candidateTabs = allTabs.filter(t =>
          t.id && t.url && !isSpecialPage(t.url) && t.id !== activeTab?.id
        )

        console.log('[Oh My Prompt] SidePanel: Found', candidateTabs.length, 'candidate tabs')
        for (const tab of candidateTabs) {
          if (tab.id && tab.url) {
            const isLovart = tab.url.includes('lovart.ai') || tab.url.startsWith('file://')
            if (isLovart) {
              console.log('[Oh My Prompt] SidePanel: Found Lovart tab:', tab.id, tab.url)
              setCurrentTabId(tab.id)
              setIsOnLovart(true)
              return
            }

            setCurrentTabId(tab.id)
            const hasInput = await checkInputOnTab(tab.id, 2) // Fewer retries for fallback tabs
            if (hasInput) {
              console.log('[Oh My Prompt] SidePanel: Found tab with input:', tab.id, tab.url)
              setIsOnLovart(true)
              return
            }
          }
        }

        // No suitable tab found
        console.log('[Oh My Prompt] SidePanel: No tab with input found in window')
        setIsOnLovart(false)
        setCurrentTabId(null)
      })
    })
  }, [])

  // Fetch update status
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_UPDATE_STATUS }, (response) => {
      if (response?.success && response.data) {
        setUpdateStatus(response.data)
      }
    })
  }, [])

  // Helper functions for modal state
  const openModal = useCallback((key: keyof typeof modalStates) =>
    setModalStates(prev => ({ ...prev, [key]: true })), [])
  const closeModal = useCallback((key: keyof typeof modalStates) =>
    setModalStates(prev => ({ ...prev, [key]: false })), [])
  const setToastMessage = useCallback((message: string) =>
    setModalStates(prev => ({ ...prev, toastMessage: message })), [])
  const hideToast = useCallback(() =>
    setModalStates(prev => ({ ...prev, toastMessage: null })), [])

  // Helper functions for editing state
  const setEditingItem = useCallback(<K extends keyof typeof editingStates>(key: K, value: typeof editingStates[K]) =>
    setEditingStates(prev => ({ ...prev, [key]: value })), [])
  const clearEditingItem = useCallback(<K extends keyof typeof editingStates>(key: K) =>
    setEditingStates(prev => ({ ...prev, [key]: null })), [])

  // Categories with "全部" virtual category
  const allCategory: Category = { id: 'all', name: '全部分类', order: 0 }
  const displayCategories = useMemo(() => {
    return [allCategory, ...sortCategoriesByOrder(categories)]
  }, [categories])

  const sortableCategories = useMemo(() => {
    return displayCategories.filter(c => c.id !== 'all')
  }, [displayCategories])

  const showCategoryDragHandles = sortableCategories.length >= 2

  // Filter prompts by category
  const filteredPrompts = useMemo(() => {
    let result = selectedCategoryId === 'all'
      ? prompts
      : prompts.filter(p => p.categoryId === selectedCategoryId)
    return sortPromptsByOrder(result)
  }, [prompts, selectedCategoryId])

  const showPromptDragHandles = filteredPrompts.length >= 2

  // Display prompts with language transformation
  const displayPrompts = useMemo(() => {
    return filteredPrompts.map(p => ({
      ...p,
      name: resourceLanguage === 'en' && p.nameEn ? p.nameEn : p.name,
      content: resourceLanguage === 'en' && p.contentEn ? p.contentEn : p.content,
      description: resourceLanguage === 'en' && p.descriptionEn ? p.descriptionEn : p.description,
    }))
  }, [filteredPrompts, resourceLanguage])

  // Filter resource prompts
  const filteredResourcePrompts = useMemo(() => {
    const prompts = selectedResourceCategoryId === 'all'
      ? resourcePrompts
      : resourcePrompts.filter(p => p.categoryId === selectedResourceCategoryId || p.sourceCategory === selectedResourceCategoryId)
    return selectedResourceCategoryId === 'all'
      ? sortResourcePromptsByCategoryOrder(prompts, resourceCategories)
      : prompts
  }, [resourcePrompts, selectedResourceCategoryId, resourceCategories])

  const paginatedResourcePrompts = useMemo(() => {
    return filteredResourcePrompts.slice(0, loadedCount)
  }, [filteredResourcePrompts, loadedCount])

  // Reset pagination on category change
  useEffect(() => {
    if (isResourceLibrary) {
      setLoadedCount(50)
    }
  }, [selectedResourceCategoryId, isResourceLibrary])

  // Handle prompt insertion
  const handleSelectPrompt = useCallback(async (prompt: Prompt) => {
    if (isOnLovart && currentTabId) {
      // Send to content script for insertion
      try {
        const response = await chrome.tabs.sendMessage(currentTabId, {
          type: MessageType.INSERT_PROMPT_TO_CS,
          payload: { prompt: prompt.content }
        })
        if (response?.success) {
          setToastMessage('已插入提示词')
          setTimeout(hideToast, 2000)
        } else if (response?.error === 'INPUT_NOT_FOUND') {
          // Input not found - copy to clipboard as fallback
          await navigator.clipboard.writeText(prompt.content)
          setToastMessage('已复制到剪贴板（无输入框）')
          setTimeout(hideToast, 2000)
        } else {
          setToastMessage(response?.error || '插入失败')
          setTimeout(hideToast, 2000)
        }
      } catch {
        // Connection failed - copy to clipboard as fallback
        try {
          await navigator.clipboard.writeText(prompt.content)
          setToastMessage('已复制到剪贴板')
          setTimeout(hideToast, 2000)
        } catch {
          setToastMessage('无法连接到页面')
          setTimeout(hideToast, 2000)
        }
      }
    }
    setSelectedPromptId(prompt.id)
    setTimeout(() => setSelectedPromptId(null), 2000)
  }, [isOnLovart, currentTabId, setToastMessage, hideToast])

  // Handle resource prompt injection
  const handleInjectResource = useCallback(async (resourcePrompt: ResourcePrompt) => {
    if (!isOnLovart || !currentTabId) return

    const promptToInject = resourceLanguage === 'en' && resourcePrompt.contentEn
      ? resourcePrompt.contentEn
      : resourcePrompt.content

    try {
      const response = await chrome.tabs.sendMessage(currentTabId, {
        type: MessageType.INSERT_PROMPT_TO_CS,
        payload: { prompt: promptToInject }
      })
      if (response?.success) {
        setToastMessage('已注入提示词')
        setTimeout(hideToast, 2000)
      } else if (response?.error === 'INPUT_NOT_FOUND') {
        await navigator.clipboard.writeText(promptToInject)
        setToastMessage('已复制到剪贴板')
        setTimeout(hideToast, 2000)
      }
    } catch {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(promptToInject)
        setToastMessage('已复制到剪贴板')
        setTimeout(hideToast, 2000)
      } catch {
        setToastMessage('无法连接到页面')
        setTimeout(hideToast, 2000)
      }
    }
  }, [isOnLovart, currentTabId, resourceLanguage, setToastMessage, hideToast])

  // Check if resource prompt is collected
  const isPromptCollected = useCallback((resourcePrompt: ResourcePrompt): boolean => {
    return prompts.some(p => p.content === resourcePrompt.content)
  }, [prompts])

  // Handle collect resource prompt
  const handleQuickCollect = useCallback((resourcePrompt: ResourcePrompt) => {
    setEditingItem('resourcePrompt', resourcePrompt)
    openModal('isCategoryDialog')
  }, [setEditingItem, openModal])

  // Handle confirm collect
  const handleConfirmCollect = useCallback(async (categoryId: string, newCategoryName?: string) => {
    if (!editingStates.resourcePrompt) return
    const resourcePrompt = editingStates.resourcePrompt

    let targetCategoryId = categoryId

    if (newCategoryName?.trim()) {
      usePromptStore.getState().addCategory(newCategoryName.trim())
      const storeCategories = usePromptStore.getState().categories
      const newCategory = storeCategories.find(c => c.name === newCategoryName.trim())
      if (newCategory) {
        targetCategoryId = newCategory.id
      }
    }

    const localPrompt: Omit<Prompt, 'id'> = {
      name: resourcePrompt.name,
      content: resourcePrompt.content,
      categoryId: targetCategoryId,
      description: resourcePrompt.description,
      order: 0,
      remoteImageUrl: resourcePrompt.previewImage,
    }

    await usePromptStore.getState().addPrompt(localPrompt)

    const categoryName = usePromptStore.getState().categories.find(c => c.id === targetCategoryId)?.name || '未知分类'
    setToastMessage(`已收藏到 ${categoryName}`)
    setTimeout(hideToast, 2000)

    closeModal('isCategoryDialog')
    closeModal('isPreview')
    clearEditingItem('resourcePrompt')
  }, [editingStates.resourcePrompt, setToastMessage, hideToast, closeModal, clearEditingItem])

  // Handle drag end for category reorder
  const handleCategoryDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const sortedCategories = sortCategoriesByOrder(categories)
      const oldIndex = sortedCategories.findIndex(c => c.id === active.id)
      const newIndex = sortedCategories.findIndex(c => c.id === over.id)
      const newOrder = [...sortedCategories]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, sortedCategories[oldIndex])

      const updatedCategories = categories.map(category => ({
        ...category,
        order: newOrder.map(c => c.id).indexOf(category.id)
      }))

      try {
        await chrome.runtime.sendMessage({
          type: MessageType.SET_STORAGE,
          payload: {
            version: chrome.runtime.getManifest().version,
            userData: { prompts, categories: updatedCategories }
          }
        })
      } catch (error) {
        console.error('[Oh My Prompt] Category reorder failed:', error)
      }
    }
  }, [categories, prompts])

  // Handle drag end for prompt reorder
  const handlePromptDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = displayPrompts.findIndex(p => p.id === active.id)
      const newIndex = displayPrompts.findIndex(p => p.id === over.id)
      const newOrder = [...displayPrompts]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, displayPrompts[oldIndex])

      const updatedPrompts = prompts.map(prompt => {
        const newIndexInOrder = newOrder.map(p => p.id).indexOf(prompt.id)
        if (newIndexInOrder !== -1) {
          return { ...prompt, order: newIndexInOrder }
        }
        return prompt
      })

      try {
        await chrome.runtime.sendMessage({
          type: MessageType.SET_STORAGE,
          payload: {
            version: chrome.runtime.getManifest().version,
            userData: { prompts: updatedPrompts, categories }
          }
        })
      } catch (error) {
        console.error('[Oh My Prompt] Prompt reorder failed:', error)
      }
    }
  }, [displayPrompts, prompts, categories])

  // CRUD handlers
  const handleAddCategory = useCallback((name: string) => {
    usePromptStore.getState().addCategory(name)
    setToastMessage('分类已添加')
    setTimeout(hideToast, 2000)
  }, [setToastMessage, hideToast])

  const handleUpdateCategory = useCallback((name: string) => {
    if (!editingStates.category) return
    usePromptStore.getState().updateCategory(editingStates.category.id, name)
    clearEditingItem('category')
    setToastMessage('分类已更新')
    setTimeout(hideToast, 2000)
  }, [editingStates.category, clearEditingItem, setToastMessage, hideToast])

  const handleDeleteCategory = useCallback(() => {
    if (!editingStates.deletingCategory) return
    usePromptStore.getState().deleteCategory(editingStates.deletingCategory.id)
    if (selectedCategoryId === editingStates.deletingCategory.id) {
      setSelectedCategoryId('all')
    }
    clearEditingItem('deletingCategory')
    closeModal('isCategoryDelete')
    setToastMessage('分类已删除')
    setTimeout(hideToast, 2000)
  }, [editingStates.deletingCategory, selectedCategoryId, clearEditingItem, closeModal, setToastMessage, hideToast])

  const handleAddPrompt = useCallback((data: { name: string; description?: string; content: string; categoryId: string }) => {
    usePromptStore.getState().addPrompt({
      name: data.name,
      description: data.description,
      content: data.content,
      categoryId: data.categoryId,
      order: prompts.filter(p => p.categoryId === data.categoryId).length,
    })
    closeModal('isPromptAdd')
    setToastMessage('提示词已添加')
    setTimeout(hideToast, 2000)
  }, [prompts, closeModal, setToastMessage, hideToast])

  const handleUpdatePrompt = useCallback((data: { name: string; description?: string; content: string; categoryId: string }) => {
    if (!editingStates.prompt) return
    usePromptStore.getState().updatePrompt(editingStates.prompt.id, {
      name: data.name,
      description: data.description,
      content: data.content,
      categoryId: data.categoryId,
    })
    clearEditingItem('prompt')
    closeModal('isPromptEdit')
    setToastMessage('提示词已更新')
    setTimeout(hideToast, 2000)
  }, [editingStates.prompt, clearEditingItem, closeModal, setToastMessage, hideToast])

  const handleDeletePrompt = useCallback(() => {
    if (!editingStates.deletingPrompt) return
    usePromptStore.getState().deletePrompt(editingStates.deletingPrompt.id)
    clearEditingItem('deletingPrompt')
    closeModal('isPromptDelete')
    setToastMessage('提示词已删除')
    setTimeout(hideToast, 2000)
  }, [editingStates.deletingPrompt, clearEditingItem, closeModal, setToastMessage, hideToast])

  // Export handler
  const handleExport = useCallback(async () => {
    const version = chrome.runtime.getManifest().version
    const data: StorageSchema = {
      version,
      userData: { prompts, categories },
      settings: { showBuiltin: true, syncEnabled: false }
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.EXPORT_DATA, payload: data })
      if (response?.success) {
        setToastMessage('导出成功')
      } else {
        setToastMessage(response?.error || '导出失败')
      }
      setTimeout(hideToast, 2000)
    } catch {
      setToastMessage('导出失败')
      setTimeout(hideToast, 2000)
    }
  }, [prompts, categories, setToastMessage, hideToast])

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
          { prompts, categories },
          result.data.userData
        )

        usePromptStore.setState({
          prompts: merged.prompts,
          categories: merged.categories,
          selectedCategoryId: 'all'
        })
        await usePromptStore.getState().saveToStorage()

        setToastMessage(`导入成功：新增 ${merged.addedCount} 条`)
        setTimeout(hideToast, 2000)
      } else {
        setToastMessage(result.error || '导入失败')
        setTimeout(hideToast, 2000)
      }
    }

    input.click()
  }, [prompts, categories, setToastMessage, hideToast])

  // Language switch
  const handleLanguageSwitch = useCallback((lang: 'zh' | 'en') => {
    setResourceLanguage(lang)
    chrome.runtime.sendMessage({
      type: MessageType.SET_SETTINGS_ONLY,
      payload: { settings: { resourceLanguage: lang } }
    })
  }, [])

  // Backup handler
  const handleBackup = useCallback(async () => {
    setIsRefreshing(true)
    await chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })
    setIsRefreshing(false)
  }, [])

  // Check update
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
  }, [openModal, closeModal])

  // Get category icon
  const getCategoryIcon = (categoryId: string) => {
    return CATEGORY_ICON_MAP[categoryId] || Layers
  }

  // Open settings page
  const handleOpenSettings = useCallback(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
  }, [])

  // Go to Lovart
  const handleGoToLovart = useCallback(() => {
    chrome.tabs.create({ url: 'https://lovart.ai' })
  }, [])

  return (
    <div className="side-panel-container">
      {/* Sidebar */}
      <div className="side-panel-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-version">v{chrome.runtime.getManifest().version}</span>
        </div>

        <div className="sidebar-categories scrollbar-thin">
          {isResourceLibrary ? (
            <>
              <button
                className="sidebar-category-item"
                onClick={() => setIsResourceLibrary(false)}
              >
                <div className="sidebar-category-icon-wrapper">
                  <ArrowLeft className="sidebar-category-icon" />
                </div>
                <span>返回</span>
              </button>
              <button
                className={`sidebar-category-item ${selectedResourceCategoryId === 'all' ? 'selected' : ''}`}
                onClick={() => setSelectedResourceCategoryId('all')}
              >
                <div className="sidebar-category-icon-wrapper">
                  <Database className="sidebar-category-icon" />
                </div>
                <span>全部</span>
              </button>
              {sortProviderCategoriesByOrder(resourceCategories).map(category => (
                <button
                  key={category.id}
                  className={`sidebar-category-item ${selectedResourceCategoryId === category.id ? 'selected' : ''}`}
                  onClick={() => setSelectedResourceCategoryId(category.id)}
                >
                  <div className="sidebar-category-icon-wrapper">
                    <Layers className="sidebar-category-icon" />
                  </div>
                  <Tooltip content={category.name}>
                    <span>{category.name}</span>
                  </Tooltip>
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                className={`sidebar-category-item ${selectedCategoryId === 'all' ? 'selected' : ''}`}
                onClick={() => setSelectedCategoryId('all')}
              >
                <div className="sidebar-category-icon-wrapper">
                  <FolderOpen className="sidebar-category-icon" />
                </div>
                <span>全部分类</span>
              </button>

              <button
                className={`sidebar-category-item ${isResourceLibrary ? 'selected' : ''}`}
                onClick={() => setIsResourceLibrary(true)}
              >
                <div className="sidebar-category-icon-wrapper">
                  <Database className="sidebar-category-icon" />
                </div>
                <span>资源库</span>
              </button>

              <DndContext collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
                <SortableContext
                  items={sortableCategories.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortableCategories.map(category => {
                    const IconComponent = getCategoryIcon(category.id)
                    return (
                      <SortableCategoryItem
                        key={category.id}
                        category={category}
                        isSelected={selectedCategoryId === category.id}
                        onSelect={setSelectedCategoryId}
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

              <button
                className="sidebar-add-category-btn"
                onClick={() => openModal('isCategoryAdd')}
              >
                <Plus style={{ width: 14, height: 14 }} />
                <span>添加分类</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="side-panel-main">
        {/* Header actions */}
        <div className="main-header">
          <div className="header-actions">
            <Tooltip content={updateStatus?.hasUpdate ? `新版本 ${updateStatus.latestVersion}` : '检查更新'} placement="bottom">
              <button
                className="header-action-btn"
                style={updateStatus?.hasUpdate ? { color: '#FF5722' } : {}}
                onClick={updateStatus?.hasUpdate ? () => openModal('isUpdateGuide') : handleCheckUpdate}
              >
                <ArrowUpCircle style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="备份数据" placement="bottom">
              <button
                className={`header-action-btn ${isRefreshing ? 'refreshing' : ''}`}
                onClick={handleBackup}
                disabled={isRefreshing}
              >
                <RefreshCw style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="导入" placement="bottom">
              <button className="header-action-btn" onClick={handleImport}>
                <Upload style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="导出" placement="bottom">
              <button className="header-action-btn" onClick={handleExport}>
                <Download style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <button
              className="header-language-btn"
              onClick={() => handleLanguageSwitch(resourceLanguage === 'zh' ? 'en' : 'zh')}
            >
              {resourceLanguage === 'zh' ? '中' : 'EN'}
            </button>
            <Tooltip content="设置" placement="bottom">
              <button className="header-action-btn" onClick={handleOpenSettings}>
                <Settings style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
            <Tooltip content="官网" placement="bottom">
              <a
                className="header-action-btn"
                href="https://oh-my-prompt.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink style={{ width: 14, height: 14 }} />
              </a>
            </Tooltip>
          </div>
        </div>

        {/* Input availability status banner */}
        {!isOnLovart && (
          <div className="lovart-status-banner">
            <AlertTriangle style={{ width: 14, height: 14, color: '#ea580c' }} />
            <span className="banner-text">当前页面未检测到输入框</span>
            <button className="banner-btn" onClick={handleGoToLovart}>
              前往 Lovart
            </button>
          </div>
        )}

        {/* Update banner */}
        {updateStatus?.hasUpdate && (
          <div className="update-banner">
            <ArrowUpCircle style={{ width: 14, height: 14, color: '#856404' }} />
            <span className="banner-text">新版本 {updateStatus.latestVersion} 可用</span>
            <span className="banner-link" onClick={() => openModal('isUpdateGuide')}>
              查看更新引导
            </span>
          </div>
        )}

        {/* Content area */}
        <div className="main-content scrollbar-thin">
          {isLoading ? (
            <div className="empty-state">
              <div className="empty-message">加载中...</div>
            </div>
          ) : isResourceLibrary ? (
            paginatedResourcePrompts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-message">该分类暂无提示词</div>
              </div>
            ) : (
              <div className="network-cards-grid">
                {paginatedResourcePrompts.map(prompt => (
                  <SidePanelNetworkCard
                    key={prompt.id}
                    prompt={prompt}
                    language={resourceLanguage}
                    onClick={() => {
                      const rawPrompt = rawResourcePrompts.find(p => p.id === prompt.id)
                      setEditingItem('resourcePrompt', rawPrompt || prompt)
                      openModal('isPreview')
                    }}
                    onInject={() => handleInjectResource(prompt)}
                    onCollect={() => handleQuickCollect(prompt)}
                    isCollected={isPromptCollected(prompt)}
                    isOnLovart={isOnLovart}
                  />
                ))}
              </div>
            )
          ) : displayPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-message">
                {selectedCategoryId === 'all' ? '暂无提示词' : '该分类暂无提示词'}
              </div>
            </div>
          ) : (
            <DndContext collisionDetection={closestCenter} onDragEnd={handlePromptDragEnd}>
              <SortableContext
                items={displayPrompts.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayPrompts.map(prompt => (
                  <SortablePromptItem
                    key={prompt.id}
                    prompt={prompt}
                    isSelected={selectedPromptId === prompt.id}
                    onSelect={handleSelectPrompt}
                    showDragHandle={showPromptDragHandles}
                    onEdit={(p) => {
                      setEditingItem('prompt', p)
                      openModal('isPromptEdit')
                    }}
                    onDelete={(p) => {
                      setEditingItem('deletingPrompt', p)
                      openModal('isPromptDelete')
                    }}
                    isOnLovart={isOnLovart}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* FAB add button */}
        {!isResourceLibrary && (
          <button
            className="fab-add-btn"
            onClick={() => openModal('isPromptAdd')}
            aria-label="添加提示词"
          >
            <Plus style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {editingStates.resourcePrompt && (
          <PromptPreviewModal
            prompt={editingStates.resourcePrompt}
            isOpen={modalStates.isPreview}
            onClose={() => {
              closeModal('isPreview')
              clearEditingItem('resourcePrompt')
            }}
            onCollect={() => openModal('isCategoryDialog')}
            onInject={(language) => {
              if (editingStates.resourcePrompt) {
                const promptToInject = language === 'en' && editingStates.resourcePrompt.contentEn
                  ? { ...editingStates.resourcePrompt, content: editingStates.resourcePrompt.contentEn }
                  : editingStates.resourcePrompt
                handleInjectResource(promptToInject)
              }
            }}
            globalLanguage={resourceLanguage}
          />
        )}
        <UpdateGuideModal
          status={updateStatus}
          isOpen={modalStates.isUpdateGuide}
          onClose={() => closeModal('isUpdateGuide')}
        />
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
        <CategorySelectDialog
          categories={sortableCategories}
          isOpen={modalStates.isCategoryDialog}
          onClose={() => closeModal('isCategoryDialog')}
          onConfirm={handleConfirmCollect}
        />
      </Suspense>

      {/* Toast notification */}
      {modalStates.toastMessage && (
        <ToastNotification
          message={modalStates.toastMessage}
          onClose={hideToast}
        />
      )}
    </div>
  )
}