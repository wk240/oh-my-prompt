# 官方 Vision API 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Oh My Prompt 插件用户提供官方 Vision API 服务，会员用户无需配置 API Key 即可使用图片转提示词功能。

**Architecture:** Web App 后端代理第三方 Vision API，插件通过 Supabase session token 调用官方 API `/api/vision/generate`，后端验证会员状态和额度后代理调用并扣除额度。

**Tech Stack:** Next.js API Routes, Supabase Auth, Chrome Extension Manifest V3, React, TypeScript

---

## 文件结构

### Web App (packages/web-app/)
```
app/api/vision/
  generate/route.ts        # 新建：官方 Vision API 路由
lib/
  vision-proxy.ts         # 新建：第三方 Vision API 代理模块
app/api/billing/status/
  route.ts                # 修改：扩展返回 visionQuota
```

### Extension (packages/extension/)
```
src/lib/
  vision-api.ts           # 修改：新增官方 API 调用逻辑
  provider-data.ts        # 修改：加载官方 Provider
src/sidepanel/settings/
  VisionSection.tsx       # 修改：新增官方卡片 + 折叠区域
src/popup/components/
  ConfigCard.tsx          # 修改：支持官方配置特殊显示
  OfficialVisionCard.tsx  # 新建：官方 Provider 卡片组件
  CollapsibleSection.tsx  # 新建：可折叠区域组件
```

### Shared (packages/shared/)
```
types/vision.ts           # 修改：扩展类型定义
messages.ts               # 修改：新增 MessageType
```

### Data (packages/extension/src/data/)
```
providers.json            # 修改：新增官方 Provider 条目
```

---

## Phase 1: Web App 后端 API

### Task 1: 创建 vision-proxy.ts 代理模块

**Files:**
- Create: `packages/web-app/lib/vision-proxy.ts`

- [ ] **Step 1: 创建 vision-proxy.ts 文件**

```typescript
// packages/web-app/lib/vision-proxy.ts
import type { VisionApiResultData } from '@oh-my-prompt/shared/types'

const API_KEY = process.env.VISION_API_KEY!
const API_ENDPOINT = process.env.VISION_API_ENDPOINT!
const API_MODEL = process.env.VISION_API_MODEL || 'gpt-4o'
const API_FORMAT = process.env.VISION_API_FORMAT || 'chat_completions'

// Vision system prompt (same as extension)
const VISION_SYSTEM_PROMPT = `You are an extremely rigorous visual analyst, cinematography analyst, and prompt engineer. Always produce highly detailed, visually grounded prompt output for every supported model provider. Return valid JSON only and follow the requested schema exactly.

The JSON schema:
{
  "zh": {
    "title": "A concise Chinese title (5-15 characters)",
    "prompt": "A highly detailed Chinese image generation prompt",
    "analysis": "A compact Chinese explanation"
  },
  "en": {
    "title": "A concise English title (3-10 words)",
    "prompt": "A highly detailed English image generation prompt",
    "analysis": "A compact English explanation"
  },
  "zh_style_tags": ["中文标签1", "中文标签2"],
  "en_style_tags": ["english tag 1", "english tag 2"],
  "zh_json": { "主体": "...", "动作姿态": "...", ... },
  "en_json": { "subject": "...", "action_pose": "...", ... },
  "json_prompt": { "subject": "...", "action_pose": "...", ... },
  "confidence": 0.9
}

Rules:
- Return JSON only. No markdown fences.
- Keep prompts directly usable for Midjourney, Flux or SDXL.
- Be faithful to visually verifiable facts.
- zh_json must have ALL field names and values in Chinese.
- en_json must have ALL field names and values in English.
- Confidence must be a number between 0 and 1.

