# Online Search Feature Design

将资源库改造为在线搜索功能，集成 prompts.chat API 作为可选浏览模式。

## Overview

- **目标**: 在现有资源库基础上新增 prompts.chat 在线搜索功能
- **用户价值**: 扩展提示词来源，用户可搜索并收藏在线提示词到本地
- **方案**: 独立搜索模式，通过侧边栏入口切换

## API Overview

### prompts.chat API

**搜索接口**
```
GET https://prompts.chat/api/prompts?q={query}&page={page}&perPage={perPage}
```

**分类查询**
```
GET https://prompts.chat/api/prompts?category={categoryId}&page={page}&perPage={perPage}
```

**获取单个提示词**
```
GET https://prompts.chat/api/prompts/{id}
```

**响应结构**
```json
{
  "prompts": [
    {
      "id": "xxx",
      "title": "Prompt Title",
      "slug": "prompt-slug",
      "description": "Description text",
      "content": "Full prompt content...",
      "type": "TEXT | IMAGE",
      "mediaUrl": "https://...",
      "author": { "id", "name", "username", "avatar", "verified" },
      "category": { "id", "name", "slug", "description" },
      "tags": [{ "id", "name", "color" }],
      "voteCount": 10,
      "createdAt": "2026-04-25T..."
    }
  ],
  "total": 310,
  "page": 1,
  "perPage": 20,
  "totalPages": 16
}
```

## Architecture

### Module Structure

```
src/
├── lib/
│   ├── resource-library.ts       # 现有本地资源库（保持不变）
│   └── prompts-chat-api.ts       # 新增：API 客户端 + 预定义分类
│
├── content/components/
│   ├── DropdownContainer.tsx     # 新增在线搜索模式状态管理
│   ├── OnlineSearchPanel.tsx     # 新增：搜索面板组件
│   ├── OnlineSearchInput.tsx     # 新增：搜索输入框
│   ├── OnlineCategorySelect.tsx  # 新增：分类选择器
│   ├── OnlinePromptCard.tsx      # 新增：在线提示词卡片
│   └── OnlinePromptPreviewModal.tsx  # 新增：在线预览弹窗（或复用现有）
│
├── background/
│   └── service-worker.ts         # 新增 API 代理请求处理
│
├── shared/
│   ├── types.ts                  # 新增 OnlinePrompt, OnlineCategory 类型
│   └── messages.ts               # 新增 FETCH_ONLINE_PROMPTS 消息类型
```

### Data Types

```typescript
// shared/types.ts

export interface OnlinePrompt {
  id: string
  title: string
  slug: string
  description: string | null
  content: string
  type: 'TEXT' | 'IMAGE'
  mediaUrl: string | null
  author: {
    id: string
    name: string
    username: string
    avatar: string
    verified: boolean
  }
  category: {
    id: string
    name: string
    slug: string
    description?: string
  }
  tags: Array<{ id: string; name: string; color: string }>
  voteCount: number
  createdAt: string
}

export interface OnlineCategory {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  order: number
}

export interface PromptsChatResponse {
  prompts: OnlinePrompt[]
  total: number
  page: number
  perPage: number
  totalPages: number
}
```

### Predefined Categories

精选与 Lovart AI 用户最相关的分类（写死）：

```typescript
// lib/prompts-chat-api.ts

export const PREDEFINED_ONLINE_CATEGORIES: OnlineCategory[] = [
  {
    id: 'cmj1yryrn000vt5als6r4vbgn',
    name: 'Image Generation',
    slug: 'image-generation',
    description: 'AI image prompts',
    order: 1
  },
  {
    id: 'cmju78wpz0004l704nql7qwli',
    name: 'Video Generation',
    slug: 'video-generation',
    description: 'AI video prompts',
    order: 2
  },
  {
    id: 'cmmnlanki0004l204gai1zuii',
    name: 'Design',
    slug: 'design',
    description: 'Design prompts',
    order: 3
  },
  {
    id: 'cmj1yryoz0005t5albvxi3aw8',
    name: 'Coding',
    slug: 'coding',
    description: 'Programming prompts',
    order: 4
  },
  {
    id: 'cmj1yrypb0006t5alt679jsqo',
    name: 'Writing',
    slug: 'writing',
    description: 'Writing prompts',
    order: 5
  }
]
```

