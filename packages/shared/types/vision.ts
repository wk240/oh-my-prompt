// Phase 10: Vision API configuration
export interface VisionApiConfig {
  baseUrl: string // API endpoint base URL
  apiKey: string // User-provided API key
  modelName: string // Model identifier (e.g., 'claude-3-5-sonnet-20241022')
  apiFormat: 'openai' | 'anthropic' // Request format type (user-selected)
  configuredAt?: number // Timestamp of configuration (optional)
}

// Provider API configuration (multi-provider support)
export interface ProviderConfig {
  id: string                    // UUID (crypto.randomUUID())
  providerId: string            // Provider ID from providers.json, or 'custom'
  providerName: string          // Display name (e.g., 'Anthropic Claude')
  apiKey: string                // API key — NEVER log this
  apiEndpoint: string           // Full API URL
  apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses' | 'omp_official'
  selectedModel: string         // User-selected model
  configuredAt: number          // Timestamp
  isCustom?: boolean            // true for custom configs
  requiresAuth?: boolean        // 是否需要会员登录（官方 Provider）
}

// Provider data from providers.json
export interface Provider {
  id: string                              // Generated from name (slug)
  name: string                            // Display name (English/international)
  nameCn?: string                         // Chinese name for cn_official providers
  type: 'official' | 'cn_official' | 'omp_official'
  apiEndpoint: string                     // Default API URL
  apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses' | 'omp_official'
  models: ModelInfo[]                     // Available models with vision info
  icon: string                            // Icon identifier
  iconColor: string                       // Icon color
  websiteUrl?: string                     // Official website
  apiKeyUrl?: string                      // API key management page
  isPartner?: boolean                     // Partner flag
  requiresAuth?: boolean                  // 是否需要会员登录（官方 Provider）
}

// Model information with vision capability
export interface ModelInfo {
  id: string                              // Model identifier (API name)
  visionCapable: boolean                  // Supports vision/multimodal input
}

// Provider group for UI display
export interface ProviderGroup {
  label: string              // '官方 API' / '国内提供商' / '聚合器' / '第三方'
  labelEn: string            // 'Official' / 'China Providers' / 'Aggregators' / 'Third-party'
  type: Provider['type']
  providers: Provider[]
  order: number
}

// Storage structure for provider configs
export interface ProviderConfigsStorage {
  configs: ProviderConfig[]
  activeConfigId: string | null
}

// Phase 11: Vision API call payload
export interface VisionApiCallPayload {
  imageUrl: string // HTTP URL of captured image (for reference)
  imageBase64?: string // Compressed base64 image data (actual payload for API)
  imageFormat?: 'url' | 'base64' // Format indicator (default: base64)
}

// Phase 11: Vision API result payload (updated to include full structured data)
export interface VisionApiResultPayload {
  prompt: string // Primary prompt text (for backward compatibility)
  fullData?: VisionApiResultData // Full structured result data
}

// JSON prompt schema - structured fields for image generation (English)
export interface JsonPromptSchema {
  subject: string
  action_pose: string
  details_appearance: string
  environment_background: string
  lighting_atmosphere: string
  style_camera: string
  colors: string[]
  materials: string[]
  aspect_ratio: string
  // Additional nested fields as needed (composition, layout, text, constraints, etc.)
  [key: string]: unknown
}

// JSON prompt schema - structured fields for image generation (Chinese)
export interface ZhJsonPromptSchema {
  主体: string
  动作姿态: string
  细节外观: string
  环境背景: string
  光影氛围: string
  风格镜头: string
  色彩: string[]
  材质: string[]
  宽高比: string
  // Additional nested fields in Chinese
  [key: string]: unknown
}

// Vision API structured result (bilingual output with JSON details)
export interface VisionApiResultData {
  zh: {
    title: string // Chinese title for the generated prompt
    prompt: string
    analysis: string
  }
  en: {
    title: string // English title for the generated prompt
    prompt: string
    analysis: string
  }
  zh_style_tags: string[]
  en_style_tags: string[]
  zh_json?: ZhJsonPromptSchema  // Chinese JSON with Chinese field names and values (optional for backward compatibility)
  en_json?: JsonPromptSchema  // English JSON with English field names and values (optional for backward compatibility)
  json_prompt: JsonPromptSchema  // Legacy: language-neutral JSON (backward compatible)
  confidence: number
  // Fallback: raw JSON text when structured parsing fails
  _rawJsonText?: string
}

// Phase 11: Vision API error classification
export type VisionApiErrorType = 'invalid_key' | 'network' | 'rate_limit' | 'unsupported_image' | 'unsupported_vision' | 'timeout'

// Phase 11: Vision API error payload
export interface VisionApiErrorPayload {
  type: VisionApiErrorType
  message: string // User-friendly error message
  action: 'settings' | 'retry' | 'close' // UI action button type - 'settings' opens settings.html
}

// Phase 12: Prompt insertion payload (forwarded to content script)
export interface InsertPromptPayload {
  prompt: string  // Generated prompt text
  tabId: number   // Lovart tab ID for targeted messaging
}

// Phase 12: Content script insertion result
export interface InsertResultPayload {
  success: boolean
  error?: string  // 'INPUT_NOT_FOUND' or other error
}

// Phase 12: Save to temporary category payload (updated for bilingual support)
export interface SaveTemporaryPromptPayload {
  name: string      // Prompt name (Chinese)
  nameEn?: string   // Prompt name (English, optional)
  content: string   // Prompt content (Chinese)
  contentEn?: string // Prompt content (English, optional)
  description?: string // Description (Chinese analysis)
  descriptionEn?: string // Description (English analysis)
  imageUrl?: string // Source image URL (optional, for reference)
  base64Data?: string // Base64 data URL (for file:// images that service worker cannot fetch)
  styleTags?: string[] // Style tags for reference (optional)
  format?: 'natural' | 'json' // Save format marker
}

// Update temporary prompt format payload
export interface UpdateTemporaryPromptFormatPayload {
  taskId: string // Task ID to identify the prompt
  imageUrl: string // Source image URL
  result: VisionApiResultData // Vision API result data
  newFormat: 'natural' | 'json' // New format to save
}