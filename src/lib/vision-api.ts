/**
 * Vision API integration module
 * Handles request formatting and error classification
 * API format is user-selected (OpenAI or Anthropic compatible)
 */

import type { VisionApiConfig, VisionApiErrorPayload } from '../shared/types'

// Anthropic API version header (T-11-04 mitigation)
const ANTHROPIC_VERSION = '2023-06-01'

// API call timeout in milliseconds (5 minutes for slow Vision APIs)
const API_TIMEOUT_MS = 300000

// Max retry count per D-05 (Claude's discretion: 3 retries)
const MAX_RETRY_COUNT = 3

/**
 * Build Anthropic Claude Vision API request
 * @param imageUrl - HTTP URL of image to analyze
 * @param modelName - Model identifier
 * @param languageInstruction - Language preference instruction
 * @returns Request body object
 */
export function buildAnthropicRequest(
  imageUrl: string,
  modelName: string,
  languageInstruction: string
): object {
  const systemPrompt = `Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition. ${languageInstruction}`

  return {
    model: modelName,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'url',
            url: imageUrl
          }
        },
        {
          type: 'text',
          text: systemPrompt
        }
      ]
    }]
  }
}

/**
 * Build OpenAI GPT-4V compatible API request
 * @param imageUrl - HTTP URL of image to analyze
 * @param modelName - Model identifier
 * @param languageInstruction - Language preference instruction
 * @returns Request body object
 */
export function buildOpenAIRequest(
  imageUrl: string,
  modelName: string,
  languageInstruction: string
): object {
  const systemPrompt = `Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition. ${languageInstruction}`

  return {
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: systemPrompt
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        }
      ]
    }],
    max_tokens: 1024
  }
}

/**
 * Build fetch headers for API format (T-11-01: apiKey never logged)
 * @param apiFormat - 'anthropic' or 'openai'
 * @param apiKey - API key (not logged)
 * @returns Headers object
 */
export function buildHeaders(apiFormat: 'anthropic' | 'openai', apiKey: string): HeadersInit {
  if (apiFormat === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION // T-11-04 mitigation
    }
  }

  // OpenAI format (Authorization: Bearer)
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }
}

/**
 * Parse Vision API response and extract prompt text
 * @param apiFormat - 'anthropic' or 'openai'
 * @param response - API response JSON
 * @returns Generated prompt string
 */
export function parseVisionResponse(apiFormat: 'anthropic' | 'openai', response: unknown): string {
  if (apiFormat === 'anthropic') {
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
 * Get full API endpoint URL from base URL
 * @param baseUrl - User-provided base URL
 * @param apiFormat - 'openai' or 'anthropic'
 * @returns Full endpoint URL
 */
function getFullEndpoint(baseUrl: string, apiFormat: 'openai' | 'anthropic'): string {
  const normalizedBase = baseUrl.replace(/\/$/, '') // Remove trailing slash

  if (apiFormat === 'anthropic') {
    // Anthropic: usually user provides full path, but if not, append /messages
    if (normalizedBase.includes('/messages')) {
      return normalizedBase
    }
    if (normalizedBase.includes('/v1')) {
      return normalizedBase + '/messages'
    }
    return normalizedBase + '/v1/messages'
  }

  // OpenAI format: append /chat/completions if not already present
  if (normalizedBase.includes('/chat/completions')) {
    return normalizedBase
  }
  if (normalizedBase.includes('/v1')) {
    return normalizedBase + '/chat/completions'
  }
  return normalizedBase + '/v1/chat/completions'
}

/**
 * Execute Vision API call with timeout
 * @param config - VisionApiConfig from storage
 * @param imageUrl - HTTP URL of captured image
 * @param languagePreference - 'zh' or 'en'
 * @returns Generated prompt string
 * @throws Error on API failure
 */
export async function executeVisionApiCall(
  config: VisionApiConfig,
  imageUrl: string,
  languagePreference: 'zh' | 'en'
): Promise<string> {
  // SECURITY: Validate baseUrl starts with https:// (T-11-02)
  if (!config.baseUrl.startsWith('https://')) {
    throw new Error('API Base URL must use HTTPS for security')
  }

  // SECURITY: Validate imageUrl starts with http/https (T-11-03)
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error('Image URL must be HTTP or HTTPS')
  }

  // Use user-selected API format (default to OpenAI if not specified)
  const apiFormat = config.apiFormat || 'openai'
  const languageInstruction = languagePreference === 'zh'
    ? '请用中文回复。'
    : 'Please respond in English.'

  // Get full endpoint URL
  const endpointUrl = getFullEndpoint(config.baseUrl, apiFormat)

  const requestBody = apiFormat === 'anthropic'
    ? buildAnthropicRequest(imageUrl, config.modelName, languageInstruction)
    : buildOpenAIRequest(imageUrl, config.modelName, languageInstruction)

  const headers = buildHeaders(apiFormat, config.apiKey)

  // Log request details (T-11-01: apiKey never logged)
  console.log('[Oh My Prompt] Vision API call:', {
    apiFormat,
    baseUrl: config.baseUrl,
    endpointUrl,
    modelName: config.modelName,
    imageUrl: imageUrl.substring(0, 50) + '...' // Truncate for privacy
  })

  // Log request body for debugging
  console.log('[Oh My Prompt] Vision API request body:', JSON.stringify(requestBody, null, 2))

  // Execute with AbortController timeout
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  console.log('[Oh My Prompt] Vision API fetch starting...')

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })

    console.log('[Oh My Prompt] Vision API fetch completed, status:', response.status)
    clearTimeout(timeoutId)

    if (!response.ok) {
      // Log response body for debugging
      const errorText = await response.text()
      console.log('[Oh My Prompt] Vision API error response:', errorText)
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('[Oh My Prompt] Vision API response data:', JSON.stringify(data, null, 2).substring(0, 200))
    const prompt = parseVisionResponse(apiFormat, data)

    console.log('[Oh My Prompt] Vision API success, prompt length:', prompt.length)
    return prompt

  } catch (error) {
    clearTimeout(timeoutId)
    console.error('[Oh My Prompt] Vision API fetch error:', error)

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }

    throw error
  }
}

