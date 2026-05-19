---
name: cloud-sync-login-refactor
description: Extension侧边栏登录统一跳转Web App，简化认证流程并实现Session共享
type: project
---

# 云端同步登录重构设计

## Why

当前Extension侧边栏的登录流程复杂：用户需要点击登录按钮，弹出AuthModal，然后在Modal中点击GitHub OAuth，打开新tab完成授权。这种设计有以下问题：

1. **多步骤交互**：Modal + OAuth tab切换，体验不流畅
2. **维护成本**：Extension需要维护完整的AuthModal组件和OAuth逻辑
3. **Session隔离**：Extension和Web App的登录状态独立，无法共享

通过统一跳转Web App登录，可以：
- 简化Extension代码（移除AuthModal）
- 实现Session共享（Web登录后，Extension自动读取cookie session）
- 提升用户体验（单一登录入口，流程更清晰）

## How to apply

当用户在Extension侧边栏点击"登录"按钮时，直接打开Web App的 `/auth/extension/sync` 页面。如果用户未登录，自动重定向到 `/auth/login`，登录成功后返回sync页面，将tokens通过URL hash传递给Extension。

这个设计适用于所有Extension的登录入口（SyncStatusCard、BackupSection等）。

---

## Architecture Overview

### Core Changes

**Extension侧：**
- **移除**: `AuthModal.tsx` 组件（不再需要弹出登录框）
- **修改**: 所有登录按钮 → 直接打开Web App URL
  - `SyncStatusCard.tsx`
  - `BackupSection.tsx`（如有登录入口）

**Web App侧：**
- **重构**: `/auth/extension/sync` 从 `route.ts` 改为 `page.tsx`
  - 原因：需要client-side重定向逻辑
- **新增**: `/auth/login` 支持redirect参数
  - 登录成功后重定向回指定页面
- **保持**: token传递机制（URL hash方式不变）

### Authentication Flow

**旧流程：**
```
Extension AuthModal → signInWithOAuth() → GitHub OAuth →
/auth/extension/callback → tokens in hash → Extension存储
```

**新流程：**
```
Extension按钮 → /auth/extension/sync →
未登录重定向 → /auth/login?redirect=/auth/extension/sync →
GitHub OAuth → /auth/callback → 重定向回sync →
tokens in hash → Extension存储
```

### Key Design Decisions

1. **保持现有hash传递机制**
   - 已验证稳定，避免新增安全风险（tokens通过API传输）

2. **改成page组件**
   - route.ts是server-only，无法实现client重定向
   - page可以检测登录状态并触发重定向

---

## Component Changes

### Extension Changes

#### AuthModal.tsx
- **删除**: 整个组件
- 不再需要弹出式OAuth登录UI

#### SyncStatusCard.tsx
- **移除**: AuthModal导入和状态
- **修改**: 登录按钮改为直接打开Web URL

```typescript
// 新的handleLogin实现
const handleLogin = () => {
  chrome.tabs.create({ url: WEB_APP_URL + '/auth/extension/sync' })
}
```

#### BackupSection.tsx
- **检查**: 是否有登录入口
- **如有**: 同样改为打开Web URL

#### auth-service.ts
- **保留**: `syncFromWebApp()` 函数（可能用于其他场景）
- **可选删除**: `signInWithOAuth()` 函数（不再需要Extension侧OAuth）

### Web App Changes

#### 新建: `/app/auth/extension/sync/page.tsx`

