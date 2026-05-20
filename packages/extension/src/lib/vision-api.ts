/**
 * Vision API integration module
 * Handles request formatting and error classification
 * API format is user-selected (OpenAI or Anthropic compatible)
 */

import type { VisionApiConfig, VisionApiErrorPayload, VisionApiResultData, ProviderConfig } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { extractBase64Data } from './image-utils'
import { WEB_APP_URL } from '@/lib/config'
import { getSupabaseClient } from '@/lib/cloud-sync/supabase-client'
import visionConfig from '@/data/vision-config.json'

/**
 * Get active provider config from storage
 * SECURITY: Returns full apiKey for internal Vision API use only
 */
async function getActiveProviderConfig(): Promise<ProviderConfig | null> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.GET_ACTIVE_CONFIG })
  return response?.success ? response.data : null
}

/**
 * Map ProviderConfig apiFormat to Vision API format
 */
function mapApiFormat(format: ProviderConfig['apiFormat']): 'anthropic' | 'openai' {
  return format === 'anthropic_messages' ? 'anthropic' : 'openai'
}

// Anthropic API version header (T-11-04 mitigation)
const ANTHROPIC_VERSION = '2023-06-01'

// API call timeout in milliseconds (5 minutes for slow Vision APIs)
const API_TIMEOUT_MS = 300000

// Max retry count per D-05 (Claude's discretion: 3 retries)
const MAX_RETRY_COUNT = 3

// Vision system prompt loaded from config file
const VISION_SYSTEM_PROMPT = visionConfig.systemPrompt

/**
 * Build Anthropic Claude Vision API request
 * @param image - Image URL or base64 data
 * @param modelName - Model identifier
 * @param format - 'url' or 'base64' (default 'base64')
 * @returns Request body object
 */
export function buildAnthropicRequest(
  image: string,
  modelName: string,
  format: 'url' | 'base64' = 'base64'
): object {
  // Build image source based on format
  const imageSource = format === 'base64'
    ? {
        type: 'base64',
        media_type: 'image/jpeg', // We compress to JPEG
        data: image // Pure base64 string (without data URL prefix)
      }
    : {
        type: 'url',
        url: image
      }

  return {
    model: modelName,
    max_tokens: 4096, // Increased for structured JSON output
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: imageSource
        },
        {
          type: 'text',
          text: VISION_SYSTEM_PROMPT
        }
      ]
    }]
  }
}

/**
 * Build OpenAI GPT-4V compatible API request
 * @param image - Image URL or base64 data URL
 * @param modelName - Model identifier
 * @param format - 'url' or 'base64' (default 'base64')
 * @returns Request body object
 */
export function buildOpenAIRequest(
  image: string,
  modelName: string,
  format: 'url' | 'base64' = 'base64'
): object {
  // For OpenAI format, image_url.url can be either:
  // - HTTP URL: "https://example.com/image.jpg"
  // - Data URL: "data:image/jpeg;base64,xxxxx"
  const imageUrl = format === 'base64'
    ? image // Already a data URL from compression
    : image // HTTP URL

  return {
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: VISION_SYSTEM_PROMPT
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        }
      ]
    }],
    max_tokens: 4096 // Increased for structured JSON output
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
 * Extract text content from Vision API response
 * @param apiFormat - 'anthropic' or 'openai'
 * @param response - API response JSON
 * @returns Raw text content from response
 */
