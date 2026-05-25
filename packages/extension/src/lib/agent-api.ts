/**
 * Agent API integration module
 * Handles prompt enhancement using Vision Provider Config infrastructure
 * Supports Anthropic Messages, OpenAI Chat Completions, and OMP Official API formats
 *
 * For omp_official: reuses the /api/vision/generate endpoint with mode='agent'
 * to avoid needing a separate deployed route.
 */

import type { ProviderConfig, AgentGeneratePayload, AgentGenerateResult } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { buildAgentSystemPrompt, buildEcommerceSystemPrompt } from './agent-templates'
import { parseAgentGenerateResult } from './agent-result-parser'
import { parseEcommerceGenerateResult } from './ecommerce-result-parser'
import { extractBase64Data, extractMediaType } from './image-utils'
import { WEB_APP_URL } from '@/lib/config'
import { getSupabaseClient } from '@/lib/cloud-sync/supabase-client'

// API call timeout in milliseconds (5 minutes)
const API_TIMEOUT_MS = 300000
const DEFAULT_AGENT_MAX_TOKENS = 4096
const ECOMMERCE_AGENT_MAX_TOKENS = 8192

// Anthropic API version header
const ANTHROPIC_VERSION = '2023-06-01'

export function getPayloadProductImages(payload: AgentGeneratePayload): string[] {
  if (payload.productImages?.length) {
    return payload.productImages.filter(Boolean)
  }
  return payload.productImage ? [payload.productImage] : []
}

/**
 * Get active provider config from storage
 * NOTE: Only works from content script / popup / sidepanel contexts.
 * Service worker CANNOT send messages to itself — use executeAgentApiCallWithProviderConfig() instead.
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
function getFullEndpoint(baseUrl: string, apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses'): string {
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

  if (apiFormat === 'openai_responses') {
    if (normalizedBase.includes('/responses')) {
      return normalizedBase
    }
    if (normalizedBase.includes('/v1')) {
      return normalizedBase + '/responses'
    }
    return normalizedBase + '/v1/responses'
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
  modelName: string,
  maxTokens: number
): object {
  return {
    model: modelName,
    max_tokens: maxTokens,
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
export function buildOpenAIRequest(
  systemPrompt: string,
  userText: string,
  modelName: string,
  maxTokens: number,
  imageData?: string,
  productImages: string[] = []
): object {
  // Build user content with system prompt prefix
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []

  // Add text content with system prompt prefix
  userContent.push({
    type: 'text',
    text: `${systemPrompt}\n\n用户描述：${userText}`
  })

  // Add product images for ecommerce
  for (const productImage of productImages) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: productImage
      }
    })
  }

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
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: userContent
    }]
  }
}

export function buildOpenAIResponsesRequest(
  systemPrompt: string,
  userText: string,
  modelName: string,
  maxTokens: number,
  imageData?: string,
  productImages: string[] = []
): object {
  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> = [
    { type: 'input_text', text: userText }
  ]

  for (const productImage of productImages) {
    content.push({ type: 'input_image', image_url: productImage })
  }

  if (imageData) {
    content.push({ type: 'input_image', image_url: imageData })
  }

  return {
    model: modelName,
    instructions: systemPrompt,
    max_output_tokens: maxTokens,
    input: [{
      role: 'user',
      content
    }]
  }
}

/**
 * Build fetch headers for API format
 * @param apiFormat - 'anthropic_messages' or 'chat_completions'
 * @param apiKey - API key
 * @returns Headers object
 */
function buildHeaders(apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses', apiKey: string): HeadersInit {
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
export function extractAgentTextContent(apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses', response: unknown): string {
  if (apiFormat === 'anthropic_messages') {
    // Anthropic response: { content: [{ type: 'text', text: '...' }] }
    const anthropicResponse = response as { content?: Array<{ type?: string; text?: string }> }
    return joinTextParts(anthropicResponse.content)
  }

  if (apiFormat === 'openai_responses') {
    const responsesResponse = response as {
      output_text?: string
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
    }
    if (typeof responsesResponse.output_text === 'string' && responsesResponse.output_text.trim()) {
      return responsesResponse.output_text.trim()
    }
    return joinTextParts(responsesResponse.output?.flatMap(item => item.content || []))
  }

  // OpenAI response: { choices: [{ message: { content: '...' }] } }
  const openaiResponse = response as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> }
  const content = openaiResponse.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content.trim()
  }
  return joinTextParts(content)
}

