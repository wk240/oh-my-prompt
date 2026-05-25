import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt, buildEcommerceSystemPrompt } from '../agent-templates'

describe('buildAgentSystemPrompt', () => {
  it('requires general Agent responses to use the structured JSON layout', () => {
    const prompt = buildAgentSystemPrompt('general', false)

    expect(prompt).toContain('请严格输出 JSON')
    expect(prompt).toContain('"prompt": "可直接用于图片生成的一整段完整提示词"')
    expect(prompt).toContain('"sections"')
    expect(prompt).toContain('"subject"')
    expect(prompt).toContain('"negativePrompt"')
  })
})

describe('buildEcommerceSystemPrompt multi-image semantics', () => {
  it('tells the model to treat uploaded ecommerce images as one reference set', () => {
    const prompt = buildEcommerceSystemPrompt({
      platform: 'amazon',
      market: 'china',
      language: 'zh',
      aspectRatio: '1:1',
      sellingPoints: '主动降噪，长续航',
      setStructure: 'smart',
    }, true)

    expect(prompt).toContain('同一组商品参考图')
    expect(prompt).toContain('不要将不同照片误判为不同商品')
  })
})
