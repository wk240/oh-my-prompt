# 官方 Vision API 集成设计

> **需求**: 为 Oh My Prompt 插件用户提供官方 Vision API 服务，会员用户无需配置 API Key 即可使用图片转提示词功能。

## 1. 需求概览

| 项目 | 内容 |
|------|------|
| **目标用户** | Oh My Prompt 插件用户 |
| **功能** | 图片转提示词（Vision API） |
| **认证方式** | Supabase Auth（现有登录系统） |
| **会员要求** | Pro (50次/月) 或 Team (200次/月) |
| **API 来源** | 代理第三方 Vision API（后端配置，用户不感知） |
| **Provider 名称** | Oh My Prompt 官方 |

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ VisionModal │───▶│ vision-api  │───▶│ Supabase Client     │  │
│  │  (UI)       │    │  (调用层)    │    │ (session token)    │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Bearer token + base64 image
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Web App (Next.js)                         │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ /api/vision/    │───▶│ 验证会员状态    │                    │
│  │   generate      │    │ 检查额度        │                    │
│  └─────────────────┘    └─────────────────┘                    │
│           │                    │                                │
│           │                    ▼                                │
│           │         ┌─────────────────┐                         │
│           │         │ 扣除额度        │                         │
│           │         └─────────────────┘                         │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ 代理调用第三方  │───▶│ OpenAI/Claude   │                    │
│  │ Vision API      │    │ Vision API      │                    │
│  └─────────────────┘    └─────────────────┘                    │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │ 返回结构化结果  │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 数据结构

### 3.1 Provider 配置

**providers.json 新增条目**:

```json
{
  "name": "Oh My Prompt 官方",
  "nameCn": "Oh My Prompt 官方",
  "type": "omp_official",
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

**关键字段说明**:
- `type: "omp_official"` — 新类型，标识官方服务
- `apiFormat: "omp_official"` — 新格式，表示使用会员认证而非 API Key
- `requiresAuth: true` — 标记需要会员登录
- `models: [{ id: "auto" }]` — 模型由后端自动选择

### 3.2 类型扩展

**packages/shared/types/vision.ts**:

```typescript
// Provider type 新增
type ProviderType = 'official' | 'cn_official' | 'aggregator' | 'third_party' | 'omp_official'

// API format 新增
type ApiFormat = 'anthropic_messages' | 'chat_completions' | 'openai_responses' | 'omp_official'

// Provider 接口新增字段
interface Provider {
  ...
  requiresAuth?: boolean  // 是否需要会员认证
}