function extractTextContent(apiFormat: 'anthropic' | 'openai', response: unknown): string {
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
 * Validate Vision API result has required fields
 * @param data - Parsed VisionApiResultData
 * @throws Error if validation fails
 */
function validateVisionResult(data: VisionApiResultData): void {
  // Check required top-level fields
  if (!data.zh || !data.en) {
    throw new Error('Missing zh or en fields in Vision API response')
  }

  if (!data.zh.prompt || !data.en.prompt) {
    throw new Error('Missing prompt fields in Vision API response')
  }

  // Check title fields (optional but recommended)
  if (!data.zh.title) {
    console.warn('[Oh My Prompt] Missing zh.title, using fallback')
  }
  if (!data.en.title) {
    console.warn('[Oh My Prompt] Missing en.title, using fallback')
  }

  // Check json_prompt has baseline keys (backward compatible)
  const requiredKeys = ['subject', 'action_pose', 'details_appearance', 'environment_background', 'lighting_atmosphere', 'style_camera', 'colors', 'materials', 'aspect_ratio']
  for (const key of requiredKeys) {
    if (!(key in data.json_prompt)) {
      throw new Error(`Missing required json_prompt key: ${key}`)
    }
  }

  // Validate zh_json has Chinese baseline keys (if present)
  const zhJsonRequiredKeys = ['主体', '动作姿态', '细节外观', '环境背景', '光影氛围', '风格镜头', '色彩', '材质', '宽高比']
  if (data.zh_json) {
    for (const key of zhJsonRequiredKeys) {
      if (!(key in data.zh_json)) {
        throw new Error(`Missing required zh_json key: ${key}`)
      }
    }
  }

  // Validate en_json has English baseline keys (if present)
  if (data.en_json) {
    for (const key of requiredKeys) {
      if (!(key in data.en_json)) {
        throw new Error(`Missing required en_json key: ${key}`)
      }
    }
  }

  // Validate confidence is a number between 0 and 1
  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
    throw new Error('Invalid confidence value in Vision API response')
  }
}

/**
 * Robustly extract JSON from text that may contain markdown fences or mixed content
 * Handles: uppercase fences, spaces in fences, explanatory text, truncated JSON
 * @param text - Raw text from Vision API
 * @returns Extracted JSON string
 * @throws Error if no valid JSON found
 */
