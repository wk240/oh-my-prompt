import { SyncStrategy, SyncStrategyId, FullBackupData, SyncResult, StrategyStatus } from '../types'

/**
 * Base class for sync strategies
 * Provides common merge functionality and enforces strategy interface
 */
export abstract class BaseSyncStrategy implements SyncStrategy {
  readonly id: SyncStrategyId
  readonly name: string

  constructor(id: SyncStrategyId, name: string) {
    this.id = id
    this.name = name
  }

  abstract sync(data: FullBackupData): Promise<SyncResult>
  abstract restore(): Promise<FullBackupData | null>
  abstract isAvailable(): Promise<boolean>
  abstract getStatus(): Promise<StrategyStatus>

  /**
   * Merge arrays by ID with cloud priority
   * Same ID: cloud item wins
   * Local only: preserved
   */
  protected mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
    const merged = new Map<string, T>()

    // Cloud data takes priority
    for (const item of cloud) {
      merged.set(item.id, item)
    }

    // Add local-only items
    for (const item of local) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item)
      }
    }

    return Array.from(merged.values())
  }
}