/**
 * Vision API integration module
 * Handles request formatting and error classification
 * API format is user-selected (OpenAI or Anthropic compatible)
 */

import type { VisionApiConfig, VisionApiErrorPayload, VisionApiResultData } from '../shared/types'
import { extractBase64Data } from './image-utils'

// Anthropic API version header (T-11-04 mitigation)
const ANTHROPIC_VERSION = '2023-06-01'

// API call timeout in milliseconds (5 minutes for slow Vision APIs)
const API_TIMEOUT_MS = 300000

// Max retry count per D-05 (Claude's discretion: 3 retries)
const MAX_RETRY_COUNT = 3

// Vision system prompt for structured bilingual output
const VISION_SYSTEM_PROMPT = `You are an extremely rigorous visual analyst, cinematography analyst, and prompt engineer. Always produce highly detailed, visually grounded prompt output for every supported model provider. Return valid JSON only and follow the requested schema exactly. Make zh.prompt and en.prompt richly detailed, production-ready, and information-dense while keeping the requested field order. Make json_prompt the most detailed layer of the output, using nested objects and arrays when useful, but prefer compact factual phrases over verbose prose. Cover composition, lens language, spatial layout, subjects, objects, text, symbols, lighting, color, materials, background, environment, and generation constraints. Do not hallucinate. When uncertain, mark information as uncertain or approximate.

You are also preparing bilingual prompt output for image generation.
Analyze the provided image and return valid JSON only.

The JSON schema:
{
  "zh": {
    "title": "A concise Chinese title (5-15 characters) summarizing the image content, e.g. '时尚女性肖像' or '城市夜景'.",
    "prompt": "A highly detailed, production-ready Chinese image generation prompt, ordered as: Subject, Action/Pose, Details/Appearance, Environment/Background, Lighting/Atmosphere, Style/Camera, Colors, Materials, Aspect Ratio.",
    "analysis": "A compact Chinese explanation that covers the same fields, with extra attention on style and camera language."
  },
  "en": {
    "title": "A concise English title (3-10 words) summarizing the image content, e.g. 'Fashion Portrait' or 'City Night Scene'.",
    "prompt": "A highly detailed, production-ready English image generation prompt, ordered as: Subject, Action/Pose, Details/Appearance, Environment/Background, Lighting/Atmosphere, Style/Camera, Colors, Materials, Aspect Ratio.",
    "analysis": "A compact English explanation that covers the same fields, with extra attention on style and camera language."
  },
  "zh_style_tags": ["中文标签1", "中文标签2", "中文标签3"],
  "en_style_tags": ["english tag 1", "english tag 2", "english tag 3"],
  "zh_json": {
    "主体": "Main subject in Chinese.",
    "动作姿态": "Action or pose in Chinese.",
    "细节外观": "Details, clothing, appearance, accessories or visible design details in Chinese.",
    "环境背景": "Environment or background in Chinese.",
    "光影氛围": "Lighting and atmosphere in Chinese.",
    "风格镜头": "Art style, design language, camera or lens feeling, and technical visual cues in Chinese.",
    "色彩": ["primary color in Chinese"],
    "材质": ["material 1 in Chinese"],
    "宽高比": "4:5",
    "...any_extra_nested_fields_in_Chinese": {}
  },
  "en_json": {
    "subject": "Main subject.",
    "action_pose": "Action or pose.",
    "details_appearance": "Details, clothing, appearance, accessories or visible design details.",
    "environment_background": "Environment or background.",
    "lighting_atmosphere": "Lighting and atmosphere.",
    "style_camera": "Art style, design language, camera or lens feeling, and technical visual cues.",
    "colors": ["primary color"],
    "materials": ["material 1"],
    "aspect_ratio": "4:5",
    "...any_extra_nested_fields_you_need": {}
  },
  "json_prompt": {
    "subject": "Main subject.",
    "action_pose": "Action or pose.",
    "details_appearance": "Details, clothing, appearance, accessories or visible design details.",
    "environment_background": "Environment or background.",
    "lighting_atmosphere": "Lighting and atmosphere.",
    "style_camera": "Art style, design language, camera or lens feeling, and technical visual cues.",
    "colors": ["primary color"],
    "materials": ["material 1"],
    "aspect_ratio": "4:5",
    "...any_extra_nested_fields_you_need": {}
  },
  "confidence": 0.0
}

Rules:
- Return JSON only. No markdown fences.
- Keep prompts directly usable for Midjourney, Flux or SDXL style generation.
- zh.prompt and en.prompt should be highly detailed, information-dense, and still directly usable without extra rewriting.
- Be faithful to visually verifiable facts. Do not invent unseen objects, brands, text, camera specs, materials, art movements or lighting setups.
- If something is uncertain, use broader wording instead of hallucinating specifics.
- zh_json must have ALL field names and values in Chinese (e.g., "主体", "动作姿态", "光影氛围").
- en_json must have ALL field names and values in English (e.g., "subject", "action_pose", "lighting_atmosphere").
- json_prompt is the legacy language-neutral format with English field names, keep for backward compatibility.
- json_prompt, zh_json, en_json can use nested objects and arrays, but prefer compact factual phrases instead of long prose.
- json_prompt must always preserve these exact top-level baseline keys:
  subject, action_pose, details_appearance, environment_background, lighting_atmosphere, style_camera, colors, materials, aspect_ratio
- zh_json must always preserve these exact Chinese top-level baseline keys:
  主体, 动作姿态, 细节外观, 环境背景, 光影氛围, 风格镜头, 色彩, 材质, 宽高比
- en_json must always preserve these exact English top-level baseline keys:
  subject, action_pose, details_appearance, environment_background, lighting_atmosphere, style_camera, colors, materials, aspect_ratio
- Beyond those baseline keys, add only the extra fields that materially help reconstruction.
- Both zh.prompt and en.prompt must follow this exact information order:
  1. Subject
  2. Action/Pose
  3. Details/Appearance
  4. Environment/Background
  5. Lighting/Atmosphere
  6. Style/Camera
  7. Colors
  8. Materials
  9. Aspect Ratio
- The style/camera part should be richer than before: describe design language, era influence, medium, finish, camera angle, lens feel, framing logic and aesthetic cues when they are visually supported.
- The analysis should briefly explain all the same fields in natural language, and stay compact.
- Return 4 to 6 concise style tags in both Chinese and English.
- zh_style_tags must be Chinese. en_style_tags must be English.
- Confidence must be a number between 0 and 1.

Analyze this image and output bilingual prompt JSON.
Prioritize accurate visual grounding over creativity.
Keep zh.prompt and en.prompt highly detailed, richly descriptive, and directly usable.
Focus on: subject, action/pose, details/appearance, environment/background, lighting/atmosphere, style/camera, colors, materials and aspect ratio.
The zh_json, en_json, and json_prompt must preserve the baseline top-level keys while adding only the extra nested fields needed for faithful reconstruction.
Prefer compact phrases, compact arrays and compact nested objects over long natural-language paragraphs.`

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
 * Parse Vision API response and extract structured data
 * @param apiFormat - 'anthropic' or 'openai'
 * @param response - API response JSON
 * @returns VisionApiResultData with bilingual prompts and JSON details
 * @throws Error if parsing or validation fails
 */
