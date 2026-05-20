# Web App Dashboard 重构设计文档

**日期**: 2024-03-15
**版本**: v1.0
**状态**: 已验证

---

## 概述

重构 web-app dashboard，从现有的 prompts 列表页面改为管理仪表盘，包含三个核心模块：
1. **备份数据状态** — 云端同步状态与历史记录
2. **团队管理** — 创建/管理团队、邀请成员、共享 prompts
3. **订阅管理** — 订阅状态、升级、支付历史

---

## 核心决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| 同步功能 | 云端同步（而非本地文件导入导出） | extension 已有完整云端同步实现，web-app 作为管理端 |
| 页面布局 | 多页面路由 `/dashboard/backup`, `/dashboard/team`, `/dashboard/subscription` | 按需加载、初始渲染快、数据隔离 |
| 实现方案 | 方案 B：一次性重构 | 架构统一、避免新旧混杂 |
| 设计风格 | 黑色主色调，参考 sidepanel 设置界面 | 与 extension 保持一致，用户偏好 |

---

## 路由架构

```
packages/web-app/app/dashboard/
├── layout.tsx              # Dashboard 布局（顶部 Tab 导航）
├── page.tsx                # 首页（重定向到 backup）
├── backup/
│   └── page.tsx            # 备份数据状态页面
├── team/
│   ├── page.tsx            # 团队列表页面
│   ├── [teamId]/
│   │   └── page.tsx        # 团队详情页面（成员管理、共享库）
│   └── invite/
│       └── [token]/
│           └── page.tsx    # 接受邀请页面（token 为邀请码）
└── subscription/
    └── page.tsx            # 订阅管理页面
```

**删除内容**:
- `app/dashboard/prompts/page.tsx`
- `components/dashboard/PromptCard.tsx`
- `components/dashboard/CategoryFilter.tsx`

---

## 模块详细设计

### 1. 备份数据状态 (`/dashboard/backup`)

**功能**:
- 显示 prompts/categories 条数
- 显示最后同步时间
- 同步状态指示（已同步/有未同步变更）
- 同步历史列表（时间、类型、数量）
- 上传/下载按钮

**UI 结构**:
```
┌─────────────────────────────────────┐
│  云端同步状态                         │
│  ┌─────┐ ┌─────┐ ┌─────┐            │
│  │128  │ │12   │ │最后 │            │
│  │提示词│ │分类 │ │同步 │            │
│  └─────┘ └─────┘ └─────┘            │
│  [立即上传] [下载到本地]              │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  同步历史                             │
│  2024-03-15 上传 128提示词 ✓         │
│  2024-03-10 下载 115提示词 ✓         │
└─────────────────────────────────────┘
```

**API**:
- GET `/api/sync/status` — 获取同步状态（已存在）
- GET `/api/sync/history` — 获取同步历史列表（需新增）
- POST `/api/sync/upload` — 上传数据（已存在）
- GET `/api/sync/download` — 下载数据（已存在）

---

### 2. 团队管理 (`/dashboard/team`)

**功能**:
- 团队列表展示（成员数、共享 prompts 数、角色）
- 创建团队
- 团队详情页：成员管理、共享库
- 邀请成员（链接邀请，生成邀请码，用户点击链接接受）
- 角色权限：owner / admin / member

**权限规则**:
| 角色 | 能力 |
|------|------|
| owner | 全部权限 + 删除团队 + 转移 owner |
| admin | 管理成员 + 管理共享库 |
| member | 查看 + 添加共享 prompts |

