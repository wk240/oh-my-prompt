// src/lib/config-validator.ts
import type { ProviderConfig } from '@oh-my-prompt/shared/types'

export interface ConfigValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate provider config before saving
 */
export function validateProviderConfig(config: Partial<ProviderConfig>): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Skip validation for official config (uses backend auth, no API key needed)
  if (config.apiFormat === 'omp_official') {
    return {
      valid: true,
      errors: [],
      warnings: []
    }
  }

  // Required fields
  if (!config.apiKey?.trim()) {
    errors.push('API Key 不能为空')
  }
  if (!config.apiEndpoint?.trim()) {
    errors.push('API 地址不能为空')
  } else if (!config.apiEndpoint.startsWith('https://')) {
    // HTTPS enforcement (Section 8.2)
    errors.push('API 地址必须使用 HTTPS')
  }
  if (!config.selectedModel?.trim()) {
    errors.push('模型名称不能为空')
  }

  // Format validation
  if (config.apiFormat && !['anthropic_messages', 'chat_completions', 'openai_responses'].includes(config.apiFormat)) {
    errors.push('不支持的 API 格式')
  }

  // Warnings (non-blocking)
  if (config.providerId === 'custom' && !config.providerName?.trim()) {
    warnings.push('建议为自定义配置设置一个名称')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Mask API key for safe display (returns [REDACTED] for non-empty keys)
 */
export function maskApiKey(apiKey: string | undefined): string {
  if (!apiKey || apiKey.trim() === '') {
    return ''
  }
  return '[REDACTED]'
}