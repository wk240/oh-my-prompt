/**
 * PromptEditModal - Modal for adding/editing prompts
 * Uses BaseModal structure with inline styles
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Link, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { BaseModal } from './BaseModal'
import type { Prompt, Category } from '../../shared/types'
import {
  saveImage,
  deleteImage,
  downloadImageFromUrl,
  isFolderConfigured,
  getCachedImageUrl,
} from '../../lib/sync/image-sync'
import type { ImageSaveResult } from '../../lib/sync/image-sync'
import { MAX_IMAGE_SIZE, ALLOWED_IMAGE_EXTENSIONS } from '../../shared/constants'

interface PromptEditModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  prompt?: Prompt
  categories: Category[]
  defaultCategoryId?: string
  onConfirm: (data: {
    name: string
    description?: string
    content: string
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
  onConfirm,
}: PromptEditModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Image state
  const [localImage, setLocalImage] = useState<string | undefined>(undefined)
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | undefined>(undefined)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | undefined>(undefined)
  const [showFolderWarning, setShowFolderWarning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cleanup blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
    }
  }, [imagePreviewUrl])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      let cancelled = false

      if (prompt) {
        setName(prompt.name)
        setDescription(prompt.description || '')
        setContent(prompt.content)
        setCategoryId(prompt.categoryId)
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
      } else {
        setName('')
        setDescription('')
        setContent('')
        setCategoryId(defaultCategoryId || categories[0]?.id || '')
        // Reset image state for add mode
        setLocalImage(undefined)
        setRemoteImageUrl(undefined)
        setImagePreviewUrl(undefined)
      }
      setImageUrlInput('')
      setImageError(undefined)
      setShowFolderWarning(false)

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

  const handleConfirm = () => {
    const trimmedName = name.trim()
    const trimmedContent = content.trim()
    if (!trimmedName || !trimmedContent || !categoryId) return

    onConfirm({
      name: trimmedName,
      description: description.trim() || undefined,
      content: trimmedContent,
      categoryId,
      localImage,
      remoteImageUrl,
    })
    onClose()
  }

  const isValid = name.trim() && content.trim() && categoryId

  return (
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
            {mode === 'add' ? '添加' : '保存'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="提示词名称"
            autoFocus
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简短描述，用于列表展示"
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
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="提示词内容"
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
                  style={{
                    width: 80,
                    height: 60,
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#f0f0f0',
                    flexShrink: 0,
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
                  chrome.runtime.sendMessage({ type: 'OPEN_BACKUP_PAGE' })
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
  )
}