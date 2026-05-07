/**
 * File image utilities
 * Convert file:// URLs to base64 (content script context has DOM/canvas access)
 */

/**
 * Check if URL is a local file URL (file://)
 */
export function isFileUrl(url: string): boolean {
  return url.startsWith('file://')
}

/**
 * Convert file:// URL to base64 data URL
 * Works in content script context which has DOM/canvas access
 * @param fileUrl - file:// URL of the image
 * @returns Base64 encoded image string (data URL format)
 */
export async function fileUrlToBase64(fileUrl: string): Promise<string> {
  // Create an image element to load the file
  const img = new Image()
  img.crossOrigin = 'anonymous' // Try to avoid CORS issues (may not work for file://)

  return new Promise((resolve, reject) => {
    img.onload = () => {
      try {
        // Create canvas
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Draw image to canvas
        ctx.drawImage(img, 0, 0)

        // Check if canvas is tainted (may happen for some file:// images)
        try {
          // Convert to base64
          const base64 = canvas.toDataURL('image/jpeg', 0.9)
          resolve(base64)
        } catch (taintError) {
          reject(new Error('Canvas is tainted, cannot convert to base64'))
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Canvas conversion failed'))
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image from file:// URL'))
    }

    // Set src to trigger load
    img.src = fileUrl
  })
}

/**
 * Convert HTMLImageElement to base64
 * Used when the image element is already loaded in the DOM
 */
export function imageElementToBase64(img: HTMLImageElement): string | null {
  try {
    // Check if image is loaded
    if (!img.complete || img.naturalWidth === 0) {
      return null
    }

    // Create canvas
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }

    // Draw image to canvas
    ctx.drawImage(img, 0, 0)

    // Try to convert to base64
    return canvas.toDataURL('image/jpeg', 0.9)
  } catch (error) {
    // Canvas may be tainted
    console.warn('[Oh My Prompt] Failed to convert image element to base64:', error)
    return null
  }
}