```typescript
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'

export default function ExtensionSyncPage() {
  const supabase = createBrowserClient()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        // 未登录 → 重定向到login
        const currentUrl = window.location.pathname
        window.location.href = `/auth/login?redirect=${encodeURIComponent(currentUrl)}`
        return
      }

      // 已登录 → 设置tokens in hash
      const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in
      const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&expires_at=${expiresAt}&token_type=bearer`

      window.location.hash = hash
      setStatus('success')

      console.log('[Extension Sync] Tokens set in hash')
    } catch (err) {
      console.error('[Extension Sync] Session check failed:', err)
      setStatus('error')
    }
  }

  // UI渲染（参考现有route.ts的HTML）
  return (
    <div className="min-h-screen bg-[#0e0e10] flex flex-col justify-center items-center">
      {status === 'loading' && <LoadingUI />}
      {status === 'success' && <SuccessUI />}
      {status === 'error' && <ErrorUI />}
    </div>
  )
}
```

#### 修改: `/app/auth/login/page.tsx`

```typescript
'use client'

import { useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')

  const handleLoginSuccess = () => {
    // 登录成功后的重定向逻辑
    window.location.href = redirect || '/dashboard'
  }

  // 现有登录逻辑...
}
```

**注意**: 需要在OAuth回调处理中传递redirect参数。

#### 删除: `/app/auth/extension/sync/route.ts`
- 功能已迁移到page.tsx

---

## Data Flow & Error Handling

### Complete Authentication Flow (Sequence)

```
1. User点击Extension登录按钮
2. Extension: chrome.tabs.create({ url: '/auth/extension/sync' })
3. Web App: 检查session
4. Web App: 未登录 → 重定向到 /auth/login?redirect=/auth/extension/sync
5. User: 在login页完成GitHub OAuth
6. GitHub: OAuth授权
7. GitHub: 重定向到 /auth/callback
8. Web App: 设置cookie session
9. Web App: 重定向到 /auth/extension/sync (通过redirect参数)
10. Web App: 检查session(已登录)
11. Web App: 设置tokens in URL hash
12. Extension: content script检测hash变化
13. Extension: 提取tokens并保存到chrome.storage
14. Extension: 显示登录成功
```

### URL Parameter Passing

- `/auth/login?redirect=/auth/extension/sync` - 告诉login页面登录后去哪
- `/auth/extension/sync#access_token=xxx&refresh_token=yyy...` - tokens传递给Extension

### Error Handling Scenarios

#### Scenario 1: 用户关闭登录页面
- Extension不会收到任何回调
- 用户下次点击登录按钮重新开始流程
- **处理**: 无需特殊处理，现有机制已覆盖

#### Scenario 2: OAuth失败
- `/auth/callback` 处理错误（现有机制）
- 显示错误页面，用户手动关闭
- **处理**: 保持现有错误处理逻辑

#### Scenario 3: 重定向参数丢失
- `/auth/login` 检查redirect参数有效性
- 无效或缺失 → 默认重定向到 `/dashboard`
- **处理**: 参数验证和默认值

#### Scenario 4: Extension未正确接收tokens
- 现有超时机制（60秒）
- content script轮询检测hash
- 超时后显示错误提示
- **处理**: 保持现有超时机制

---

## Testing Strategy

### Manual Test Scenarios

#### 1. 未登录用户首次登录
- Extension点击登录 → 打开Web → 重定向到login → 完成OAuth → 重定向回sync → Extension收到tokens
- **验证**: Extension侧边栏显示登录状态，可以同步数据

#### 2. 已登录用户再次登录
- Extension点击登录 → 打开Web sync页面 → 直接返回tokens → Extension收到tokens
- **验证**: 无需重新OAuth，直接同步成功

#### 3. 登录中途关闭页面
- Extension点击登录 → 打开Web → 用户关闭tab → Extension无变化
- **验证**: Extension保持未登录状态，无错误

#### 4. OAuth失败
- Extension点击登录 → Web login → GitHub授权失败 → 显示错误页面
- **验证**: 错误页面正确显示，Extension保持未登录状态

#### 5. Session过期后重新登录
- Extension点击登录 → Web sync检测session过期 → 重定向到login → 重新OAuth
- **验证**: 重新认证流程正常

### Automated Testing (Optional)