function extractJsonFromText(text: string): string {
  let jsonText = text.trim()

  // Strategy 1: Strip markdown fences (case-insensitive, with optional spaces)
  // Pattern: ```[optional spaces][json|JSON|js][optional spaces]
  const fenceStartMatch = jsonText.match(/^```\s*(json|JSON|js)?\s*\n?/i)
  if (fenceStartMatch) {
    jsonText = jsonText.slice(fenceStartMatch[0].length)
  }

  // Strip trailing fence
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3).trim()
  }

  // Strategy 2: If still not valid JSON, try to extract JSON object from mixed text
  // Look for the outermost {...} pattern
  if (!jsonText.startsWith('{')) {
    // Find first opening brace
    const firstBrace = jsonText.indexOf('{')
    if (firstBrace !== -1) {
      // Find matching closing brace (count depth)
      let depth = 0
      let lastBrace = -1
      for (let i = firstBrace; i < jsonText.length; i++) {
        if (jsonText[i] === '{') depth++
        else if (jsonText[i] === '}') {
          depth--
          if (depth === 0) {
            lastBrace = i
            break
          }
        }
      }

      if (lastBrace !== -1) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1)
      }
    }
  }

  // Strategy 3: Handle truncated JSON (missing closing braces)
  // Try to repair by counting and adding missing braces
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      else if (char === '}') depth--
    }
  }

  // If depth > 0, JSON is truncated - add missing closing braces
  if (depth > 0) {
    console.warn('[Oh My Prompt] Vision API response appears truncated, attempting repair')
    jsonText += '}'.repeat(depth)
  }

  return jsonText.trim()
}

/**
 * Parse Vision API response and extract structured data
 * @param apiFormat - 'anthropic' or 'openai'
 * @param response - API response JSON
 * @returns VisionApiResultData with bilingual prompts and JSON details
 * @throws Error only if response is completely empty or has no text content
 */
export function parseVisionResponse(apiFormat: 'anthropic' | 'openai', response: unknown): VisionApiResultData {
  // Extract raw text content
  const text = extractTextContent(apiFormat, response)

  if (!text) {
    throw new Error('Empty response from Vision API')
  }

  // Robustly extract JSON from potentially messy text
  const jsonText = extractJsonFromText(text)

  // Try to parse JSON
  let data: VisionApiResultData
  try {
    data = JSON.parse(jsonText) as VisionApiResultData
  } catch (parseError) {
    // JSON parse failed - return raw text as fallback instead of throwing error
    console.warn('[Oh My Prompt] Vision API JSON parse failed, showing raw response')
    console.warn('[Oh My Prompt] Raw text (first 500 chars):', text.substring(0, 500))
    console.warn('[Oh My Prompt] Extracted JSON (first 500 chars):', jsonText.substring(0, 500))

    // Return minimal valid structure with raw JSON text
    return {
      zh: {
        title: 'JSON 格式异常',
        prompt: jsonText,
        analysis: 'API 返回的 JSON 格式无法解析，已显示原始内容'
      },
      en: {
        title: 'Invalid JSON Format',
        prompt: jsonText,
        analysis: 'API response JSON could not be parsed, showing raw content'
      },
      zh_style_tags: [],
      en_style_tags: [],
      json_prompt: {
        subject: '',
        action_pose: '',
        details_appearance: '',
        environment_background: '',
        lighting_atmosphere: '',
        style_camera: '',
        colors: [],
        materials: [],
        aspect_ratio: ''
      },
      confidence: 0,
      _rawJsonText: jsonText
    }
  }

  // Validate required fields - on failure, return raw JSON instead of throwing
  try {
    validateVisionResult(data)
  } catch (validationError) {
    console.warn('[Oh My Prompt] Vision API validation failed:', validationError)

    // Return minimal valid structure with raw JSON text
    return {
      zh: {
        title: data.zh?.title || 'JSON 字段缺失',
        prompt: data.zh?.prompt || jsonText,
        analysis: 'API 返回缺少必需字段，已显示原始内容'
      },
      en: {
        title: data.en?.title || 'Missing JSON Fields',
        prompt: data.en?.prompt || jsonText,
        analysis: 'API response missing required fields, showing raw content'
      },
      zh_style_tags: data.zh_style_tags || [],
      en_style_tags: data.en_style_tags || [],
      json_prompt: {
        subject: '',
        action_pose: '',
        details_appearance: '',
        environment_background: '',
        lighting_atmosphere: '',
        style_camera: '',
        colors: [],
        materials: [],
        aspect_ratio: ''
      },
      confidence: data.confidence || 0,
      _rawJsonText: jsonText
    }
  }

  return data
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
 * @param imageData - Base64 data URL (preferred) or HTTP URL
 * @param format - 'url' or 'base64' (default 'base64')
 * @param signal - Optional external AbortSignal for user-initiated cancellation
 * @returns VisionApiResultData with bilingual prompts and JSON details
 * @throws Error on API failure
 */
export async function executeVisionApiCall(
  config: VisionApiConfig,
  imageData: string,
  format: 'url' | 'base64' = 'base64',
  signal?: AbortSignal
): Promise<VisionApiResultData> {
  // SECURITY: Validate baseUrl starts with https:// (T-11-02)
  if (!config.baseUrl.startsWith('https://')) {
    throw new Error('API Base URL must use HTTPS for security')
  }

  // Validate image data based on format
  if (format === 'url') {
    // URL format: must be HTTP URL
    if (!imageData.startsWith('http://') && !imageData.startsWith('https://')) {
      throw new Error('Image URL must be HTTP or HTTPS')
    }
  } else {
    // Base64 format: must be data URL
    if (!imageData.startsWith('data:image/')) {
      throw new Error('Image must be a valid data URL for base64 format')
    }
  }

  // Use user-selected API format (default to OpenAI if not specified)
  const apiFormat = config.apiFormat || 'openai'

  // Get full endpoint URL
  const endpointUrl = getFullEndpoint(config.baseUrl, apiFormat)

  // Prepare image data for API
  // For Anthropic: need pure base64 (without data URL prefix)
  // For OpenAI: can use full data URL
  const imageForApi = apiFormat === 'anthropic' && format === 'base64'
    ? extractBase64Data(imageData) // Remove "data:image/jpeg;base64," prefix
    : imageData

  const requestBody = apiFormat === 'anthropic'
    ? buildAnthropicRequest(imageForApi, config.modelName, format)
    : buildOpenAIRequest(imageForApi, config.modelName, format)

  const headers = buildHeaders(apiFormat, config.apiKey)

  // Execute with AbortController timeout - merge with external signal if provided
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  // If external signal provided, abort when it triggers
  if (signal) {
    if (signal.aborted) {
      // Already aborted before we started - abort internal controller and throw AbortError
      clearTimeout(timeoutId)
      abortController.abort() // Abort internal controller so downstream check works
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
      // Try to extract error details from response body
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
    const resultData = parseVisionResponse(apiFormat, data)

    return resultData

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
 * Execute Vision API call using active ProviderConfig
 * New multi-provider architecture
 * @param imageData - Image data (base64 or URL)
 * @param format - 'url' or 'base64'
 * @param signal - Optional AbortSignal for cancellation
 * @param providedConfig - Optional config passed directly (avoids nested messaging in service worker)
 */
export async function executeVisionApiCallWithProviderConfig(
  imageData: string,
  format: 'url' | 'base64' = 'base64',
  signal?: AbortSignal,
  providedConfig?: ProviderConfig | null
): Promise<VisionApiResultData> {
  // Use provided config if available (service worker passes it directly)
  // Otherwise fetch from storage (content script context)
  const config = providedConfig ?? await getActiveProviderConfig()
  if (!config) {
    throw new Error('NO_CONFIG: 请先配置 Vision API')
  }

  // Official API: use session token authentication
  if (config.apiFormat === 'omp_official') {
    return executeOfficialVisionApiCall(imageData, signal)
  }

  // Third-party API: use API key authentication
  // SECURITY: Validate endpoint starts with https://
  if (!config.apiEndpoint.startsWith('https://')) {
    throw new Error('API 地址必须使用 HTTPS')
  }

  // Validate image data
  if (format === 'url') {
    if (!imageData.startsWith('http://') && !imageData.startsWith('https://')) {
      throw new Error('Image URL must be HTTP or HTTPS')
    }
  } else {
    if (!imageData.startsWith('data:image/')) {
      throw new Error('Image must be a valid data URL for base64 format')
    }
  }

  const apiFormat = mapApiFormat(config.apiFormat)
  const endpointUrl = getFullEndpoint(config.apiEndpoint, apiFormat)

  // Prepare image data
  const imageForApi = apiFormat === 'anthropic' && format === 'base64'
    ? extractBase64Data(imageData)
    : imageData

  const requestBody = apiFormat === 'anthropic'
    ? buildAnthropicRequest(imageForApi, config.selectedModel, format)
    : buildOpenAIRequest(imageForApi, config.selectedModel, format)

  const headers = buildHeaders(apiFormat, config.apiKey)

  // Execute with timeout
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
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`
      try {
        const errorBody = await response.json()
        if (errorBody?.error?.message) {
          errorDetail = errorBody.error.message
        }
        if (errorBody?.message) {
          errorDetail = errorBody.message
        }
        if (errorBody?.error?.code) {
          errorDetail = `${errorBody.error.code}: ${errorDetail}`
        }
      } catch {
        // Failed to parse error body
      }
      throw new Error(errorDetail)
    }

    const data = await response.json()
    return parseVisionResponse(apiFormat, data)
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }
    throw error
  }
}

