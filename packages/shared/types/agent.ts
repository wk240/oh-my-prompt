/**
 * Agent template categories
 */
export type AgentTemplateCategory =
  | 'ecommerce'    // 电商套图
  | 'poster'       // 海报图
  | 'illustration' // 插画
  | 'logo'         // Logo
  | 'ui'           // UI界面
  | '3d'           // 3D渲染

/**
 * Agent template definition
 */
export interface AgentTemplate {
  id: AgentTemplateCategory
  name: string
  nameEn: string
  keywords: string[] // Style keywords for System Prompt
  description: string // Template description shown in UI
  descriptionEn: string
}

/**
 * Agent generate request payload
 */
export interface AgentGeneratePayload {
  inputText: string
  imageData?: string // Optional reference image (base64 data URL)
  templateCategory: AgentTemplateCategory
  productImage?: string             // 单张商品原图 (base64 data URL)
  ecommerceConfig?: EcommerceConfig  // 电商专属配置
}

/**
 * Agent generate result
 */
export interface AgentGenerateResult {
  prompt: string // Generated prompt text
  templateCategory: AgentTemplateCategory
  ecommercePrompts?: EcommerceGenerateResult  // 结构化多提示词结果
}

// 电商平台
export type EcommercePlatform = 'amazon' | 'taobao' | 'jd' | 'pinduoduo' | 'temu' | 'shein'

// 目标市场
export type EcommerceMarket = 'china' | 'usa' | 'europe' | 'japan' | 'southeast_asia'

// 输出语言
export type EcommerceLanguage = 'zh' | 'en' | 'ja'

// 图片比例
export type EcommerceAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'

// 自定义套图数量配置
export interface EcommerceCustomCounts {
  whiteBg: number
  scene: number
  sellingPoint: number
  other: number
}

// 电商配置
export interface EcommerceConfig {
  platform: EcommercePlatform
  market: EcommerceMarket
  language: EcommerceLanguage
  aspectRatio: EcommerceAspectRatio
  sellingPoints: string
  setStructure: 'smart' | 'custom'
  customCounts?: EcommerceCustomCounts
}

export interface EcommercePromptDetails {
  subject?: string
  scene?: string
  composition?: string
  lighting?: string
  style?: string
  sellingPoint?: string
  parameters?: string
}

// 电商结构化生成结果
export interface EcommerceGenerateResult {
  prompts: Array<{
    type: string
    typeEn: string
    prompt: string
    aspectRatio: string
    details?: EcommercePromptDetails
  }>
  templateCategory: 'ecommerce'
  rawText?: string
}

/**
 * Agent view mode state
 */
export type AgentViewMode = 'default' | 'agent'
