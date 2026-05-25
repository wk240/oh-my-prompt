# Ecommerce Agent Result Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the ecommerce Agent result experience so JSON output becomes readable prompt cards, bulk copy/insert uses one structured multi-image task package, and sidepanel/content script behavior stays consistent.

**Architecture:** Add two pure extension-side helpers: one parser that normalizes ecommerce model output into `EcommerceGenerateResult`, and one formatter that turns a parsed result plus the generation-time config snapshot into a task package. Wire both ecommerce UIs to those helpers, store a config snapshot at generation time, and keep result rendering local to each UI so sidepanel layout and Shadow DOM dropdown constraints do not become coupled.

**Tech Stack:** React 19, TypeScript, Vitest, Chrome Extension MV3 messaging, lucide-react, CSS classes in `packages/extension/src/sidepanel/index.css` and `packages/extension/src/content/styles/dropdown-styles.ts`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/types/agent.ts` | Modify | Add optional ecommerce prompt `details` and `rawText` fields |
| `packages/extension/src/lib/ecommerce-result-parser.ts` | Create | Pure parser for `response.data`, embedded JSON text, Markdown code blocks, details normalization, fallback cards, and empty-result errors |
| `packages/extension/src/lib/__tests__/ecommerce-result-parser.test.ts` | Create | Vitest coverage for standard JSON, embedded JSON, code fences, multiple JSON snippets, details mapping, invalid prompts, raw fallback, and empty result errors |
| `packages/extension/src/lib/ecommerce-prompt-bundle.ts` | Create | Pure formatter for the organized multi-image task package used by copy-all and insert-all |
| `packages/extension/src/lib/__tests__/ecommerce-prompt-bundle.test.ts` | Create | Vitest coverage for task goal, requirements, numbering, snapshot labels, and prompt ordering |
| `packages/extension/src/lib/agent-api.ts` | Modify | Use the shared parser for ecommerce API responses instead of local regex parsing |
| `packages/extension/src/sidepanel/views/EcommerceView.tsx` | Modify | Use parser and formatter, store generation config snapshot, add result summary, expandable details, fixed footer actions, and explicit insert-all behavior |
| `packages/extension/src/content/components/EcommercePanel.tsx` | Modify | Mirror sidepanel result behavior while preserving content-script `onInsert` semantics and persisted dropdown state |
| `packages/extension/src/sidepanel/index.css` | Modify | Add result summary, detail, card, scroll padding, and fixed footer styles for sidepanel |
| `packages/extension/src/content/styles/dropdown-styles.ts` | Modify | Add matching result summary, detail, card, scroll padding, and fixed footer styles inside the dropdown Shadow DOM |

---

### Task 1: Extend Ecommerce Result Types

**Files:**
- Modify: `packages/shared/types/agent.ts`

- [ ] **Step 1: Update ecommerce result type definitions**

Replace the existing `EcommerceGenerateResult` interface in `packages/shared/types/agent.ts` with:

```typescript
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
```

- [ ] **Step 2: Run typecheck for the shared type change**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: TypeScript completes without errors from `packages/shared/types/agent.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/types/agent.ts
git commit -m "feat(agent): extend ecommerce result details"
```

---

### Task 2: Add Shared Ecommerce Result Parser

**Files:**
- Create: `packages/extension/src/lib/__tests__/ecommerce-result-parser.test.ts`
- Create: `packages/extension/src/lib/ecommerce-result-parser.ts`
- Modify: `packages/extension/src/lib/agent-api.ts`

- [ ] **Step 1: Write failing parser tests**

Create `packages/extension/src/lib/__tests__/ecommerce-result-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/ecommerce-result-parser.test.ts
```

Expected: FAIL because `packages/extension/src/lib/ecommerce-result-parser.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `packages/extension/src/lib/ecommerce-result-parser.ts`:

```typescript
import type { EcommerceGenerateResult, EcommercePromptDetails } from '@oh-my-prompt/shared/types'

type ParseSuccess = {
  ok: true
  result: EcommerceGenerateResult
}

type ParseFailure = {
  ok: false
  error: string
}

export type EcommerceResultParseResult = ParseSuccess | ParseFailure

type PromptCandidate = {
  type?: unknown
  typeEn?: unknown
  prompt?: unknown
  aspectRatio?: unknown
  details?: unknown
  sections?: unknown
  metadata?: unknown
}

type ResultCandidate = {
  prompts?: unknown
  templateCategory?: unknown
}

const DETAIL_ALIASES: Record<keyof EcommercePromptDetails, string[]> = {
  subject: ['subject', 'product', 'mainSubject', '主体', '产品主体'],
  scene: ['scene', 'background', 'environment', '场景', '背景'],
  composition: ['composition', 'layout', 'camera', '构图', '镜头'],
  lighting: ['lighting', 'light', '光影', '灯光'],
  style: ['style', 'visualStyle', 'mood', '风格', '调性'],
  sellingPoint: ['sellingPoint', 'benefit', 'feature', '卖点', '核心卖点'],
  parameters: ['parameters', 'params', 'negativePrompt', '参数', '补充参数'],
}

export function parseEcommerceGenerateResult(
  data: unknown,
  fallbackAspectRatio: string
): EcommerceResultParseResult {
  const responseData = isRecord(data) ? data : {}
  const rawText = typeof responseData.prompt === 'string' ? responseData.prompt.trim() : ''

  const directResult = normalizeResult(responseData.ecommercePrompts, fallbackAspectRatio)
  if (directResult) {
    return { ok: true, result: directResult }
  }

  for (const candidate of getJsonCandidates(rawText)) {
    const parsedResult = normalizeResult(candidate, fallbackAspectRatio)
    if (parsedResult) {
      return { ok: true, result: parsedResult }
    }
  }

  if (rawText) {
    return { ok: true, result: buildRawResult(rawText, fallbackAspectRatio) }
  }

  return { ok: false, error: '生成结果为空' }
}

function normalizeResult(value: unknown, fallbackAspectRatio: string): EcommerceGenerateResult | null {
  if (!isRecord(value)) {
    return null
  }

  const candidate = value as ResultCandidate
  if (!Array.isArray(candidate.prompts)) {
    return null
  }

  const prompts = candidate.prompts
    .map(item => normalizePrompt(item as PromptCandidate, fallbackAspectRatio))
    .filter((prompt): prompt is EcommerceGenerateResult['prompts'][number] => prompt !== null)

  if (prompts.length === 0) {
    return null
  }

  return {
    prompts,
    templateCategory: 'ecommerce',
  }
}

function normalizePrompt(
  value: PromptCandidate,
  fallbackAspectRatio: string
): EcommerceGenerateResult['prompts'][number] | null {
  if (!isRecord(value)) {
    return null
  }

  const prompt = normalizeString(value.prompt)
  if (!prompt) {
    return null
  }

  const details = normalizeDetails(value.details, value.sections, value.metadata)
  const normalizedPrompt: EcommerceGenerateResult['prompts'][number] = {
    type: normalizeString(value.type) || '综合',
    typeEn: normalizeString(value.typeEn) || 'General',
    prompt,
    aspectRatio: normalizeString(value.aspectRatio) || fallbackAspectRatio,
  }

  if (Object.keys(details).length > 0) {
    normalizedPrompt.details = details
  }

  return normalizedPrompt
}

function normalizeDetails(...sources: unknown[]): EcommercePromptDetails {
  const mergedSources = sources.filter(isRecord)
  const details: EcommercePromptDetails = {}

  for (const [targetKey, aliases] of Object.entries(DETAIL_ALIASES) as Array<[keyof EcommercePromptDetails, string[]]>) {
    for (const source of mergedSources) {
      const value = firstAliasValue(source, aliases)
      if (value) {
        details[targetKey] = value
        break
      }
    }
  }

  return details
}

function firstAliasValue(source: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = normalizeString(source[alias])
    if (value) {
      return value
    }
  }
  return undefined
}

function buildRawResult(rawText: string, fallbackAspectRatio: string): EcommerceGenerateResult {
  return {
    prompts: [
      {
        type: '原始生成结果',
        typeEn: 'Raw Result',
        prompt: rawText,
        aspectRatio: fallbackAspectRatio,
      },
    ],
    templateCategory: 'ecommerce',
    rawText,
  }
}

function getJsonCandidates(rawText: string): unknown[] {
  if (!rawText) {
    return []
  }

  const candidates: unknown[] = []
  for (const codeBlock of rawText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const parsed = parseJson(codeBlock[1])
    if (parsed !== undefined) {
      candidates.push(parsed)
    }
  }

  const direct = parseJson(rawText)
  if (direct !== undefined) {
    candidates.push(direct)
  }

  for (const objectText of extractJsonObjects(rawText)) {
    const parsed = parseJson(objectText)
    if (parsed !== undefined) {
      candidates.push(parsed)
    }
  }

  return candidates
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = []
  const starts: number[] = []
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
      starts.push(index)
      continue
    }

    if (char === '}' && starts.length > 0) {
      const start = starts.pop()
      if (start !== undefined) {
        objects.push(text.slice(start, index + 1))
      }
    }
  }

  return objects.sort((left, right) => right.length - left.length)
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text.trim())
  } catch {
    return undefined
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 4: Use the parser in agent-api**

In `packages/extension/src/lib/agent-api.ts`, add:

```typescript
import { parseEcommerceGenerateResult } from './ecommerce-result-parser'
```

Replace the local `let ecommercePrompts` parsing block in `executeAgentApiCallWithProviderConfig` with:

```typescript
    const parsedEcommerceResult = isEcommerce
      ? parseEcommerceGenerateResult({ prompt: promptText }, payload.ecommerceConfig?.aspectRatio || '1:1')
      : null
    const ecommercePrompts = parsedEcommerceResult?.ok ? parsedEcommerceResult.result : undefined