/**
 * Execute Vision API call using official Oh My Prompt service.
 * Uses Supabase session token for authentication.
 */
async function executeOfficialVisionApiCall(
  imageData: string,
  signal?: AbortSignal
): Promise<VisionApiResultData> {
  // 1. Get Supabase client (may be null if cleared after logout)
  const supabase = getSupabaseClient()

  if (!supabase) {
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }

  // 2. Get Supabase session token
  let sessionResult: { data: { session: { access_token: string } | null }; error: unknown }
  try {
    sessionResult = await supabase.auth.getSession()
  } catch (sessionError) {
    // Session fetch failed (network, storage, or client not initialized)
    console.error('[Oh My Prompt] Failed to get Supabase session:', sessionError)
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }

  // Check for session errors or missing session
  if (sessionResult.error || !sessionResult.data.session || !sessionResult.data.session.access_token) {
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }

  const session = sessionResult.data.session

  // 3. Validate image data
  if (!imageData.startsWith('data:image/')) {
    throw new Error('Image must be a valid data URL')
  }

  // 4. Call official API
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
      body: JSON.stringify({ image: imageData }),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    // Check HTTP status first before parsing JSON
    if (!response.ok) {
      // Try to parse error from response body
      let errorMessage = `HTTP ${response.status}`
      try {
        const errorData = await response.json()
        // API returns: { success: false, error: 'ERROR_CODE', message?: '...' }
        if (errorData && errorData.error) {
          // Map error codes to user-friendly messages
          const errorMessages: Record<string, string> = {
            'NOT_LOGGED_IN': '请先登录',
            'NOT_MEMBER': '此功能需要会员订阅',
            'SUBSCRIPTION_INACTIVE': '订阅已过期',
            'QUOTA_EXCEEDED': '本月额度已用完',
            'INVALID_REQUEST': '请求格式无效',
            'INVALID_IMAGE': '图片格式无效',
            'VISION_API_ERROR': errorData.message || 'Vision API 错误'
          }
          errorMessage = errorMessages[errorData.error] || errorData.error
        }
      } catch {
        // Failed to parse error body (HTML error page, etc.)
        // Use HTTP status code as error message
      }
      throw new Error(errorMessage)
    }

    // Parse JSON response (only after response.ok is confirmed)
    let result: { success?: boolean; data?: VisionApiResultData; error?: string; message?: string }
    try {
      result = await response.json()
    } catch (parseError) {
      // JSON parse failed - response body is not valid JSON (e.g., HTML, empty, truncated)
      console.error('[Oh My Prompt] Vision API JSON parse error:', parseError)
      throw new Error('API 返回格式异常（非JSON格式）')
    }

    // Validate result structure
    if (!result) {
      throw new Error('API 返回空响应')
    }

    // Check success flag and data presence
    if (!result.success || !result.data) {
      // API explicitly returned error in JSON format
      const errorMessage = result.error || result.message || 'Vision API 返回无效响应'
      throw new Error(errorMessage)
    }

    return result.data as VisionApiResultData
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }
    throw error
  }
}

