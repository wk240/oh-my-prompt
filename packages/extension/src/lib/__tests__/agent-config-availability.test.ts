import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from '@oh-my-prompt/shared/types'
import { isAgentConfigUsable } from '../agent-config-availability'

const officialConfig: ProviderConfig = {
  id: 'omp-official-default',
  providerId: 'omp_official',
  providerName: 'Oh My Prompt 官方服务',
  apiKey: '',
  apiEndpoint: '',
  apiFormat: 'omp_official',
  selectedModel: 'auto',
  configuredAt: 1,
  isCustom: false,
}

const thirdPartyConfig: ProviderConfig = {
  id: 'third-party',
  providerId: 'custom',
  providerName: 'Custom',
  apiKey: 'sk-test',
  apiEndpoint: 'https://api.example.com',
  apiFormat: 'chat_completions',
  selectedModel: 'test-model',
  configuredAt: 1,
  isCustom: true,
}

describe('isAgentConfigUsable', () => {
  it('treats official API as unavailable when login has expired', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', false)).toBe(false)
  })

  it('treats official API as usable when login is active', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', true)).toBe(true)
  })

  it('keeps active third-party API usable without login', () => {
    expect(isAgentConfigUsable([thirdPartyConfig], 'third-party', false)).toBe(true)
  })
})
