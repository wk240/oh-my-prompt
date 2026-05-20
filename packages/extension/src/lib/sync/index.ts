export { SyncOrchestrator } from './orchestrator'
export { CloudSyncStrategy } from './strategies/cloud'
export { LocalSyncStrategy } from './strategies/local'
export { BaseSyncStrategy } from './strategies/base'
export * from './types'

// Factory function for easy instantiation
import { CloudSyncStrategy } from './strategies/cloud'
import { LocalSyncStrategy } from './strategies/local'
import { SyncOrchestrator } from './orchestrator'

export function createSyncOrchestrator(): SyncOrchestrator {
  const cloudStrategy = new CloudSyncStrategy()
  const localStrategy = new LocalSyncStrategy()
  return new SyncOrchestrator(cloudStrategy, localStrategy)
}