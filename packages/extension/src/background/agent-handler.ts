/**
 * Agent message handler module
 * Handles AGENT_GENERATE message type for prompt enhancement
 * Reads provider config directly from storage to avoid nested messaging
 * (service worker cannot send messages to itself)
 */

import type { AgentGeneratePayload, AgentGenerateResult, ProviderConfig, ProviderConfigsStorage } from '@oh-my-prompt/shared/types'
import { MessageResponse } from '@oh-my-prompt/shared/messages'
import { PROVIDER_CONFIGS_STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import { executeAgentApiCallWithProviderConfig } from '../lib/agent-api'

/**
 * Handle AGENT_GENERATE message from content script or sidepanel
 * Reads active provider config directly from storage (avoids nested chrome.runtime.sendMessage
 * which doesn't work from service worker to itself — same pattern as VISION_API_CALL handler).
 * @param payload - Agent generation payload with input text and template category
 * @param sendResponse - Response callback for message reply
 * @returns true for async response (required by Chrome message API)
 */
export async function handleAgentGenerate(
  payload: AgentGeneratePayload,
  sendResponse: (response: MessageResponse<AgentGenerateResult>) => void
): Promise<boolean> {
  try {
    // Read active config directly from storage (same pattern as Vision API handler)
    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
    const activeConfig: ProviderConfig | null =
      (storage?.activeConfigId && storage?.configs?.find(c => c.id === storage.activeConfigId)) || null

    const agentResult = await executeAgentApiCallWithProviderConfig(payload, undefined, activeConfig)
    sendResponse({ success: true, data: agentResult })
  } catch (error) {
    console.error('[Oh My Prompt] Agent API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    sendResponse({ success: false, error: errorMessage })
  }
  return true // Async response
}
