/**
 * Agent API integration module
 * Handles prompt enhancement using Vision Provider Config infrastructure
 * Supports Anthropic Messages and OpenAI Chat Completions API formats
 */

import type { ProviderConfig, AgentGeneratePayload, AgentGenerateResult } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { buildAgentSystemPrompt } from './agent-templates'
import { extractBase64Data } from './image-utils'

// API call timeout in milliseconds (5 minutes)
const API_TIMEOUT_MS = 300000

// Anthropic API version header
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Get active provider config from storage
 * Reuses Vision Provider Config infrastructure
 */
async function getActiveProviderConfig(): Promise<ProviderConfig | null> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.GET_ACTIVE_CONFIG })
  return response?.success ? response.data : null
}

/**
 * Get full API endpoint URL from base URL
 * @param baseUrl - User-provided base URL
 * @param apiFormat - 'anthropic_messages' or 'chat_completions'
 * @returns Full endpoint URL
 */
function getFullEndpoint(baseUrl: string, apiFormat: 'anthropic_messages' | 'chat_completions'): string {
  const normalizedBase = baseUrl.replace(/\/$/, '') // Remove trailing slash

  if (apiFormat === 'anthropic_messages') {
    // Anthropic: append /v1/messages if not present
    if (normalizedBase.includes('/messages')) {
      return normalizedBase
    }
    if (normalizedBase.includes('/v1')) {
      return normalizedBase + '/messages'
    }
    return normalizedBase + '/v1/messages'
  }

  // OpenAI chat_completions: append /v1/chat/completions if not present
  if (normalizedBase.includes('/chat/completions')) {
    return normalizedBase
  }
  if (normalizedBase.includes('/v1')) {
    return normalizedBase + '/chat/completions'
  }
  return normalizedBase + '/v1/chat/completions'
}

/**
 * Build request body for Anthropic Messages API
 * @param systemPrompt - System prompt text
 * @param userContent - User message content (text and optional image)
 * @param modelName - Model identifier
 * @returns Request body object
 */
function buildAnthropicRequest(
  systemPrompt: string,
  userContent: Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'base64'; media_type: string; data: string } }>,
  modelName: string
): object {
  return {
    model: modelName,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: userContent
    }]
  }
}

/**
 * Build request body for OpenAI Chat Completions API
 * System prompt is prepended to user message
 * @param systemPrompt - System prompt text
 * @param userText - User input text
 * @param modelName - Model identifier
 * @param imageData - Optional image data URL
 * @returns Request body object
 */
function buildOpenAIRequest(
  systemPrompt: string,
  userText: string,
  modelName: string,
  imageData?: string
): object {
  // Build user content with system prompt prefix
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []

  // Add text content with system prompt prefix
  userContent.push({
    type: 'text',
    text: `${systemPrompt}\n\n用户描述：${userText}`
  })

  // Add image if provided
  if (imageData) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: imageData // OpenAI accepts data URL directly
      }
    })
  }

  return {
    model: modelName,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: userContent
    }]
  }
}

/**
 * Build fetch headers for API format
 * @param apiFormat - 'anthropic_messages' or 'chat_completions'
 * @param apiKey - API key
 * @returns Headers object
 */
function buildHeaders(apiFormat: 'anthropic_messages' | 'chat_completions', apiKey: string): HeadersInit {
  if (apiFormat === 'anthropic_messages') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    }
  }

  // OpenAI format: Authorization: Bearer
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }
}

/**
 * Extract text content from API response
 * @param apiFormat - 'anthropic_messages' or 'chat_completions'
 * @param response - API response JSON
 * @returns Text content from response
 */
function extractTextContent(apiFormat: 'anthropic_messages' | 'chat_completions', response: unknown): string {
  if (apiFormat === 'anthropic_messages') {
    // Anthropic response: { content: [{ type: 'text', text: '...' }] }
    const anthropicResponse = response as { content?: Array<{ type?: string; text?: string }> }
    const textContent = anthropicResponse.content?.find(c => c.type === 'text')
    return textContent?.text || ''
  }

  // OpenAI response: { choices: [{ message: { content: '...' }] } }
  const openaiResponse = response as { choices?: Array<{ message?: { content?: string } }> }
  return openaiResponse.choices?.[0]?.message?.content || ''
}

