import { describe, expect, it } from 'vitest'
import type { EcommerceConfig, EcommerceGenerateResult } from '@oh-my-prompt/shared/types'
import { formatEcommercePromptBundle } from '../ecommerce-prompt-bundle'

const config: EcommerceConfig = {
  platform: 'amazon',
  market: 'china',
  language: 'zh',
  aspectRatio: '1:1',
  sellingPoints: '主动降噪，30小时续航',
  setStructure: 'custom',
  customCounts: {
    whiteBg: 1,
    scene: 2,
    sellingPoint: 2,
    other: 1,
  },
}

const result: EcommerceGenerateResult = {
  templateCategory: 'ecommerce',
  prompts: [
    {
      type: '白底主图',
      typeEn: 'Main Image',
      prompt: 'Create the white background hero image.',
      aspectRatio: '1:1',
    },
    {
      type: '场景图',
      typeEn: 'Lifestyle Image',
      prompt: 'Create a lifestyle desk scene.',
      aspectRatio: '4:3',
      details: {
        subject: 'Wireless earbuds',
      },
    },
  ],
}

describe('formatEcommercePromptBundle', () => {
  it('formats an organized multi-image task package', () => {
    const bundle = formatEcommercePromptBundle(result, config)

    expect(bundle).toContain('任务目标：请根据以下 2 条提示词分别生成 2 张电商商品图')
    expect(bundle).toContain('每条提示词对应一张独立图片，不要合并成单张图。')
    expect(bundle).toContain('按编号顺序生成。')
    expect(bundle).toContain('所有图片比例：1:1。')
    expect(bundle).toContain('目标平台：亚马逊。')
    expect(bundle).toContain('目标市场：中国。')
    expect(bundle).toContain('输出语言：中文。')
    expect(bundle).toContain('套图结构：自定义配图（白底图 1 张、场景图 2 张、卖点图 2 张、其他图 1 张）。')
    expect(bundle).toContain('01｜白底主图｜用途：电商主图')
    expect(bundle).toContain('提示词：Create the white background hero image.')
    expect(bundle).toContain('02｜场景图｜用途：生活场景展示')
    expect(bundle).toContain('提示词：Create a lifestyle desk scene.')
    expect(bundle.indexOf('01｜白底主图｜用途：电商主图')).toBeLessThan(
      bundle.indexOf('02｜场景图｜用途：生活场景展示')
    )
  })

  it('separates each prompt section with a blank line for multi-image insertion', () => {
    const bundle = formatEcommercePromptBundle(result, config)

    expect(bundle).toContain([
      '01｜白底主图｜用途：电商主图',
      '提示词：Create the white background hero image.',
      '',
      '02｜场景图｜用途：生活场景展示',
      '提示词：Create a lifestyle desk scene.',
    ].join('\n'))
  })

  it('uses the generation snapshot instead of prompt-level ratios for global requirements', () => {
    const changedSnapshot: EcommerceConfig = {
      ...config,
      platform: 'temu',
      market: 'usa',
      language: 'en',
      aspectRatio: '9:16',
      setStructure: 'smart',
      customCounts: undefined,
    }

    const bundle = formatEcommercePromptBundle(result, changedSnapshot)

    expect(bundle).toContain('目标平台：Temu。')
    expect(bundle).toContain('目标市场：美国。')
    expect(bundle).toContain('输出语言：English。')
    expect(bundle).toContain('所有图片比例：9:16。')
    expect(bundle).toContain('套图结构：智能配图。')
  })
})
