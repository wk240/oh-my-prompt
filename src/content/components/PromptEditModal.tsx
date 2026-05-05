/**
 * PromptEditModal - Modal for adding/editing prompts
 * Uses BaseModal structure with inline styles
 * Image hover preview: shows full image instantly when hovering on preview thumbnail
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Upload, Link, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { BaseModal } from './BaseModal'
import type { Prompt, Category } from '../../shared/types'
import { MessageType } from '../../shared/messages'
import {
  saveImage,
  deleteImage,
  downloadImageFromUrl,
  isFolderConfigured,
  getCachedImageUrl,
} from '../../lib/sync/image-sync'
import type { ImageSaveResult } from '../../lib/sync/image-sync'
import { MAX_IMAGE_SIZE, ALLOWED_IMAGE_EXTENSIONS } from '../../shared/constants'

// Preview offset from mouse cursor
const PREVIEW_OFFSET = 16
const PREVIEW_MAX_WIDTH = 720
const PREVIEW_MAX_HEIGHT = 480

// Fallback placeholder SVG
const FALLBACK_IMAGE_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"%3E%3Crect fill="%23f0f0f0" width="720" height="480"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E'

interface PromptEditModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  prompt?: Prompt
  categories: Category[]
  defaultCategoryId?: string
  isTemporary?: boolean  // Whether editing a temporary library prompt
  onTransfer?: (categoryId: string) => void  // Transfer callback for temporary prompts
  onConfirm: (data: {
    name: string
    nameEn?: string
    description?: string
    descriptionEn?: string
    content: string
    contentEn?: string
    categoryId: string
    localImage?: string
    remoteImageUrl?: string
  }) => void
}

// Helper function for error messages
function getImageErrorMessage(error?: string): string {
  switch (error) {
    case 'FOLDER_NOT_CONFIGURED':
      return '请先配置备份文件夹'
    case 'FOLDER_NOT_FOUND':
      return '备份文件夹不存在或已移动，请重新选择文件夹'
    case 'PERMISSION_DENIED':
      return '文件夹权限不足，请重新选择文件夹或授权访问'
    case 'WRITE_FAILED':
      return '图片保存失败，请检查文件夹权限'
    case 'FILE_TOO_LARGE':
      return '图片太大，请选择小于5MB的图片'
    case 'INVALID_FORMAT':
      return '图片格式不支持'
    default:
      return '图片保存失败'
  }
}

export function PromptEditModal({
  isOpen,
  onClose,
  mode,
  prompt,
  categories,
  defaultCategoryId,
  isTemporary,
  onTransfer,
  onConfirm,
}: PromptEditModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Bilingual editing: tab and English field states
  const [activeTab, setActiveTab] = useState<'zh' | 'en'>('zh')
  const [nameEn, setNameEn] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [contentEn, setContentEn] = useState('')

  // Image state
  const [localImage, setLocalImage] = useState<string | undefined>(undefined)
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | undefined>(undefined)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | undefined>(undefined)
  const [showFolderWarning, setShowFolderWarning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hover preview state
  const [showImagePreview, setShowImagePreview] = useState(false)
  const [imagePreviewMousePos, setImagePreviewMousePos] = useState({ x: 0, y: 0 })

  // Cleanup blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
    }
  }, [imagePreviewUrl])

  // Reset hover preview state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowImagePreview(false)
    }
  }, [isOpen])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      let cancelled = false

      if (prompt) {
        setName(prompt.name)
        setDescription(prompt.description || '')
        setContent(prompt.content)
        // Initialize English fields from existing prompt
        setNameEn(prompt.nameEn || '')
        setDescriptionEn(prompt.descriptionEn || '')
        setContentEn(prompt.contentEn || '')
        // Reset image state from prompt
        setLocalImage(prompt.localImage)
        setRemoteImageUrl(prompt.remoteImageUrl)
        if (prompt.localImage) {
          // Load preview for existing image
          getCachedImageUrl(prompt.localImage)
            .then((url) => {
              if (!cancelled) {
                setImagePreviewUrl(url || undefined)
              }
            })
            .catch(() => {
              if (!cancelled) {
                setImagePreviewUrl(undefined)
              }
            })
        } else {
          setImagePreviewUrl(undefined)
        }
        // categoryId: use defaultCategoryId for temporary prompts (prompt.categoryId='temporary' is virtual)
        // For regular prompts, use prompt.categoryId or defaultCategoryId fallback
        const isTemporaryPrompt = prompt.categoryId === 'temporary'
        if (isTemporaryPrompt) {
          setCategoryId(defaultCategoryId || categories[0]?.id || '')
        } else {
          setCategoryId(prompt.categoryId || defaultCategoryId || categories[0]?.id || '')
        }
      } else {
        setName('')
        setDescription('')
        setContent('')
        setCategoryId(defaultCategoryId || categories[0]?.id || '')
        // Reset English fields for add mode
        setNameEn('')
        setDescriptionEn('')
        setContentEn('')
        // Reset image state for add mode
        setLocalImage(undefined)
        setRemoteImageUrl(undefined)
        setImagePreviewUrl(undefined)
      }
      setImageUrlInput('')
      setImageError(undefined)
      setShowFolderWarning(false)
      // Reset tab to Chinese when modal opens
      setActiveTab('zh')

      return () => {
        cancelled = true
      }
    }
  }, [isOpen, prompt, defaultCategoryId, categories])

  // Handle file upload
  const handleFileUpload = useCallback(
    async (file: File) => {
      setImageError(undefined)

      // Check folder configured
      const configured = await isFolderConfigured()
      if (!configured) {
        setShowFolderWarning(true)
        return
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError(`图片太大，请选择小于${MAX_IMAGE_SIZE / 1024 / 1024}MB的图片`)
        return
      }

      // Validate file type
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext || '')) {
        setImageError(`请选择 ${ALLOWED_IMAGE_EXTENSIONS.join('、')} 格式的图片`)
        return
      }

      setIsUploadingImage(true)

      try {
        // Generate temporary ID for new prompts (use timestamp)
        const tempId = prompt?.id || `temp-${Date.now()}`

        const result: ImageSaveResult = await saveImage(tempId, file, file.name)

        if (result.success && result.relativePath) {
          setLocalImage(result.relativePath)
          setImagePreviewUrl(URL.createObjectURL(file))
        } else {
          setImageError(getImageErrorMessage(result.error))
        }
      } catch {
        setImageError('图片保存失败，请检查文件夹权限')
      }

      setIsUploadingImage(false)
    },
    [prompt?.id]
  )

  // Handle URL download
  const handleUrlDownload = useCallback(async () => {
    if (!imageUrlInput.trim()) return

    setImageError(undefined)

    // Check folder configured
    const configured = await isFolderConfigured()
    if (!configured) {
      setShowFolderWarning(true)
      return
    }

    setIsUploadingImage(true)

    try {
      const downloadResult = await downloadImageFromUrl(imageUrlInput.trim())

      if (downloadResult.success && downloadResult.blob) {
        const tempId = prompt?.id || `temp-${Date.now()}`
        const result = await saveImage(tempId, downloadResult.blob)

        if (result.success && result.relativePath) {
          setLocalImage(result.relativePath)
          setRemoteImageUrl(imageUrlInput.trim()) // Record source URL
          setImagePreviewUrl(URL.createObjectURL(downloadResult.blob))
          setImageUrlInput('')
        } else {
          setImageError(getImageErrorMessage(result.error))
        }
      } else {
        setImageError('图片下载失败，请检查网络或URL是否有效')
      }
    } catch {
      setImageError('图片下载失败')
    }

    setIsUploadingImage(false)
  }, [imageUrlInput, prompt?.id])

  // Handle image delete
  const handleImageDelete = useCallback(async () => {
    if (prompt?.id && localImage) {
      await deleteImage(prompt.id)
    }
    setLocalImage(undefined)
    setRemoteImageUrl(undefined)
    setImagePreviewUrl(undefined)
  }, [prompt?.id, localImage])

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Handle drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) {
        await handleFileUpload(file)
      }
    },
    [handleFileUpload]
  )

  // Handle image thumbnail hover preview
  const handleImageThumbnailMouseEnter = () => {
    if (imagePreviewUrl) {
      setShowImagePreview(true)
    }
  }

  const handleImageThumbnailMouseMove = (e: React.MouseEvent) => {
    setImagePreviewMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleImageThumbnailMouseLeave = () => {
    setShowImagePreview(false)
  }

  const handleConfirm = () => {
    const trimmedName = name.trim()
    const trimmedContent = content.trim()
    if (!trimmedName || !trimmedContent || !categoryId) return

    // If editing temporary prompt, use transfer callback
    if (isTemporary && onTransfer) {
      onTransfer(categoryId)
      onClose()
      return
    }

    const trimmedNameEn = nameEn.trim()
    const trimmedContentEn = contentEn.trim()
    const trimmedDescriptionEn = descriptionEn.trim()

    onConfirm({
      name: trimmedName,
      nameEn: trimmedNameEn || undefined,
      description: description.trim() || undefined,
      descriptionEn: trimmedDescriptionEn || undefined,
      content: trimmedContent,
      contentEn: trimmedContentEn || undefined,
      categoryId,
      localImage,
      remoteImageUrl,
    })
    onClose()
  }

  const isValid = name.trim() && content.trim() && categoryId

  // Preview element - rendered via portal to document.body
  // Auto-stick to top if preview would exceed viewport top boundary
  const previewHeight = PREVIEW_MAX_HEIGHT + 32 + 16 // max height + padding + extra
  const previewTopPosition = imagePreviewMousePos.y - PREVIEW_OFFSET - previewHeight
  const shouldStickToTop = previewTopPosition < 0

  const previewElement = showImagePreview && imagePreviewUrl ? (
    <div
      style={{
        position: 'fixed',
        left: imagePreviewMousePos.x - PREVIEW_OFFSET,
        top: shouldStickToTop ? PREVIEW_OFFSET : imagePreviewMousePos.y - PREVIEW_OFFSET,
        transform: shouldStickToTop ? 'translateX(-100%)' : 'translate(-100%, -100%)',
        zIndex: 2147483647,
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
        padding: '16px',
        maxWidth: `${PREVIEW_MAX_WIDTH + 32}px`,
        maxHeight: `${PREVIEW_MAX_HEIGHT + 32}px`,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <img
        src={imagePreviewUrl}
        alt="Image preview"
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
      {/* Preview rendered via portal to document.body */}
      {previewElement && createPortal(previewElement, document.body)}
      <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'add' ? '添加提示词' : '编辑提示词'}
      description={mode === 'add' ? '添加新的提示词到您的收藏' : '修改提示词的名称、内容和分类'}
      width={480}
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px',
              background: '#f8f8f8',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#171717',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              padding: '10px 16px',
              background: '#171717',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: isValid ? 'pointer' : 'not-allowed',
              opacity: isValid ? 1 : 0.5,
            }}
          >
            {isTemporary ? '转移到分类' : (mode === 'add' ? '添加' : '保存')}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Tab buttons - pill style with width fit-content */}
        <div style={{
          display: 'flex',
          width: 'fit-content',
          gap: '4px',
          background: '#f0f0f0',
          padding: '4px',
          borderRadius: '6px',
        }}>
          <button
            onClick={() => setActiveTab('zh')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 500,
              color: activeTab === 'zh' ? '#171717' : '#64748B',
              background: activeTab === 'zh' ? '#ffffff' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: activeTab === 'zh' ? '0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
            }}
          >
            中
          </button>
          <button
            onClick={() => setActiveTab('en')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 500,
              color: activeTab === 'en' ? '#171717' : '#64748B',
              background: activeTab === 'en' ? '#ffffff' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: activeTab === 'en' ? '0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
            }}
          >
            EN
          </button>
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#64748B',
            }}
          >
            名称
          </label>
          <input
            value={activeTab === 'zh' ? name : nameEn}
            onChange={(e) => {
              if (activeTab === 'zh') {
                setName(e.target.value)
              } else {
                setNameEn(e.target.value)
              }
            }}
            placeholder={activeTab === 'zh' ? '提示词名称' : 'Prompt name (English)'}
            autoFocus={activeTab === 'zh'}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#64748B',
            }}
          >
            描述（选填）
          </label>
          <input
            value={activeTab === 'zh' ? description : descriptionEn}
            onChange={(e) => {
              if (activeTab === 'zh') {
                setDescription(e.target.value)
              } else {
                setDescriptionEn(e.target.value)
              }
            }}
            placeholder={activeTab === 'zh' ? '简短描述，用于列表展示' : 'Short description for display'}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#64748B',
            }}
          >
            内容
          </label>
          <textarea
            value={activeTab === 'zh' ? content : contentEn}
            onChange={(e) => {
              if (activeTab === 'zh') {
                setContent(e.target.value)
              } else {
                setContentEn(e.target.value)
              }
            }}
            placeholder={activeTab === 'zh' ? '提示词内容' : 'Prompt content (English)'}
            rows={8}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              resize: 'vertical',
              minHeight: '120px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Image upload section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#64748B',
            }}
          >
            示例图片（选填）
          </label>

          {/* Image preview / upload area */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              padding: '12px',
              background: imagePreviewUrl ? '#f8f8f8' : '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {/* Has image: show preview with actions */}
            {imagePreviewUrl ? (
              <>
                <div
                  onMouseEnter={handleImageThumbnailMouseEnter}
                  onMouseMove={handleImageThumbnailMouseMove}
                  onMouseLeave={handleImageThumbnailMouseLeave}
                  style={{
                    width: 80,
                    height: 60,
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#f0f0f0',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={imagePreviewUrl}
                    alt="Preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    {remoteImageUrl ? '来源: 网络图片' : '来源: 本地上传'}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      style={{
                        padding: '6px 12px',
                        background: '#ffffff',
                        border: '1px solid #E5E5E5',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#171717',
                        cursor: isUploadingImage ? 'wait' : 'pointer',
                      }}
                    >
                      更换图片
                    </button>
                    <button
                      onClick={handleImageDelete}
                      disabled={isUploadingImage}
                      style={{
                        padding: '6px 12px',
                        background: '#ffffff',
                        border: '1px solid #E5E5E5',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#dc2626',
                        cursor: isUploadingImage ? 'wait' : 'pointer',
                      }}
                    >
                      删除图片
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* No image: show upload UI */}
                <ImageIcon style={{ width: 24, height: 24, color: '#64748B' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      style={{
                        padding: '6px 12px',
                        background: '#ffffff',
                        border: '1px solid #E5E5E5',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#171717',
                        cursor: isUploadingImage ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Upload style={{ width: 12, height: 12 }} />
                      上传图片
                    </button>
                    <span style={{ fontSize: '10px', color: '#999' }}>或拖拽到此处</span>
                  </div>
                  {/* URL input */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="或输入图片URL..."
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #E5E5E5',
                        borderRadius: '4px',
                        fontSize: '11px',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleUrlDownload}
                      disabled={isUploadingImage || !imageUrlInput.trim()}
                      style={{
                        padding: '6px 12px',
                        background: '#ffffff',
                        border: '1px solid #E5E5E5',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#171717',
                        cursor: isUploadingImage ? 'wait' : 'pointer',
                        opacity: imageUrlInput.trim() ? 1 : 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Link style={{ width: 12, height: 12 }} />
                      下载
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
              style={{ display: 'none' }}
            />
          </div>

          {/* Error message */}
          {imageError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#dc2626',
              }}
            >
              <AlertCircle style={{ width: 12, height: 12 }} />
              {imageError}
            </div>
          )}

          {/* Folder warning */}
          {showFolderWarning && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: '4px',
              }}
            >
              <AlertCircle style={{ width: 14, height: 14, color: '#ea580c' }} />
              <span style={{ fontSize: '11px', color: '#9a3412', flex: 1 }}>
                保存图片需要先配置备份文件夹
              </span>
              <button
                onClick={() => {
                  setShowFolderWarning(false)
                  // Open backup page for folder selection
                  chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })
                }}
                style={{
                  padding: '4px 8px',
                  background: '#f97316',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 500,
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                配置文件夹
              </button>
            </div>
          )}
        </div>

        {/* Category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#64748B',
            }}
          >
            所属分类
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </BaseModal>
    </>
  )
}