**UI 结构**:
```
团队列表页:
┌─────────────────────────────────────┐
│  我的团队              [创建团队]    │
│  ┌───────────────────────────────┐  │
│  │ 设计团队                       │  │
│  │ 5成员 · 32共享 · 角色:管理员   │  │
│  │ [A][B][C][+2]                  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 营销团队                       │  │
│  │ 3成员 · 15共享 · 角色:成员     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

团队详情页:
┌─────────────────────────────────────┐
│  设计团队                            │
│  ┌─────────────────────────────────┐│
│  │ 成员管理                         ││
│  │ [A] admin  [移除]                ││
│  │ [B] member [移除]                ││
│  │ [邀请成员]                       ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 共享提示词库                     ││
│  │ 32 个提示词                      ││
│  │ [添加到共享]                     ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**API（需新增）**:
- GET `/api/teams` — 获取用户所属团队列表
- POST `/api/teams` — 创建团队
- GET `/api/teams/[teamId]` — 获取团队详情
- PUT `/api/teams/[teamId]` — 更新团队信息
- DELETE `/api/teams/[teamId]` — 删除团队
- POST `/api/teams/[teamId]/members` — 邀请成员
- DELETE `/api/teams/[teamId]/members/[userId]` — 移除成员
- PUT `/api/teams/[teamId]/members/[userId]/role` — 更改角色
- GET `/api/teams/[teamId]/prompts` — 获取共享 prompts
- POST `/api/teams/[teamId]/prompts` — 添加共享 prompt
- DELETE `/api/teams/[teamId]/prompts/[promptId]` — 移除共享
- GET `/api/teams/invite/[token]` — 获取邀请信息
- POST `/api/teams/invite/[token]/accept` — 接受邀请

**数据库（已存在）**:
- `teams` — 团队信息
- `team_members` — 成员关系 + 角色
- `team_prompts` — 共享 prompts

---

### 3. 订阅管理 (`/dashboard/subscription`)

**功能**:
- 显示当前订阅（计划类型、状态、到期时间）
- 计划选项对比（Free / Pro / Team）
- 升级按钮（Stripe 支付）
- 支付历史列表
- 取消订阅

**计划定价**:
| 计划 | 价格 | 功能 |
|------|------|------|
| Free | ¥0 | 基础功能 |
| Pro | ¥29/月 | 云端同步 + 加入团队 |
| Team | ¥99/月 | 创建团队 + 无限成员 + 共享库 |

**UI 结构**:
```
┌─────────────────────────────────────┐
│  当前计划                            │
│  Pro 计划           ¥29/月          │
│  到期: 2024-04-15                    │
│  [升级到 Team] [取消订阅]            │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  可用计划                            │
│  [Free] [Pro ✓] [Team]              │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  支付历史                            │
│  2024-03-15 Pro ¥29 已支付          │
│  2024-02-15 Pro ¥29 已支付          │
└─────────────────────────────────────┘
```

**API（部分已存在）**:
- GET `/api/billing/status` — 获取订阅状态（已存在）
- POST `/api/billing/subscribe` — 创建订阅（已存在）
- POST `/api/billing/cancel` — 取消订阅（已存在）
- POST `/api/webhooks/stripe` — Stripe webhook（已存在）
- GET `/api/billing/history` — 支付历史（需新增）

---

## 设计风格

**参考**: extension sidepanel 设置界面

**颜色规范**:
| 元素 | 颜色 |
|------|------|
| 主色调 | `#171717` (黑色) |
| 文字主色 | `#171717` |
| 文字次色 | `#64748B` |
| 卡片背景 | `#f8f8f8` |
| 边框 | `#E5E5E5` |
| 成功色 | `#16a34a` |
| 成功背景 | `#dcfce7` |
| Tab 高亮 | `#171717` (底部边框) |

**组件规范**:
- Tab 导航：底部 2px 黑色高亮线
- 按钮：黑色背景 + 白色文字 + 4px 圆角
- 卡片：`#f8f8f8` 背景 + 1px `#E5E5E5` 边框 + 8px 圆角
- 订阅卡片：黑色背景 + 白色文字
- 头像：28px 圆形，黑色系

---

## 数据流

```
┌──────────────────┐
│  Extension       │
│  chrome.storage  │
│     ↓ ↑          │
│  upload/download │
└──────────────────┘
        ↓ ↑ API
┌──────────────────┐
│  Web App API     │
│  /api/sync/*     │
│     ↓ ↑          │
│  Supabase DB     │
│  prompts         │
│  categories      │
│  sync_logs       │
│  teams           │
│  team_members    │
│  team_prompts    │
│  user_subscriptions │
└──────────────────┘
        ↓ ↑
┌──────────────────┐
│  Web App Dashboard │
│  显示状态/管理    │
└──────────────────┘
```

---

## 实现范围

### 需新增

1. **Dashboard 布局组件** (`layout.tsx`)
   - Tab 导航栏
   - 用户头像 + 退出

2. **备份数据页面** (`backup/page.tsx`)
   - 统计卡片
   - 同步历史列表
   - 上传/下载按钮

3. **团队管理页面** (`team/page.tsx`, `team/[teamId]/page.tsx`)
   - 团队列表
   - 团队详情（成员管理、共享库）
   - 创建团队对话框
   - 邀请成员功能

4. **订阅管理页面** (`subscription/page.tsx`)
   - 当前订阅卡片
   - 计划选项对比
   - 支付历史列表

5. **新增 API**
   - `/api/sync/history`
   - `/api/teams/*` (团队 CRUD)
   - `/api/teams/[teamId]/members/*` (成员管理)
   - `/api/teams/[teamId]/prompts/*` (共享 prompts)
   - `/api/teams/invite/*` (邀请流程)
   - `/api/billing/history`

### 可复用

- `/api/sync/upload`, `/api/sync/download`, `/api/sync/status` — 已存在
- `/api/billing/status`, `/api/billing/subscribe`, `/api/billing/cancel` — 已存在
- `/api/webhooks/stripe` — 已存在
- Supabase 数据库表 — 已存在
- extension 的 `cloud-sync-service.ts` — 上传/下载逻辑参考

---

## 测试要点

1. **云端同步**
   - 上传后数据正确存储到 Supabase
   - 下载后数据正确显示
   - 未登录时提示登录

2. **团队管理**
   - RLS 权限正确：成员只能看到所属团队
   - 角色权限正确：admin 可管理，member 只可查看
   - 邀请流程：生成链接 → 接受 → 加入团队

3. **订阅管理**
   - Stripe 支付流程完整
   - 计划升级正确反映到 Supabase
   - 支付历史正确记录

---

## 后续迭代（不在本次范围）

- 数据可视化图表（趋势、分类分布）
- 团队共享 prompts 编辑功能
- 邮件邀请成员（而非链接邀请）
- 续费提醒（到期前邮件/通知提醒）
- 多语言支持（中/英）