Analyze this image and output bilingual prompt JSON.`

function buildVisionRequest(format: string, model: string, image: string): object {
  // Extract base64 data from data URL
  const base64Data = image.replace(/^data:image\/\w+;base64,/, '')

  if (format === 'anthropic_messages') {
    return {
      model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
          { type: 'text', text: VISION_SYSTEM_PROMPT }
        ]
      }]
    }
  }

  // chat_completions format (default)
  return {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: VISION_SYSTEM_PROMPT },
        { type: 'image_url', image_url: { url: image } }
      ]
    }],
    max_tokens: 4096
  }
}

function parseVisionResponse(format: string, response: unknown): VisionApiResultData {
  let text: string

  if (format === 'anthropic_messages') {
    const anthropicResponse = response as { content?: Array<{ type?: string; text?: string }> }
    text = anthropicResponse.content?.find(c => c.type === 'text')?.text || ''
  } else {
    const openaiResponse = response as { choices?: Array<{ message?: { content?: string } }> }
    text = openaiResponse.choices?.[0]?.message?.content || ''
  }

  // Strip markdown fences if present
  let jsonText = text.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()
  }

  // Parse JSON
  const data = JSON.parse(jsonText) as VisionApiResultData

  // Validate required fields
  if (!data.zh?.prompt || !data.en?.prompt) {
    throw new Error('Missing required prompt fields in Vision API response')
  }

  return data
}

export async function callThirdPartyVisionApi(image: string): Promise<VisionApiResultData> {
  if (!API_KEY || !API_ENDPOINT) {
    throw new Error('Vision API not configured. Set VISION_API_KEY and VISION_API_ENDPOINT.')
  }

  const requestBody = buildVisionRequest(API_FORMAT, API_MODEL, image)

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Vision API error: ${response.status} - ${errorBody}`)
  }

  const data = await response.json()
  return parseVisionResponse(API_FORMAT, data)
}
```

- [ ] **Step 2: Commit vision-proxy.ts**

```bash
git add packages/web-app/lib/vision-proxy.ts
git commit -m "feat(web-app): add vision-proxy module for third-party API calls

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 创建 /api/vision/generate 路由

**Files:**
- Create: `packages/web-app/app/api/vision/generate/route.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p packages/web-app/app/api/vision/generate
```

- [ ] **Step 2: 创建 route.ts 文件**

```typescript
// packages/web-app/app/api/vision/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/lib/api-auth'
import { callThirdPartyVisionApi } from '@/lib/vision-proxy'

// Quota limits per plan
const QUOTA_LIMITS: Record<string, number> = {
  pro: 50,
  team: 200,
  free: 0
}

export async function POST(request: NextRequest) {
  // 1. Authentication check
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({
      success: false,
      error: 'NOT_LOGGED_IN'
    }, { status: 401 })
  }

  // 2. Get subscription status
  const { data: subscription, error: subError } = await auth.supabase
    .from('user_subscriptions')
    .select('plan_type, optimization_quota_used')
    .eq('user_id', auth.userId)
    .single()

  if (subError || !subscription) {
    // No subscription record = free user
    return NextResponse.json({
      success: false,
      error: 'NOT_MEMBER'
    }, { status: 403 })
  }

  // 3. Check plan type
  const planType = subscription.plan_type as keyof typeof QUOTA_LIMITS
  const limit = QUOTA_LIMITS[planType] || 0

  if (planType === 'free' || limit === 0) {
    return NextResponse.json({
      success: false,
      error: 'NOT_MEMBER'
    }, { status: 403 })
  }

  // 4. Check quota
  const used = subscription.optimization_quota_used || 0
  if (used >= limit) {
    return NextResponse.json({
      success: false,
      error: 'QUOTA_EXCEEDED',
      quota: { used, remaining: 0, limit }
    }, { status: 429 })
  }

  // 5. Parse request body
  let body: { image?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({
      success: false,
      error: 'INVALID_REQUEST'
    }, { status: 400 })
  }

  const { image } = body
  if (!image || !image.startsWith('data:image/')) {
    return NextResponse.json({
      success: false,
      error: 'INVALID_IMAGE'
    }, { status: 400 })
  }

  // 6. Call third-party Vision API
  try {
    const result = await callThirdPartyVisionApi(image)

    // 7. Deduct quota
    const { error: updateError } = await auth.supabase
      .from('user_subscriptions')
      .update({ optimization_quota_used: used + 1 })
      .eq('user_id', auth.userId)

    if (updateError) {
      console.error('[Vision API] Failed to update quota:', updateError)
      // Still return result, but log the error
    }

    // 8. Return success with quota info
    return NextResponse.json({
      success: true,
      data: result,
      quota: {
        used: used + 1,
        remaining: limit - used - 1,
        limit
      }
    })
  } catch (error) {
    console.error('[Vision API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'VISION_API_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit route.ts**

```bash
git add packages/web-app/app/api/vision/generate/route.ts
git commit -m "feat(web-app): add /api/vision/generate route for official Vision API

