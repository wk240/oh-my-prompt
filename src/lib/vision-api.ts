/**
 * Vision API integration module
 * Handles provider detection, request formatting, and error classification
 */

import type { VisionApiConfig, VisionApiErrorPayload } from '../shared/types'

// Anthropic API version header (T-11-04 mitigation)
const ANTHROPIC_VERSION = '2023-06-01'

// API call timeout in milliseconds (Claude's discretion: 30 seconds)
const API_TIMEOUT_MS = 30000

// Max retry count per D-05 (Claude's discretion: 3 retries)
const MAX_RETRY_COUNT = 3

/**
 * Detect Vision API provider from baseUrl pattern (D-01)
 * @param baseUrl - API endpoint base URL
 * @returns 'anthropic' or 'openai'
 */
export function detectProvider(baseUrl: string): 'anthropic' | 'openai' {
  const normalizedUrl = baseUrl.toLowerCase()

  if (normalizedUrl.includes('anthropic.com')) {
    return 'anthropic'
  }

  if (normalizedUrl.includes('openai.com')) {
    return 'openai'
  }

  // Default fallback per D-01 (Anthropic format most common for Vision APIs)
  console.log('[Oh My Prompt] Unknown provider domain, defaulting to Anthropic format')
  return 'anthropic'
}

/**
 * Build Anthropic Claude Vision API request (RESEARCH Pattern 2)
 * @param imageUrl - HTTP URL of image to analyze
 * @param modelName - Model identifier (e.g., 'claude-3-5-sonnet-20241022')
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
 * Build OpenAI GPT-4V API request (RESEARCH Pattern 3)
 * @param imageUrl - HTTP URL of image to analyze
 * @param modelName - Model identifier (e.g., 'gpt-4-vision-preview')
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
 * Build fetch headers for provider (T-11-01: apiKey never logged)
 * @param provider - 'anthropic' or 'openai'
 * @param apiKey - API key (not logged)
 * @returns Headers object
 */
export function buildHeaders(provider: 'anthropic' | 'openai', apiKey: string): HeadersInit {
  if (provider === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION // T-11-04 mitigation
    }
  }

  // OpenAI format
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }
}

/**
 * Parse Vision API response and extract prompt text
 * @param provider - 'anthropic' or 'openai'
 * @param response - API response JSON
 * @returns Generated prompt string
 */
export function parseVisionResponse(provider: 'anthropic' | 'openai', response: unknown): string {
  if (provider === 'anthropic') {
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

  const provider = detectProvider(config.baseUrl)
  const languageInstruction = languagePreference === 'zh'
    ? '请用中文回复。'
    : 'Please respond in English.'

  const requestBody = provider === 'anthropic'
    ? buildAnthropicRequest(imageUrl, config.modelName, languageInstruction)
    : buildOpenAIRequest(imageUrl, config.modelName, languageInstruction)

  const headers = buildHeaders(provider, config.apiKey)

  // Log request details (T-11-01: apiKey never logged)
  console.log('[Oh My Prompt] Vision API call:', {
    provider,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    imageUrl: imageUrl.substring(0, 50) + '...' // Truncate for privacy
  })

  // Execute with AbortController timeout
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      // Throw error with status code for classification
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const prompt = parseVisionResponse(provider, data)

    console.log('[Oh My Prompt] Vision API success, prompt length:', prompt.length)
    return prompt

  } catch (error) {
    clearTimeout(timeoutId)

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
  }

  // Generic error fallback
  return {
    type: 'network',
    message: '发生未知错误，请重试',
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