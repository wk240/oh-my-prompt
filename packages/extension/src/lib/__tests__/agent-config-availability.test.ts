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
  it('treats official API as unavailable when logged out', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', false)).toBe(false)
  })

  it('treats official API as usable when logged in with quota remaining', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', true, 12)).toBe(true)
  })

  it('treats official API as unavailable when quota is exhausted', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', true, 0)).toBe(false)
  })

  it('keeps third-party API usable without official quota', () => {
    expect(isAgentConfigUsable([thirdPartyConfig], 'third-party', false, 0)).toBe(true)
  })
})