- Authenticates via Supabase session token
- Validates member status (Pro/Team)
- Enforces quota limits (Pro: 50, Team: 200)
- Proxies to third-party Vision API
- Deducts quota on success

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 扩展 /api/billing/status 返回

**Files:**
- Modify: `packages/web-app/app/api/billing/status/route.ts`

- [ ] **Step 1: 读取现有文件**

```bash
cat packages/web-app/app/api/billing/status/route.ts
```

- [ ] **Step 2: 修改 route.ts 添加 visionQuota 字段**

修改返回部分，在现有 `optimizationQuota` 后添加 `visionQuota`:

```typescript
// 在 return NextResponse.json({...}) 之前添加
const visionQuota = {
  available: planType !== 'free' && quotaRemaining > 0,
  used: quotaUsed,
  remaining: quotaRemaining,
  limit: planLimits[planType]
}

// 修改返回对象
return NextResponse.json({
  plan: planType,
  status: subscription?.status || 'inactive',
  currentPeriodEnd: subscription?.current_period_end,
  optimizationQuota: {
    used: quotaUsed,
    remaining: quotaRemaining,
    limit: planLimits[planType]
  },
  visionQuota  // 新增
})
```

- [ ] **Step 3: Commit 修改**

```bash
git add packages/web-app/app/api/billing/status/route.ts
git commit -m "feat(web-app): add visionQuota to billing status response

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2: Shared 类型扩展

### Task 4: 扩展 vision.ts 类型定义

**Files:**
- Modify: `packages/shared/types/vision.ts`

- [ ] **Step 1: 扩展 Provider type**

找到 `Provider` 接口的 `type` 字段，修改为：

```typescript
type: 'official' | 'cn_official' | 'aggregator' | 'third_party' | 'omp_official'
```

- [ ] **Step 2: 扩展 apiFormat type**

找到 `Provider` 和 `ProviderConfig` 接口的 `apiFormat` 字段，修改为：

```typescript
apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses' | 'omp_official'
```

- [ ] **Step 3: 添加 requiresAuth 字段**

在 `Provider` 接口添加：

```typescript
requiresAuth?: boolean  // 是否需要会员登录（官方 Provider）
```

在 `ProviderConfig` 接口添加：

```typescript
requiresAuth?: boolean
```

- [ ] **Step 4: Commit 类型扩展**

```bash
git add packages/shared/types/vision.ts
git commit -m "feat(shared): add omp_official type and requiresAuth field

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 扩展 messages.ts

**Files:**
- Modify: `packages/shared/messages.ts`

- [ ] **Step 1: 添加新 MessageType**

在 `MessageType` enum 末尾添加：

```typescript
// Official Vision API
GET_VISION_QUOTA = 'GET_VISION_QUOTA',           // 获取 Vision 额度状态
ACTIVATE_OFFICIAL_CONFIG = 'ACTIVATE_OFFICIAL_CONFIG', // 激活官方配置
```

- [ ] **Step 2: Commit messages.ts**

```bash
git add packages/shared/messages.ts
git commit -m "feat(shared): add GET_VISION_QUOTA and ACTIVATE_OFFICIAL_CONFIG message types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 更新 providers.json

**Files:**
- Modify: `packages/extension/src/data/providers.json`

- [ ] **Step 1: 在 providers 数组开头添加官方 Provider**

```json
{
  "name": "Oh My Prompt 官方",
  "nameCn": "Oh My Prompt 官方",
  "type": "omp_official",
  "websiteUrl": "https://oh-my-prompt.com",
  "apiKeyUrl": "https://oh-my-prompt.com/subscription",
  "apiEndpoint": "https://oh-my-prompt.com/api/vision",
  "apiFormat": "omp_official",
  "models": [
    { "id": "auto", "visionCapable": true }
  ],
  "icon": "omp",
  "iconColor": "#00B4D8",
  "requiresAuth": true
}
```

- [ ] **Step 2: 更新 metadata**

修改 `metadata.totalProviders` 增加 1，并在 `categories` 添加：

```json
"omp_official": "Oh My Prompt official Vision API service (requires membership)"
```

- [ ] **Step 3: Commit providers.json**

```bash
git add packages/extension/src/data/providers.json
git commit -m "feat(extension): add Oh My Prompt official Vision provider

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 修改 provider-data.ts 支持官方类型

