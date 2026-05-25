# Agent 功能设计文档

> 日期: 2026-05-21
> 状态: 待审核

## 概述

Agent 是一个 AI 提示词增强功能，用户输入简短描述（可选上传参考图片），Agent 根据预设模板扩展为详细的提示词。

**核心价值**：从简短描述快速生成专业级提示词，提升创作效率。

## 功能定位

| 功能 | 输入 | 输出 | 位置 | 存储 |
|------|------|------|------|------|
| Vision | 图片（必需） | 双语 JSON | Vision Modal | 临时库 |
| Agent | 文字 + 图片（可选） | 单语纯文本 | Sidepanel Agent 视图 | 直接保存到分类 |

Agent 和 Vision 互补：Vision 从图片提取信息，Agent 从文字扩展描述。两者共享 Vision Provider Config。

## 用户界面设计

### 1. Sidepanel 入口

**位置**：PromptListView Sidebar，资源库上方

```
Sidebar 结构：
├── Agent (新增，带 NEW 标签)
├── 资源库
├── 临时库
├── 全部分类
└── 分类列表...
```

**样式**：
- 复用现有 `sidebar-category-item` CSS 类
- 选中状态：琥珀色 `#A16207`，左侧边框
- NEW 标签：`#fef3c7` 背景，`#92400e` 文字

### 2. Agent 独立视图

点击 Agent 入口后，左侧 Sidebar 变为模板分类列表：

```
Sidebar 结构（Agent 视图）：
├── ← 返回
├── 电商套图 (选中)
├── 海报图
├── 插画
├── Logo
├── UI界面
└── 3D渲染
```

右侧 Main 区域显示 Agent 输入界面：

```
Agent 输入界面：
├── Header: Agent - [模板名称]
├── 模板风格提示（蓝色提示卡片）
├── 输入描述 (Textarea，必需)
├── 参考图片 (可选，上传按钮)
├── 生成提示词按钮
└── 结果区域（生成后显示）
    ├── 生成的提示词内容
    ├── 操作按钮：复制、保存到库、重新生成
    └── 保存分类选择器
```

### 3. 状态流转

| 状态 | 左侧 Sidebar | 右侧 Main |
|------|--------------|-----------|
| 默认 | Agent 入口 + 资源库 + 分类 | 提示词列表 |
| 点击 Agent | 返回 + 模板分类 | Agent 输入界面 |
| 选择模板 | 模板分类（选中状态） | 模板对应的 Agent 输入界面 |
| 生成中 | 模板分类 | Loading 状态 |
| 生成完成 | 模板分类 | 结果展示 + 保存选项 |

### 4. Content Script 入口

在平台输入框旁新增 Agent 图标（与 Vision 图标并列）：

```
平台输入框图标区域：
├── Agent 图标 (琥珀色背景)
├── Vision 图标
└── 提示词下拉图标
```

点击 Agent 图标后：
1. 提取输入框内容（文字）
2. 打开 Sidepanel
3. 切换到 Agent 视图
4. 自动填充提取的文字

## 模板分类设计

每个模板分类有专属 System Prompt，引导 Agent 生成对应风格的提示词。

| 模板分类 | System Prompt 关键词 |
|----------|---------------------|
| 电商套图 | 产品主体突出、白底/渐变背景、光影质感、商业摄影、多角度展示 |
| 海报图 | 视觉冲击力、主题鲜明、构图创意、色彩对比、排版设计 |
| 插画 | 艺术风格、手绘质感、创意表达、色彩搭配、叙事元素 |
| Logo | 简洁识别、品牌元素、符号化、负空间、几何造型 |
| UI界面 | 现代界面、交互设计、用户体验、响应式、Material/Fluent风格 |
| 3D渲染 | 三维建模、材质纹理、光影渲染、场景搭建、Blender/Cinema4D风格 |

**System Prompt 结构**：

```
纯文字场景：
"你是提示词增强专家。用户正在生成[模板分类]类型的提示词。
风格要点：[模板关键词列表]。
将简短描述扩展为详细的提示词，包含主体、风格、光影、色彩、构图、材质等元素。
输出语言与输入语言一致。"

文字 + 图片场景：
"你是提示词增强专家。用户正在生成[模板分类]类型的提示词。
风格要点：[模板关键词列表]。
参考图片的视觉风格、色彩、构图，结合用户描述生成详细的提示词。
输出语言与输入语言一致。"
```

## API 调用逻辑

### Provider Config

复用现有的 Vision Provider Config，无需额外配置。

**调用方式**：
- 获取 `ProviderConfigsStorage` 中的 `activeConfigId`
- 使用对应 Provider 的 `apiEndpoint`、`apiKey`、`selectedModel`、`apiFormat`

