import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RetryManager } from '../retry-manager'

describe('RetryManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return success immediately on successful operation', async () => {
    const callback = vi.fn().mockResolvedValue({ success: true })
    const manager = new RetryManager(callback)

    const result = await manager.execute()

    expect(result.success).toBe(true)
    expect(result.retryCount).toBe(0)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should retry with 1s delay on first failure', async () => {
    const callback = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'test error' })
      .mockResolvedValueOnce({ success: true })

    const manager = new RetryManager(callback)
    const result = await manager.execute()

    expect(result.success).toBe(false)
    expect(result.retryCount).toBe(0) // No retries executed yet

    // Wait for first retry to execute
    await vi.advanceTimersToNextTimerAsync()

    expect(callback).toHaveBeenCalledTimes(2) // Initial + 1 retry
    expect(manager.getState().retryCount).toBe(0) // Reset on success
  })

  it('should follow exponential backoff schedule', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const onProgress = vi.fn()
    const manager = new RetryManager(callback, onProgress)

    await manager.execute()

    // First retry scheduled (retryCount=0, no retries executed yet)
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 0, retryScheduledAt: expect.any(Number) })
    )
    expect(callback).toHaveBeenCalledTimes(1) // Only initial call

    // First retry executes (1s delay)
    await vi.advanceTimersToNextTimerAsync()

    // After first retry: retryCount=1, second retry scheduled
    expect(callback).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 1 })
    )

    // Second retry executes (5s delay)
    await vi.advanceTimersToNextTimerAsync()

    // After second retry: retryCount=2, third retry scheduled
    expect(callback).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 2 })
    )

    // Third retry executes (30s delay)
    await vi.advanceTimersToNextTimerAsync()

    // After third retry: retryCount=3, max reached
    expect(callback).toHaveBeenCalledTimes(4) // Initial + 3 retries
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ retryCount: 3 })
    )
  })

  it('should stop retrying after MAX_RETRIES and notify failure', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const onComplete = vi.fn()
    const manager = new RetryManager(callback, undefined, onComplete)

    await manager.execute()

    // Run all 3 retries
    await vi.advanceTimersToNextTimerAsync() // First retry
    await vi.advanceTimersToNextTimerAsync() // Second retry
    await vi.advanceTimersToNextTimerAsync() // Third retry

    expect(onComplete).toHaveBeenCalledWith(false)
    expect(callback).toHaveBeenCalledTimes(4) // Initial + 3 retries
  })

  it('should reset retry count on success after failures', async () => {
    const callback = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'error' })
      .mockResolvedValueOnce({ success: true })

    const manager = new RetryManager(callback)
    await manager.execute()

    // First retry executes and succeeds
    await vi.advanceTimersToNextTimerAsync()

    const state = manager.getState()
    expect(state.retryCount).toBe(0)
    expect(state.lastError).toBeUndefined()
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should cancel pending retry', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false })
    const manager = new RetryManager(callback)
    await manager.execute()

    manager.cancel()

    // Try to advance timers - nothing should happen
    vi.advanceTimersByTime(5000)
    await vi.runAllTimersAsync()

    expect(callback).toHaveBeenCalledTimes(1) // Only initial call, no retry
  })

  it('should track last error across retries', async () => {
    const callback = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'first error' })
      .mockResolvedValueOnce({ success: false, error: 'second error' })
      .mockResolvedValueOnce({ success: true })

    const manager = new RetryManager(callback)
    await manager.execute()

    // After initial failure
    const state0 = manager.getState()
    expect(state0.lastError).toBe('first error')
    expect(state0.retryCount).toBe(0)

    // First retry executes, fails with 'second error'
    await vi.advanceTimersToNextTimerAsync()

    const state1 = manager.getState()
    expect(state1.lastError).toBe('second error')
    expect(state1.retryCount).toBe(1)

    // Second retry executes, succeeds
    await vi.advanceTimersToNextTimerAsync()

    const state2 = manager.getState()
    expect(state2.retryCount).toBe(0) // Reset on success
    expect(state2.lastError).toBeUndefined()
  })

  it('should reset state completely with reset()', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const manager = new RetryManager(callback)
    await manager.execute()

    manager.reset()

    const state = manager.getState()
    expect(state.retryCount).toBe(0)
    expect(state.lastError).toBeUndefined()
    expect(state.retryScheduledAt).toBeUndefined()
    expect(state.retryTimer).toBeUndefined()
  })

  it('should call onProgress on each retry scheduled', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const onProgress = vi.fn()
    const manager = new RetryManager(callback, onProgress)

    await manager.execute()

    // First retry scheduled (retryCount=0)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 0 })
    )

    // First retry executes, second retry scheduled
    await vi.advanceTimersToNextTimerAsync()

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 1 })
    )

    // Second retry executes, third retry scheduled
    await vi.advanceTimersToNextTimerAsync()

    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 2 })
    )

    // Third retry executes, max reached
    await vi.advanceTimersToNextTimerAsync()

    expect(onProgress).toHaveBeenCalledTimes(4)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 3 })
    )
  })

  it('should return retryScheduledAt timestamp', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const manager = new RetryManager(callback)

    await manager.execute()

    const state = manager.getState()
    expect(state.retryScheduledAt).toBeDefined()
    // Should be approximately 1 second from now (first retry delay)
    const expectedTime = Date.now() + 1000
    expect(state.retryScheduledAt).toBe(expectedTime)
  })

  it('should use correct delay for each retry', async () => {
    const callback = vi.fn().mockResolvedValue({ success: false, error: 'error' })
    const manager = new RetryManager(callback)

    await manager.execute()

    // First retry: 1s delay
    expect(manager.getState().retryScheduledAt).toBe(Date.now() + 1000)

    // First retry executes
    await vi.advanceTimersToNextTimerAsync()

    // Second retry: 5s delay (scheduled after first retry completes)
    expect(manager.getState().retryScheduledAt).toBe(Date.now() + 5000)

    // Second retry executes
    await vi.advanceTimersToNextTimerAsync()

    // Third retry: 30s delay
    expect(manager.getState().retryScheduledAt).toBe(Date.now() + 30000)
  })
})