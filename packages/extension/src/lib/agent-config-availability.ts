import type { ProviderConfig } from '@oh-my-prompt/shared/types'

export function isAgentConfigUsable(
  configs: ProviderConfig[],
  activeConfigId: string | null,
  isLoggedIn: boolean,
  officialQuotaRemaining?: number
): boolean {
  const isOfficialUsable = isLoggedIn && (officialQuotaRemaining === undefined || officialQuotaRemaining > 0)
  const activeConfig = activeConfigId
    ? configs.find(config => config.id === activeConfigId)
    : null

  if (activeConfig) {
    return activeConfig.apiFormat === 'omp_official' ? isOfficialUsable : true
  }

  return configs.some(config => config.apiFormat === 'omp_official') && isOfficialUsable
}
