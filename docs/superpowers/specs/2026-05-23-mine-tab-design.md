# 侧边栏"我的"Tab 设计规范

**日期**: 2026-05-23
**状态**: 待实现

## 背景

当前登录和API配置分散在多处：
- `BackupStatusRow`: 云端备份登录入口
- `VisionSection`: 官方API + 第三方API配置 + 图片转提示词开关
- `AgentView/EcommerceView`: 功能解锁登录提示

用户需要统一的账号入口，一处登录全局可用。

## 目标

1. 集中账号/API配置到单一入口
2. 登录一次，云端备份/Agent/图片转词功能全部可用
3. 简化其他位置的登录提示（弱化为文字跳转）

## 设计

### SettingsView Tab 结构调整

```
当前: ['同步与备份', '图片转提示词', '导入导出']
调整: ['同步与备份', '导入导出', '我的']
```

- 移除 `vision` tab
- 新增 `mine` tab（最右侧）

### "我的"Tab 内容布局

按重要性从上到下排列：

#### 1. 账号状态区

```
┌─────────────────────────────────┐
│ [头像图标]                       │
│ 未登录状态:                       │
│   文字: "未登录"                  │
│   按钮: [登录] (蓝色按钮)         │
│                                 │
│ 已登录状态:                       │
│   文字: "已登录 · 会员用户"       │
│   按钮: [退出登录] (灰色文字)     │
└─────────────────────────────────┘
```

- 登录跳转: `${WEB_APP_URL}/auth/callback?source=extension`
- 使用现有 `auth-service.ts` 的 `signOut()` 退出
- 显示会员状态（如有）

#### 2. 官方服务区

登录后显示此区块：

```
┌─────────────────────────────────┐
│ Oh My Prompt 官方服务            │
│                                 │
│ 未激活: [激活官方API] (按钮)      │
│ 已激活: ✓ 已激活                 │
│                                 │
│ 说明: 激活后云端备份、Agent生成、 │
│ 图片转提示词均可使用              │
└─────────────────────────────────┘
```

- 激活逻辑复用现有 `VisionSection.handleActivateOfficial`
- 固定配置ID: `omp-official-default`
- apiFormat: `omp_official`

#### 3. 第三方API配置区（可折叠）

默认折叠，展开后显示：

```
┌─────────────────────────────────┐
│ 第三方API配置 ▼                  │
│                                 │
│ [快速配置] [自定义配置] (tabs)    │
│                                 │
│ 快速配置:                        │
│   服务商选择                     │
│   模型选择                       │
│   API Key输入                    │
│   [保存配置]                     │
│                                 │
│ 自定义配置:                      │
│   配置名称                       │
│   API格式 (Anthropic/OpenAI)     │
│   API地址                        │
│   模型名称                       │
│   API Key                       │
│   [保存配置]                     │
│                                 │
│ 已保存配置列表:                  │
│   配置名 | 模型 | [激活][编辑][删除] │
└─────────────────────────────────┘
```

- 复用现有 `VisionSection` 的第三方配置逻辑
- 组件复用: `ProviderSelect`, `ModelSelect`, `SavedConfigsList`
- 权限请求: `requestApiHostPermission()`

#### 4. 功能开关区

```
┌─────────────────────────────────┐
│ 图片转提示词  ○──────● (开关)    │
│ 鼠标悬停图片时显示转换按钮        │
└─────────────────────────────────┘
```

- 开关控制 `settings.visionEnabled`
- 复用现有 `handleVisionToggle` 逻辑
- 关闭时隐藏下方API配置区

### 其他位置登录按钮弱化

#### BackupStatusRow

| 状态 | 当前 | 调整后 |
|------|------|--------|
| 未登录 | 黄色按钮 "未登录·点击登录" | 灰色文字 "未登录" (点击跳转"我的"tab) |
| 已登录 | 绿色文字 | 保持不变 |

点击跳转实现：
```tsx
// BackupStatusRow.tsx
if (!status.loggedIn) {
  return (
    <span
      onClick={onNavigateToMine}
      className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
    >
      未登录
    </span>
  )
}
```

需要新增 prop: `onNavigateToMine?: () => void`

#### AgentView / EcommerceView

当前登录提示有按钮，弱化为文字链接：

```
当前:
  "使用 Agent 生成提示词前，需要登录官方服务或配置第三方 API"
  [登录官方服务] 按钮

调整:
  "使用 Agent 生成提示词前，请先登录或配置API"
  点击跳转"我的"tab
```