```

Do not throw when `parsedEcommerceResult.ok` is false here, because the existing API contract still returns `prompt` and the UI parser will surface the empty-result error.

- [ ] **Step 5: Run parser tests and typecheck**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/ecommerce-result-parser.test.ts
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/lib/ecommerce-result-parser.ts packages/extension/src/lib/__tests__/ecommerce-result-parser.test.ts packages/extension/src/lib/agent-api.ts
git commit -m "feat(agent): share ecommerce result parser"
```

---

### Task 3: Add Shared Ecommerce Prompt Bundle Formatter

**Files:**
- Create: `packages/extension/src/lib/__tests__/ecommerce-prompt-bundle.test.ts`
- Create: `packages/extension/src/lib/ecommerce-prompt-bundle.ts`

- [ ] **Step 1: Write failing bundle formatter tests**

Create `packages/extension/src/lib/__tests__/ecommerce-prompt-bundle.test.ts`:

```typescript
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
    expect(bundle).toContain('所有图片比例：1:1。')
    expect(bundle).toContain('目标平台：亚马逊。')
    expect(bundle).toContain('目标市场：中国。')
    expect(bundle).toContain('输出语言：中文。')
    expect(bundle).toContain('套图结构：自定义配图（白底图 1 张、场景图 2 张、卖点图 2 张、其他图 1 张）。')
    expect(bundle).toContain('01｜白底主图｜用途：电商主图')
    expect(bundle).toContain('提示词：Create the white background hero image.')
    expect(bundle).toContain('02｜场景图｜用途：生活场景展示')
    expect(bundle).toContain('提示词：Create a lifestyle desk scene.')
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
```

- [ ] **Step 2: Run formatter tests and verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/ecommerce-prompt-bundle.test.ts
```

Expected: FAIL because `packages/extension/src/lib/ecommerce-prompt-bundle.ts` does not exist.

- [ ] **Step 3: Implement bundle formatter**

Create `packages/extension/src/lib/ecommerce-prompt-bundle.ts`:

```typescript
import type { EcommerceConfig, EcommerceGenerateResult } from '@oh-my-prompt/shared/types'

const PLATFORM_LABELS: Record<string, string> = {
  amazon: '亚马逊',
  taobao: '淘宝',
  jd: '京东',
  pinduoduo: '拼多多',
  temu: 'Temu',
  shein: 'Shein',
}

const MARKET_LABELS: Record<string, string> = {
  china: '中国',
  usa: '美国',
  europe: '欧洲',
  japan: '日本',
  southeast_asia: '东南亚',
}

const LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

const TYPE_USAGE_LABELS: Array<[RegExp, string]> = [
  [/白底|主图|main|hero/i, '电商主图'],
  [/场景|生活|lifestyle|scene/i, '生活场景展示'],
  [/卖点|功能|benefit|selling|feature/i, '核心卖点展示'],
  [/细节|detail|texture|材质/i, '商品细节展示'],
  [/对比|compare|comparison/i, '对比说明展示'],
  [/尺寸|size|scale/i, '尺寸规格展示'],
  [/品牌|brand/i, '品牌调性展示'],
]

export function formatEcommercePromptBundle(
  result: EcommerceGenerateResult,
  configSnapshot: EcommerceConfig
): string {
  const count = result.prompts.length
  const platform = PLATFORM_LABELS[configSnapshot.platform] || configSnapshot.platform
  const market = MARKET_LABELS[configSnapshot.market] || configSnapshot.market
  const language = LANGUAGE_LABELS[configSnapshot.language] || configSnapshot.language
  const structure = formatStructure(configSnapshot)

  const promptItems = result.prompts.map((prompt, index) => {
    const number = String(index + 1).padStart(2, '0')
    const usage = getUsage(prompt.type, prompt.typeEn)
    return [
      `${number}｜${prompt.type}｜用途：${usage}`,
      `提示词：${prompt.prompt.trim()}`,
    ].join('\n')
  })

  return [
    `任务目标：请根据以下 ${count} 条提示词分别生成 ${count} 张电商商品图，保持同一产品、同一品牌调性和统一视觉系列感。`,
    '',
    '生成要求：',
    '- 每条提示词对应一张独立图片，不要合并成单张图。',
    '- 按编号顺序生成。',
    `- 所有图片比例：${configSnapshot.aspectRatio}。`,
    `- 目标平台：${platform}。`,
    `- 目标市场：${market}。`,
    `- 输出语言：${language}。`,
    `- 套图结构：${structure}。`,
    '- 主体产品保持一致，并遵循目标平台和目标市场的电商展示习惯。',
    '- 不要输出解释、分析或 Markdown 表格，只按顺序生成对应图片。',
    '',
    ...promptItems.flatMap((item, index) => index === 0 ? [item] : ['', item]),
  ].join('\n')
}

