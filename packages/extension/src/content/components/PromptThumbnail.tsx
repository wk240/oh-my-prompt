/**
 * PromptThumbnail - Lazy-loaded thumbnail component using Intersection Observer
 * Only loads image when near viewport (100px threshold)
 * Hover to show full-size preview (no delay, instant display)
 *
 * NOTE: Blob URLs are managed by the centralized image cache (image-sync.ts).
 * Do NOT revoke URLs at component level - the cache handles lifecycle.
 */

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Shapes } from 'lucide-react'
import { queueImageLoad } from '@/lib/sync/image-loader-queue'

interface PromptThumbnailProps {
  relativePath: string      // Image path relative to backup folder
  promptName: string        // Prompt name for alt text
  onClick?: () => void      // Click handler for preview modal
}

// Threshold for early loading (load when within 100px of viewport)
const INTERSECTION_THRESHOLD = 100

// Preview offset from mouse cursor
const PREVIEW_OFFSET = 16

// Preview image max dimensions
const PREVIEW_MAX_WIDTH = 720
const PREVIEW_MAX_HEIGHT = 480

// Fallback placeholder SVG
const FALLBACK_IMAGE_SVG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"%3E%3Crect fill="%23f0f0f0" width="720" height="480"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ENo Image%3C/text%3E%3C/svg%3E'

export function PromptThumbnail({
  relativePath,
  promptName,
  onClick,
}: PromptThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)

  // Hover preview state
  const [showPreview, setShowPreview] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Intersection Observer for lazy loading
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            // Disconnect observer once in view
            observer.disconnect()
          }
        })
      },
      {
        rootMargin: `${INTERSECTION_THRESHOLD}px`, // Start loading 100px before visible
        threshold: 0,
      }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  // Load image when in view
  useEffect(() => {
    if (!isInView || isLoaded) return

    const loadImage = async () => {
      const url = await queueImageLoad(relativePath)
      if (url) {
        setImageUrl(url)
      }
      setIsLoaded(true)
    }

    loadImage()
  }, [isInView, isLoaded, relativePath])

  // Handle thumbnail mouse enter - show preview immediately
  const handleThumbnailMouseEnter = () => {
    if (imageUrl) {
      setShowPreview(true)
    }
  }

  // Handle thumbnail mouse move - track position for preview positioning
  const handleThumbnailMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  // Handle thumbnail mouse leave - hide preview
  const handleThumbnailMouseLeave = () => {
    setShowPreview(false)
  }

  // Calculate boundary detection for preview positioning
  const previewHeight = PREVIEW_MAX_HEIGHT + 32 + 16
  const previewWidth = PREVIEW_MAX_WIDTH + 32 + 16
  const previewTopPosition = mousePos.y - PREVIEW_OFFSET - previewHeight
  const previewLeftPosition = mousePos.x - PREVIEW_OFFSET - previewWidth
  const shouldStickToTop = previewTopPosition < 0
  const shouldStickToLeft = previewLeftPosition < 0

  // Preview portal element
  const previewElement = showPreview && imageUrl ? (
    <div
      style={{
        position: 'fixed',
        left: shouldStickToLeft ? PREVIEW_OFFSET : mousePos.x - PREVIEW_OFFSET,
        top: shouldStickToTop ? PREVIEW_OFFSET : mousePos.y - PREVIEW_OFFSET,
        transform: shouldStickToLeft && shouldStickToTop
          ? 'none'
          : shouldStickToLeft
            ? 'translateY(-100%)'
            : shouldStickToTop
              ? 'translateX(-100%)'
              : 'translate(-100%, -100%)',
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
        src={imageUrl}
        alt={promptName}
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
      <div
        ref={ref}
        className="dropdown-item-thumbnail"
        style={onClick && imageUrl ? { cursor: 'pointer' } : {}}
        onClick={(e) => {
          if (onClick && imageUrl) {
            e.stopPropagation()
            onClick()
          }
        }}
        onMouseEnter={handleThumbnailMouseEnter}
        onMouseMove={handleThumbnailMouseMove}
        onMouseLeave={handleThumbnailMouseLeave}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={promptName} />
        ) : (
          <Shapes className="dropdown-item-thumbnail-placeholder" style={{ width: 20, height: 20 }} />
        )}
      </div>
    </>
  )
}