/**
 * Classify API error to VisionApiErrorPayload
 * Simplified: directly pass through API error message for user visibility
 * @param error - Error from API call
 * @param retryCount - Current retry count (for retry logic)
 * @returns VisionApiErrorPayload with type, message, action
 */
export function classifyApiError(error: unknown, retryCount = 0): VisionApiErrorPayload {
  if (error instanceof Error) {
    const errorMessage = error.message

    // Timeout - needs retry
    if (errorMessage.includes('timeout') || error.name === 'AbortError') {
      return {
        type: 'timeout',
        message: 'API 响应超时，请重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }

    // Network error (before reaching API)
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      return {
        type: 'network',
        message: '网络连接失败，请检查网络或 API 地址',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }

    // Rate limit - needs retry
    if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
      return {
        type: 'rate_limit',
        message: 'API 调用频率超限，请稍后重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }

    // Server errors (500/502/503) - needs retry
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return {
        type: 'network',
        message: 'API 服务暂时不可用，请稍后重试',
        action: retryCount < MAX_RETRY_COUNT ? 'retry' : 'close'
      }
    }

    // Vision not supported - provider doesn't accept image_url
    if (errorMessage.includes('image_url') ||
        errorMessage.includes('unknown variant') ||
        errorMessage.includes('expected `text`')) {
      return {
        type: 'unsupported_vision',
        message: '该模型不支持图片输入（Vision 功能）。请选择支持 Vision 的模型，如 Claude、GPT-4o、Gemini 等。',
        action: 'settings'
      }
    }

    // All other errors: directly show the API error message
    // This includes model_not_found, invalid_api_key, 401, 403, 404, 400, etc.
    // Determine action based on error type
    const needsSettings = errorMessage.includes('invalid') ||
                          errorMessage.includes('key') ||
                          errorMessage.includes('not found') ||
                          errorMessage.includes('does not exist') ||
                          errorMessage.includes('no access') ||
                          errorMessage.includes('400') ||
                          errorMessage.includes('401') ||
                          errorMessage.includes('403') ||
                          errorMessage.includes('404')

    return {
      type: 'invalid_key',
      message: errorMessage, // Directly show API error message
      action: needsSettings ? 'settings' : 'close'
    }
  }

  // Non-Error fallback
  console.error('[Oh My Prompt] Unknown error type:', error)
  return {
    type: 'network',
    message: `发生未知错误 (${String(error)})`,
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