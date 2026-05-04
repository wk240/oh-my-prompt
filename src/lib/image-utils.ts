/**
 * Image compression utilities for Vision API
 * Uses OffscreenCanvas API (works in service worker context)
 */

// Maximum dimensions for Vision API images (to reduce payload size)
const MAX_WIDTH = 1024
const MAX_HEIGHT = 1024

// Default quality for JPEG compression (0.7 = 70%)
const DEFAULT_QUALITY = 0.7

// Supported image MIME types
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * Compress image from URL to base64 (async version for service worker)
 * Uses OffscreenCanvas.convertToBlob() which works in service worker context
 * @param imageUrl - HTTP URL of the image
 * @param maxWidth - Maximum width (default 1024)
 * @param maxHeight - Maximum height (default 1024)
 * @param quality - JPEG quality 0-1 (default 0.7)
 * @returns Base64 encoded image string (data URL format)
 */
export async function asyncCompressImageFromUrl(
  imageUrl: string,
  maxWidth: number = MAX_WIDTH,
  maxHeight: number = MAX_HEIGHT,
  quality: number = DEFAULT_QUALITY
): Promise<string> {
  // Fetch image data
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }

  const blob = await response.blob()

  // Validate MIME type
  if (!SUPPORTED_MIME_TYPES.includes(blob.type)) {
    throw new Error(`Unsupported image type: ${blob.type}`)
  }

  // Create ImageBitmap (works in service worker)
  const imageBitmap = await createImageBitmap(blob)

  // Calculate new dimensions preserving aspect ratio
  let width = imageBitmap.width
  let height = imageBitmap.height

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height)
    width = Math.floor(width * ratio)
    height = Math.floor(height * ratio)
  }

  // Create OffscreenCanvas (works in service worker)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Draw resized image
  ctx.drawImage(imageBitmap, 0, 0, width, height)

  // Convert to JPEG blob (better compression)
  const compressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality })

  // Convert blob to base64 data URL
  const base64 = await blobToDataUrl(compressedBlob)

  // Log compression stats
  const originalSize = blob.size
  const compressedSize = compressedBlob.size
  const reduction = Math.round((1 - compressedSize / originalSize) * 100)
  console.log('[Oh My Prompt] Image compressed:', {
    original: `${originalSize} bytes`,
    compressed: `${compressedSize} bytes`,
    reduction: `${reduction}%`,
    dimensions: `${width}x${height}`
  })

  return base64
}

/**
 * Convert Blob to base64 data URL
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      resolve(reader.result as string)
    }

    reader.onerror = () => {
      reject(new Error('Failed to read blob'))
    }

    reader.readAsDataURL(blob)
  })
}

/**
 * Extract base64 data from data URL (remove prefix)
 * For Anthropic API format, we need pure base64 string without data URL prefix
 * @param dataUrl - Full data URL like "data:image/jpeg;base64,xxxxx"
 * @returns Pure base64 string (without prefix)
 */
export function extractBase64Data(dataUrl: string): string {
  const prefix = 'data:image/jpeg;base64,'
  if (dataUrl.startsWith(prefix)) {
    return dataUrl.slice(prefix.length)
  }
  // Handle other image types
  const match = dataUrl.match(/^data:image\/[^;]+;base64,/)
  if (match) {
    return dataUrl.slice(match[0].length)
  }
  // Return as-is if no prefix found
  return dataUrl
}

// Thumbnail dimensions for task queue display
const THUMBNAIL_WIDTH = 80
const THUMBNAIL_HEIGHT = 80

/**
 * Generate thumbnail from image URL (80x80, low quality for display)
 * Used in BatchProgressPanel task cards
 * @param imageUrl - HTTP URL of the image
 * @returns Base64 encoded thumbnail string (data URL format), or null on failure
 */
export async function generateThumbnail(imageUrl: string): Promise<string | null> {
  try {
    // Fetch image data
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.warn('[Oh My Prompt] Thumbnail fetch failed:', response.status)
      return null
    }

    const blob = await response.blob()

    // Validate MIME type
    if (!SUPPORTED_MIME_TYPES.includes(blob.type)) {
      console.warn('[Oh My Prompt] Thumbnail unsupported type:', blob.type)
      return null
    }

    // Create ImageBitmap (works in content script context)
    const imageBitmap = await createImageBitmap(blob)

    // Calculate thumbnail dimensions preserving aspect ratio (fit within 80x80)
    let width = imageBitmap.width
    let height = imageBitmap.height
    const ratio = Math.min(THUMBNAIL_WIDTH / width, THUMBNAIL_HEIGHT / height)
    width = Math.floor(width * ratio)
    height = Math.floor(height * ratio)

    // Create canvas (use OffscreenCanvas if available, fallback to regular canvas)
    let canvas: OffscreenCanvas | HTMLCanvasElement
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null

    try {
      // Try OffscreenCanvas first (works in service worker and modern browsers)
      canvas = new OffscreenCanvas(width, height)
      ctx = canvas.getContext('2d')
    } catch {
      // Fallback to regular canvas for older browsers
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      ctx = canvas.getContext('2d')
    }

    if (!ctx) {
      console.warn('[Oh My Prompt] Thumbnail canvas context failed')
      return null
    }

    // Draw resized image
    ctx.drawImage(imageBitmap, 0, 0, width, height)

    // Convert to JPEG blob (low quality for small thumbnails)
    let thumbnailBlob: Blob

    if (canvas instanceof OffscreenCanvas) {
      thumbnailBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 })
    } else {
      // Regular canvas uses toBlob
      thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Canvas toBlob failed'))
          },
          'image/jpeg',
          0.5
        )
      })
    }

    // Convert blob to base64 data URL
    const base64 = await blobToDataUrl(thumbnailBlob)

    console.log('[Oh My Prompt] Thumbnail generated:', {
      dimensions: `${width}x${height}`,
      size: `${thumbnailBlob.size} bytes`
    })

    return base64
  } catch (error) {
    console.warn('[Oh My Prompt] Thumbnail generation failed:', error)
    return null
  }
}