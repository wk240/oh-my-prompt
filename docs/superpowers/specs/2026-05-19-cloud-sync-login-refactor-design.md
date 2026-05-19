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

## Implementation Priority

遵循brainstorming技能流程，下一步：调用writing-plans skill生成详细实施计划。