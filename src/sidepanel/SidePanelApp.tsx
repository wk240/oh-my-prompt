/**
 * SidePanelApp - Main component for Chrome Extension Side Panel
 * Reuses core functionality from DropdownContainer adapted for side panel context
 */

import { useState, useEffect, useCallback, useMemo, Suspense, lazy, useRef } from 'react'
  import type { Prompt, Category, ResourcePrompt, UpdateStatus } from '../shared/types'
  import { truncateText, sortCategoriesByOrder, sortPromptsByOrder, sortProviderCategoriesByOrder, sortResourcePromptsByCategoryOrder } from '../shared/utils'
  import { Sparkles, Palette, Shapes, FolderOpen, Layers, Sparkle, Brush, GripVertical, Database, ArrowLeft, Sun, Frame, Paintbrush, Image, ArrowUpCircle, Plus, Pencil, Trash2, ExternalLink, ArrowUpRight, Bookmark, AlertTriangle, Settings, Loader2, Clock, CheckCircle } from 'lucide-react'
  import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
  import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
  import { CSS } from '@dnd-kit/utilities'
  import { usePromptStore } from '../lib/store'
  import { getResourcePrompts, getResourceCategories } from '../lib/resource-library'
  import { MessageType } from '../shared/messages'
  import { STORAGE_KEY } from '../shared/constants'
  import { Tooltip } from '../content/components/Tooltip'
  import { ToastNotification } from './components/ToastNotification'
  import { queueImageLoad } from '../lib/sync/image-loader-queue'
  import { downloadImageFromUrl, saveImage } from '../lib/sync/image-sync'

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

  // Hover preview constants (same as PromptPreviewModal)
  const PREVIEW_OFFSET = 16
  const PREVIEW_MAX_WIDTH = 720
  const PREVIEW_MAX_HEIGHT = 480

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
      <Tooltip content={category.name} maxWidth={600}>
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
  canInject,
}: {
  prompt: Prompt
  isSelected: boolean
  onSelect: (prompt: Prompt) => void
  showDragHandle: boolean
  onEdit: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  canInject: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prompt.id })

  // Async image loading state
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Hover preview state
  const [showPreview, setShowPreview] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Load image from local folder when prompt has localImage
  useEffect(() => {
    if (!prompt.localImage || imageLoaded) return

    const loadImage = async () => {
      const url = await queueImageLoad(prompt.localImage!)
      if (url) {
        setImageUrl(url)
      }
      setImageLoaded(true)
    }

    loadImage()
  }, [prompt.localImage, imageLoaded])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const IconComponent = ICON_MAP[prompt.categoryId === 'design' ? 'design' : prompt.categoryId === 'style' ? 'style' : 'default']

  // Hover preview handlers
  const handleImageMouseEnter = () => {
    if (imageUrl) {
      setShowPreview(true)
    }
  }

  const handleImageMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleImageMouseLeave = () => {
    setShowPreview(false)
  }

  // Preview element calculation with boundary detection
  const previewHeight = PREVIEW_MAX_HEIGHT + 32 + 16
  const previewWidth = PREVIEW_MAX_WIDTH + 32 + 16
  const previewTopPosition = mousePos.y - PREVIEW_OFFSET - previewHeight
  const previewLeftPosition = mousePos.x - PREVIEW_OFFSET - previewWidth

  const shouldStickToTop = previewTopPosition < 0
  const shouldStickToLeft = previewLeftPosition < 0

  // Determine position and transform based on boundary conditions
  const getPreviewStyle = () => {
    const baseStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: 2147483647,
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
      padding: '16px',
      maxWidth: `${PREVIEW_MAX_WIDTH + 32}px`,
      maxHeight: `${PREVIEW_MAX_HEIGHT + 32}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
    }

    if (shouldStickToLeft && shouldStickToTop) {
      // Both boundaries: stick to left and top
      return {
        ...baseStyle,
        left: PREVIEW_OFFSET,
        top: PREVIEW_OFFSET,
      }
    } else if (shouldStickToLeft) {
      // Only left boundary: stick to left, normal vertical position
      return {
        ...baseStyle,
        left: PREVIEW_OFFSET,
        top: mousePos.y - PREVIEW_OFFSET,
        transform: 'translateY(-100%)',
      }
    } else if (shouldStickToTop) {
      // Only top boundary: normal horizontal position, stick to top
      return {
        ...baseStyle,
        left: mousePos.x - PREVIEW_OFFSET,
        top: PREVIEW_OFFSET,
        transform: 'translateX(-100%)',
      }
    } else {
      // No boundary: normal position (left and above cursor)
      return {
        ...baseStyle,
        left: mousePos.x - PREVIEW_OFFSET,
        top: mousePos.y - PREVIEW_OFFSET,
        transform: 'translate(-100%, -100%)',
      }
    }
  }

  const previewElement = showPreview && imageUrl ? (
    <div style={getPreviewStyle()}>
      <img
        src={imageUrl}
        alt={prompt.name}
        style={{
          maxWidth: `${PREVIEW_MAX_WIDTH}px`,
          maxHeight: `${PREVIEW_MAX_HEIGHT}px`,
          width: 'auto',
          height: 'auto',
          borderRadius: '8px',
          display: 'block',
          objectFit: 'contain',
        }}
        onError={(e) => {
          e.currentTarget.src = FALLBACK_IMAGE_SVG
        }}
      />
    </div>
  ) : null

  return (
    <>
      {/* Hover preview rendered to body */}
      {previewElement}
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
      <div className="prompt-item-icon-wrapper">
        {showDragHandle && (
          <div className="prompt-item-drag-handle" {...attributes} {...listeners}>
            <GripVertical style={{ width: 12, height: 12 }} />
          </div>
        )}
        <IconComponent className="prompt-item-icon" />
      </div>
      {prompt.localImage && (
        imageUrl ? (
          <img
            src={imageUrl}
            alt={prompt.name}
            className="prompt-item-thumbnail"
            onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE_SVG }}
            onMouseEnter={handleImageMouseEnter}
            onMouseMove={handleImageMouseMove}
            onMouseLeave={handleImageMouseLeave}
            style={{ cursor: 'pointer' }}
          />
        ) : (
          <div className="prompt-item-thumbnail prompt-item-thumbnail-loading">
            <Shapes style={{ width: 16, height: 16, color: '#64748B' }} />
          </div>
        )
      )}
      <div className="prompt-item-text">
        <Tooltip content={prompt.name} maxWidth={600}>
          <span className="prompt-item-name">{prompt.name}</span>
        </Tooltip>
        <Tooltip content={prompt.description || prompt.content} maxWidth={600}>
          <span className="prompt-item-preview">{truncateText(prompt.description || prompt.content, 40)}</span>
        </Tooltip>
      </div>
      {canInject && <ArrowUpRight className="prompt-item-arrow" />}
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
    </>
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
  canInject,
}: {
  prompt: ResourcePrompt
  onClick: () => void
  onInject?: () => void
  onCollect?: () => void
  isCollected?: boolean
  language: 'zh' | 'en'
  canInject: boolean
}) {
  const displayName = language === 'en' && prompt.nameEn ? prompt.nameEn : prompt.name

  // Hover preview state
  const [showPreview, setShowPreview] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Hover preview handlers
  const handleImageMouseEnter = () => {
    if (prompt.previewImage) {
      setShowPreview(true)
    }
  }

  const handleImageMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleImageMouseLeave = () => {
    setShowPreview(false)
  }

  // Preview element calculation with boundary detection
  const previewHeight = PREVIEW_MAX_HEIGHT + 32 + 16
  const previewWidth = PREVIEW_MAX_WIDTH + 32 + 16
  const previewTopPosition = mousePos.y - PREVIEW_OFFSET - previewHeight
  const previewLeftPosition = mousePos.x - PREVIEW_OFFSET - previewWidth

  const shouldStickToTop = previewTopPosition < 0
  const shouldStickToLeft = previewLeftPosition < 0

  // Determine position and transform based on boundary conditions
  const getPreviewStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: 2147483647,
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
      padding: '16px',
      maxWidth: `${PREVIEW_MAX_WIDTH + 32}px`,
      maxHeight: `${PREVIEW_MAX_HEIGHT + 32}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
    }

    if (shouldStickToLeft && shouldStickToTop) {
      // Both boundaries: stick to left and top
      return {
        ...baseStyle,
        left: PREVIEW_OFFSET,
        top: PREVIEW_OFFSET,
      }
    } else if (shouldStickToLeft) {
      // Only left boundary: stick to left, normal vertical position
      return {
        ...baseStyle,
        left: PREVIEW_OFFSET,
        top: mousePos.y - PREVIEW_OFFSET,
        transform: 'translateY(-100%)',
      }
    } else if (shouldStickToTop) {
      // Only top boundary: normal horizontal position, stick to top
      return {
        ...baseStyle,
        left: mousePos.x - PREVIEW_OFFSET,
        top: PREVIEW_OFFSET,
        transform: 'translateX(-100%)',
      }
    } else {
      // No boundary: normal position (left and above cursor)
      return {
        ...baseStyle,
        left: mousePos.x - PREVIEW_OFFSET,
        top: mousePos.y - PREVIEW_OFFSET,
        transform: 'translate(-100%, -100%)',
      }
    }
  }

  const previewElement = showPreview && prompt.previewImage ? (
    <div style={getPreviewStyle()}>
      <img
        src={prompt.previewImage}
        alt={displayName}
        style={{
          maxWidth: `${PREVIEW_MAX_WIDTH}px`,
          maxHeight: `${PREVIEW_MAX_HEIGHT}px`,
          width: 'auto',
          height: 'auto',
          borderRadius: '8px',
          display: 'block',
          objectFit: 'contain',
        }}
        onError={(e) => {
          e.currentTarget.src = FALLBACK_IMAGE_SVG
        }}
      />
    </div>
  ) : null

  return (
    <>
      {/* Hover preview rendered to body */}
      {previewElement}
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
            onMouseEnter={handleImageMouseEnter}
            onMouseMove={handleImageMouseMove}
            onMouseLeave={handleImageMouseLeave}
            style={{ cursor: 'pointer' }}
          />
        )}
      <Tooltip content={displayName} maxWidth={600}>
        <div className="network-card-name">{truncateText(displayName, 20)}</div>
      </Tooltip>
      <Tooltip content={prompt.description || prompt.content} maxWidth={600}>
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
            className={`network-card-btn collect ${isCollected ? 'collected' : ''}`}
            aria-label={isCollected ? '已收藏' : '收藏'}
          >
            <Bookmark style={{ width: 12, height: 12, fill: isCollected ? 'currentColor' : 'none' }} />
          </button>
        </Tooltip>
        {canInject && (
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
    </>
  )
}