// ProviderConfig 接口新增字段
interface ProviderConfig {
  ...
  requiresAuth?: boolean
}
```

### 3.3 额度存储

使用 `user_subscriptions` 表现有字段 `optimization_quota_used`（已在 `/api/billing/status/route.ts` 中使用）:

```sql
-- 现有表结构已包含此字段
-- 额度限制：
-- Pro: 50 次/月
-- Team: 200 次/月  
-- Free: 0 次（不可使用）
```

## 4. API 设计

### 4.1 POST /api/vision/generate

**请求**:
```json
{
  "image": "data:image/jpeg;base64,xxx..."
}
```

**成功响应 (200)**:
```json
{
  "success": true,
  "data": {
    "zh": { "title": "...", "prompt": "...", "analysis": "..." },
    "en": { "title": "...", "prompt": "...", "analysis": "..." },
    "zh_json": { ... },
    "en_json": { ... },
    "json_prompt": { ... },
    "zh_style_tags": [...],
    "en_style_tags": [...],
    "confidence": 0.9
  },
  "quota": {
    "used": 5,
    "remaining": 45,
    "limit": 50
  }
}
```

**错误响应**:

| 状态码 | error | 说明 |
|--------|-------|------|
| 401 | NOT_LOGGED_IN | 用户未登录 |
| 403 | NOT_MEMBER | 用户是 Free 会员 |
| 429 | QUOTA_EXCEEDED | 额度已用完 |

### 4.2 GET /api/billing/status（现有，扩展返回）

新增 `visionQuota` 字段:

```json
{
  "plan": "pro",
  "status": "active",
  "optimizationQuota": {
    "used": 5,
    "remaining": 45,
    "limit": 50
  },
  "visionQuota": {  // 新增
    "available": true,
    "used": 5,
    "remaining": 45,
    "limit": 50
  }
}
```

## 5. 插件端实现

### 5.1 文件改动清单

| 文件 | 改动 |
|------|------|
| `packages/extension/src/data/providers.json` | 新增官方 Provider 条目 |
| `packages/shared/types/vision.ts` | 扩展类型定义 |
| `packages/shared/messages.ts` | 新增 MessageType |
| `packages/extension/src/lib/vision-api.ts` | 新增官方 API 调用逻辑 |
| `packages/extension/src/sidepanel/settings/VisionSection.tsx` | 重构 UI，新增官方卡片 + 折叠区域 |
| `packages/extension/src/popup/components/ConfigCard.tsx` | 支持官方配置特殊显示 |

### 5.2 vision-api.ts 核心逻辑

```typescript
// 新增函数
async function executeOfficialVisionApiCall(
  imageData: string,
  signal?: AbortSignal
): Promise<VisionApiResultData> {
  // 1. 获取 Supabase session token
  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('NOT_LOGGED_IN')
  }
  
  // 2. 调用官方 API
  const response = await fetch(`${WEB_APP_URL}/api/vision/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ image: imageData }),
    signal
  })
  
  // 3. 错误处理
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }
  
  // 4. 返回结果
  const result = await response.json()
  return result.data
}

// 修改入口函数
export async function executeVisionApiCallWithProviderConfig(...) {
  const config = await getActiveProviderConfig()
  
  if (config.apiFormat === 'omp_official') {
    return executeOfficialVisionApiCall(imageData, signal)
  }
  
  // 现有第三方逻辑
  return executeThirdPartyVisionApiCall(...)
}
```

### 5.3 VisionSection.tsx UI 结构

```typescript
return (
  <div className="w-full space-y-4 p-4">
    {/* 功能开关（现有） */}
    <FeatureToggle />
    
    {/* 官方 Provider 卡片（新增） */}
    <OfficialVisionCard 
      authState={authState}
      isActive={activeConfigId === OFFICIAL_CONFIG_ID}
      onActivate={handleActivateOfficial}
    />
    
    {/* 第三方配置区域（改为可折叠） */}
    <CollapsibleSection
      title="第三方 API 配置"
      defaultExpanded={false}
      hint={configs.length > 0 ? `已有 ${configs.length} 个配置` : undefined}
    >
      {/* 现有 Tabs + SavedConfigsList */}
    </CollapsibleSection>
    
    {/* Dialogs（现有） */}
  </div>
)
```

### 5.4 OfficialVisionCard 组件

```typescript
function OfficialVisionCard({ authState, isActive, onActivate }) {
  const { status, subscription } = authState || {}
  
  // 未登录
  if (status === 'not_logged_in') {
    return (
      <Card>
        <Title>Oh My Prompt 官方</Title>
        <Status>需要登录</Status>
        <Button onClick={openLogin}>登录后使用</Button>
      </Card>
    )
  }
  
  // 非会员
  if (!subscription || subscription.plan === 'free') {
    return (
      <Card>
        <Title>Oh My Prompt 官方</Title>
        <Status>需要升级</Status>
        <Button onClick={openUpgrade}>升级 Pro 会员</Button>
      </Card>
    )
  }
  
  // 额度耗尽
  if (subscription.quota?.remaining <= 0) {
    return (
      <Card>
        <Title>Oh My Prompt 官方</Title>
        <Badge>{subscription.plan}</Badge>
        <Quota>0/{subscription.quota.limit} 次</Quota>
        <Button disabled>额度已耗尽</Button>
        <Link>升级 Team 获取更多额度</Link>
      </Card>
    )
  }
  
  // 正常状态
  return (
    <Card isActive={isActive}>
      <Title>Oh My Prompt 官方</Title>
      <Badge>{subscription.plan}</Badge>
      <Quota>剩余 {subscription.quota.remaining}/{subscription.quota.limit} 次</Quota>
      <Button onClick={onActivate}>
        {isActive ? '已激活' : '切换到此配置'}
      </Button>
    </Card>
  )
}
```

## 6. Web App 后端实现

### 6.1 文件改动清单

| 文件 | 改动 |
|------|------|
| `packages/web-app/app/api/vision/generate/route.ts` | 新建 API 路由 |
| `packages/web-app/lib/vision-proxy.ts` | 新建代理调用模块 |
| `packages/web-app/app/api/billing/status/route.ts` | 扩展返回 visionQuota |
| `packages/web-app/.env.local` | 新增 VISION_API_* 环境变量 |

### 6.2 /api/vision/generate 实现

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/lib/api-auth'
import { callThirdPartyVisionApi } from '@/lib/vision-proxy'

export async function POST(request: NextRequest) {
  // 1. 认证
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }
  
  // 2. 获取会员状态
  const { data: subscription } = await auth.supabase
    .from('user_subscriptions')
    .select('plan_type, optimization_quota_used')
    .eq('user_id', auth.userId)
    .single()
  
  if (!subscription || subscription.plan_type === 'free') {
    return NextResponse.json({ success: false, error: 'NOT_MEMBER' }, { status: 403 })
  }
  
  // 3. 额度检查
  const limits = { pro: 50, team: 200 }
  const limit = limits[subscription.plan_type]
  const used = subscription.optimization_quota_used || 0
  
  if (used >= limit) {
    return NextResponse.json({
      success: false,
      error: 'QUOTA_EXCEEDED',
      quota: { used, remaining: 0, limit }
    }, { status: 429 })
  }
  
  // 4. 解析图片
  const body = await request.json()
  const { image } = body
  
  if (!image || !image.startsWith('data:image/')) {
    return NextResponse.json({ success: false, error: 'INVALID_IMAGE' }, { status: 400 })
  }
  
  // 5. 代理调用
  try {
    const result = await callThirdPartyVisionApi(image)
    
    // 6. 扣除额度
    await auth.supabase
      .from('user_subscriptions')
      .update({ optimization_quota_used: used + 1 })
      .eq('user_id', auth.userId)
    
    // 7. 返回
    return NextResponse.json({
      success: true,
      data: result,
      quota: { used: used + 1, remaining: limit - used - 1, limit }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'VISION_API_ERROR',
      message: error.message
    }, { status: 500 })
  }
}
```

### 6.3 vision-proxy.ts

```typescript
const API_KEY = process.env.VISION_API_KEY!
const API_ENDPOINT = process.env.VISION_API_ENDPOINT!
const API_MODEL = process.env.VISION_API_MODEL!
const API_FORMAT = process.env.VISION_API_FORMAT || 'chat_completions'

