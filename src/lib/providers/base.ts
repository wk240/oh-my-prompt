/**
 * DataSourceProvider Interface
 * Abstract contract for network prompt data sources (Phase 5)
 *
 * Design decisions:
 * - D-01: Three methods: fetch(), parse(), getCategories()
 * - D-02: No error callbacks, retry config, health check - keep simple
 * - D-03: parse() returns NetworkPrompt[], getCategories() returns ProviderCategory[]
 */

import type { NetworkPrompt, ProviderCategory } from '@/shared/types'

/**
 * DataSourceProvider interface
 * All network data source implementations must follow this contract
 */
export interface DataSourceProvider {
  /** Provider identifier (e.g., 'nano-banana') */
  readonly id: string

  /** Provider display name (e.g., 'Nano Banana Prompts') */
  readonly name: string

  /** Data source URL */
  readonly dataUrl: string

  /**
   * Fetch raw data from network source
   * @returns Raw markdown/string content
   */
  fetch(): Promise<string>

  /**
   * Parse raw data into NetworkPrompt array
   * @param rawData - Raw content from fetch()
   * @returns Array of parsed NetworkPrompt objects
   */
  parse(rawData: string): NetworkPrompt[]

  /**
   * Get available categories from this source
   * @returns Array of ProviderCategory metadata
   */
  getCategories(): ProviderCategory[]
}