/**
 * Classify API error to VisionApiErrorPayload (D-05, VISION-04)
 * @param error - Error from API call
 * @param retryCount - Current retry count (for T-11-05)
 * @returns VisionApiErrorPayload with type, message, action
 */
export function classifyApiError(error: unknown, retryCount = 0): VisionApiErrorPayload {
  if (error instanceof Error) {
    const errorMessage = error.message

    // Invalid API key (401, invalid_api_key)
    if (errorMessage.includes('401') || errorMessage.includes('invalid_api_key')) {
      return {
        type: 'invalid_key',
        message: 'API Key 无效，请检查配置',
        action: 'reconfigure'
      }
    }

    // Rate limit (429)
    if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
      return {
        type: 'rate_limit',
        message: 'API 调用频率超限，请稍后重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close' // T-11-05 mitigation
      }
    }

    // Timeout
    if (errorMessage.includes('timeout') || error.name === 'AbortError') {
      return {
        type: 'timeout',
        message: 'API 响应超时，请重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }

    // Network error
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
      return {
        type: 'network',
        message: '网络连接失败，请检查网络后重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }

    // Unsupported image (400 with image-related error)
    if (errorMessage.includes('400') || errorMessage.includes('image')) {
      return {
        type: 'unsupported_image',
        message: '图片格式不支持或图片过大',
        action: 'close'
      }
    }

    // Endpoint not found (404)
    if (errorMessage.includes('404')) {
      return {
        type: 'network',
        message: 'API 端点不存在，请检查 Base URL 配置',
        action: 'reconfigure'
      }
    }

    // Forbidden (403)
    if (errorMessage.includes('403')) {
      return {
        type: 'invalid_key',
        message: 'API 访问被拒绝，请检查 API Key 权限',
        action: 'reconfigure'
      }
    }

    // Server errors (500/502/503)
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return {
        type: 'network',
        message: 'API 服务暂时不可用，请稍后重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }
  }

  // Generic error fallback with detailed logging
  const errorDetails = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack?.substring(0, 200) }
    : { value: String(error), type: typeof error }

  console.error('[Oh My Prompt] Unhandled API error:', errorDetails)

  // Include error message in the user message for debugging (visible in page console)
  return {
    type: 'network',
    message: `发生未知错误，请重试 (${error instanceof Error ? error.message : 'unknown'})`,
    action: 'retry'
  }
}

/**
 * Get language preference from storage
 * @returns 'zh' or 'en' (default 'zh')
 */
export async function getLanguagePreference(): Promise<'zh' | 'en'> {
  try {
    const result = await chrome.storage.local.get('prompt_script_data')
    const settings = result?.prompt_script_data?.settings
    return settings?.resourceLanguage || 'zh'
  } catch {
    return 'zh' // Default fallback
  }
}