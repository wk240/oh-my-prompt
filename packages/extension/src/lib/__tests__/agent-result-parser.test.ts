import { describe, expect, it } from 'vitest'
import { parseAgentGenerateResult } from '../agent-result-parser'

const structuredResult = {
  prompt: 'A cinematic portrait of a ceramic robot in warm window light.',
  sections: {
    subject: 'Ceramic robot holding a small flower',
    style: 'Cinematic product portrait',
    lighting: 'Warm window light with soft shadows',
    colors: 'Ivory, moss green, warm amber',
    composition: 'Centered three-quarter view',
    materials: 'Glazed ceramic, linen backdrop',
    mood: 'Quiet, tender, premium',
    negativePrompt: 'No watermark, no text, no distorted hands',
  },
}

describe('parseAgentGenerateResult', () => {
  it('parses a structured JSON prompt payload', () => {
    const parsed = parseAgentGenerateResult({
      prompt: JSON.stringify(structuredResult),
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompt).toBe(structuredResult.prompt)
      expect(parsed.result.sections.subject).toBe('Ceramic robot holding a small flower')
      expect(parsed.result.sections.negativePrompt).toBe('No watermark, no text, no distorted hands')
      expect(parsed.result.rawText).toBeUndefined()
    }
  })

  it('extracts JSON wrapped in Markdown code fences', () => {
    const parsed = parseAgentGenerateResult({
      prompt: ['Result:', '```json', JSON.stringify(structuredResult), '```'].join('\n'),
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.sections.lighting).toBe('Warm window light with soft shadows')
    }
  })

  it('normalizes section aliases from top-level fields', () => {
    const parsed = parseAgentGenerateResult({
      prompt: JSON.stringify({
        finalPrompt: 'A minimal desk setup with a glass keyboard.',
        主体: 'Glass keyboard',
        风格: 'Minimal editorial',
        光影: 'Soft overcast daylight',
        色彩: 'Clear glass, silver, pale blue',
        构图: 'Top-down flat lay',
        材质: 'Glass and brushed aluminum',
        氛围: 'Clean and futuristic',
        负面提示词: 'No clutter, no logo',
      }),
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.result.prompt).toBe('A minimal desk setup with a glass keyboard.')
      expect(parsed.result.sections).toEqual({
        subject: 'Glass keyboard',
        style: 'Minimal editorial',
        lighting: 'Soft overcast daylight',
        colors: 'Clear glass, silver, pale blue',
        composition: 'Top-down flat lay',
        materials: 'Glass and brushed aluminum',
        mood: 'Clean and futuristic',
        negativePrompt: 'No clutter, no logo',
      })
    }
  })

  it('returns a raw structured result for non-JSON text', () => {
    const parsed = parseAgentGenerateResult({
      prompt: 'Plain model response without structured JSON',
    })

    expect(parsed).toEqual({
      ok: true,
      result: {
        prompt: 'Plain model response without structured JSON',
        sections: {},
        templateCategory: 'general',
        rawText: 'Plain model response without structured JSON',
      },
    })
  })

  it('returns an empty-result error when prompt text is blank', () => {
    const parsed = parseAgentGenerateResult({ prompt: '' })

    expect(parsed).toEqual({
      ok: false,
      error: '生成结果为空',
    })
  })
})