**Files:**
- Modify: `packages/extension/src/lib/provider-data.ts`

- [ ] **Step 1: 更新 SUPPORTED_FORMATS**

将 `SUPPORTED_FORMATS` 修改为：

```typescript
const SUPPORTED_FORMATS = ['anthropic_messages', 'chat_completions', 'openai_responses', 'omp_official'] as const
```

- [ ] **Step 2: 更新 mapProviderType**

在 `typeMap` 中添加：

```typescript
'omp_official': 'omp_official'
```

- [ ] **Step 3: 更新 groupProvidersByType**

在 `groupDefinitions` 数组开头添加：

```typescript
{ type: 'omp_official', label: '官方服务', labelEn: 'Official', order: 0 }
```

- [ ] **Step 4: Commit provider-data.ts**

```bash
git add packages/extension/src/lib/provider-data.ts
git commit -m "feat(extension): support omp_official provider type and format

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3: Extension API 调用层

### Task 8: 修改 vision-api.ts 添加官方 API 调用

**Files:**
- Modify: `packages/extension/src/lib/vision-api.ts`

- [ ] **Step 1: 导入 WEB_APP_URL 和 getSupabaseClient**

在文件顶部添加导入：

```typescript
import { WEB_APP_URL } from '@/lib/config'
import { getSupabaseClient } from '@/lib/cloud-sync/supabase-client'
```

- [ ] **Step 2: 添加 executeOfficialVisionApiCall 函数**

在文件末尾（`classifyApiError` 函数之前）添加：

```typescript
/**
 * Execute Vision API call using official Oh My Prompt service.
 * Uses Supabase session token for authentication.
 */