## API Client

由于 Content Script 受 CORS 限制，所有 API 请求通过 Service Worker 代理。

### API Functions

```typescript
// lib/prompts-chat-api.ts

export async function searchOnlinePrompts(
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<PromptsChatResponse>

export async function getOnlinePromptsByCategory(
  categoryId: string,
  page: number = 1,
  perPage: number = 20
): Promise<PromptsChatResponse>

export async function getOnlinePromptById(
  id: string
): Promise<OnlinePrompt>
```

### Service Worker Proxy

```typescript
// background/service-worker.ts

// 新增消息类型
case MessageType.FETCH_ONLINE_PROMPTS: {
  const { endpoint, query, categoryId, promptId, page, perPage } = payload

  let url: string
  if (endpoint === 'search') {
    url = `${API_BASE}/prompts?q=${encodeURIComponent(query)}&page=${page}&perPage=${perPage}`
  } else if (endpoint === 'category') {
    url = `${API_BASE}/prompts?category=${categoryId}&page=${page}&perPage=${perPage}`
  } else if (endpoint === 'detail') {
    url = `${API_BASE}/prompts/${promptId}`
  }

  try {
    const response = await fetch(url)
    const data = await response.json()
    sendResponse({ success: true, data })
  } catch (error) {
    sendResponse({ success: false, error: error.message })
  }
  return true
}
```

## UI Design

### Entry Point

在现有资源库侧边栏新增"在线搜索"入口：

```
侧边栏（本地模式）:
├── 全部分类
├── 资源库
├── 🌐 在线搜索    ← 新增，Globe 图标
├── [用户分类...]
└── + 添加分类

侧边栏（在线模式）:
├── ← 返回本地
├── 🔍 [搜索输入框]
├── Image Generation (310+)
├── Video Generation
├── Design
├── Coding
└── Writing
```

### Search Panel Layout

```
┌─────────────────────────────────────────────────────┐
│ Oh My Prompt v1.x.x    [刷新] [导入] [导出] [官网] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 搜索 prompts.chat...                     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  分类: [Image Generation ▼]    共 310 条           │
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ [图片]  │  │ [图片]  │  │ [图片]  │            │
│  │ Title   │  │ Title   │  │ Title   │            │
│  │ @author │  │ @author │  │ @author │            │
│  │ [注入][收藏] │ │ [注入][收藏] │ │ [注入][收藏] │            │
│  └─────────┘  └─────────┘  └─────────┘            │
│                                                     │
│  [加载更多...]                                      │
└─────────────────────────────────────────────────────┘
```

### OnlinePromptCard Component

```typescript
interface OnlinePromptCardProps {
  prompt: OnlinePrompt
  onClick: () => void      // 打开预览弹窗
  onInject: () => void     // 直接注入
  onCollect: () => void    // 收藏到本地
  isCollected: boolean     // 已收藏状态
}
```

卡片内容：
- Preview: mediaUrl 图片或内容截断
- Title: title
- Author: avatar + name
- Actions: 注入按钮 + 收藏按钮

### Preview Modal

复用 PromptPreviewModal，适配 OnlinePrompt：

- 标题 + 作者头像
- 分类 + 标签
- 完整内容（可滚动）
- 来源链接: `https://prompts.chat/prompts/{slug}`
- 操作: [注入] [收藏]

## State Management

DropdownContainer 新增状态：