export default function SidePanelApp() {
  // Store state
  const prompts = usePromptStore((state) => state.prompts)
  const categories = usePromptStore((state) => state.categories)
  const temporaryPrompts = usePromptStore((state) => state.temporaryPrompts)
  const isLoading = usePromptStore((state) => state.isLoading)
  const loadFromStorage = usePromptStore((state) => state.loadFromStorage)
  const transferTemporaryPrompt = usePromptStore((state) => state.transferTemporaryPrompt)

  // Local state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [isResourceLibrary, setIsResourceLibrary] = useState(false)
  const [selectedResourceCategoryId, setSelectedResourceCategoryId] = useState<string>('all')
  const [resourceLanguage, setResourceLanguage] = useState<'zh' | 'en'>('zh')
  const [loadedCount, setLoadedCount] = useState(50)
  const [visionEnabled, setVisionEnabled] = useState(true)

  // Input availability detection (Port-based real-time connection)
  type InputStatus = 'checking' | 'available' | 'unavailable'
  const [inputStatus, setInputStatus] = useState<InputStatus>('checking')
  const [currentTabId, setCurrentTabId] = useState<number | null>(null)
  const [checkingSiteName, setCheckingSiteName] = useState<string>('')
  const [connectedSiteName, setConnectedSiteName] = useState<string>('')

  // Port reference for managing connection
  const currentPortRef = useRef<chrome.runtime.Port | null>(null)

  // Ref for findAvailableTab to avoid circular dependency in useCallback
  const findAvailableTabRef = useRef<() => void>(() => {})

  // Helper function to check if a URL is a special page (no content script)
  const isSpecialPage = useCallback((url: string): boolean => {
    return url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about://') || url.startsWith('chrome-extension://')
  }, [])

  // Helper function to extract site name from URL
  const getSiteNameFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  }, [])

  // Helper function to inject content script dynamically
  const injectContentScript = useCallback(async (tabId: number): Promise<boolean> => {
    try {
      const manifest = chrome.runtime.getManifest()
      const contentScripts = manifest.content_scripts || []
      const targetScript = contentScripts.find(script =>
        script.matches?.includes('<all_urls>')
      )

      if (!targetScript?.js?.[0]) {
        console.error('[Oh My Prompt] SidePanel: No content script found in manifest')
        return false
      }

      const scriptFile = targetScript.js[0]
      console.log('[Oh My Prompt] SidePanel: Injecting', scriptFile, 'into tab', tabId)

      await chrome.scripting.executeScript({
        target: { tabId },
        files: [scriptFile]
      })
      await new Promise(resolve => setTimeout(resolve, 300))
      return true
    } catch (error) {
      console.error('[Oh My Prompt] SidePanel: Failed to inject content script:', error)
      return false
    }
  }, [])

  // Connect to a tab using Port (real-time communication)
  const connectToTab = useCallback(async (tabId: number, retryCount = 0): Promise<boolean> => {
    // Disconnect existing port first
    if (currentPortRef.current) {
      currentPortRef.current.disconnect()
      currentPortRef.current = null
    }

    // Clear currentTabId at the start to prevent stale references
    setCurrentTabId(null)

    // First check if content script is ready (Port requires content script listener)
    try {
      const checkResponse = await chrome.tabs.sendMessage(tabId, { type: MessageType.PING })
      if (!checkResponse?.success) {
        throw new Error('Content script not responding')
      }
    } catch (checkError) {
      console.log('[Oh My Prompt] SidePanel: Content script not ready, injecting...', checkError)

      // Inject content script if not ready
      if (retryCount < 2) {
        const injected = await injectContentScript(tabId)
        if (injected) {
          // Wait for content script to initialize Port listener
          await new Promise(resolve => setTimeout(resolve, 300))
          // Retry connection
          return connectToTab(tabId, retryCount + 1)
        }
      }
      console.error('[Oh My Prompt] SidePanel: Failed to establish content script')
      // Connection failed - ensure currentTabId stays null
      return false
    }

    try {
      // Establish Port connection
      const port = chrome.tabs.connect(tabId, { name: 'sidepanel-connection' })
      currentPortRef.current = port
      console.log('[Oh My Prompt] SidePanel: Port connected to tab', tabId)

      // Get tab URL to set connected site name
      chrome.tabs.get(tabId).then((tab) => {
        if (tab && tab.url) {
          setConnectedSiteName(getSiteNameFromUrl(tab.url))
        }
      })

      // Handle incoming messages
      port.onMessage.addListener((message) => {
        if (message.type === MessageType.INPUT_STATUS_CHANGED) {
          console.log('[Oh My Prompt] SidePanel: Received INPUT_STATUS_CHANGED:', message.hasInput)
          if (message.hasInput) {
            setInputStatus('available')
            setCheckingSiteName('')
          } else {
            setInputStatus('unavailable')
          }
        }
      })

      // Handle disconnection (tab closed, refreshed, navigated)
      port.onDisconnect.addListener(() => {
        const lastError = chrome.runtime.lastError
        if (lastError) {
          console.log('[Oh My Prompt] SidePanel: Port disconnect with error:', lastError.message)
        } else {
          console.log('[Oh My Prompt] SidePanel: Port disconnected from tab', tabId)
        }
        currentPortRef.current = null
        setConnectedSiteName('')

        // Check if disconnected due to tab close or just page navigation
        chrome.tabs.get(tabId).then((tab) => {
          if (tab && tab.url && !isSpecialPage(tab.url)) {
            // Tab still exists, try reconnect (page navigation)
            console.log('[Oh My Prompt] SidePanel: Tab still exists, reconnecting...')
            setCheckingSiteName(getSiteNameFromUrl(tab.url))
            setInputStatus('checking')
            // Wait for content script to reinitialize, then reconnect
            setTimeout(() => {
              if (tab.id) connectToTab(tab.id)
            }, 500)
          } else {
            // Tab closed or became special page, find new tab
            setInputStatus('unavailable')
            setCurrentTabId(null)
            findAvailableTabRef.current()
          }
        }).catch(() => {
          // Tab no longer exists
          setInputStatus('unavailable')
          setCurrentTabId(null)
          setConnectedSiteName('')
          findAvailableTabRef.current()
        })
      })

      // Request initial status
      port.postMessage({ type: MessageType.CHECK_INPUT_PORT })
      setCurrentTabId(tabId)
      return true
    } catch (error) {
      console.error('[Oh My Prompt] SidePanel: Port connection failed:', error)
      return false
    }
  }, [isSpecialPage, getSiteNameFromUrl, injectContentScript])

  // Find an available tab to connect (fallback logic)
  const findAvailableTab = useCallback(async () => {
    console.log('[Oh My Prompt] SidePanel: Finding available tab...')
    setInputStatus('checking')
    setCheckingSiteName('')
    setCurrentTabId(null)

    chrome.tabs.query({ active: true, currentWindow: true }, async (activeTabs) => {
      const activeTab = activeTabs[0]

      // Try active tab first
      if (activeTab?.id && activeTab?.url && !isSpecialPage(activeTab.url)) {
        setCheckingSiteName(getSiteNameFromUrl(activeTab.url))

        // Try to connect via Port
        const connected = await connectToTab(activeTab.id)
        if (!connected) {
          // Connection failed, try injecting content script first
          const injected = await injectContentScript(activeTab.id)
          if (injected) {
            await connectToTab(activeTab.id)
          }
        }
        return
      }

      // Active tab not suitable, find other tabs
      chrome.tabs.query({ currentWindow: true }, async (allTabs) => {
        const candidateTabs = allTabs.filter(t =>
          t.id && t.url && !isSpecialPage(t.url) && t.id !== activeTab?.id
        )

        for (const tab of candidateTabs) {
          if (tab.id && tab.url) {
            setCheckingSiteName(getSiteNameFromUrl(tab.url))
            const connected = await connectToTab(tab.id)
            if (connected) {
              console.log('[Oh My Prompt] SidePanel: Connected to fallback tab', tab.id)
              return
            }
          }
        }

        // No suitable tab found
        console.log('[Oh My Prompt] SidePanel: No available tab found')
        setInputStatus('unavailable')
        setCurrentTabId(null)
        setCheckingSiteName('')
      })
    })
  }, [isSpecialPage, connectToTab, injectContentScript, getSiteNameFromUrl])

  // Update ref whenever findAvailableTab changes
  findAvailableTabRef.current = findAvailableTab

  // Initialize connection on mount
  useEffect(() => {
    findAvailableTab()
  }, [findAvailableTab])

  // Re-connect when tab is activated (user switches tabs)
  useEffect(() => {
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      console.log('[Oh My Prompt] SidePanel: Tab activated:', activeInfo.tabId)

      // Disconnect existing port
      if (currentPortRef.current) {
        currentPortRef.current.disconnect()
        currentPortRef.current = null
      }

      // Connect to new active tab
      chrome.tabs.get(activeInfo.tabId).then(async (tab) => {
        if (tab && tab.url && !isSpecialPage(tab.url)) {
          setCheckingSiteName(getSiteNameFromUrl(tab.url))
          setInputStatus('checking')
          const connected = await connectToTab(activeInfo.tabId)
          if (!connected) {
            // Connection failed, find fallback tab
            setInputStatus('unavailable')
            findAvailableTabRef.current()
          }
        } else {
          // Special page, find fallback
          setInputStatus('unavailable')
          setCurrentTabId(null)
          findAvailableTabRef.current()
        }
      }).catch(() => {
        setInputStatus('unavailable')
        findAvailableTabRef.current()
      })
    }

    chrome.tabs.onActivated.addListener(handleTabActivated)
    return () => chrome.tabs.onActivated.removeListener(handleTabActivated)
  }, [isSpecialPage, connectToTab, getSiteNameFromUrl])

  // Handle tab removal (disconnect and find new tab)
  useEffect(() => {
    const handleTabRemoved = (tabId: number) => {
      if (tabId === currentTabId) {
        console.log('[Oh My Prompt] SidePanel: Connected tab removed:', tabId)
        if (currentPortRef.current) {
          currentPortRef.current.disconnect()
          currentPortRef.current = null
        }
        setInputStatus('unavailable')
        setCurrentTabId(null)
        findAvailableTabRef.current()
      }
    }

    chrome.tabs.onRemoved.addListener(handleTabRemoved)
    return () => chrome.tabs.onRemoved.removeListener(handleTabRemoved)
  }, [currentTabId])

  // Handle tab URL updates (page navigation within same tab)
  useEffect(() => {
    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      // Only handle url changes for connected tab
      if (tabId === currentTabId && changeInfo.url) {
        console.log('[Oh My Prompt] SidePanel: Connected tab URL changed:', changeInfo.url)

        // Check if new URL is special page
        if (isSpecialPage(changeInfo.url)) {
          if (currentPortRef.current) {
            currentPortRef.current.disconnect()
            currentPortRef.current = null
          }
          setInputStatus('unavailable')
          setCurrentTabId(null)
          findAvailableTabRef.current()
        }
      }
    }

    chrome.tabs.onUpdated.addListener(handleTabUpdated)
    return () => chrome.tabs.onUpdated.removeListener(handleTabUpdated)
  }, [currentTabId, isSpecialPage])

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
    showBackupReminder: false,
    showFirstBackupWarning: false,
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

  // Backup warning data states
  const [backupWarningPromptCount, setBackupWarningPromptCount] = useState(0)
  const [dontShowBackupWarning, setDontShowBackupWarning] = useState(false)

  // Ref for update button (to position "already latest" tip)
  const updateButtonRef = useRef<HTMLButtonElement | null>(null)

  // Resource library data
  const [resourcePrompts, setResourcePrompts] = useState<ResourcePrompt[]>([])
  const rawResourcePrompts = useMemo(() => getResourcePrompts(), [])
  const resourceCategories = useMemo(() => getResourceCategories(), [])

  // Load data on mount
  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  // Listen for REFRESH_DATA messages from service worker (backup import, sync complete)
  useEffect(() => {
    const handleMessage = (message: { type: string }) => {
      if (message.type === MessageType.REFRESH_DATA) {
        console.log('[Oh My Prompt] SidePanel: Received REFRESH_DATA, refreshing...')
        loadFromStorage()
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [loadFromStorage])

  // Listen for storage changes directly (robust fallback for any storage mutation)
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEY]) {
        console.log('[Oh My Prompt] SidePanel: Storage changed, refreshing...')
        loadFromStorage()
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [loadFromStorage])

  // Load language preference and vision setting
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings?.resourceLanguage) {
        setResourceLanguage(response.data.settings.resourceLanguage)
      }
      if (response?.success && response.data?.settings?.visionEnabled !== undefined) {
        setVisionEnabled(response.data.settings.visionEnabled)
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

  // Fetch update status
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_UPDATE_STATUS }, (response) => {
      if (response?.success && response.data) {
        setUpdateStatus(response.data)
      }
    })
  }, [])

  // Check for unsynced changes to show backup reminder
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_SYNC_STATUS }, (response) => {
      if (response?.success && response.data) {
        const syncStatus = response.data
        if (syncStatus.hasUnsyncedChanges) {
          setModalStates(prev => ({ ...prev, showBackupReminder: true }))
        }
        // Check for first-time backup warning
        if (!syncStatus.hasFolder && !syncStatus.dismissedBackupWarning) {
          const promptCount = prompts.length
          if (promptCount > 0) {
            setBackupWarningPromptCount(promptCount)
            setModalStates(prev => ({ ...prev, showFirstBackupWarning: true }))
          }
        }
      }
    })
  }, [prompts.length])

  // Listen for storage changes to detect sync failures
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      // Check if settings changed and hasUnsyncedChanges became true
      if (changes['prompt_script_data']) {
        const newValue = changes['prompt_script_data'].newValue
        if (newValue?.settings?.hasUnsyncedChanges && !modalStates.showBackupReminder) {
          setModalStates(prev => ({ ...prev, showBackupReminder: true }))
        }
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [modalStates.showBackupReminder])

  // Listen for sync failure events from service worker (legacy - for content script compatibility)
  useEffect(() => {
    const handleSyncFailed = () => {
      setModalStates(prev => ({ ...prev, showBackupReminder: true }))
    }
    window.addEventListener('oh-my-prompt-sync-failed', handleSyncFailed)
    return () => {
      window.removeEventListener('oh-my-prompt-sync-failed', handleSyncFailed)
    }
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

  // Temporary prompts from store (independent storage, not in category system)
  const displayTemporaryPrompts = useMemo(() => {
    return sortPromptsByOrder(temporaryPrompts).map(p => ({
      ...p,
      name: resourceLanguage === 'en' && p.nameEn ? p.nameEn : p.name,
      content: resourceLanguage === 'en' && p.contentEn ? p.contentEn : p.content,
      description: resourceLanguage === 'en' && p.descriptionEn ? p.descriptionEn : p.description,
    }))
  }, [temporaryPrompts, resourceLanguage])

  // Filter prompts by category
  const filteredPrompts = useMemo(() => {
    if (selectedCategoryId === 'temporary') {
      // Temporary library: use displayTemporaryPrompts (already sorted in reverse order)
      return displayTemporaryPrompts
    }
    let result = selectedCategoryId === 'all'
      ? prompts
      : prompts.filter(p => p.categoryId === selectedCategoryId)
    return sortPromptsByOrder(result)
  }, [prompts, displayTemporaryPrompts, selectedCategoryId])

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
    if (inputStatus === 'available' && currentTabId) {
      // Send to content script for insertion
      try {
        // Verify tab still exists before sending
        const tab = await chrome.tabs.get(currentTabId)
        if (!tab || !tab.url || isSpecialPage(tab.url)) {
          console.log('[Oh My Prompt] SidePanel: Tab no longer valid, triggering re-check')
          setInputStatus('unavailable')
          setCurrentTabId(null)
          findAvailableTabRef.current()
          await navigator.clipboard.writeText(prompt.content)
          setToastMessage('已复制到剪贴板（页面已切换）')
          setTimeout(hideToast, 2000)
          return
        }

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
      } catch (error) {
        console.log('[Oh My Prompt] SidePanel: Message failed, triggering re-check:', error)
        // Connection failed - trigger re-check and copy to clipboard as fallback
        setInputStatus('unavailable')
        setCurrentTabId(null)
        findAvailableTabRef.current()
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
  }, [inputStatus, currentTabId, setToastMessage, hideToast, isSpecialPage])

  // Handle resource prompt injection
  const handleInjectResource = useCallback(async (resourcePrompt: ResourcePrompt) => {
    if (inputStatus !== 'available' || !currentTabId) return

    const promptToInject = resourceLanguage === 'en' && resourcePrompt.contentEn
      ? resourcePrompt.contentEn
      : resourcePrompt.content

    try {
      // Verify tab still exists before sending
      const tab = await chrome.tabs.get(currentTabId)
      if (!tab || !tab.url || isSpecialPage(tab.url)) {
        console.log('[Oh My Prompt] SidePanel: Tab no longer valid, triggering re-check')
        setInputStatus('unavailable')
        setCurrentTabId(null)
        findAvailableTabRef.current()
        await navigator.clipboard.writeText(promptToInject)
        setToastMessage('已复制到剪贴板（页面已切换）')
        setTimeout(hideToast, 2000)
        return
      }

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
    } catch (error) {
      console.log('[Oh My Prompt] SidePanel: Message failed, triggering re-check:', error)
      // Fallback to clipboard and trigger re-check
      setInputStatus('unavailable')
      setCurrentTabId(null)
      findAvailableTabRef.current()
      try {
        await navigator.clipboard.writeText(promptToInject)
        setToastMessage('已复制到剪贴板')
        setTimeout(hideToast, 2000)
      } catch {
        setToastMessage('无法连接到页面')
        setTimeout(hideToast, 2000)
      }
    }
  }, [inputStatus, currentTabId, resourceLanguage, isSpecialPage, setToastMessage, hideToast])

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
      nameEn: resourcePrompt.nameEn,
      content: resourcePrompt.content,
      contentEn: resourcePrompt.contentEn,
      categoryId: targetCategoryId,
      description: resourcePrompt.description,
      descriptionEn: resourcePrompt.descriptionEn,
      order: 0,
      remoteImageUrl: resourcePrompt.previewImage,
    }

    // Add prompt first to get generated id
    await usePromptStore.getState().addPrompt(localPrompt)

    // Get the newly added prompt by matching content in the category
    const store = usePromptStore.getState()
    const newPrompt = store.prompts.find(p =>
      p.content === resourcePrompt.content && p.categoryId === targetCategoryId
    )

    // Download and save image locally if previewImage exists
    if (newPrompt && resourcePrompt.previewImage) {
      try {
        const downloadResult = await downloadImageFromUrl(resourcePrompt.previewImage)
        if (downloadResult.success && downloadResult.blob) {
          const saveResult = await saveImage(newPrompt.id, downloadResult.blob)
          if (saveResult.success && saveResult.relativePath) {
            // Update prompt with localImage path
            store.updatePrompt(newPrompt.id, { localImage: saveResult.relativePath })
          }
        }
      } catch (error) {
        // Image download/save failed, but prompt is already saved
        // Keep remoteImageUrl as fallback
      }
    }

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

  const handleAddPrompt = useCallback((data: {
    name: string
    nameEn?: string
    description?: string
    descriptionEn?: string
    content: string
    contentEn?: string
    categoryId: string
    localImage?: string
    remoteImageUrl?: string
  }) => {
    usePromptStore.getState().addPrompt({
      name: data.name,
      nameEn: data.nameEn,
      description: data.description,
      descriptionEn: data.descriptionEn,
      content: data.content,
      contentEn: data.contentEn,
      categoryId: data.categoryId,
      localImage: data.localImage,
      remoteImageUrl: data.remoteImageUrl,
      order: prompts.filter(p => p.categoryId === data.categoryId).length,
    })
    closeModal('isPromptAdd')
    setToastMessage('提示词已添加')
    setTimeout(hideToast, 2000)
  }, [prompts, closeModal, setToastMessage, hideToast])

  const handleUpdatePrompt = useCallback((data: {
    name: string
    nameEn?: string
    description?: string
    descriptionEn?: string
    content: string
    contentEn?: string
    categoryId: string
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
      localImage: data.localImage,
      remoteImageUrl: data.remoteImageUrl,
    })
    clearEditingItem('prompt')
    closeModal('isPromptEdit')
    setToastMessage('提示词已更新')
    setTimeout(hideToast, 2000)
  }, [editingStates.prompt, clearEditingItem, closeModal, setToastMessage, hideToast])

  const handleDeletePrompt = useCallback(() => {
    if (!editingStates.deletingPrompt) return

    // Check if deleting a temporary prompt
    if (editingStates.deletingPrompt.categoryId === 'temporary') {
      // Delete from temporary library
      const updatedTemporaryPrompts = temporaryPrompts.filter(p => p.id !== editingStates.deletingPrompt!.id)
      // Update store locally
      usePromptStore.setState({ temporaryPrompts: updatedTemporaryPrompts })
      // Persist via service worker
      chrome.runtime.sendMessage({
        type: MessageType.SET_STORAGE,
        payload: {
          version: chrome.runtime.getManifest().version,
          userData: { prompts, categories },
          settings: usePromptStore.getState().temporaryPrompts,
          temporaryPrompts: updatedTemporaryPrompts
        }
      })
    } else {
      usePromptStore.getState().deletePrompt(editingStates.deletingPrompt.id)
    }

    clearEditingItem('deletingPrompt')
    closeModal('isPromptDelete')
    setToastMessage('提示词已删除')
    setTimeout(hideToast, 2000)
  }, [editingStates.deletingPrompt, temporaryPrompts, prompts, categories, clearEditingItem, closeModal, setToastMessage, hideToast])

  // Handle transfer temporary prompt to category
  const handleTransferPrompt = useCallback((categoryId: string) => {
    if (!editingStates.prompt) return
    transferTemporaryPrompt(editingStates.prompt.id, categoryId)
    clearEditingItem('prompt')
    closeModal('isPromptEdit')
    const categoryName = categories.find(c => c.id === categoryId)?.name || '未知分类'
    setToastMessage(`已转移到 ${categoryName}`)
    setTimeout(hideToast, 2000)
  }, [editingStates.prompt, transferTemporaryPrompt, categories, clearEditingItem, closeModal, setToastMessage, hideToast])

  // Language switch
  const handleLanguageSwitch = useCallback((lang: 'zh' | 'en') => {
    setResourceLanguage(lang)
    chrome.runtime.sendMessage({
      type: MessageType.SET_SETTINGS_ONLY,
      payload: { settings: { resourceLanguage: lang } }
    })
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

  // Handle first-time backup warning actions
  const handleBackupWarningSelectFolder = useCallback(async () => {
    closeModal('showFirstBackupWarning')
    if (dontShowBackupWarning) {
      chrome.runtime.sendMessage({ type: MessageType.DISMISS_BACKUP_WARNING })
    }
    // Open backup page for folder selection
    chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })
  }, [dontShowBackupWarning])

  const handleBackupWarningSkip = useCallback(() => {
    closeModal('showFirstBackupWarning')
    if (dontShowBackupWarning) {
      chrome.runtime.sendMessage({ type: MessageType.DISMISS_BACKUP_WARNING })
    }
  }, [dontShowBackupWarning])

  
  return (
    <div className="side-panel-container">
      {/* Top header - spans full width */}
      <div className="top-header">
        <span className="top-header-version">v{chrome.runtime.getManifest().version}</span>
        <div className="top-header-actions">
          {visionEnabled && (
            <Tooltip content="转提示词功能已开启" placement="bottom">
              <button
                className="header-action-btn"
                style={{ color: '#a855f7' }}
                onClick={handleOpenSettings}
                aria-label="转提示词功能已开启"
              >
                <Sparkles style={{ width: 14, height: 14 }} />
              </button>
            </Tooltip>
          )}
          <Tooltip content={updateStatus?.hasUpdate ? `新版本 ${updateStatus.latestVersion}` : '检查更新'} placement="bottom">
            <button
              ref={updateButtonRef}
              className="header-action-btn"
              style={updateStatus?.hasUpdate ? { color: '#FF5722' } : {}}
              onClick={updateStatus?.hasUpdate ? () => openModal('isUpdateGuide') : handleCheckUpdate}
            >
              <ArrowUpCircle style={{ width: 14, height: 14 }} />
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

      {/* Content row - sidebar + main */}
      <div className="side-panel-content-row">
        {/* Sidebar */}
        <div className="side-panel-sidebar">
          <div className="sidebar-categories scrollbar-thin">
          {isResourceLibrary ? (
            <>
              <button
                className="sidebar-category-item"
                onClick={() => {
                  setIsResourceLibrary(false)
                  setSelectedCategoryId('all')
                }}
              >
                <div className="sidebar-category-icon-wrapper">
                  <ArrowLeft className="sidebar-category-icon" />
                </div>
                <span>返回</span>
              </button>
              {/* Resource library mode: show categories */}
              <>
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
                    <Tooltip content={category.name} maxWidth={600}>
                      <span>{category.name}</span>
                    </Tooltip>
                  </button>
                ))}
              </>
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

              {/* "临时库" entry - as sidebar category item */}
              <button
                className={`sidebar-category-item ${selectedCategoryId === 'temporary' ? 'selected' : ''}`}
                onClick={() => setSelectedCategoryId('temporary')}
              >
                <div className="sidebar-category-icon-wrapper">
                  <Clock className="sidebar-category-icon" />
                </div>
                <span>临时库</span>
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
        {/* Input availability status banner */}
        {inputStatus === 'checking' && (
          <div className="input-status-banner checking">
            <Loader2 style={{ width: 14, height: 14, color: '#6b7280' }} className="spin-animation" />
            <span className="banner-text">
              {checkingSiteName ? `正在连接 ${checkingSiteName}...` : '正在检测页面...'}
            </span>
          </div>
        )}
        {inputStatus === 'available' && connectedSiteName && (
          <div className="input-status-banner connected">
            <CheckCircle style={{ width: 14, height: 14, color: '#16a34a' }} />
            <span className="banner-text">已连接 {connectedSiteName}</span>
          </div>
        )}
        {inputStatus === 'unavailable' && (
          <div className="input-status-banner unavailable">
            <AlertTriangle style={{ width: 14, height: 14, color: '#ea580c' }} />
            <span className="banner-text">无法连接到页面，请关闭并重新打开扩展</span>
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

        {/* Backup reminder banner - shows after unsynced changes */}
        {modalStates.showBackupReminder && (
          <div className="backup-reminder-banner">
            <AlertTriangle style={{ width: 14, height: 14, color: '#1e40af' }} />
            <span className="banner-text backup-reminder-text">本次改动尚未备份</span>
            <span
              className="banner-link backup-reminder-link"
              onClick={() => {
                closeModal('showBackupReminder')
                chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })
              }}
            >
              设置备份
            </span>
            <span className="banner-close" onClick={() => closeModal('showBackupReminder')}>×</span>
          </div>
        )}

        {/* First-time backup warning banner - shows on open if no backup configured */}
        {modalStates.showFirstBackupWarning && (
          <div className="first-backup-warning-banner">
            <div className="first-backup-warning-header">
              <AlertTriangle className="first-backup-warning-icon" />
              <span className="first-backup-warning-title">数据安全提醒</span>
            </div>
            <div className="first-backup-warning-text">
              当前有 {backupWarningPromptCount} 个提示词，尚未设置备份。浏览器扩展卸载后数据将无法恢复。
            </div>
            <div className="first-backup-warning-actions">
              <button
                className="first-backup-warning-btn"
                onClick={handleBackupWarningSelectFolder}
              >
                设置备份
              </button>
              <span
                className="first-backup-warning-skip"
                onClick={handleBackupWarningSkip}
              >
                稍后
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
                    canInject={inputStatus === 'available'}
                  />
                ))}
              </div>
            )
          ) : filteredPrompts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-message">
                {selectedCategoryId === 'all' ? '暂无提示词' : selectedCategoryId === 'temporary' ? '暂无临时提示词' : '该分类暂无提示词'}
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
                    canInject={inputStatus === 'available'}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* FAB add button */}
        {!isResourceLibrary && selectedCategoryId !== 'temporary' && (
          <button
            className="fab-add-btn"
            onClick={() => openModal('isPromptAdd')}
            aria-label="添加提示词"
          >
            <Plus style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>
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
            width="340px"
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
          isTemporary={editingStates.prompt?.categoryId === 'temporary'}
          onTransfer={handleTransferPrompt}
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

      {/* "Already latest" tip - positioned near update button */}
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