### API Request 结构

```typescript
{
  model: config.selectedModel,
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: [
      { type: 'text', text: userInput },
      // 如果有图片：
      { type: 'image_url', image_url: { url: imageData } }
    ]}
  ],
  max_tokens: 1024
}
```

### 输出格式

单语纯文本（不使用 Vision API 的双语 JSON 结构，节省 token）。

语言判断逻辑：
- 按用户的扩展默认语言选择

## 数据存储设计

### 存储位置

生成后直接保存到临时库。

用户需选择目标分类后保存到用户数据。

### 新增 Prompt 字段

```typescript
interface Prompt {
  // ...现有字段
  generatedBy?: 'agent' // 标记由 Agent 生成（可选，用于未来统计）
  templateCategory?: string // 使用的模板分类（可选，用于追溯）
}
```

### Agent 相关状态

```typescript
// PromptListView 状态扩展
type AgentViewMode = 'default' | 'agent'
type AgentTemplateCategory = 'ecommerce' | 'poster' | 'illustration' | 'logo' | 'ui' | '3d'

// 新增 state
const [agentViewMode, setAgentViewMode] = useState<AgentViewMode>('default')
const [agentSelectedTemplate, setAgentSelectedTemplate] = useState<AgentTemplateCategory>('ecommerce')
const [agentInputText, setAgentInputText] = useState<string>('')
const [agentImageData, setAgentImageData] = useState<string | null>(null)
const [agentGeneratedPrompt, setAgentGeneratedPrompt] = useState<string | null>(null)
const [agentIsGenerating, setAgentIsGenerating] = useState<boolean>(false)
```

## 消息类型扩展

新增 MessageType：

```typescript
// packages/shared/messages.ts
export enum MessageType {
  // ...现有类型
  
  // Agent 相关
  AGENT_GENERATE = 'AGENT_GENERATE', // 请求 Agent 生成
  AGENT_GENERATE_RESULT = 'AGENT_GENERATE_RESULT', // 返回生成结果
  AGENT_EXTRACT_FROM_CS = 'AGENT_EXTRACT_FROM_CS', // Content Script 提取内容发送到 Sidepanel
}
```

## 技术实现要点

### 1. Sidebar 入口实现

在 `PromptListView.tsx` 的 `sidebar-categories` 中，资源库按钮之前添加 Agent 入口：

```tsx
{/* Agent 入口 */}
<button
  className={`sidebar-category-item ${agentViewMode === 'agent' ? 'selected' : ''}`}
  onClick={() => setAgentViewMode('agent')}
>
  <div className="sidebar-category-icon-wrapper">
    <Sparkles className="sidebar-category-icon" />
  </div>
  <span className="sidebar-category-name">Agent</span>
  <span className="sidebar-category-name-new">NEW</span>
</button>

{/* 资源库 */}
<button className="sidebar-category-item" onClick={() => setIsResourceLibrary(true)}>
  ...
</button>
```

### 2. Agent 视图 Sidebar 实现

当 `agentViewMode === 'agent'` 时，替换 Sidebar 内容：

```tsx
{agentViewMode === 'agent' ? (
  <>
    {/* 返回按钮 */}
    <button className="sidebar-category-item return-btn" onClick={() => setAgentViewMode('default')}>
      <ArrowLeft className="sidebar-category-icon" />
      <span>返回</span>
    </button>
    
    {/* 模板分类 */}
    {AGENT_TEMPLATE_CATEGORIES.map(template => (
      <button
        key={template.id}
        className={`sidebar-category-item ${agentSelectedTemplate === template.id ? 'selected' : ''}`}
        onClick={() => setAgentSelectedTemplate(template.id)}
      >
        <span>{template.name}</span>
      </button>
    ))}
  </>
) : (
  // 默认 Sidebar 内容
)}
```

### 3. Agent 输入界面组件

新建 `AgentView.tsx` 组件：

```tsx
// packages/extension/src/sidepanel/views/AgentView.tsx
interface AgentViewProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string // 从 Content Script 提取的内容
}

export function AgentView({ selectedTemplate, extractedText }: AgentViewProps) {
  // ...状态和逻辑
}
```

### 4. API 调用实现

在 Service Worker 中处理 `AGENT_GENERATE` 消息：

```typescript
// packages/extension/src/background/index.ts
case MessageType.AGENT_GENERATE:
  const { inputText, imageData, templateCategory, language } = message.payload
  
  // 获取 active Provider Config
  const config = await getActiveProviderConfig()
  
  // 构建 System Prompt
  const systemPrompt = buildAgentSystemPrompt(templateCategory, !!imageData)
  
  // 调用 API
  const result = await executeAgentApiCall(config, systemPrompt, inputText, imageData)
  
  // 返回结果
  sendResponse({ success: true, data: result })
  return true
```

