import { describe, it, expect, beforeEach } from 'vitest'
import { BaseSyncStrategy } from '../strategies/base'
import { FullBackupData, SyncResult, StrategyStatus } from '../types'

class TestStrategy extends BaseSyncStrategy {
  constructor() {
    super('test' as 'cloud' | 'local', 'Test Strategy')
  }

  async sync(_data: FullBackupData): Promise<SyncResult> {
    return { success: true, syncedAt: Date.now() }
  }

  async restore(): Promise<FullBackupData | null> {
    return null
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getStatus(): Promise<StrategyStatus> {
    return { enabled: true, lastSyncTime: Date.now() }
  }

  // Public test method to expose protected mergeById for testing
  testMergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
    return this.mergeById(cloud, local)
  }
}

describe('BaseSyncStrategy', () => {
  let strategy: TestStrategy

  beforeEach(() => {
    strategy = new TestStrategy()
  })

  it('should have id and name', () => {
    expect(strategy.id).toBe('test')
    expect(strategy.name).toBe('Test Strategy')
  })

  it('should merge by ID with cloud priority', () => {
    const cloud = [{ id: '1', name: 'Cloud Item' }]
    const local = [{ id: '1', name: 'Local Item' }, { id: '2', name: 'Local Only' }]

    const result = strategy.testMergeById(cloud, local)

    expect(result).toHaveLength(2)
    expect(result.find(i => i.id === '1')?.name).toBe('Cloud Item')
    expect(result.find(i => i.id === '2')?.name).toBe('Local Only')
  })

  it('should preserve local items not in cloud', () => {
    const cloud = [{ id: '1', name: 'Cloud Item' }]
    const local = [{ id: '2', name: 'Local Only' }, { id: '3', name: 'Another Local' }]

    const result = strategy.testMergeById(cloud, local)

    expect(result).toHaveLength(3)
    expect(result.find(i => i.id === '2')?.name).toBe('Local Only')
    expect(result.find(i => i.id === '3')?.name).toBe('Another Local')
  })

  it('should handle empty arrays', () => {
    const result1 = strategy.testMergeById([], [{ id: '1', name: 'Local' }])
    expect(result1).toHaveLength(1)

    const result2 = strategy.testMergeById([{ id: '1', name: 'Cloud' }], [])
    expect(result2).toHaveLength(1)

    const result3 = strategy.testMergeById([], [])
    expect(result3).toHaveLength(0)
  })

  it('should handle multiple items with same ID', () => {
    const cloud = [{ id: 'a', name: 'Cloud A' }, { id: 'b', name: 'Cloud B' }]
    const local = [{ id: 'a', name: 'Local A' }, { id: 'b', name: 'Local B' }, { id: 'c', name: 'Local C' }]

    const result = strategy.testMergeById(cloud, local)

    expect(result).toHaveLength(3)
    expect(result.find(i => i.id === 'a')?.name).toBe('Cloud A')
    expect(result.find(i => i.id === 'b')?.name).toBe('Cloud B')
    expect(result.find(i => i.id === 'c')?.name).toBe('Local C')
  })
})