function formatStructure(config: EcommerceConfig): string {
  if (config.setStructure !== 'custom' || !config.customCounts) {
    return '智能配图'
  }

  return [
    `自定义配图（白底图 ${config.customCounts.whiteBg} 张`,
    `场景图 ${config.customCounts.scene} 张`,
    `卖点图 ${config.customCounts.sellingPoint} 张`,
    `其他图 ${config.customCounts.other} 张）`,
  ].join('、')
}

function getUsage(type: string, typeEn: string): string {
  const text = `${type} ${typeEn}`
  const match = TYPE_USAGE_LABELS.find(([pattern]) => pattern.test(text))
  return match?.[1] || type || '电商图片'
}
```

- [ ] **Step 4: Run formatter tests and typecheck**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/ecommerce-prompt-bundle.test.ts
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/ecommerce-prompt-bundle.ts packages/extension/src/lib/__tests__/ecommerce-prompt-bundle.test.ts
git commit -m "feat(agent): format ecommerce prompt bundles"
```

---

### Task 4: Upgrade Sidepanel Ecommerce Result Flow

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: Add imports and result state**

In `packages/extension/src/sidepanel/views/EcommerceView.tsx`, add imports:

```typescript
import { parseEcommerceGenerateResult } from '@/lib/ecommerce-result-parser'
import { formatEcommercePromptBundle } from '@/lib/ecommerce-prompt-bundle'
```

Update the lucide import to include `ChevronDown` and `ChevronUp`:

```typescript
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react'
```

Add state after `const [result, setResult] = useState<EcommerceGenerateResult | null>(null)`:

```typescript
  const [generationConfigSnapshot, setGenerationConfigSnapshot] = useState<EcommerceConfig | null>(null)
  const [expandedPromptIndexes, setExpandedPromptIndexes] = useState<Set<number>>(() => new Set())
```

- [ ] **Step 2: Add summary and detail helpers**

Add these helper constants and functions above `export default function EcommerceView`:

```typescript
const DETAIL_ROWS: Array<{ key: keyof NonNullable<EcommerceGenerateResult['prompts'][number]['details']>; label: string }> = [
  { key: 'subject', label: '主体' },
  { key: 'scene', label: '场景' },
  { key: 'composition', label: '构图' },
  { key: 'lighting', label: '光影' },
  { key: 'style', label: '风格' },
  { key: 'sellingPoint', label: '卖点' },
  { key: 'parameters', label: '参数' },
]

function getConfigLabel(options: ConfigOption[], id: string): string {
  return options.find(option => option.id === id)?.name || id
}
```

Add these callbacks inside the component before `handleCopy`:

```typescript
  const getPromptBundle = useCallback(() => {
    if (!result || !generationConfigSnapshot) return ''
    return formatEcommercePromptBundle(result, generationConfigSnapshot)
  }, [result, generationConfigSnapshot])

  const togglePromptDetails = useCallback((index: number) => {
    setExpandedPromptIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])
```

- [ ] **Step 3: Replace result parsing in handleGenerate**

Inside `handleGenerate`, before `chrome.runtime.sendMessage`, add:

```typescript
      const configSnapshot = buildEcommerceConfig()
```

Use `configSnapshot` in the payload:

```typescript
          ecommerceConfig: configSnapshot,
```

Replace the local result parsing block with:

```typescript
      const parsed = parseEcommerceGenerateResult(data, configSnapshot.aspectRatio)

      if (parsed.ok) {
        setResult(parsed.result)
        setGenerationConfigSnapshot(configSnapshot)
        setExpandedPromptIndexes(new Set())
        setViewMode('result')
      } else {
        setError(parsed.error)
      }
```

Remove `aspectRatio` from the `handleGenerate` dependency array because the snapshot comes from `buildEcommerceConfig`.

- [ ] **Step 4: Replace copy-all and insert handlers**

Replace `handleCopyAll` with:

```typescript
  const handleCopyAll = useCallback(async () => {
    const bundle = getPromptBundle()
    if (!bundle) return
    try {
      await navigator.clipboard.writeText(bundle)
      showToast('已复制全部提示词')
    } catch {
      showToast('复制失败')
    }
  }, [getPromptBundle, showToast])
```

Replace `handleInsert` with:

```typescript
  const handleInsert = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制，请在输入框中粘贴')
    } catch {
      showToast('复制失败')
    }
  }, [showToast])
```

Add an explicit insert-all handler:

```typescript
  const handleInsertAll = useCallback(async () => {
    const bundle = getPromptBundle()
    if (!bundle) return
    try {
      await navigator.clipboard.writeText(bundle)
      showToast('当前页面暂不可直接插入，已复制任务包')
    } catch {
      showToast('插入通道不可用，且复制失败')
    }
  }, [getPromptBundle, showToast])
```

This sidepanel implementation shows a clear unavailable-channel message and does not silently label copy behavior as a successful insert.

- [ ] **Step 5: Replace the sidepanel result view JSX**

Replace the `Result View - full-screen overlay` block with:

```tsx
        {viewMode === 'result' && result && (
          <div className="ecommerce-panel-result-view">
            <div className="ecommerce-panel-result-header">
              <button className="ecommerce-panel-result-back-btn" onClick={handleBackToForm} aria-label="返回表单">
                <ArrowLeft style={{ width: 16, height: 16 }} />
              </button>
              <span className="ecommerce-panel-result-title">套图生成结果</span>
              <span className="ecommerce-panel-result-count">共 {result.prompts.length} 张</span>
            </div>

            <div className="ecommerce-panel-result-body">
              {generationConfigSnapshot && (
                <div className="ecommerce-panel-result-summary">
                  <span>平台：{getConfigLabel(config.platforms, generationConfigSnapshot.platform)}</span>
                  <span>市场：{getConfigLabel(config.markets, generationConfigSnapshot.market)}</span>
                  <span>语言：{getConfigLabel(config.languages, generationConfigSnapshot.language)}</span>
                  <span>比例：{generationConfigSnapshot.aspectRatio}</span>
                  <span>结构：{generationConfigSnapshot.setStructure === 'custom' ? '自定义配图' : '智能配图'}</span>
                </div>
              )}

              {result.prompts.map((p, i) => {
                const isExpanded = expandedPromptIndexes.has(i)
                const detailRows = DETAIL_ROWS.filter(row => p.details?.[row.key])
                return (
                  <div key={`${p.type}-${i}`} className="ecommerce-panel-result-card">
                    <div className="ecommerce-panel-result-card-header">
                      <span className="ecommerce-panel-result-type-tag">{p.type}</span>
                      <span className="ecommerce-panel-result-ratio">{p.aspectRatio}</span>
                    </div>
                    <div className="ecommerce-panel-result-text">{p.prompt}</div>
                    {detailRows.length > 0 && (
                      <button className="ecommerce-panel-details-toggle" onClick={() => togglePromptDetails(i)}>
                        {isExpanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                        <span>{isExpanded ? '收起详情' : '展开详情'}</span>
                      </button>
                    )}
                    {isExpanded && (
                      <div className="ecommerce-panel-details">
                        {detailRows.map(row => (
                          <div key={row.key} className="ecommerce-panel-detail-row">
                            <span className="ecommerce-panel-detail-label">{row.label}</span>
                            <span className="ecommerce-panel-detail-value">{p.details?.[row.key]}</span>
                          </div>
                        ))}
                        <div className="ecommerce-panel-detail-row ecommerce-panel-detail-row-full">
                          <span className="ecommerce-panel-detail-label">完整提示词</span>
                          <span className="ecommerce-panel-detail-value">{p.prompt}</span>
                        </div>
                      </div>
                    )}
                    <div className="ecommerce-panel-result-actions">
                      <button className="ecommerce-panel-action-btn ecommerce-panel-insert-btn" onClick={() => handleInsert(p.prompt)} title="插入">
                        <ArrowUpRight style={{ width: 14, height: 14 }} />
                      </button>
                      <button className="ecommerce-panel-action-btn" onClick={() => handleCopy(p.prompt)} title="复制">
                        <Copy style={{ width: 14, height: 14 }} />
                      </button>
                      <button className="ecommerce-panel-action-btn" onClick={() => handleSavePrompt(i)} title="保存到库">
                        <Bookmark style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="ecommerce-panel-result-footer">
              <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleRegenerate} disabled={isLoading}>
                {isLoading ? '生成中...' : '重新生成'}
              </button>
              <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleCopyAll}>
                复制全部
              </button>
              <button className="ecommerce-panel-result-footer-btn-primary" onClick={handleInsertAll}>
                插入全部
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "feat(agent): improve ecommerce sidepanel results"
```

---

### Task 5: Upgrade Content Script Ecommerce Result Flow

**Files:**
- Modify: `packages/extension/src/content/components/EcommercePanel.tsx`

- [ ] **Step 1: Add imports and persisted snapshot state**