- **Extension**: 测试登录按钮是否正确打开Web URL（单元测试）
- **Web App**: 测试redirect参数传递和重定向逻辑（单元测试）
- **Integration**: 测试完整认证链路（Playwright E2E）

---

## Migration Strategy

### Data Migration

**无需数据迁移:**
- 用户数据不受影响
- 已登录用户的session依然有效
- 只改变认证入口方式，不改变token存储格式

### User Notification (Optional)

可以在Extension更新日志中说明：
- "登录方式优化：统一在Web端登录，体验更流畅"

### Rollback Plan

如果新流程有问题，可以快速回滚：
1. 恢复AuthModal组件
2. 恢复sync/route.ts
3. 恢复登录按钮的OAuth调用逻辑

---

## Future Enhancements (Optional)

### 1. 自动检测Web登录状态

Extension定期调用 `/api/auth/check`，如果Web已登录，提示用户"点击同步"按钮。

### 2. 登录状态双向同步

- Web登录 → Extension自动同步
- Extension登出 → Web同步登出

---

## UX Enhancement Requirements

### 上下文引导原则

用户在任何页面跳转后，应能在3秒内理解：
- **我在哪里** — 页面标识（Extension logo、标题）
- **我为什么在这里** — 简短说明文案
- **下一步做什么** — 明确引导

---

### Web Sync页面 UI设计

#### 页面结构

```tsx
// /app/auth/extension/sync/page.tsx 的完整UI设计

export default function ExtensionSyncPage() {
  // ... 状态逻辑 ...

  return (
    <div className="min-h-screen bg-[#0e0e10] flex flex-col justify-center items-center p-8">
      {/* 页面标识 — 让用户知道这是为Extension服务的 */}
      <ExtensionLogo className="w-16 h-16 mb-6 opacity-80" />

      {/* Loading状态 */}
      {status === 'loading' && (
        <div className="text-center">
          <Spinner className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">
            正在同步云端账户
          </h1>
          <p className="text-gray-400 text-sm">
            请稍候，完成后请返回扩展侧边栏
          </p>
        </div>
      )}

      {/* 成功状态 — 引导用户完成闭环 */}
      {status === 'success' && (
        <div className="text-center">
          <CheckCircleIcon className="w-12 h-12 text-green-500 mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">
            同步成功
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            您的账户已同步到Chrome扩展，请返回侧边栏开始使用云端同步功能
          </p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            关闭此页面
          </button>
        </div>
      )}

      {/* 错误状态 */}
      {status === 'error' && (
        <div className="text-center">
          <AlertCircleIcon className="w-12 h-12 text-red-500 mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">
            同步失败
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            请返回扩展侧边栏重新尝试，或检查网络连接
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            重新尝试
          </button>
        </div>
      )}
    </div>
  )
}
```

#### 设计要点

1. **Extension Logo** — 页面顶部显示，让用户立刻识别"这是Extension相关页面"
2. **状态文案** — 每个状态都有清晰的标题+说明
3. **成功引导** — 明确告诉用户"返回侧边栏"并提供关闭按钮
4. **错误恢复** — 提供重新尝试按钮

---

### Extension按钮文案设计

#### 状态感知按钮

根据Web端登录状态和Extension同步状态，动态显示不同文案：

| Web状态 | Extension状态 | 按钮文案 | 按钮样式 |
|---------|---------------|----------|----------|
| 未登录 | 未同步 | "登录以启用云端同步" | 主要按钮 (蓝色) |
| 已登录 | 未同步 | "同步云端账户" | 次要按钮 (灰色) |
| 已登录 | 已同步 | "云端已同步 ✓" | 状态标签 (非按钮) |
| Session过期 | - | "重新登录" | 主要按钮 (蓝色) |

#### 实现方式

