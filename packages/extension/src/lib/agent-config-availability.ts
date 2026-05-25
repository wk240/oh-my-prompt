import type { ProviderConfig } from '@oh-my-prompt/shared/types'

export function isAgentConfigUsable(
  configs: ProviderConfig[],
  activeConfigId: string | null,
  isLoggedIn: boolean
): boolean {
  const activeConfig = activeConfigId
    ? configs.find(config => config.id === activeConfigId)
    : null

  if (activeConfig) {
    return activeConfig.apiFormat === 'omp_official' ? isLoggedIn : true
  }

  return configs.some(config => config.apiFormat === 'omp_official') && isLoggedIn
}
