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
}

// Supported API formats
const SUPPORTED_FORMATS = ['anthropic_messages', 'chat_completions', 'openai_responses', 'omp_official'] as const

// Unsupported formats (3 providers):
// - gemini_native: Google Gemini (requires separate implementation)
// - bedrock_converse_stream: AWS Bedrock (requires AWS SDK)
// - openai_chat: GitHub Copilot (OAuth-based)

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
    'cn_official': 'cn_official',
    'aggregator': 'aggregator',
    'third_party': 'third_party',
    'cloud_provider': 'third_party'
  }
  return typeMap[type] || 'third_party'
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
 * Load supported providers from providers.json
 * Filters out unsupported API formats and logs them
 */
export function loadSupportedProviders(): Provider[] {
  const providersData = providersJson.providers as JsonProvider[]
  const supported: Provider[] = []
  const unsupported: { name: string; format: string }[] = []

  for (const p of providersData) {
    if (SUPPORTED_FORMATS.includes(p.apiFormat as typeof SUPPORTED_FORMATS[number])) {
      supported.push({
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
        isPartner: p.isPartner
      })
    } else {
      unsupported.push({ name: p.name, format: p.apiFormat })
    }
  }

  // Log unsupported providers for debugging (not user-visible)
  console.log('[Oh My Prompt] Unsupported providers (require separate implementation):', unsupported)

  return supported
}

/**
 * Group providers by type for UI display
 */
export function groupProvidersByType(providers: Provider[]): ProviderGroup[] {
  const groups: Map<Provider['type'], Provider[]> = new Map()

  for (const provider of providers) {
    const existing = groups.get(provider.type) || []
    groups.set(provider.type, [...existing, provider])
  }

  const groupDefinitions: Array<{ type: Provider['type']; label: string; labelEn: string; order: number }> = [
    { type: 'omp_official', label: '官方服务', labelEn: 'Official', order: 0 },
    { type: 'cn_official', label: '国内提供商', labelEn: 'China Providers', order: 1 },
    { type: 'official', label: '国外 API', labelEn: 'Global', order: 2 },
    { type: 'aggregator', label: '聚合器', labelEn: 'Aggregators', order: 3 },
    { type: 'third_party', label: '第三方', labelEn: 'Third-party', order: 4 }
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