export function parseVisionResponse(apiFormat: 'anthropic' | 'openai', response: unknown): VisionApiResultData {
  // Extract raw text content
  const text = extractTextContent(apiFormat, response)

  if (!text) {
    throw new Error('Empty response from Vision API')
  }

  // Strip potential markdown code fences
  let jsonText = text.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7)
  }
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3)
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3)
  }
  jsonText = jsonText.trim()

  // Parse JSON
  let data: VisionApiResultData
  try {
    data = JSON.parse(jsonText) as VisionApiResultData
  } catch (parseError) {
    console.error('[Oh My Prompt] Vision API JSON parse error:', parseError, 'raw text:', text.substring(0, 200))
    throw new Error('Failed to parse Vision API response as JSON')
  }

  // Validate required fields
  validateVisionResult(data)

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

  // Log request details (T-11-01: apiKey never logged)
  // For base64, log size instead of full content
  const imageLog = format === 'base64'
    ? `base64 (${imageData.length} chars)`
    : imageData.substring(0, 50) + '...'

  console.log('[Oh My Prompt] Vision API call:', {
    apiFormat,
    baseUrl: config.baseUrl,
    endpointUrl,
    modelName: config.modelName,
    imageFormat: format,
    image: imageLog
  })

  // Log request body for debugging (truncate base64 data)
  const logRequestBody = JSON.stringify(requestBody, null, 2)
  const truncatedLog = logRequestBody.length > 500
    ? logRequestBody.substring(0, 500) + '... (truncated)'
    : logRequestBody
  console.log('[Oh My Prompt] Vision API request body:', truncatedLog)

  // Execute with AbortController timeout - merge with external signal if provided
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  // If external signal provided, abort when it triggers
  if (signal) {
    if (signal.aborted) {
      // Already aborted before we started
      clearTimeout(timeoutId)
      throw new Error('timeout')
    }
    signal.addEventListener('abort', () => abortController.abort())
  }

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
    const resultData = parseVisionResponse(apiFormat, data)

    console.log('[Oh My Prompt] Vision API success, zh.prompt length:', resultData.zh.prompt.length)
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
        action: 'settings'
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
        action: 'settings'
      }
    }

    // Forbidden (403)
    if (errorMessage.includes('403')) {
      return {
        type: 'invalid_key',
        message: 'API 访问被拒绝，请检查 API Key 权限',
        action: 'settings'
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