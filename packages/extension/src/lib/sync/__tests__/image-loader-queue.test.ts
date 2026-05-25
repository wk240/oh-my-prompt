import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../image-sync', () => ({
  getCachedImageUrl: vi.fn(),
}))

import { getCachedImageUrl } from '../image-sync'
import { clearLoadQueue, queueImageLoad } from '../image-loader-queue'

describe('image-loader-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearLoadQueue()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries a failed image load so permission restore can complete', async () => {
    vi.mocked(getCachedImageUrl)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('blob:image-url')

    const resultPromise = queueImageLoad('images/example.png')

    await vi.advanceTimersByTimeAsync(500)

    await expect(resultPromise).resolves.toBe('blob:image-url')
    expect(getCachedImageUrl).toHaveBeenCalledTimes(2)
  })
})
