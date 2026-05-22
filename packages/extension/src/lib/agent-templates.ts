import type { AgentTemplate, AgentTemplateCategory } from '@oh-my-prompt/shared/types/agent'
import type { EcommercePlatform, EcommerceConfig, EcommerceLanguage } from '@oh-my-prompt/shared/types'
import templatesData from '@/data/agent-templates.json'

/**
 * Get all Agent templates
 */
export function getAgentTemplates(): AgentTemplate[] {
  return templatesData as AgentTemplate[]
}

/**
 * Get template by category ID
 */
export function getAgentTemplate(category: AgentTemplateCategory): AgentTemplate | undefined {
  return getAgentTemplates().find(t => t.id === category)
}

/**
 * Build System Prompt for Agent generation
 * @param category - Template category
 * @param hasImage - Whether user provided reference image
 * @returns System Prompt string
 */
export function buildAgentSystemPrompt(
  category: AgentTemplateCategory,
  hasImage: boolean
): string {
  const template = getAgentTemplate(category)
  if (!template) {
    throw new Error(`Unknown template category: ${category}`)
  }

  const keywordsText = template.keywords.join('、')

  if (hasImage) {
    return `你是提示词增强专家。用户正在生成${template.name}类型的提示词。

风格要点：${keywordsText}。

参考图片的视觉风格、色彩、构图，结合用户描述生成详细的提示词。提示词应包含：
- 主体描述（是什么）
- 风格定义（什么风格）
- 光影效果（如何照亮）
- 色彩方案（什么颜色）
- 构图布局（如何排列）
- 材质纹理（什么质感）
- 氛围情绪（什么感觉）

输出语言与输入语言一致。如果用户用中文描述，输出中文提示词；如果用英文描述，输出英文提示词。`
  }

  return `你是提示词增强专家。用户正在生成${template.name}类型的提示词。

风格要点：${keywordsText}。

将简短描述扩展为详细的提示词，包含：
- 主体描述（是什么）
- 风格定义（什么风格）
- 光影效果（如何照亮）
- 色彩方案（什么颜色）
- 构图布局（如何排列）
- 材质纹理（什么质感）
- 氛围情绪（什么感觉）

输出语言与输入语言一致。如果用户用中文描述，输出中文提示词；如果用英文描述，输出英文提示词。`
}

/**
 * Get platform-specific image rules for ecommerce
 * @param platform - Ecommerce platform
 * @returns Platform rules string
 */
export function getPlatformRules(platform: EcommercePlatform): string {
  const rules: Record<EcommercePlatform, string> = {
    amazon: '主图必须纯白背景（RGB 255,255,255），产品占画面85%以上面积，禁止水印、文字、Logo。副图可展示使用场景、尺寸对比、功能细节。建议7张图。',
    taobao: '白底或浅色渐变背景主图，促销文字不超过20%面积，建议5张图。副图突出卖点、细节、场景。',
    jd: '白底主图，产品居中，允许品牌Logo水印。副图展示功能、细节、场景。建议5-8张图。',
    pinduoduo: '突出产品主体，背景简洁，强调性价比。主图可加促销标签。建议5-10张图。',
    temu: '白底或场景图，英文标注为主，面向海外消费者。主图简洁突出产品。建议6-8张图。',
    shein: '时尚感强，场景图为主，模特展示优先。风格年轻化，色彩鲜明。建议6-8张图。'
  }
  return rules[platform] || rules.amazon
}

/**
 * Build System Prompt for ecommerce Agent generation
 * @param config - Ecommerce configuration
 * @param hasProductImages - Whether user provided product images
 * @returns System Prompt string
 */
export function buildEcommerceSystemPrompt(
  config: EcommerceConfig,
  hasProductImages: boolean
): string {
  const platformRules = getPlatformRules(config.platform)
  const marketNames: Record<string, string> = {
    china: '中国', usa: '美国', europe: '欧洲', japan: '日本', southeast_asia: '东南亚'
  }
  const languageNames: Record<string, string> = {
    zh: '中文', en: '英文', ja: '日文'
  }

  const imageInstruction = hasProductImages
    ? `用户提供了商品参考图片，请仔细分析图片中的商品外观、颜色、材质、形状等特征，确保生成的提示词准确描述商品。`
    : ''

  const sellingPointsSection = config.sellingPoints.trim()
    ? `\n## 商品卖点\n${config.sellingPoints.trim()}\n请在提示词中自然融入以上卖点。`
    : ''

  const structureInstruction = config.setStructure === 'smart'
    ? `请根据平台规则和商品类型，智能决定最优的图片类型组合（通常5-7张），确保覆盖主图、场景图、细节图、卖点图等关键类型。`
    : config.customCounts
      ? `请按照以下数量生成各类型图片提示词：白底图 ${config.customCounts.whiteBg} 张、场景图 ${config.customCounts.scene} 张、卖点图 ${config.customCounts.sellingPoint} 张、其他类型 ${config.customCounts.other} 张（由AI智能匹配最优类型）。`
      : `请生成以下固定类型的图片提示词：主图、场景图、细节图、卖点图、对比图、氛围图、品牌图。`

  return `你是电商套图提示词专家。根据用户提供的商品信息${hasProductImages ? '和参考图片' : ''}，生成一套完整的电商产品展示图片提示词。

## 平台要求
当前平台：${config.platform}
${platformRules}

## 目标市场
${marketNames[config.market] || config.market}市场，请遵循该市场的消费者偏好和审美习惯。

## 输出语言
所有提示词使用${languageNames[config.language] || config.language}输出。图片类型标签同时提供中文和英文。

## 图片比例
所有图片比例为 ${config.aspectRatio}。
${imageInstruction}
${sellingPointsSection}

## 套图结构
${structureInstruction}

## 输出格式
请严格以JSON格式输出，不要包含任何其他文字：
{
  "prompts": [
    { "type": "图片类型（中文）", "typeEn": "Image type (English)", "prompt": "详细的图片生成提示词", "aspectRatio": "${config.aspectRatio}" }
  ]
}`
}

/**
 * Build System Prompt for ecommerce AI write (selling points generation)
 * @param platform - Ecommerce platform
 * @param language - Output language
 * @returns System Prompt string
 */
export function buildEcommerceAiWritePrompt(
  platform: EcommercePlatform,
  language: EcommerceLanguage
): string {
  const languageNames: Record<string, string> = {
    zh: '中文', en: '英文', ja: '日文'
  }
  return `你是电商商品卖点撰写专家。请根据提供的商品图片，生成3-5条简洁有力的商品卖点描述。

要求：
1. 每条卖点一行，不要编号
2. 使用${languageNames[language] || '中文'}
3. 适合${platform}平台的风格
4. 突出产品核心优势和差异化卖点
5. 语言简洁有力，每条不超过30字

请直接输出卖点，不要包含任何其他文字。`
}