async function executeOfficialVisionApiCall(
  imageData: string,
  signal?: AbortSignal
): Promise<VisionApiResultData> {
  // 1. Get Supabase session token
  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('NOT_LOGGED_IN: 请先登录')
  }

  // 2. Validate image data
  if (!imageData.startsWith('data:image/')) {
    throw new Error('Image must be a valid data URL')
  }

  // 3. Call official API
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      throw new DOMException('Aborted before API call', 'AbortError')
    }
    signal.addEventListener('abort', () => abortController.abort())
  }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/vision/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ image: imageData }),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const result = await response.json()

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Vision API returned invalid response')
    }

    return result.data as VisionApiResultData
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }
    throw error
  }
}
```

- [ ] **Step 3: 修改 executeVisionApiCallWithProviderConfig**

修改函数，在开头添加官方 API 检测逻辑：

```typescript
export async function executeVisionApiCallWithProviderConfig(
  imageData: string,
  format: 'url' | 'base64' = 'base64',
  signal?: AbortSignal
): Promise<VisionApiResultData> {
  const config = await getActiveProviderConfig()
  if (!config) {
    throw new Error('NO_CONFIG: 请先配置 Vision API')
  }

  // Official API: use session token authentication
  if (config.apiFormat === 'omp_official') {
    return executeOfficialVisionApiCall(imageData, signal)
  }

  // Third-party API: use API key authentication (existing logic)
  // SECURITY: Validate endpoint starts with https://
  ...
```

- [ ] **Step 4: Commit vision-api.ts**

```bash
git add packages/extension/src/lib/vision-api.ts
git commit -m "feat(extension): add official Vision API call support

- New executeOfficialVisionApiCall() using Supabase session token
- Modified executeVisionApiCallWithProviderConfig() to detect omp_official format

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4: Extension UI

### Task 9: 创建 CollapsibleSection 组件

**Files:**
- Create: `packages/extension/src/popup/components/CollapsibleSection.tsx`

- [ ] **Step 1: 创建 CollapsibleSection.tsx**

```typescript
// packages/extension/src/popup/components/CollapsibleSection.tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  defaultExpanded?: boolean
  hint?: string
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  hint,
  children
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header - clickable to toggle */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          <h3 className={`font-medium ${expanded ? 'text-gray-900' : 'text-gray-700'}`}>
            {title}
          </h3>
        </div>
        {hint && !expanded && (
          <span className="text-xs text-gray-500">{hint}</span>
        )}
      </div>

      {/* Content - only show when expanded */}
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit CollapsibleSection.tsx**

```bash
git add packages/extension/src/popup/components/CollapsibleSection.tsx
git commit -m "feat(extension): add CollapsibleSection component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 创建 OfficialVisionCard 组件

**Files:**
- Create: `packages/extension/src/popup/components/OfficialVisionCard.tsx`

- [ ] **Step 1: 创建 OfficialVisionCard.tsx**

```typescript
// packages/extension/src/popup/components/OfficialVisionCard.tsx
import { Star, ExternalLink } from 'lucide-react'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

interface OfficialVisionCardProps {
  authState: CloudAuthState | null
  isActive: boolean
  onActivate: () => void
  onLogin: () => void
  onUpgrade: () => void
}

export function OfficialVisionCard({
  authState,
  isActive,
  onActivate,
  onLogin,
  onUpgrade
}: OfficialVisionCardProps) {
  const { status, subscription } = authState || {}

  // State: not logged in
  if (status === 'not_logged_in') {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <span className="text-sm text-red-500 flex items-center gap-1">
            需要登录
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-3">会员专享 Vision API，无需配置 API Key</p>
        <button
          onClick={onLogin}
          className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition"
        >
          登录后使用
        </button>
      </div>
    )
  }

  // State: logged in but not member
  if (!subscription || subscription.plan === 'free') {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <span className="text-sm text-yellow-600 flex items-center gap-1">
            需要升级
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-3">会员专享 Vision API，无需配置 API Key</p>
        <button
          onClick={onUpgrade}
          className="w-full py-2.5 rounded-md font-medium text-sm bg-yellow-500/10 text-yellow-700 border border-yellow-500/30 hover:bg-yellow-500/20 transition"
        >
          升级 Pro 会员
        </button>
      </div>
    )
  }

  // Get quota info from subscription
  const quota = subscription.quota || { remaining: 0, limit: 50 }
  const plan = subscription.plan
  const isPro = plan === 'pro'
  const isTeam = plan === 'team'

  // Badge color
  const badgeClass = isTeam
    ? 'bg-gradient-to-r from-purple-400 to-purple-600 text-white'
    : 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900'

  // State: quota exhausted
  if (quota.remaining <= 0) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
              {isTeam ? 'Team' : 'Pro'}
            </span>
            <span className="text-sm text-red-500">0/{quota.limit} 次</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">本月额度已用完，下月自动恢复</p>
        <button
          disabled
          className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-100 text-gray-400 cursor-not-allowed"
        >
          额度已耗尽
        </button>
        <p className="text-xs text-center mt-2">
          <a
            href="https://oh-my-prompt.com/subscription"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-500 underline inline-flex items-center gap-1"
          >
            升级 Team 获取更多额度 <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>
    )
  }

  // State: active member with quota
  return (
    <div className={`p-4 rounded-lg border ${isActive ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Oh My Prompt 官方</h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
            {isTeam ? 'Team' : 'Pro'}
          </span>
          <span className="text-sm text-gray-500">
            剩余 <span className="text-cyan-500 font-medium">{quota.remaining}</span>/{quota.limit} 次
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-3">会员专享 Vision API，无需配置 API Key</p>
      <button
        onClick={onActivate}
        className={`w-full py-2.5 rounded-md font-medium text-sm transition ${
          isActive
            ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900'
            : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
        }`}
      >
        {isActive ? (
          <span className="flex items-center justify-center gap-1">
            <Star className="w-4 h-4 fill-current" />
            已激活
          </span>
        ) : (
          '切换到此配置'
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit OfficialVisionCard.tsx**

```bash
git add packages/extension/src/popup/components/OfficialVisionCard.tsx
git commit -m "feat(extension): add OfficialVisionCard component

Displays member status, quota, and activation controls

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 重构 VisionSection.tsx

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/VisionSection.tsx`

- [ ] **Step 1: 添加新导入**

在文件顶部添加：

```typescript
import { getAuthState } from '@/lib/cloud-sync/auth-service'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'
import { OfficialVisionCard } from '@/popup/components/OfficialVisionCard'
import { CollapsibleSection } from '@/popup/components/CollapsibleSection'
```

- [ ] **Step 2: 添加新状态变量**

在 `VisionSection` 函数内添加：

```typescript
// Official Vision API state
const [authState, setAuthState] = useState<CloudAuthState | null>(null)
const [officialConfigId] = useState('omp-official-default')  // Fixed ID for official config

// Load auth state on mount
useEffect(() => {
  getAuthState().then(setAuthState)
}, [])
```

- [ ] **Step 3: 添加官方配置激活函数**

在 `handleDeleteConfirm` 后添加：

```typescript
const handleActivateOfficial = async () => {
  setLoading(true)
  try {
    // Create or activate official config
    const response = await chrome.runtime.sendMessage({
      type: MessageType.SET_ACTIVE_CONFIG,
      payload: { id: officialConfigId }
    })

    if (response.success) {
      setActiveConfigId(officialConfigId)
      setSuccess('已激活官方 Vision API')
    } else {
      // If config doesn't exist, create it first
      const createResponse = await chrome.runtime.sendMessage({
        type: MessageType.ADD_PROVIDER_CONFIG,
        payload: {
          id: officialConfigId,
          providerId: 'oh-my-prompt-official',
          providerName: 'Oh My Prompt 官方',
          apiKey: '',  // No API key for official
          apiEndpoint: WEB_APP_URL + '/api/vision',
          apiFormat: 'omp_official',
          selectedModel: 'auto',
          isCustom: false,
          requiresAuth: true
        }
      })

      if (createResponse.success) {
        setActiveConfigId(officialConfigId)
        setSuccess('已激活官方 Vision API')
        await loadConfigs()
      } else {
        setError(createResponse.error || '激活失败')
      }
    }
  } catch (err) {
    setError('激活失败')
  } finally {
    setLoading(false)
  }
}

const handleLogin = () => {
  // Navigate to login view or open web app
  window.open(WEB_APP_URL + '/auth/login', '_blank')
}

const handleUpgrade = () => {
  window.open(WEB_APP_URL + '/subscription', '_blank')
}
```

需要添加 WEB_APP_URL 导入：

```typescript
import { WEB_APP_URL } from '@/lib/config'
```

- [ ] **Step 4: 重构 return 部分**

修改 `return` 部分，将官方卡片置于功能开关后，第三方配置改为折叠：

```typescript
return (
  <div className="w-full space-y-4 p-4">
    {/* Feature Toggle (existing) */}
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      ...
    </div>

    {/* Intro for first-time users (existing) */}
    {configs.length === 0 && visionEnabled && (
      ...
    )}

    {/* Official Vision API Card (new) */}
    {visionEnabled && (
      <OfficialVisionCard
        authState={authState}
        isActive={activeConfigId === officialConfigId}
        onActivate={handleActivateOfficial}
        onLogin={handleLogin}
        onUpgrade={handleUpgrade}
      />
    )}

    {/* Third-party API Configuration (collapsible) */}
    {visionEnabled && (
      <CollapsibleSection
        title="第三方 API 配置"
        defaultExpanded={false}
        hint={configs.length > 0 ? `已有 ${configs.length} 个配置` : undefined}
      >
        {/* Tabs (existing) */}
        <Tabs defaultValue="quick">
          ...
        </Tabs>

        {/* Error/Success messages */}
        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        {success && <p className="text-sm text-green-600 mt-4">{success}</p>}

        {/* Saved configs */}
        <SavedConfigsList
          configs={configs.filter(c => c.apiFormat !== 'omp_official')}
          activeConfigId={activeConfigId}
          onActivate={handleActivate}
          onDelete={handleDeleteClick}
          onEdit={handleEdit}
        />

        {/* Hint */}
        <div className="text-xs text-gray-500 pt-4 border-t border-gray-100 mt-4">
          <p>所有配置仅存储在本地</p>
        </div>
      </CollapsibleSection>
    )}

    {/* Disabled state hint (existing) */}
    {!visionEnabled && (
      ...
    )}

    {/* Dialogs (existing) */}
    ...
  </div>
)
```

- [ ] **Step 5: Commit VisionSection.tsx**

```bash
git add packages/extension/src/sidepanel/settings/VisionSection.tsx
git commit -m "feat(extension): integrate OfficialVisionCard into VisionSection

- Add auth state loading
- Add official config activation handler
- Third-party section now collapsible
- Filter out official config from saved configs list

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: 修改 ConfigCard 支持官方配置样式

**Files:**
- Modify: `packages/extension/src/popup/components/ConfigCard.tsx`

- [ ] **Step 1: 添加官方配置检测**

在 `ConfigCard` 函数开头添加：

```typescript
const isOfficial = config.apiFormat === 'omp_official'
```

- [ ] **Step 2: 修改样式和内容显示**

修改卡片样式：

```typescript
<div className={`p-3 border rounded-lg ${
  isActive
    ? isOfficial
      ? 'border-cyan-400 bg-cyan-50'
      : 'border-green-500 bg-green-50'
    : 'border-gray-200 bg-white'
}`}>
```

- [ ] **Step 3: 添加官方配置特殊内容**

修改内容区域：

```typescript
<div className="flex-1 min-w-0">
  <div className="flex items-center gap-2">
    {isActive && (
      <Star className={`w-4 h-4 ${isOfficial ? 'text-cyan-500 fill-cyan-500' : 'text-green-600 fill-green-600'}`} />
    )}
    <h3 className="text-sm font-medium text-gray-900 truncate">
      {config.providerName}
    </h3>
    {isOfficial && config.requiresAuth && (
      <span className="bg-gradient-to-r from-cyan-400 to-cyan-500 text-gray-900 px-1.5 py-0.5 rounded text-xs font-semibold">
        Pro
      </span>
    )}
  </div>
  <p className="text-xs text-gray-500 mt-1 truncate">
    {isOfficial ? '自动模型 · 无需 API Key' : config.selectedModel}
  </p>
  <p className="text-xs text-gray-400 mt-0.5">
    {isOfficial ? '官方服务' : new Date(config.configuredAt).toLocaleDateString()}
  </p>
</div>
```

- [ ] **Step 4: 隐藏官方配置的编辑/删除按钮**

修改按钮区域：

```typescript
<div className="flex items-center gap-1">
  {!isActive && !isOfficial && (
    <Button ... />
  )}
  {!isOfficial && (
    <Button variant="ghost" size="sm" onClick={onEdit} ... />
    <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 px-2 text-red-500 hover:text-red-600" ... />
  )}
</div>
```

- [ ] **Step 5: Commit ConfigCard.tsx**

```bash
git add packages/extension/src/popup/components/ConfigCard.tsx
git commit -m "feat(extension): support official config special styling in ConfigCard

- Cyan border/background for official configs
- Show Pro badge
- Hide edit/delete buttons for official configs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5: 测试与验证

### Task 13: 手动测试官方 Vision API 流程

- [ ] **Step 1: 启动开发环境**

```bash
# Web App
cd packages/web-app && npm run dev

# Extension
cd packages/extension && npm run dev
```

- [ ] **Step 2: 在 Chrome 加载插件**

打开 `chrome://extensions`，加载 `packages/extension/dist`

- [ ] **Step 3: 测试未登录状态**

1. 打开 sidepanel → Vision 设置
2. 验证官方卡片显示"需要登录"
3. 点击登录按钮，验证打开 web app 登录页

- [ ] **Step 4: 测试非会员状态**

1. 登录但不购买会员
2. 验证官方卡片显示"需要升级"
3. 点击升级按钮，验证打开订阅页

- [ ] **Step 5: 测试会员状态**

1. 使用 Pro 或 Team 会员账号登录
2. 验证官方卡片显示徽章 + 额度
3. 点击激活按钮
4. 在任意页面悬停图片，点击 Vision 按钮
5. 验证图片转提示词成功
6. 验证额度扣除

- [ ] **Step 6: 测试额度耗尽状态**

模拟额度用完（手动修改数据库或调用多次）
验证显示"额度已耗尽"和升级链接

---

### Task 14: 提交最终代码

- [ ] **Step 1: 确认所有更改已提交**

```bash
git status
```

- [ ] **Step 2: 推送到远程**

```bash
git push origin v2.0.0
```

---

**计划完成。实现顺序总结：**

| Phase | 内容 | Tasks |
|-------|------|-------|
| 1 | Web App 后端 API | Task 1-3 |
| 2 | Shared 类型扩展 | Task 4-7 |
| 3 | Extension API 调用层 | Task 8 |
| 4 | Extension UI | Task 9-12 |
| 5 | 测试验证 | Task 13-14 |

---

**执行选项：**

1. **Subagent-Driven (推荐)** — 每个任务派发独立 subagent，任务间审查，快速迭代

2. **Inline Execution** — 在当前 session 中逐任务执行，批量执行带检查点

选择哪种方式？