```typescript
// 模式切换
const [isOnlineSearch, setIsOnlineSearch] = useState(false)

// 搜索参数
const [onlineSearchQuery, setOnlineSearchQuery] = useState('')
const [selectedOnlineCategoryId, setSelectedOnlineCategoryId] = useState(PREDEFINED_ONLINE_CATEGORIES[0].id)
const [onlinePage, setOnlinePage] = useState(1)

// 数据状态
const [onlinePrompts, setOnlinePrompts] = useState<OnlinePrompt[]>([])
const [onlineTotal, setOnlineTotal] = useState(0)
const [isLoadingOnline, setIsLoadingOnline] = useState(false)
const [onlineError, setOnlineError] = useState<string | null>(null)

// 预览弹窗
const [selectedOnlinePrompt, setSelectedOnlinePrompt] = useState<OnlinePrompt | null>(null)
const [isOnlinePreviewOpen, setIsOnlinePreviewOpen] = useState(false)
```

## Data Flow

```
用户操作                    系统响应
────────────────────────────────────────────────────────────
点击"在线搜索"               → isOnlineSearch = true
                             → 加载默认分类数据

选择分类                     → selectedOnlineCategoryId = id
                             → onlinePage = 1
                             → getOnlinePromptsByCategory()
                             → 更新 onlinePrompts, onlineTotal

输入关键词                   → onlineSearchQuery = query
                             → onlinePage = 1
                             → searchOnlinePrompts()
                             → 更新数据

滚动到底部                   → onlinePage++
                             → 加载下一页
                             → 追加到 onlinePrompts

点击收藏                     → 打开分类选择对话框
                             → 用户选择本地分类
                             → 转换为 Prompt 格式
                             → saveToStorage()

点击注入                     → onInjectResource(prompt.content)
                             → 插入 Lovart 输入框
```

## Collect Function

将 OnlinePrompt 转换为本地 Prompt：

```typescript
function convertOnlinePromptToLocal(
  online: OnlinePrompt,
  categoryId: string
): Omit<Prompt, 'id'> {
  return {
    name: online.title,
    content: online.content,
    categoryId: categoryId,
    description: online.description || truncateText(online.content, 100),
    order: 0
  }
}

// 收藏流程
const handleCollectOnlinePrompt = async (categoryId: string) => {
  const localPrompt = convertOnlinePromptToLocal(selectedOnlinePrompt, categoryId)
  await usePromptStore.getState().addPrompt(localPrompt)
  setIsOnlinePreviewOpen(false)
  setToastMessage('已收藏到本地')
}
```

## Error Handling

- 网络错误: 显示"网络请求失败，请稍后重试"
- 空结果: 显示"暂无相关提示词"
- 加载状态: 显示骨架屏或加载动画

## Performance Considerations

- **不缓存**: 每次请求实时数据
- **分页加载**: 每页 20 条，滚动加载更多
- **防抖搜索**: 输入停止 300ms 后触发搜索

## Files to Create/Modify

### New Files
- `src/lib/prompts-chat-api.ts` - API 客户端 + 预定义分类
- `src/content/components/OnlineSearchPanel.tsx` - 搜索面板
- `src/content/components/OnlinePromptCard.tsx` - 卡片组件
- `src/content/components/OnlineCategorySelect.tsx` - 分类选择器

### Modified Files
- `src/shared/types.ts` - 新增类型定义
- `src/shared/messages.ts` - 新增 FETCH_ONLINE_PROMPTS
- `src/background/service-worker.ts` - 新增 API 代理
- `src/content/components/DropdownContainer.tsx` - 新增状态 + UI 逻辑
- `src/content/components/PromptPreviewModal.tsx` - 支持 OnlinePrompt（可选）

## Success Criteria

1. 用户可通过侧边栏进入在线搜索模式
2. 用户可按分类浏览 prompts.chat 提示词
3. 用户可通过关键词搜索提示词
4. 用户可收藏在线提示词到本地分类
5. 用户可直接注入在线提示词到 Lovart 输入框
6. 已收藏提示词显示"已收藏"状态