- 移除登录按钮
- 文字可点击，跳转到"我的"tab
- 使用 `setSidepanelIntent('mine')` 实现跳转

## 文件变更清单

| 操作 | 文件路径 |
|------|----------|
| **新增** | `packages/extension/src/sidepanel/views/MineView.tsx` |
| **修改** | `packages/extension/src/sidepanel/views/SettingsView.tsx` |
| **修改** | `packages/extension/src/sidepanel/settings/BackupStatusRow.tsx` |
| **修改** | `packages/extension/src/sidepanel/views/AgentView.tsx` |
| **修改** | `packages/extension/src/sidepanel/views/EcommerceView.tsx` |
| **修改** | `packages/extension/src/sidepanel/SidePanelApp.tsx` |
| **删除** | `packages/extension/src/sidepanel/settings/VisionSection.tsx` |

### 详细变更说明

#### 1. MineView.tsx (新增)

```tsx
// packages/extension/src/sidepanel/views/MineView.tsx
export default function MineView() {
  // 状态: authState, configs, activeConfigId, visionEnabled
  // 区块: 账号状态、官方服务、第三方API、功能开关
  // 逻辑: 从 VisionSection 迁移
}
```

#### 2. SettingsView.tsx (修改)

```tsx
// 当前
type SettingsTab = 'sync' | 'vision' | 'import-export'

// 调整
type SettingsTab = 'sync' | 'import-export' | 'mine'

// tabLabels
const tabLabels = {
  sync: '同步与备份',
  'import-export': '导入导出',
  mine: '我的'
}

// lazy import
const MineView = lazy(() => import('./views/MineView'))
```

#### 3. SidePanelApp.tsx (修改)

新增 `sidepanelIntent` 处理 `'mine'`：

```tsx
// 新增 intent 类型
type CurrentView = 'prompts' | 'settings' | 'mine'

// 处理 'mine' intent
if (result.sidepanelIntent === 'mine') {
  setCurrentView('mine')
}
```

或保持两级结构，SettingsView 内部处理 tab 跳转。

#### 4. BackupStatusRow.tsx (修改)

```tsx
interface BackupStatusRowProps {
  // 新增
  onNavigateToMine?: () => void
}

// 未登录状态渲染
if (!status.loggedIn) {
  return (
    <span
      onClick={onNavigateToMine}
      className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
    >
      未登录
    </span>
  )
}
```

#### 5. AgentView.tsx / EcommerceView.tsx (修改)

```tsx
// 登录提示弱化
<div className="text-sm text-gray-500">
  请先
  <button onClick={handleNavigateToMine} className="text-blue-600 hover:underline">
    登录或配置API
  </button>
</div>
```

#### 6. VisionSection.tsx (删除)

- 功能迁移到 MineView
- 文件删除
- 相关组件（ProviderSelect等）保留，MineView复用

## 实现要点

### 跳转到"我的"tab的实现

方案: 使用 `chrome.storage.session` 存储 intent

```tsx
// 跳转方
const handleNavigateToMine = () => {
  chrome.storage.session.set({ sidepanelIntent: 'mine' })
  // 如果 sidepanel 未打开，需用户手动打开
}

// 接收方 (SidePanelApp 或 SettingsView)
chrome.storage.session.get('sidepanelIntent', (result) => {
  if (result.sidepanelIntent === 'mine') {
    setCurrentView('mine') // 或 setActiveTab('mine')
    chrome.storage.session.remove('sidepanelIntent')
  }
})
```

### 状态同步

- 登录状态: `auth-service.ts` 的 `getAuthState()`
- API配置: `MessageType.GET_PROVIDER_CONFIGS`
- 功能开关: `settings.visionEnabled`
- 监听 `AUTH_STATUS_UPDATE` 刷新状态

### 第三方API配置说明

根据 feedback 记忆，第三方API配置区**不显示官方服务商选项**：
- `groupProvidersByType(providers, true)` 排除官方
- 快速配置的 ProviderSelect 只显示第三方服务商

## 测试要点

1. 登录流程: 点击登录 → OAuth回调 → 状态更新
2. 激活官方API: 登录后激活 → 配置创建成功 → activeConfigId更新
3. 第三方配置: 保存 → 权限请求 → 配置列表显示
4. 功能开关: 切换 → storage更新 → content script响应
5. 跳转: 各处点击"未登录" → 正确跳转到"我的"tab
6. 退出登录: 状态清除 → API配置保留但官方失效

## 风险

- 跳转intent可能在sidepanel未打开时失效（需提示用户）
- VisionSection删除需确保所有依赖组件正确迁移