In `packages/extension/src/content/components/EcommercePanel.tsx`, add imports:

```typescript
import { parseEcommerceGenerateResult } from '@/lib/ecommerce-result-parser'
import { formatEcommercePromptBundle } from '@/lib/ecommerce-prompt-bundle'
```

Update the lucide import to include `ChevronDown` and `ChevronUp`:

```typescript
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, LogIn, ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react'
```

Update `EcommercePersistedState`:

```typescript
  generationConfigSnapshot: EcommerceConfig | null
  expandedPromptIndexes: number[]
```

Update `DEFAULT_PERSISTED_STATE`:

```typescript
  generationConfigSnapshot: null,
  expandedPromptIndexes: [],
```

Add state after `const [result, setResult] = useState<EcommerceGenerateResult | null>(initState.result)`:

```typescript
  const [generationConfigSnapshot, setGenerationConfigSnapshot] = useState<EcommerceConfig | null>(initState.generationConfigSnapshot)
  const [expandedPromptIndexes, setExpandedPromptIndexes] = useState<Set<number>>(() => new Set(initState.expandedPromptIndexes))
```

Update `buildPersistedState` to include:

```typescript
    generationConfigSnapshot,
    expandedPromptIndexes: Array.from(expandedPromptIndexes),
```

Add `generationConfigSnapshot` and `expandedPromptIndexes` to the `buildPersistedState` dependency array.

- [ ] **Step 2: Add shared helpers inside the content component**

Add these helper constants and functions above `export function EcommercePanel`:

```typescript
const DETAIL_ROWS: Array<{ key: keyof NonNullable<EcommerceGenerateResult['prompts'][number]['details']>; label: string }> = [
  { key: 'subject', label: '主体' },
  { key: 'scene', label: '场景' },
  { key: 'composition', label: '构图' },
  { key: 'lighting', label: '光影' },
  { key: 'style', label: '风格' },
  { key: 'sellingPoint', label: '卖点' },
  { key: 'parameters', label: '参数' },
]

function getConfigLabel(options: ConfigOption[], id: string): string {
  return options.find(option => option.id === id)?.name || id
}
```

Add these callbacks inside the component before `handleCopy`:

```typescript
  const getPromptBundle = useCallback(() => {
    if (!result || !generationConfigSnapshot) return ''
    return formatEcommercePromptBundle(result, generationConfigSnapshot)
  }, [result, generationConfigSnapshot])

  const togglePromptDetails = useCallback((index: number) => {
    setExpandedPromptIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])
```

- [ ] **Step 3: Replace result parsing in handleGenerate**

Inside `handleGenerate`, before `chrome.runtime.sendMessage`, add:

```typescript
      const configSnapshot = buildEcommerceConfig()
```

Use `configSnapshot` in the payload:

```typescript
          ecommerceConfig: configSnapshot,
```

Replace the local result parsing block with:

```typescript
      const parsed = parseEcommerceGenerateResult(data, configSnapshot.aspectRatio)

      if (parsed.ok) {
        setResult(parsed.result)
        setGenerationConfigSnapshot(configSnapshot)
        setExpandedPromptIndexes(new Set())
        setViewMode('result')
      } else {
        setError(parsed.error)
      }
```

Remove `aspectRatio` from the `handleGenerate` dependency array because the snapshot comes from `buildEcommerceConfig`.

- [ ] **Step 4: Replace bulk action handlers**

Replace `handleCopyAll` with:

```typescript
  const handleCopyAll = useCallback(async () => {
    const bundle = getPromptBundle()
    if (!bundle) return
    try {
      await navigator.clipboard.writeText(bundle)
      showToast('已复制全部提示词')
    } catch {
      showToast('复制失败')
    }
  }, [getPromptBundle])
```

Add `handleInsertAll` after `handleCopyAll`:

```typescript
  const handleInsertAll = useCallback(() => {
    const bundle = getPromptBundle()
    if (!bundle) return
    if (!onInsert) {
      showToast('当前页面暂不可直接插入')
      return
    }
    onInsert(bundle)
    showToast('已插入全部提示词')
  }, [getPromptBundle, onInsert])
```

- [ ] **Step 5: Replace the content result view JSX**

Replace the `Result View - full-screen overlay` block with:

```tsx
      {viewMode === 'result' && result && (
        <div className="ecommerce-panel-result-view">
          <div className="ecommerce-panel-result-header">
            <button className="ecommerce-panel-result-back-btn" onClick={handleBackToForm} aria-label="返回表单">
              <ArrowLeft style={{ width: 16, height: 16 }} />
            </button>
            <span className="ecommerce-panel-result-title">套图生成结果</span>
            <span className="ecommerce-panel-result-count">共 {result.prompts.length} 张</span>
          </div>

          <div className="ecommerce-panel-result-body">
            {generationConfigSnapshot && (
              <div className="ecommerce-panel-result-summary">
                <span>平台：{getConfigLabel(config.platforms, generationConfigSnapshot.platform)}</span>
                <span>市场：{getConfigLabel(config.markets, generationConfigSnapshot.market)}</span>
                <span>语言：{getConfigLabel(config.languages, generationConfigSnapshot.language)}</span>
                <span>比例：{generationConfigSnapshot.aspectRatio}</span>
                <span>结构：{generationConfigSnapshot.setStructure === 'custom' ? '自定义配图' : '智能配图'}</span>
              </div>
            )}

            {result.prompts.map((p, i) => {
              const isExpanded = expandedPromptIndexes.has(i)
              const detailRows = DETAIL_ROWS.filter(row => p.details?.[row.key])
              return (
                <div key={`${p.type}-${i}`} className="ecommerce-panel-result-card">
                  <div className="ecommerce-panel-result-card-header">
                    <span className="ecommerce-panel-result-type-tag">{p.type}</span>
                    <span className="ecommerce-panel-result-ratio">{p.aspectRatio}</span>
                  </div>
                  <div className="ecommerce-panel-result-text">{p.prompt}</div>
                  {detailRows.length > 0 && (
                    <button className="ecommerce-panel-details-toggle" onClick={() => togglePromptDetails(i)}>
                      {isExpanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                      <span>{isExpanded ? '收起详情' : '展开详情'}</span>
                    </button>
                  )}
                  {isExpanded && (
                    <div className="ecommerce-panel-details">
                      {detailRows.map(row => (
                        <div key={row.key} className="ecommerce-panel-detail-row">
                          <span className="ecommerce-panel-detail-label">{row.label}</span>
                          <span className="ecommerce-panel-detail-value">{p.details?.[row.key]}</span>
                        </div>
                      ))}
                      <div className="ecommerce-panel-detail-row ecommerce-panel-detail-row-full">
                        <span className="ecommerce-panel-detail-label">完整提示词</span>
                        <span className="ecommerce-panel-detail-value">{p.prompt}</span>
                      </div>
                    </div>
                  )}
                  <div className="ecommerce-panel-result-actions">
                    {onInsert && (
                      <button className="ecommerce-panel-action-btn" onClick={() => { onInsert(p.prompt); showToast('已插入提示词') }} title="插入到输入框">
                        <ArrowUpRight style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                    <button className="ecommerce-panel-action-btn" onClick={() => handleCopy(p.prompt)} title="复制">
                      <Copy style={{ width: 14, height: 14 }} />
                    </button>
                    <button className="ecommerce-panel-action-btn" onClick={() => handleSavePrompt(i)} title="保存到库">
                      <Bookmark style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="ecommerce-panel-result-footer">
            <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleRegenerate} disabled={isLoading}>
              {isLoading ? '生成中...' : '重新生成'}
            </button>
            <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleCopyAll}>
              复制全部
            </button>
            <button className="ecommerce-panel-result-footer-btn-primary" onClick={handleInsertAll} disabled={!onInsert}>
              插入全部
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/content/components/EcommercePanel.tsx
git commit -m "feat(agent): improve ecommerce content results"
```

---

### Task 6: Add Fixed Footer and Detail Styles

**Files:**
- Modify: `packages/extension/src/sidepanel/index.css`
- Modify: `packages/extension/src/content/styles/dropdown-styles.ts`

- [ ] **Step 1: Add sidepanel result styles**

Append this CSS to `packages/extension/src/sidepanel/index.css` near the existing ecommerce result styles:

```css
.ecommerce-panel-result-body {
  padding-bottom: 96px;
}

.ecommerce-panel-result-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  line-height: 1.4;
}

.ecommerce-panel-result-summary span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ecommerce-panel-result-ratio {
  flex-shrink: 0;
  color: #737373;
  font-size: 11px;
}

.ecommerce-panel-details-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
}

.ecommerce-panel-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.ecommerce-panel-detail-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.ecommerce-panel-detail-label {
  color: #64748b;
  font-weight: 500;
}

.ecommerce-panel-detail-value {
  min-width: 0;
  color: #111827;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.ecommerce-panel-detail-row-full {
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.ecommerce-panel-result-footer {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
}

.ecommerce-panel-result-footer button {
  min-width: 0;
  min-height: 44px;
  white-space: normal;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 2: Add content dropdown result styles**

In `packages/extension/src/content/styles/dropdown-styles.ts`, find the existing ecommerce CSS template string and add the same class rules inside it:

```css
.ecommerce-panel-result-body {
  padding-bottom: 96px;
}

.ecommerce-panel-result-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  line-height: 1.4;
}

