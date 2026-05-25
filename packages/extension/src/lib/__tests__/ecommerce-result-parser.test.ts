import { describe, expect, it } from 'vitest'
import { parseEcommerceGenerateResult } from '../ecommerce-result-parser'

const standardResult = {
  prompts: [
    {
      type: '白底主图',
      typeEn: 'Main Image',
      prompt: 'A white background hero product image',
      aspectRatio: '1:1',
      details: {
        subject: 'Wireless earbuds',
        scene: 'Pure white studio',
      },
    },
    {
      type: '场景图',
      typeEn: 'Lifestyle',
      prompt: 'Lifestyle product scene on a desk',
      aspectRatio: '4:3',
    },
  ],
  templateCategory: 'ecommerce',
}

describe('parseEcommerceGenerateResult', () => {
  it('uses data.ecommercePrompts before parsing prompt text', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        ecommercePrompts: standardResult,
        prompt: 'this should not be used',
      },
      '3:4'
    )

    expect(parsed).toEqual({
      ok: true,
      result: {
        prompts: standardResult.prompts,
        templateCategory: 'ecommerce',
      },
    })
  })

  it('parses a plain JSON prompt payload', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: JSON.stringify(standardResult),
      },
      '1:1'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts).toHaveLength(2)
      expect(parsed.result.prompts[0].type).toBe('白底主图')
      expect(parsed.result.prompts[0].details?.subject).toBe('Wireless earbuds')
    }
  })

  it('extracts JSON wrapped in Markdown code fences', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: ['Here is the result:', '```json', JSON.stringify(standardResult), '```'].join('\n'),
      },
      '1:1'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts[1].prompt).toBe('Lifestyle product scene on a desk')
    }
  })

  it('extracts the valid prompts object when multiple JSON snippets exist', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: `{"note":"ignore this"}\n${JSON.stringify(standardResult)}\n{"other":true}`,
      },
      '1:1'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts.map(prompt => prompt.type)).toEqual(['白底主图', '场景图'])
    }
  })

  it('normalizes detail aliases from sections and metadata', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: JSON.stringify({
          prompts: [
            {
              type: '卖点图',
              typeEn: 'Benefit',
              prompt: 'Show battery life with premium light',
              sections: {
                product: 'Charging case',
                background: 'Soft gradient',
                camera: 'Centered macro angle',
                light: 'Softbox highlight',
              },
              metadata: {
                visualStyle: 'Premium minimal',
                benefit: '30 hours battery',
                negativePrompt: 'No watermark',
              },
            },
          ],
        }),
      },
      '16:9'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts[0]).toEqual({
        type: '卖点图',
        typeEn: 'Benefit',
        prompt: 'Show battery life with premium light',
        aspectRatio: '16:9',
        details: {
          subject: 'Charging case',
          scene: 'Soft gradient',
          composition: 'Centered macro angle',
          lighting: 'Softbox highlight',
          style: 'Premium minimal',
          sellingPoint: '30 hours battery',
          parameters: 'No watermark',
        },
      })
    }
  })

  it('normalizes missing detail aliases across details, sections, and metadata', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: JSON.stringify({
          prompts: [
            {
              prompt: 'Create a polished ecommerce image',
              details: {
                mainSubject: 'Insulated travel mug',
                场景: 'Morning kitchen counter',
                镜头: 'Three-quarter close-up',
              },
              sections: {
                光影: 'Warm window light',
                mood: 'Cozy premium',
              },
              metadata: {
                核心卖点: 'Keeps coffee hot for 8 hours',
                补充参数: 'No logo, clean background',
              },
            },
          ],
        }),
      },
      '4:5'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts[0].details).toEqual({
        subject: 'Insulated travel mug',
        scene: 'Morning kitchen counter',
        composition: 'Three-quarter close-up',
        lighting: 'Warm window light',
        style: 'Cozy premium',
        sellingPoint: 'Keeps coffee hot for 8 hours',
        parameters: 'No logo, clean background',
      })
    }
  })

  it('normalizes Chinese detail keys from each supported detail source', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: JSON.stringify({
          prompts: [
            {
              prompt: 'Create a localized ecommerce image',
              details: {
                产品主体: '便携榨汁杯',
                背景: '夏日露营桌面',
              },
              sections: {
                构图: '产品居中，水果环绕',
                灯光: '自然逆光',
              },
              metadata: {
                调性: '清爽活力',
                卖点: '无线便携，快速出汁',
                参数: '画面干净，无文字',
              },
            },
          ],
        }),
      },
      '1:1'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts[0].details).toEqual({
        subject: '便携榨汁杯',
        scene: '夏日露营桌面',
        composition: '产品居中，水果环绕',
        lighting: '自然逆光',
        style: '清爽活力',
        sellingPoint: '无线便携，快速出汁',
        parameters: '画面干净，无文字',
      })
    }
  })

  it('skips prompts with blank prompt text and keeps valid prompts', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: JSON.stringify({
          prompts: [
            { type: '空白', prompt: '   ', aspectRatio: '1:1' },
            { type: '细节图', prompt: 'Close-up material texture', aspectRatio: '1:1' },
          ],
        }),
      },
      '1:1'
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompts).toHaveLength(1)
      expect(parsed.result.prompts[0].type).toBe('细节图')
    }
  })

  it('returns a raw result card for non-JSON text', () => {
    const parsed = parseEcommerceGenerateResult(
      {
        prompt: 'Plain model response without structured JSON',
      },
      '9:16'
    )

    expect(parsed).toEqual({
      ok: true,
      result: {
        prompts: [
          {
            type: '原始生成结果',
            typeEn: 'Raw Result',
            prompt: 'Plain model response without structured JSON',
            aspectRatio: '9:16',
          },
        ],
        templateCategory: 'ecommerce',
        rawText: 'Plain model response without structured JSON',
      },
    })
  })

  it('returns a raw result card when all structured prompts are invalid but raw text exists', () => {
    const rawText = JSON.stringify({ prompts: [{ type: 'Bad', prompt: '   ' }] })
    const parsed = parseEcommerceGenerateResult({ prompt: rawText }, '1:1')

    expect(parsed).toEqual({
      ok: true,
      result: {
        prompts: [
          {
            type: '原始生成结果',
            typeEn: 'Raw Result',
            prompt: rawText,
            aspectRatio: '1:1',
          },
        ],
        templateCategory: 'ecommerce',
        rawText,
      },
    })
  })

  it('returns an empty-result error when no raw text or valid prompts exist', () => {
    const parsed = parseEcommerceGenerateResult({ prompt: '' }, '1:1')

    expect(parsed).toEqual({
      ok: false,
      error: '生成结果为空',
    })
  })
})