function joinTextParts(parts: Array<{ type?: string; text?: string }> | undefined): string {
  return (parts || [])
    .filter(part => (part.type === undefined || part.type === 'text' || part.type === 'output_text') && typeof part.text === 'string' && part.text.trim())
    .map(part => part.text!.trim())
    .join('\n')
}

/**
 * Execute Agent API call with pre-resolved provider config
 * Use this from service worker context where chrome.runtime.sendMessage to self doesn't work.
 * @param payload - Agent generation payload
 * @param signal - Optional AbortSignal for cancellation
 * @param providedConfig - Provider config passed directly (avoids nested messaging in service worker)
 * @returns AgentGenerateResult with generated prompt
 * @throws Error on API failure
 */
export async function executeAgentApiCallWithProviderConfig(
  payload: AgentGeneratePayload,
  signal?: AbortSignal,
  providedConfig?: ProviderConfig | null
): Promise<AgentGenerateResult> {
  const perfLog = (step: string, startTime?: number) => {
    const now = performance.now()
    const elapsed = startTime ? now - startTime : 0
    console.log(`[Oh My Prompt] ⏱️ Agent Perf: ${step}${startTime ? ` (${elapsed.toFixed(0)}ms)` : ''}`)
    return now
  }

  const totalStart = perfLog('START total flow')

  // Use provided config if available (service worker passes it directly)
  // Otherwise fetch from storage (content script / sidepanel context)
  const configStart = perfLog('START get config')
  const config = providedConfig ?? await getActiveProviderConfig()
  perfLog('END get config', configStart)

  if (!config) {
    throw new Error('NO_CONFIG: 请先配置 API 或登录官方服务')
  }

  // Official API: use session token authentication via Vision endpoint
  // Build systemPrompt locally and send to server (single source of truth)
  if (config.apiFormat === 'omp_official') {
    const promptStart = perfLog('START build system prompt (official)')
    const isEcommerce = payload.templateCategory === 'ecommerce' && payload.ecommerceConfig
    const productImages = getPayloadProductImages(payload)
    const systemPrompt = isEcommerce
      ? buildEcommerceSystemPrompt(payload.ecommerceConfig!, !!(productImages.length || payload.imageData))
      : buildAgentSystemPrompt(payload.templateCategory, !!payload.imageData)
    perfLog('END build system prompt (official)', promptStart)

    const result = await executeOfficialAgentApiCall(payload, systemPrompt, productImages, signal, perfLog)
    perfLog('END total flow', totalStart)
    return result
  }

  // Only support anthropic_messages, chat_completions and openai_responses for third-party APIs
  if (config.apiFormat !== 'anthropic_messages' && config.apiFormat !== 'chat_completions' && config.apiFormat !== 'openai_responses') {
    throw new Error('UNSUPPORTED_FORMAT: Agent 功能仅支持 Anthropic Messages、OpenAI Chat Completions、OpenAI Responses 和官方服务 API 格式')
  }

  // Validate endpoint security (HTTPS)
  if (!config.apiEndpoint.startsWith('https://')) {
    throw new Error('API 地址必须使用 HTTPS')
  }

  // Build system prompt
  const promptStart = perfLog('START build system prompt (third-party)')
  const isEcommerce = payload.templateCategory === 'ecommerce' && payload.ecommerceConfig
  const productImages = getPayloadProductImages(payload)
  const systemPrompt = isEcommerce
    ? buildEcommerceSystemPrompt(payload.ecommerceConfig!, !!(productImages.length || payload.imageData))
    : buildAgentSystemPrompt(payload.templateCategory, !!payload.imageData)
  perfLog('END build system prompt (third-party)', promptStart)

  // Get full endpoint URL
  const endpointUrl = getFullEndpoint(config.apiEndpoint, config.apiFormat as 'anthropic_messages' | 'chat_completions' | 'openai_responses')
  const maxTokens = isEcommerce ? ECOMMERCE_AGENT_MAX_TOKENS : DEFAULT_AGENT_MAX_TOKENS

  // Build request body
  const buildStart = perfLog('START build request body')
  let requestBody: object

  if (config.apiFormat === 'anthropic_messages') {
    // Anthropic: build content array with optional image
    const userContent: Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'base64'; media_type: string; data: string } }> = []

    userContent.push({
      type: 'text',
      text: payload.inputText
    })

    // Add product images for ecommerce before single imageData
    for (const productImage of productImages) {
      const base64Data = extractBase64Data(productImage)
      if (base64Data) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: extractMediaType(productImage), data: base64Data }
        })
      }
    }

    if (payload.imageData) {
      // Extract pure base64 (without data URL prefix) for Anthropic
      const base64Data = extractBase64Data(payload.imageData)
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: extractMediaType(payload.imageData),
          data: base64Data
        }
      })
    }

    requestBody = buildAnthropicRequest(systemPrompt, userContent, config.selectedModel, maxTokens)
  } else if (config.apiFormat === 'openai_responses') {
    requestBody = buildOpenAIResponsesRequest(systemPrompt, payload.inputText, config.selectedModel, maxTokens, payload.imageData, productImages)
  } else {
    // OpenAI: system prompt in user message prefix
    requestBody = buildOpenAIRequest(systemPrompt, payload.inputText, config.selectedModel, maxTokens, payload.imageData, productImages)
  }
  perfLog('END build request body', buildStart)

  // Build headers
  const headers = buildHeaders(config.apiFormat as 'anthropic_messages' | 'chat_completions' | 'openai_responses', config.apiKey)

  // Execute with timeout and optional external signal
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
    const fetchStart = perfLog('START third-party API fetch')
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    perfLog('END third-party API fetch (got response)', fetchStart)

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

    const parseStart = perfLog('START parse JSON response (third-party)')
    const data = await response.json()
    perfLog('END parse JSON response (third-party)', parseStart)

    // Extract result
    const promptText = extractAgentTextContent(config.apiFormat as 'anthropic_messages' | 'chat_completions' | 'openai_responses', data)

    if (!promptText) {
      throw new Error('API 返回空内容')
    }

    const parsedAgentResult = !isEcommerce
      ? parseAgentGenerateResult({ prompt: promptText })
      : null
    const agentResult = parsedAgentResult?.ok ? parsedAgentResult.result : undefined
    const parsedEcommerceResult = isEcommerce
      ? parseEcommerceGenerateResult({ prompt: promptText }, payload.ecommerceConfig?.aspectRatio || '1:1')
      : null
    const ecommercePrompts = parsedEcommerceResult?.ok ? parsedEcommerceResult.result : undefined

    perfLog('END total flow', totalStart)

    return {
      prompt: agentResult?.prompt || promptText,
      templateCategory: payload.templateCategory,
      agentResult,
      ecommercePrompts
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

/**
 * Execute Agent API call (convenience wrapper for non-service-worker contexts)
 * Fetches active provider config via messaging before calling the API.
 * Do NOT use from service worker — use executeAgentApiCallWithProviderConfig() instead.
 * @param payload - Agent generation payload
 * @param signal - Optional AbortSignal for cancellation
 * @returns AgentGenerateResult with generated prompt
 * @throws Error on API failure
 */
export async function executeAgentApiCall(
  payload: AgentGeneratePayload,
  signal?: AbortSignal
): Promise<AgentGenerateResult> {
  return executeAgentApiCallWithProviderConfig(payload, signal)
}

/**
 * Execute Agent API call via official OMP service
 * Reuses the /api/vision/generate endpoint with mode='agent' to avoid
 * needing a separate deployed route.
 * Uses Supabase session token for authentication (same pattern as Vision API)
 * @param payload - Agent generation payload
 * @param signal - Optional AbortSignal for cancellation
 * @returns AgentGenerateResult with generated prompt
 * @throws Error on API failure
 */
async function executeOfficialAgentApiCall(
  payload: AgentGeneratePayload,
  systemPrompt: string,
  productImages: string[],
  signal?: AbortSignal,
  perfLog?: (step: string, startTime?: number) => number
): Promise<AgentGenerateResult> {
  const log = perfLog || ((step: string, start?: number) => {
    console.log(`[Oh My Prompt] ⏱️ Agent Perf (official): ${step}${start ? ` (${(performance.now() - start).toFixed(0)}ms)` : ''}`)
    return performance.now()
  })

  // 1. Get Supabase client (may be null if cleared after logout)
  const clientStart = log('START get supabase client')
  const supabase = getSupabaseClient()
  log('END get supabase client', clientStart)

  if (!supabase) {
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }

  // 2. Get Supabase session token
  const sessionStart = log('START get session token')
  let sessionResult: { data: { session: { access_token: string } | null }; error: unknown }
  try {
    sessionResult = await supabase.auth.getSession()
  } catch (sessionError) {
    console.error('[Oh My Prompt] Failed to get Supabase session:', sessionError)
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }

  if (sessionResult.error || !sessionResult.data.session || !sessionResult.data.session.access_token) {
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }
  log('END get session token', sessionStart)

  const session = sessionResult.data.session

  // 3. Call Vision API endpoint with mode='agent'
  const apiStart = log('START API fetch request')
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      abortController.abort()
      throw new DOMException('Aborted before API call', 'AbortError')
    }
    signal.addEventListener('abort', () => abortController.abort())
  }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/vision/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        mode: 'agent',
        inputText: payload.inputText,
        imageData: payload.imageData,
        templateCategory: payload.templateCategory,
        systemPrompt,
        ...(payload.ecommerceConfig && { ecommerceConfig: payload.ecommerceConfig }),
        ...(productImages.length > 0 && { productImages }),
        ...(payload.productImage && productImages.length === 0 && !payload.productImages?.length && { productImage: payload.productImage }),
      }),
      signal: abortController.signal
    })

    log('END API fetch (got response)', apiStart)

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      try {
        const errorData = await response.json()
        if (errorData && errorData.error) {
          const errorMessages: Record<string, string> = {
            'NOT_LOGGED_IN': '请先登录',
            'NOT_MEMBER': '此功能需要会员订阅',
            'SUBSCRIPTION_INACTIVE': '订阅已过期',
            'QUOTA_EXCEEDED': '本月额度已用完',
            'INVALID_REQUEST': '请求格式无效',
            'AGENT_API_NOT_CONFIGURED': '官方 Agent 服务暂未配置，请联系管理员检查 VISION_API_KEY 和 VISION_API_ENDPOINT',
            'AGENT_API_ERROR': errorData.message || 'Agent API 错误'
          }
          errorMessage = errorMessages[errorData.error] || errorData.error
        }
      } catch {
        // Failed to parse error body
      }
      throw new Error(errorMessage)
    }

    const parseStart = log('START parse JSON response')
    const result = await response.json()
    log('END parse JSON response', parseStart)

    if (!result?.success || !result.data?.prompt) {
      throw new Error(result?.error || 'Agent API 返回无效响应')
    }

    const isEcommerce = payload.templateCategory === 'ecommerce' && payload.ecommerceConfig
    const parsedAgentResult = !isEcommerce
      ? parseAgentGenerateResult({ prompt: result.data.prompt })
      : null
    const agentResult = parsedAgentResult?.ok ? parsedAgentResult.result : undefined
    const parsedEcommerceResult = isEcommerce
      ? parseEcommerceGenerateResult({ prompt: result.data.prompt }, payload.ecommerceConfig?.aspectRatio || '1:1')
      : null
    const ecommercePrompts = parsedEcommerceResult?.ok ? parsedEcommerceResult.result : undefined

    return {
      prompt: agentResult?.prompt || result.data.prompt,
      templateCategory: payload.templateCategory,
      agentResult,
      ecommercePrompts
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }
    throw error
  }
}