.ecommerce-panel-result-summary span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ecommerce-panel-result-ratio {
  flex-shrink: 0;
  color: #737373;
  font-size: 11px;
}

.ecommerce-panel-details-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
}

.ecommerce-panel-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.ecommerce-panel-detail-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.ecommerce-panel-detail-label {
  color: #64748b;
  font-weight: 500;
}

.ecommerce-panel-detail-value {
  min-width: 0;
  color: #111827;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.ecommerce-panel-detail-row-full {
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.ecommerce-panel-result-footer {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
}

.ecommerce-panel-result-footer button {
  min-width: 0;
  min-height: 44px;
  white-space: normal;
  overflow-wrap: anywhere;
}
```

If existing duplicate selectors already exist, merge properties into the existing selectors instead of creating conflicting duplicates.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/sidepanel/index.css packages/extension/src/content/styles/dropdown-styles.ts
git commit -m "style(agent): fix ecommerce result actions layout"
```

---

### Task 7: Full Verification

**Files:**
- No file edits

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/ecommerce-result-parser.test.ts src/lib/__tests__/ecommerce-prompt-bundle.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all extension unit tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 3: Run extension typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 4: Build the extension**

Run:

```bash
npm run build --workspace=@oh-my-prompt/extension
```

Expected: PASS and `packages/extension/dist/` is produced.

- [ ] **Step 5: Manual sidepanel verification**

Run:

```bash
npm run dev --workspace=@oh-my-prompt/extension
```

Expected: Vite extension dev build starts successfully.

Then manually verify in the loaded extension sidepanel:

```text
1. Select 电商套图.
2. Upload one product image under 5MB.
3. Enter selling points.
4. Generate results.
5. Confirm the result page shows header, total count, summary, cards, and the fixed footer.
6. Expand a card with details and confirm only populated detail rows are shown.
7. Click single copy and confirm clipboard contains only that prompt.
8. Click 复制全部 and confirm clipboard starts with 任务目标.
9. Click 插入全部 and confirm the sidepanel shows an explicit unavailable-channel/copy message when direct insertion is unavailable.
10. Click 重新生成 and confirm it uses the generation snapshot for the result task package.
```

- [ ] **Step 6: Manual content script verification**

With the dev build loaded in Chrome, open a supported AI platform page and verify:

```text
1. Open the Oh My Prompt floating panel.
2. Select 电商套图.
3. Upload one product image under 5MB.
4. Enter selling points.
5. Generate results.
6. Confirm the result page shows header, total count, summary, cards, and the fixed footer inside the dropdown.
7. Expand details and confirm long text wraps without horizontal scrolling.
8. Click single insert and confirm the prompt inserts into the host editor.
9. Click 复制全部 and confirm clipboard starts with 任务目标.
10. Click 插入全部 and confirm the same task package inserts into the host editor.
11. At 375px, 768px, and 1024px viewport widths, confirm the footer remains clickable and does not cover the final card content.
```

- [ ] **Step 7: Commit verification-only fixes if needed**

If verification required code or CSS fixes, commit them:

```bash
git add packages/shared/types/agent.ts packages/extension/src/lib/ecommerce-result-parser.ts packages/extension/src/lib/ecommerce-prompt-bundle.ts packages/extension/src/lib/__tests__/ecommerce-result-parser.test.ts packages/extension/src/lib/__tests__/ecommerce-prompt-bundle.test.ts packages/extension/src/lib/agent-api.ts packages/extension/src/sidepanel/views/EcommerceView.tsx packages/extension/src/content/components/EcommercePanel.tsx packages/extension/src/sidepanel/index.css packages/extension/src/content/styles/dropdown-styles.ts
git commit -m "fix(agent): polish ecommerce result experience"
```

Expected: Commit is only created when verification changes were made.

---

## Self-Review

**Spec coverage:** The parser task covers shared JSON parsing, Markdown/embedded JSON extraction, detail normalization, invalid prompt skipping, raw fallback cards, and empty-result errors. The formatter task covers organized copy-all/insert-all task packages using generation-time config snapshots. The sidepanel and content tasks cover result summaries, lightweight cards, expandable details, single actions, copy-all, insert-all, regenerate, and matching semantics. The CSS task covers fixed footer, bottom padding, 44px touch targets, wrapping, and scoped layout.

**Placeholder scan:** The plan contains no deferred implementation markers or unnamed tests. Each code-creating step includes concrete code and each verification step includes exact commands and expected outcomes.

**Type consistency:** `EcommercePromptDetails`, `EcommerceGenerateResult`, `parseEcommerceGenerateResult`, `formatEcommercePromptBundle`, `generationConfigSnapshot`, and `expandedPromptIndexes` use the same names and signatures across tests, helpers, sidepanel, content script, and persistence state.
