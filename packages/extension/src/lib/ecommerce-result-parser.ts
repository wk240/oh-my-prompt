import type { EcommerceGenerateResult, EcommercePromptDetails } from '@oh-my-prompt/shared/types'

export type EcommerceResultParseResult =
  | { ok: true; result: EcommerceGenerateResult }
  | { ok: false; error: string }

type JsonObject = Record<string, unknown>

const RAW_RESULT_TYPE = '原始生成结果'
const RAW_RESULT_TYPE_EN = 'Raw Result'
const EMPTY_RESULT_ERROR = '生成结果为空'
const DETAIL_ALIASES = {
  subject: ['subject', 'mainSubject', 'product', '主体', '产品主体'],
  scene: ['scene', 'environment', 'background', '场景', '背景'],
  composition: ['composition', 'layout', 'camera', '构图', '镜头'],
  lighting: ['lighting', 'light', '光影', '灯光'],
  style: ['style', 'visualStyle', 'mood', '风格', '调性'],
  sellingPoint: ['sellingPoint', 'benefit', 'feature', '卖点', '核心卖点'],
  parameters: ['parameters', 'negativePrompt', 'params', '参数', '补充参数'],
} satisfies Record<keyof EcommercePromptDetails, readonly string[]>

export function parseEcommerceGenerateResult(data: unknown, fallbackAspectRatio: string): EcommerceResultParseResult {
  const rawText = getStringField(data, 'prompt')
  const ecommercePrompts = getObjectField(data, 'ecommercePrompts')

  if (ecommercePrompts) {
    const result = normalizeEcommerceResult(ecommercePrompts, fallbackAspectRatio)
    if (result.prompts.length > 0) {
      return { ok: true, result }
    }
  }

  if (rawText) {
    for (const candidate of getJsonCandidates(rawText)) {
      const parsed = parseJsonObject(candidate)
      if (!parsed) {
        continue
      }

      const result = normalizeEcommerceResult(parsed, fallbackAspectRatio)
      if (result.prompts.length > 0) {
        return { ok: true, result }
      }
    }

    return {
      ok: true,
      result: createRawResult(rawText, fallbackAspectRatio),
    }
  }

  return {
    ok: false,
    error: EMPTY_RESULT_ERROR,
  }
}

function normalizeEcommerceResult(data: JsonObject, fallbackAspectRatio: string): EcommerceGenerateResult {
  const prompts = Array.isArray(data.prompts)
    ? data.prompts.flatMap(prompt => normalizePrompt(prompt, fallbackAspectRatio))
    : []

  return {
    prompts,
    templateCategory: 'ecommerce',
    ...(typeof data.rawText === 'string' && data.rawText.trim() ? { rawText: data.rawText } : {}),
  }
}

function normalizePrompt(data: unknown, fallbackAspectRatio: string): EcommerceGenerateResult['prompts'] {
  if (!isObject(data)) {
    return []
  }

  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : ''
  if (!prompt) {
    return []
  }

  return [{
    type: valueOrDefault(data.type, '综合'),
    typeEn: valueOrDefault(data.typeEn, 'General'),
    prompt,
    aspectRatio: valueOrDefault(data.aspectRatio, fallbackAspectRatio),
    ...normalizeDetails(data),
  }]
}

function normalizeDetails(data: JsonObject): { details?: EcommercePromptDetails } {
  const details = getObjectField(data, 'details')
  const sections = getObjectField(data, 'sections')
  const metadata = getObjectField(data, 'metadata')
  const sources = [details, sections, metadata].filter((source): source is JsonObject => source !== null)

  const normalized: EcommercePromptDetails = {}
  for (const [key, aliases] of getDetailAliasEntries()) {
    const value = getAliasedString(sources, aliases)
    if (value) {
      normalized[key] = value
    }
  }

  return Object.keys(normalized).length > 0 ? { details: normalized } : {}
}

function getDetailAliasEntries(): Array<[keyof EcommercePromptDetails, readonly string[]]> {
  return Object.entries(DETAIL_ALIASES) as Array<[keyof EcommercePromptDetails, readonly string[]]>
}

function getAliasedString(sources: JsonObject[], aliases: readonly string[]): string {
  for (const source of sources) {
    for (const alias of aliases) {
      const value = source[alias]
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }

  return ''
}

function createRawResult(rawText: string, fallbackAspectRatio: string): EcommerceGenerateResult {
  return {
    prompts: [
      {
        type: RAW_RESULT_TYPE,
        typeEn: RAW_RESULT_TYPE_EN,
        prompt: rawText,
        aspectRatio: fallbackAspectRatio,
      },
    ],
    templateCategory: 'ecommerce',
    rawText,
  }
}

function getJsonCandidates(text: string): string[] {
  const fenced = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), match => match[1].trim())
  return [text.trim(), ...fenced, ...extractJsonObjects(text)].filter(Boolean)
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }

  return objects
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const parsed = JSON.parse(text)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getObjectField(data: unknown, field: string): JsonObject | null {
  if (!isObject(data)) {
    return null
  }

  const value = data[field]
  return isObject(value) ? value : null
}

function getStringField(data: unknown, field: string): string {
  if (!isObject(data)) {
    return ''
  }

  const value = data[field]
  return typeof value === 'string' ? value.trim() : ''
}

function valueOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
