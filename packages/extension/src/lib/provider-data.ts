// src/lib/provider-data.ts
import providersJson from '../data/providers.json'
import type { Provider, ProviderGroup, ModelInfo } from '@oh-my-prompt/shared/types'

// JSON provider type (matches providers.json structure)
interface JsonProvider {
  name: string
  nameCn?: string
  type: string
  websiteUrl: string
  apiKeyUrl: string
  apiEndpoint: string
  apiFormat: string
  models: Array<{ id: string; visionCapable: boolean }>
  icon: string
  iconColor: string
  isPartner?: boolean
  requiresAuth?: boolean
}

/**
 * Generate provider ID from name (slug)
 */
function generateProviderId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Map provider type from JSON to our type
 */
function mapProviderType(type: string): Provider['type'] {
  const typeMap: Record<string, Provider['type']> = {
    'omp_official': 'omp_official',
    'official': 'official',
    'cn_official': 'cn_official'
  }
  return typeMap[type] || 'official'
}

/**
 * Map models from JSON format to ModelInfo
 */
function mapModels(models: Array<{ id: string; visionCapable: boolean }>): ModelInfo[] {
  return models.map(m => ({
    id: m.id,
    visionCapable: m.visionCapable
  }))
}

/**
 * Load providers from providers.json
 */
export function loadSupportedProviders(): Provider[] {
  const providersData = providersJson.providers as JsonProvider[]
  return providersData.map(p => ({
    id: generateProviderId(p.name),
    name: p.name,
    nameCn: p.nameCn,
    type: mapProviderType(p.type),
    apiEndpoint: p.apiEndpoint,
    apiFormat: p.apiFormat as Provider['apiFormat'],
    models: mapModels(p.models),
    icon: p.icon,
    iconColor: p.iconColor,
    websiteUrl: p.websiteUrl,
    apiKeyUrl: p.apiKeyUrl,
    isPartner: p.isPartner,
    requiresAuth: p.requiresAuth
  }))
}

/**
 * Group providers by type for UI display
 * @param providers - List of providers to group
 * @param excludeOfficial - If true, excludes omp_official and official types (for third-party config section)
 */
export function groupProvidersByType(providers: Provider[], excludeOfficial = false): ProviderGroup[] {
  const groups: Map<Provider['type'], Provider[]> = new Map()

  // Filter out official types if requested
  const filteredProviders = excludeOfficial
    ? providers.filter(p => p.type !== 'omp_official' && p.type !== 'official')
    : providers

  for (const provider of filteredProviders) {
    const existing = groups.get(provider.type) || []
    groups.set(provider.type, [...existing, provider])
  }

  const groupDefinitions: Array<{ type: Provider['type']; label: string; labelEn: string; order: number }> = [
    { type: 'omp_official', label: '官方服务', labelEn: 'Official', order: 0 },
    { type: 'cn_official', label: '国内提供商', labelEn: 'China Providers', order: 1 },
    { type: 'official', label: '国外 API', labelEn: 'Global', order: 2 }
  ]

  const result: ProviderGroup[] = []
  for (const def of groupDefinitions) {
    const providersInGroup = groups.get(def.type)
    if (providersInGroup && providersInGroup.length > 0) {
      result.push({
        label: def.label,
        labelEn: def.labelEn,
        type: def.type,
        providers: providersInGroup,
        order: def.order
      })
    }
  }

  return result.sort((a, b) => a.order - b.order)
}

/**
 * Get provider by ID
 */
export function getProviderById(providers: Provider[], id: string): Provider | undefined {
  return providers.find(p => p.id === id)
}