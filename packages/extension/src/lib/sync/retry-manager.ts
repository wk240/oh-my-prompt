/**
 * RetryManager - Automatic retry with exponential backoff.
 *
 * Retry schedule: 1s → 5s → 30s → 5min (max)
 * After 3 consecutive failures, notify user for intervention.
 */

type RetryCallback = () => Promise<{ success: boolean; error?: string }>

interface RetryState {
  retryCount: number // Number of retries that have been executed
  lastError?: string
  retryScheduledAt?: number
  retryTimer?: ReturnType<typeof setTimeout>
}

const RETRY_SCHEDULE = [1000, 5000, 30000, 300000] // 1s, 5s, 30s, 5min
const MAX_RETRIES = 3
const NON_RETRYABLE_ERRORS = new Set(['SUBSCRIPTION_REQUIRED'])

export class RetryManager {
  private state: RetryState = {
    retryCount: 0
  }
  private callback: RetryCallback
  private onProgress?: (state: RetryState) => void
  private onComplete?: (success: boolean) => void

  constructor(
    callback: RetryCallback,
    onProgress?: (state: RetryState) => void,
    onComplete?: (success: boolean) => void
  ) {
    this.callback = callback
    this.onProgress = onProgress
    this.onComplete = onComplete
  }

  /**
   * Execute operation with automatic retry on failure.
   * Returns retryCount = number of retries that have been executed.
   */
  async execute(): Promise<{ success: boolean; retryCount: number }> {
    // Clear any pending retry
    this.clearRetryTimer()

    // Reset retry count for new operation
    this.state.retryCount = 0
    this.state.lastError = undefined

    const result = await this.callback()

    if (result.success) {
      this.state.retryCount = 0
      this.state.retryScheduledAt = undefined
      this.onComplete?.(true)
      return { success: true, retryCount: 0 }
    }

    if (result.error && NON_RETRYABLE_ERRORS.has(result.error)) {
      this.state.lastError = result.error
      this.state.retryScheduledAt = undefined
      this.onComplete?.(false)
      return { success: false, retryCount: 0 }
    }

    // Start retry schedule
    this.state.lastError = result.error
    this.scheduleRetry()
    return { success: false, retryCount: this.state.retryCount }
  }

  /**
   * Get current retry state.
   */
  getState(): RetryState {
    return { ...this.state }
  }

  /**
   * Cancel pending retry.
   */
  cancel(): void {
    this.clearRetryTimer()
    this.state.retryScheduledAt = undefined
  }

  /**
   * Reset retry state.
   */
  reset(): void {
    this.clearRetryTimer()
    this.state = { retryCount: 0 }
  }

  /**
   * Schedule the next retry.
   * Uses retryCount to determine which delay to use (0 -> first delay, 1 -> second, etc.)
   */
  private scheduleRetry(): void {
    // Check if we've exhausted retries
    if (this.state.retryCount >= MAX_RETRIES) {
      // Max retries reached - notify for user intervention
      this.onProgress?.(this.state)
      this.onComplete?.(false)
      return
    }

    // Calculate delay based on current retryCount (retries executed)
    // retryCount=0 -> first retry scheduled -> use RETRY_SCHEDULE[0]
    const delay = RETRY_SCHEDULE[Math.min(this.state.retryCount, RETRY_SCHEDULE.length - 1)]
    this.state.retryScheduledAt = Date.now() + delay

    // Notify progress: a retry is scheduled
    this.onProgress?.(this.state)

    this.state.retryTimer = setTimeout(() => {
      this.executeRetry()
    }, delay)
  }

  /**
   * Execute a retry attempt.
   * Increments retryCount AFTER execution to track completed retries.
   */
  private async executeRetry(): Promise<void> {
    this.state.retryScheduledAt = undefined

    const result = await this.callback()

    // Increment retry count AFTER execution
    this.state.retryCount++

    if (result.success) {
      this.state.retryCount = 0
      this.state.lastError = undefined
      this.onComplete?.(true)
      return
    }

    if (result.error && NON_RETRYABLE_ERRORS.has(result.error)) {
      this.state.lastError = result.error
      this.onComplete?.(false)
      return
    }

    this.state.lastError = result.error
    this.scheduleRetry()
  }

  private clearRetryTimer(): void {
    if (this.state.retryTimer) {
      clearTimeout(this.state.retryTimer)
      this.state.retryTimer = undefined
    }
  }
}