/**
 * Execute Agent API call with timeout
 * @param payload - Agent generation payload
 * @param signal - Optional AbortSignal for cancellation
 * @returns AgentGenerateResult with generated prompt
 * @throws Error on API failure
 */
export async function executeAgentApiCall(
  payload: AgentGeneratePayload,
  signal?: AbortSignal
): Promise<AgentGenerateResult> {
  // 1. Get active provider config
  const config = await getActiveProviderConfig()
  if (!config) {
    throw new Error('NO_CONFIG: 请先配置 Vision API')
  }

  // 2. Only support anthropic_messages and chat_completions (not omp_official)
  if (config.apiFormat !== 'anthropic_messages' && config.apiFormat !== 'chat_completions') {
    throw new Error('UNSUPPORTED_FORMAT: Agent 功能仅支持 Anthropic Messages 和 OpenAI Chat Completions API 格式')
  }

  // 3. Validate endpoint security (HTTPS)
  if (!config.apiEndpoint.startsWith('https://')) {
    throw new Error('API 地址必须使用 HTTPS')
  }

  // 4. Build system prompt
  const hasImage = !!payload.imageData
  const systemPrompt = buildAgentSystemPrompt(payload.templateCategory, hasImage)

  // 5. Get full endpoint URL
  const endpointUrl = getFullEndpoint(config.apiEndpoint, config.apiFormat as 'anthropic_messages' | 'chat_completions')

  // 6. Build request body
  let requestBody: object

  if (config.apiFormat === 'anthropic_messages') {
    // Anthropic: build content array with optional image
    const userContent: Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'base64'; media_type: string; data: string } }> = []

    userContent.push({
      type: 'text',
      text: payload.inputText
    })

    if (payload.imageData) {
      // Extract pure base64 (without data URL prefix) for Anthropic
      const base64Data = extractBase64Data(payload.imageData)
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64Data
        }
      })
    }

    requestBody = buildAnthropicRequest(systemPrompt, userContent, config.selectedModel)
  } else {
    // OpenAI: system prompt in user message prefix
    requestBody = buildOpenAIRequest(systemPrompt, payload.inputText, config.selectedModel, payload.imageData)
  }

  // 7. Build headers
  const headers = buildHeaders(config.apiFormat as 'anthropic_messages' | 'chat_completions', config.apiKey)

  // 8. Execute with timeout and optional external signal
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  // If external signal provided, abort when it triggers
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      abortController.abort()
      throw new DOMException('Aborted before API call', 'AbortError')
    }
    signal.addEventListener('abort', () => abortController.abort())
  }

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      // Parse error details from response body
      let errorDetail = `HTTP ${response.status}`
      try {
        const errorBody = await response.json()
        // OpenAI format: { error: { message, code, type } }
        if (errorBody?.error?.message) {
          errorDetail = errorBody.error.message
        }
        // Anthropic format: { error: { message, type } }
        if (errorBody?.message) {
          errorDetail = errorBody.message
        }
        // Include error code if available
        if (errorBody?.error?.code) {
          errorDetail = `${errorBody.error.code}: ${errorDetail}`
        }
      } catch {
        // Failed to parse error body, use status code
      }
      throw new Error(errorDetail)
    }

    const data = await response.json()

    // 9. Extract result
    const promptText = extractTextContent(config.apiFormat as 'anthropic_messages' | 'chat_completions', data)

    if (!promptText) {
      throw new Error('API 返回空内容')
    }

    return {
      prompt: promptText,
      templateCategory: payload.templateCategory
    }

  } catch (error) {
    clearTimeout(timeoutId)
    console.error('[Oh My Prompt] Agent API fetch error:', error)

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }

    throw error
  }
}