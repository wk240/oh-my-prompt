import type { EcommerceConfig, EcommerceGenerateResult } from '@oh-my-prompt/shared/types'

const PLATFORM_LABELS: Record<EcommerceConfig['platform'], string> = {
  amazon: '亚马逊',
  taobao: '淘宝',
  jd: '京东',
  pinduoduo: '拼多多',
  temu: 'Temu',
  shein: 'SHEIN',
}

const MARKET_LABELS: Record<EcommerceConfig['market'], string> = {
  china: '中国',
  usa: '美国',
  europe: '欧洲',
  japan: '日本',
  southeast_asia: '东南亚',
}

const LANGUAGE_LABELS: Record<EcommerceConfig['language'], string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const TYPE_USAGE_LABELS: Array<[RegExp, string]> = [
  [/白底|主图|main/i, '电商主图'],
  [/场景|生活|lifestyle|scene/i, '生活场景展示'],
  [/卖点|功能|benefit|selling|feature/i, '核心卖点表达'],
  [/细节|detail/i, '商品细节展示'],
  [/对比|compare|comparison/i, '商品对比展示'],
  [/氛围|brand|品牌|mood/i, '品牌氛围展示'],
]

export function formatEcommercePromptBundle(
  result: EcommerceGenerateResult,
  configSnapshot: EcommerceConfig
): string {
  const imageCount = result.prompts.length
  const promptSections = result.prompts.map((prompt, index) => {
    const number = String(index + 1).padStart(2, '0')
    return [
      `${number}｜${prompt.type}｜用途：${getUsageLabel(prompt.type, prompt.typeEn)}`,
      `提示词：${prompt.prompt}`,
    ].join('\n')
  })

  return [
    `任务目标：请根据以下 ${imageCount} 条提示词分别生成 ${imageCount} 张电商商品图。`,
    '每条提示词对应一张独立图片，不要合并成单张图。',
    '',
    '生成要求：',
    `所有图片比例：${configSnapshot.aspectRatio}。`,
    `目标平台：${PLATFORM_LABELS[configSnapshot.platform]}。`,
    `目标市场：${MARKET_LABELS[configSnapshot.market]}。`,
    `输出语言：${LANGUAGE_LABELS[configSnapshot.language]}。`,
    `套图结构：${formatStructure(configSnapshot)}。`,
    '',
    '图片提示词：',
    ...promptSections,
  ].join('\n')
}

function getUsageLabel(type: string, typeEn: string): string {
  const source = `${type} ${typeEn}`
  return TYPE_USAGE_LABELS.find(([pattern]) => pattern.test(source))?.[1] || '电商商品展示'
}

function formatStructure(configSnapshot: EcommerceConfig): string {
  if (configSnapshot.setStructure === 'custom' && configSnapshot.customCounts) {
    const { whiteBg, scene, sellingPoint, other } = configSnapshot.customCounts
    return `自定义配图（白底图 ${whiteBg} 张、场景图 ${scene} 张、卖点图 ${sellingPoint} 张、其他图 ${other} 张）`
  }

  return '智能配图'
}