### 5. Content Script 入口实现

在 `UIInjector.tsx` 中添加 Agent 图标：

```tsx
{/* Agent 图标 */}
<button
  className="platform-icon agent"
  onClick={() => {
    // 提取输入框内容
    const inputText = extractInputContent()
    
    // 发送到 Sidepanel
    chrome.runtime.sendMessage({
      type: MessageType.AGENT_EXTRACT_FROM_CS,
      payload: { inputText }
    })
    
    // 打开 Sidepanel
    chrome.sidePanel.open()
  }}
>
  <Sparkles />
</button>
```

## 保存流程

1. 用户点击 "保存到库"
2. 显示分类选择器
3. 用户选择目标分类
4. 调用 `addPrompt` 添加到 `userData.prompts`
5. 显示成功提示
6. 用户可点击返回回到默认视图

## 错误处理

复用 Vision API 的错误分类逻辑（`classifyApiError`）：

| 错误类型 | 处理方式 |
|----------|----------|
| timeout | 重试（最多 3 次） |
| network | 重试或提示检查网络 |
| rate_limit | 等待后重试 |
| invalid_key | 提示检查 API 配置 |
| unsupported_vision | 提示模型不支持图片输入 |

## 测试要点

1. **入口测试**：
   - Sidebar Agent 入口点击 → 视图切换正确
   - 模板分类选择 → 界面更新正确
   - 返回按钮 → 回到默认视图

2. **生成测试**：
   - 纯文字生成 → 输出正确语言的提示词
   - 文字 + 图片生成 → 图片正确传递，风格参考正确
   - 不同模板 → 输出风格符合模板定义

3. **保存测试**：
   - 选择分类保存 → Prompt 正确添加到对应分类
   - 保存后返回 → 在分类列表中可见

4. **Content Script 测试**：
   - Agent 图标显示 → 与 Vision 图标并列
   - 点击提取 → 内容正确传递到 Sidepanel
   - Sidepanel 打开 → Agent 视图自动填充

## 实现优先级

### Phase 1（核心功能）
1. Sidebar Agent 入口 + 视图切换
2. 模板分类 Sidebar + 选择逻辑
3. Agent 输入界面（文字 + 图片）
4. API 调用 + 结果展示
5. 保存到分类

### Phase 2（增强功能）
1. Content Script Agent 图标 + 内容提取
2. 提取内容自动填充 Sidepanel
3. 更多模板分类（根据用户反馈扩展）

### Phase 3（优化）
1. 生成历史记录（可选）
2. 自定义模板分类（可选）
3. 批量生成（可选）

## 文件结构规划

```
packages/extension/src/
├── sidepanel/
│   ├── views/
│   │   └── AgentView.tsx          # Agent 输入界面组件
│   ├── components/
│   │   └── AgentResultCard.tsx    # 结果展示卡片
│   └── PromptListView.tsx         # 扩展 agentViewMode 状态
│
├── background/
│   └── agent-handler.ts           # Agent API 调用处理
│   └── index.ts                   # 新增 AGENT_GENERATE 消息处理
│
├── lib/
│   └── agent-api.ts               # Agent API 调用逻辑
│   └── agent-templates.ts         # 模板分类定义 + System Prompt
│
├── content/
│   ├── core/
│   │   └── ui-injector.tsx        # 扩展 Agent 图标
│   └── agent-extractor.ts         # 输入框内容提取逻辑
│
└── data/
    └── agent-templates.json       # 模板分类数据（可扩展）

packages/shared/
├── messages.ts                    # 新增 AGENT_* 消息类型
└── types/
    └── agent.ts                   # Agent 相关类型定义
```

## 依赖关系

- 复用 Vision Provider Config（`ProviderConfig`）
- 复用 Vision API 调用逻辑（`executeVisionApiCallWithProviderConfig`）
- 复用错误处理（`classifyApiError`）
- 新增 Agent 专用 System Prompt 构建（`buildAgentSystemPrompt`）

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| API 调用失败 | 复用 Vision 的重试逻辑，最多 3 次重试 |
| 用户未配置 Vision Provider | 提示"请先配置 Vision API"并引导到设置页面 |
| 模板分类过多导致 Sidebar 滚动 | 限制为 6-8 个核心模板，未来可添加"更多"展开 |
| 生成内容不符合预期 | 提供"重新生成"按钮，允许用户调整输入 |