```tsx
// SyncStatusCard.tsx 中的按钮逻辑

const getButtonText = (webLoggedIn: boolean, extensionSynced: boolean) => {
  if (!webLoggedIn) return '登录以启用云端同步'
  if (!extensionSynced) return '同步云端账户'
  return '云端已同步 ✓'
}

const getButtonStyle = (webLoggedIn: boolean, extensionSynced: boolean) => {
  if (extensionSynced) return 'status-label' // 非按钮，灰色状态标签
  if (!webLoggedIn) return 'primary' // 蓝色主要按钮
  return 'secondary' // 灰色次要按钮
}
```

---

### Extension同步反馈Toast

#### 同步过程反馈

当用户从Web返回Extension时，显示同步状态toast：

```tsx
// 在Extension sidepanel中监听同步完成事件

useEffect(() => {
  const handleSyncComplete = () => {
    toast.success('云端同步已启用', {
      duration: 3000,
      action: {
        label: '查看',
        onClick: () => navigateToSyncSettings()
      }
    })
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SYNC_COMPLETE') {
      handleSyncComplete()
    }
  })
}, [])
```

#### Toast设计

- **成功:** "云端同步已启用 ✓" + "查看"按钮跳转到设置
- **失败:** "同步失败，请重试" + "重试"按钮
- **进行中:** 可选显示"正在同步..."，但避免过多干扰

---

### Web页面跳转说明

#### Login页面添加来源提示

如果用户从Extension跳转到login页面，显示来源提示：

```tsx
// /app/auth/login/page.tsx

const isFromExtension = searchParams.get('source') === 'extension'

// 在页面顶部或登录按钮附近显示
{isFromExtension && (
  <div className="text-center mb-4">
    <ExtensionLogo className="w-8 h-8 inline mr-2 opacity-60" />
    <span className="text-gray-400 text-sm">
      为Chrome扩展登录以启用云端同步
    </span>
  </div>
)}
```

#### URL参数传递

跳转到login时添加source参数：

```
/auth/login?redirect=/auth/extension/sync&source=extension
```

---

### 改进后的完整用户流程

```
1. 用户在Extension侧边栏看到状态感知按钮
   └────────────────────────────────────┐
   │ [同步云端账户] ← 灰色次要按钮       │
   │ (Web已登录但Extension未同步)       │
   └────────────────────────────────────┘

2. 点击按钮 → 新Tab打开Web sync页面
   ┌────────────────────────────────────┐
   │  [Extension Logo]                  │
   │                                    │
   │  正在同步云端账户...               │
   │  [Spinner]                         │
   │                                    │
   │  请稍候，完成后请返回扩展侧边栏     │
   └────────────────────────────────────┘

3a. 未登录 → 自动跳转login (带source=extension提示)
    ┌────────────────────────────────────┐
    │  [Extension Logo]                  │
    │  为Chrome扩展登录以启用云端同步     │
    │                                    │
    │  [GitHub] [Google] 登录按钮        │
    └────────────────────────────────────┘
    → 完成OAuth → 返回sync → 显示成功

3b. 已登录 → 直接显示成功
    ┌────────────────────────────────────┐
    │  [Extension Logo]                  │
    │                                    │
    │  ✓ 同步成功                        │
    │                                    │
    │  您的账户已同步到Chrome扩展         │
    │  请返回侧边栏开始使用云端同步功能   │
    │                                    │
    │  [关闭此页面]                      │
    └────────────────────────────────────┘

4. 用户关闭tab，切回Extension侧边栏

5. Extension显示toast: "云端同步已启用 ✓"
   ┌────────────────────────────────────┐
   │  [Toast] 云端同步已启用 ✓ [查看]   │
   └────────────────────────────────────┘

6. 按钮状态更新为状态标签: "云端已同步 ✓"
```

---

## Implementation Priority

遵循brainstorming技能流程，下一步：调用writing-plans skill生成详细实施计划。

实施优先级：
1. **P0:** Web sync页面UI改进（上下文文案、成功引导）
2. **P0:** Extension按钮状态感知文案
3. **P1:** Extension同步完成Toast反馈
4. **P2:** Login页面source=extension来源提示