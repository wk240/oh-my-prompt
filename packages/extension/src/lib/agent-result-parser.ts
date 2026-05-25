import type { GeneralAgentGenerateResult, GeneralAgentPromptSections } from '@oh-my-prompt/shared/types'

export type AgentResultParseResult =
  | { ok: true; result: GeneralAgentGenerateResult }
  | { ok: false; error: string }

type JsonObject = Record<string, unknown>

const EMPTY_RESULT_ERROR = '生成结果为空'

const SECTION_ALIASES = {
  subject: ['subject', 'mainSubject', '主体', '主体描述', '画面主体'],
  style: ['style', 'visualStyle', '风格', '风格定义', '视觉风格'],
  lighting: ['lighting', 'light', '光影', '光影效果', '灯光'],
  colors: ['colors', 'colorPalette', 'palette', '色彩', '色彩方案', '配色'],
  composition: ['composition', 'layout', 'camera', '构图', '构图布局', '镜头'],
  materials: ['materials', 'textures', 'texture', '材质', '材质纹理', '质感'],
  mood: ['mood', 'atmosphere', 'emotion', '氛围', '氛围情绪', '情绪'],
  negativePrompt: ['negativePrompt', 'negative', 'parameters', '负面提示词', '反向提示词', '排除项'],
} satisfies Record<keyof GeneralAgentPromptSections, readonly string[]>

export function parseAgentGenerateResult(data: unknown): AgentResultParseResult {
  const rawText = getStringField(data, 'prompt')
  const agentResult = getObjectField(data, 'agentResult')

  if (agentResult) {
    const result = normalizeAgentResult(agentResult, '')
    if (result.prompt) {
      return { ok: true, result }
    }
  }

  if (!rawText) {
    return {
      ok: false,
      error: EMPTY_RESULT_ERROR,
    }
  }

  for (const candidate of getJsonCandidates(rawText)) {
    const parsed = parseJsonObject(candidate)
    if (!parsed) {
      continue
    }

    const result = normalizeAgentResult(parsed, '')
    if (result.prompt) {
      return { ok: true, result }
    }
  }

  return {
    ok: true,
    result: {
      prompt: rawText,
      sections: {},
      templateCategory: 'general',
      rawText,
    },
  }
}

function normalizeAgentResult(data: JsonObject, rawText: string): GeneralAgentGenerateResult {
  const prompt = getFirstString(data, ['prompt', 'finalPrompt', 'fullPrompt', '完整提示词', '最终提示词'])
  if (!prompt) {
    return {
      prompt: '',
      sections: {},
      templateCategory: 'general',
    }
  }

  const sections = normalizeSections(data)

  return {
    prompt,
    sections,
    templateCategory: 'general',
    ...(rawText && rawText !== prompt ? { rawText } : {}),
  }
}

function normalizeSections(data: JsonObject): GeneralAgentPromptSections {
  const details = getObjectField(data, 'details')
  const sections = getObjectField(data, 'sections')
  const metadata = getObjectField(data, 'metadata')
  const sources = [sections, details, metadata, data].filter((source): source is JsonObject => source !== null)

  const normalized: GeneralAgentPromptSections = {}
  for (const [key, aliases] of getSectionAliasEntries()) {
    const value = getAliasedString(sources, aliases)
    if (value) {
      normalized[key] = value
    }
  }

  return normalized
}

function getSectionAliasEntries(): Array<[keyof GeneralAgentPromptSections, readonly string[]]> {
  return Object.entries(SECTION_ALIASES) as Array<[keyof GeneralAgentPromptSections, readonly string[]]>
}

function getFirstString(data: JsonObject, fields: readonly string[]): string {
  for (const field of fields) {
    const value = data[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function getAliasedString(sources: JsonObject[], aliases: readonly string[]): string {
  for (const source of sources) {
    for (const alias of aliases) {
      const value = source[alias]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return ''
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

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
