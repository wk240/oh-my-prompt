# Content Script 团队共享功能设计

## 概述

在 content script 下拉面板的个人库提示词项中添加"共享到团队"功能，允许用户将个人提示词共享到团队库，与 Sidepanel 的团队共享功能保持 UI 一致性。

## 需求范围

- 仅在个人库提示词项的操作按钮区域添加共享按钮
- 不涉及 Agent 面板生成的结果区域

## 设计目标

1. UI 与 Sidepanel TeamShareDialog 完全一致（紫色主题、单选按钮选择团队）
2. 直接在 content script 中渲染 TeamShareDialog（Shadow DOM 样式隔离）
3. 复用现有 API（sharePromptToTeam、getUserTeams）

## 架构设计

### 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `content/components/TeamShareDialog.tsx` | 新增 | 团队共享对话框组件 |
| `content/styles/team-share-dialog-styles.ts` | 新增 | Shadow DOM 样式定义 |
| `content/components/DropdownContainer.tsx` | 修改 | 添加共享状态和 Modal 状态 |
| `content/components/SortableDropdownItem` | 修改 | 添加 Share2 按钮 |

### 组件依赖

```
SortableDropdownItem (Share2 按钮)
    ↓ 点击触发
DropdownContainer (状态管理)
    ↓ 控制渲染
TeamShareDialog (Shadow DOM)
    ↓ 调用 API
sharePromptToTeam / getUserTeams (lib/team-sync.ts)
```

### 状态管理

在 `DropdownContainer.tsx` 的状态中添加：

```typescript
interface ModalStates {
  // 现有状态...
  isTeamShare: boolean  // 新增
}

interface EditingStates {
  // 现有状态...
  sharingPrompt: Prompt | null  // 新增
}
```

## UI 设计

### 按钮区域布局

SortableDropdownItem 操作按钮顺序（从左到右）：

```
[Share2] [Copy] [Pencil] [Trash2]
```

共享按钮样式：
- 默认：灰色 `#64748B`
- hover：紫色 `#8b5cf6`
- tooltip：「共享到团队」

### TeamShareDialog 视觉结构

```
┌─────────────────────────────────┐
│ 选择目标团队                      │  DialogTitle
│ 将「{prompt.name}」共享到团队库    │  DialogDescription
├─────────────────────────────────┤
│  ○ 团队A                         │  团队选项
│  ● 团队B (selected)              │
│  ○ 团队C                         │
│                                  │
│  您还未加入任何团队...            │  空状态
├─────────────────────────────────┤
│         [取消]  [确认共享]        │  Footer
└─────────────────────────────────┘
```

样式规格：
- 宽度：384px (max-w-sm)
- 选中边框：`border-purple-500`
- 选中背景：`bg-purple-50`
- 单选按钮：自定义圆形样式

## 数据流

### 交互流程

```
用户点击 Share2 按钮
    ↓
检查 authState.status
    ├─ 未登录 → toast '请先登录后共享'
    ↓ 已登录
setEditingItem('sharingPrompt', prompt)
openModal('isTeamShare')
    ↓
TeamShareDialog 挂载
    ↓
getUserTeams() 获取团队列表
    ├─ loading → Loader2
    ├─ error → toast '获取团队列表失败'
    ↓ success
渲染团队选项
    ↓
用户选择团队
    ↓
点击「确认共享」
    ↓
sharePromptToTeam(prompt, teamId)
    ├─ success → syncTeamPrompts() + loadTeamPrompts()
    ├─ error → toast error message
    ↓
关闭 Dialog + toast '已共享到 {teamName}'
```

### API 复用

无需新增 MessageType，复用：
- `SHARE_PROMPT_TO_TEAM`
- `SYNC_TEAM_PROMPTS`

## 错误处理

| 场景 | 处理 |
|------|------|
| 未登录 | toast +「前往设置」按钮链接 |
| 获取团队失败 | Dialog 内 toast |
| 无团队 | 空状态文案 |
| 共享失败 | Dialog 内 toast，不关闭 |
| 网络超时 | loading → toast「请求超时」 |
| 重复共享 | toast「已存在于团队库」 |

### 登录引导

未登录 toast 包含操作：
```typescript
showToast('请先登录后共享', {
  action: '前往设置',
  onClick: () => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })
})
```

## Shadow DOM 样式隔离

### Portal 容器

```typescript
const portalContainer = document.getElementById('omp-team-share-portal')
  || createPortalContainer('omp-team-share-portal')
```

### 样式来源

从 `popup/components/ui/` 提取核心样式：
- `.dialog-overlay`：半透明背景
- `.dialog-content`：白色卡片、居中定位
- `.dialog-header/title/description/footer`
- `.team-option/selected`
- `.button-primary/outline`

### 样式文件

```typescript
// content/styles/team-share-dialog-styles.ts
export const TEAM_SHARE_DIALOG_STYLES = `
  .dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); }
  .dialog-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); ... }
  /* 团队选项、按钮等 */
`
```

样式注入时机：Dialog 打开时注入 `<style>` 到 portal container。

## 实现优先级

1. 创建 `TeamShareDialog.tsx` 和样式文件
2. 修改 `DropdownContainer.tsx` 添加状态和 handlers
3. 修改 `SortableDropdownItem` 添加 Share2 按钮
4. 测试完整流程（登录、选择团队、共享成功）