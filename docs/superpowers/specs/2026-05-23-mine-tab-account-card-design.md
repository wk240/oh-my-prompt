---
name: mine-tab-account-card
description: MineView账号卡片优化设计文档
---

# MineView 账号卡片优化设计

**日期：** 2026-05-23
**状态：** Approved
**影响范围：** `packages/extension/src/sidepanel/views/MineView.tsx`

## 背景

现有账号卡片仅显示"已登录" + planType badge，缺少账号名、邮箱展示和Web端入口。用户需要：
1. 展示真实账号名和邮箱
2. 增加进入Web端的入口
3. 优化视觉样式和布局

## 设计方案

### UI布局

```
┌─────────────────────────────────────┐
│  [N]  neo team                       │  ← 头像36px渐变 + 账号名 + badge
│       neo@example.com                │  ← 邮箱11px灰色
│                                     │
│  进入Web端 ↗        退出登录        │  ← 底部两端对齐
└─────────────────────────────────────┘
```

### 详细样式

| 元素 | 样式 |
|------|------|
| 头像 | 36px, 渐变背景(135deg, #667eea → #764ba2), 馜字母白色13px/600 |
| 账号名 | 15px/600, #111827 |
| Badge | 11px/500, #d97706, 去掉点号 |
| 邮箱 | 11px, #9ca3af |
| 进入Web端 | 11px, #6b7280, 右箭头图标10px |
| 退出登录 | 11px, #9ca3af, button |
| 容器间距 | padding 16px, gap 12px, 底部margin-top 10px |

### 交互逻辑

1. **账号名来源：** `authState.user.email?.split('@')[0]` 或 fallback "已登录"
2. **邮箱来源：** `authState.user.email`（可能不存在）
3. **头像首字母：** 账号名首字母（大写）
4. **进入Web端：** 点击跳转 `${WEB_APP_URL}/dashboard`
5. **退出登录：** 保持现有逻辑

### 未登录状态

保持原有设计：
- 灰色头像图标
- "未登录"文字
- "登录"按钮

### 数据依赖

**CloudAuthState类型（已存在）：**
```typescript
type CloudAuthState = {
  status: 'logged_in' | 'not_logged_in'
  user?: { id: string; email?: string }
  subscription?: { planType: 'free' | 'pro' | 'team'; ... }
  lastSyncAt?: number
}
```

**需确保：**
- `auth-service.ts` 返回 `user.email`
- Web端 `/api/sync/status` API 包含 `user.email`

### 实现要点

1. **头像渐变背景：** 使用CSS linear-gradient
2. **首字母提取：** `email?.split('@')[0]?.charAt(0)?.toUpperCase() || 'U'`
3. **右箭头图标：** 使用lucide-react的ArrowRight或自定义SVG
4. **两端对齐：** flex justify-between
5. **邮箱不存在时：** 不显示邮箱行，仅显示账号名 + badge

## 测试要点

1. 登录状态：账号名、邮箱、头像首字母正确显示
2. 未登录状态：保持原有UI
3. team/pro/free badge正确显示
4. 邮箱不存在时：fallback逻辑正常
5. "进入Web端"跳转正确
6. "退出登录"功能正常

## 后续优化（可选）

- 头像支持用户自定义头像URL（如果未来提供）
- 点击账号名跳转到Web端账号设置页
- 进入Web端链接支持参数传递（如source=extension）

## Why

用户需要清晰看到当前登录的账号信息，并需要便捷入口进入Web端管理账号、订阅等功能。

## How to apply

在MineView.tsx的账号状态区（402-438行）替换为新设计，保持其他功能（官方服务区、功能开关区等）不变。