export async function callThirdPartyVisionApi(image: string): Promise<VisionApiResultData> {
  // 根据 API_FORMAT 构建请求
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
    throw new Error(`Vision API error: ${response.status}`)
  }
  
  const data = await response.json()
  return parseVisionResponse(API_FORMAT, data)
}
```

### 6.4 环境变量

```env
# .env.local
VISION_API_KEY=sk-xxx
VISION_API_ENDPOINT=https://api.openai.com/v1/chat/completions
VISION_API_MODEL=gpt-4o
VISION_API_FORMAT=chat_completions
```

## 7. UI 原型参考

原型文件: `docs/ui-prototype-official-vision-v3.html`

关键场景:
1. 已登录 Pro 会员 — 显示徽章 + 额度 + 激活按钮
2. 第三方配置折叠 — 默认折叠，点击展开
3. 未登录 — 显示"需要登录"
4. 额度耗尽 — 显示"额度已耗尽" + 升级链接

## 8. 实现顺序

1. **Phase 1: 后端 API**
   - 新建 `/api/vision/generate` 路由
   - 新建 `vision-proxy.ts` 模块
   - 扩展 `/api/billing/status` 返回
   
2. **Phase 2: 插件类型扩展**
   - 更新 `providers.json`
   - 扩展 `vision.ts` 类型
   - 新增 `messages.ts` 类型
   
3. **Phase 3: 插件 API 调用层**
   - 修改 `vision-api.ts`
   
4. **Phase 4: 插件 UI**
   - 重构 `VisionSection.tsx`
   - 修改 `ConfigCard.tsx`
   
5. **Phase 5: 测试验证**
   - E2E 测试官方 API 流程
   - 验证额度扣除
   - 验证错误处理

## 9. 安全考量

1. **API Key 保护** — 第三方 API Key 仅存储在 Web App 后端环境变量，用户不可见
2. **Bearer Token 认证** — 插件使用 Supabase session token 调用官方 API
3. **HTTPS 强制** — 所有 API 通信必须使用 HTTPS
4. **额度限制** — 后端严格校验会员状态和额度，防止滥用
5. **日志脱敏** — API Key 不写入日志

---

**设计完成，等待用户审核后进入实现计划阶段。**