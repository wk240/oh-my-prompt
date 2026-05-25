/**
 * image-loader-queue.ts - Concurrent image loading queue
 * Limits simultaneous image requests to prevent network congestion
 */

// Maximum concurrent image loads
const MAX_CONCURRENT = 3
const MAX_LOAD_ATTEMPTS = 3
const RETRY_DELAY_MS = 500

// Queue of pending load requests
interface LoadRequest {
  relativePath: string
  resolve: (url: string | null) => void
}

const loadQueue: LoadRequest[] = []
let activeLoads = 0

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function loadImageWithRetry(relativePath: string): Promise<string | null> {
  // Import getCachedImageUrl dynamically to avoid circular dependency
  const { getCachedImageUrl } = await import('./image-sync')

  for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt++) {
    const url = await getCachedImageUrl(relativePath)
    if (url || attempt === MAX_LOAD_ATTEMPTS) {
      return url
    }

    await delay(RETRY_DELAY_MS)
  }

  return null
}

/**
 * Process queue - start next load if under concurrency limit
 */
async function processQueue(): Promise<void> {
  while (loadQueue.length > 0 && activeLoads < MAX_CONCURRENT) {
    const request = loadQueue.shift()
    if (!request) break

    activeLoads++
    try {
      const url = await loadImageWithRetry(request.relativePath)
      request.resolve(url)
    } catch (error) {
      console.warn('[Oh My Prompt] Image load failed:', request.relativePath, error)
      request.resolve(null)
    } finally {
      activeLoads--
      // Process next in queue
      processQueue()
    }
  }
}

/**
 * Queue an image load request
 * Returns promise that resolves when image URL is available
 */
export function queueImageLoad(relativePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    loadQueue.push({ relativePath, resolve })
    processQueue()
  })
}

/**
 * Get queue status for debugging
 */
export function getQueueStatus(): { pending: number; active: number } {
  return {
    pending: loadQueue.length,
    active: activeLoads,
  }
}

/**
 * Clear pending queue (e.g., when dropdown closes)
 */
export function clearLoadQueue(): void {
  // Reject all pending requests
  loadQueue.forEach(request => request.resolve(null))
  loadQueue.length = 0
}
