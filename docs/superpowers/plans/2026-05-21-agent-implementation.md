# Agent 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Agent 提示词增强功能 - 用户输入简短描述（可选上传参考图片），Agent 根据预设模板扩展为详细的提示词。

**Architecture:** 采用 Sidepanel 独立视图架构，复用 Vision Provider Config 进行 API 调用。新增 Agent 入口在 Sidebar 资源库上方，点击后切换到模板分类 Sidebar。API 调用逻辑与 Vision 共享，但 System Prompt 根据模板分类动态构建。

**Tech Stack:** React 19.x, TypeScript, Chrome Extension MV3, Zustand 状态管理, Tailwind CSS, Lucide icons

---

## File Structure

### New Files (Create)
```
packages/shared/
├── messages.ts              # Add AGENT_* message types (modify existing)
└── types/
    └── agent.ts             # Agent types: AgentTemplateCategory, AgentGeneratePayload

packages/extension/src/
├── lib/
│   ├── agent-api.ts         # Agent API call logic (build request, execute)
│   └── agent-templates.ts   # Template definitions + System Prompt builder
├── sidepanel/
│   └── views/
│   │   └── AgentView.tsx    # Agent input interface component
│   └── components/
│       └── AgentResultCard.tsx  # Result display with save options
├── background/
│   └── agent-handler.ts     # AGENT_GENERATE message handler
└── data/
    └── agent-templates.json # Template category data (6 categories)
```

### Modify Existing Files
```
packages/extension/src/
├── sidepanel/views/PromptListView.tsx  # Add Agent entry + view mode state
├── background/service-worker.ts         # Add AGENT_GENERATE handler
```

---

## Task Breakdown

### Task 1: Define Agent Types and Message Types

**Files:**
- Create: `packages/shared/types/agent.ts`
- Modify: `packages/shared/messages.ts:1-110`

- [ ] **Step 1: Create agent types file**

```typescript
// packages/shared/types/agent.ts

/**
 * Agent template categories
 */
export type AgentTemplateCategory =
  | 'ecommerce'    // 电商套图
  | 'poster'       // 海报图
  | 'illustration' // 插画
  | 'logo'         // Logo
  | 'ui'           // UI界面
  | '3d'           // 3D渲染

/**
 * Agent template definition
 */
export interface AgentTemplate {
  id: AgentTemplateCategory
  name: string
  nameEn: string
  keywords: string[] // Style keywords for System Prompt
  description: string // Template description shown in UI
  descriptionEn: string
}

/**
 * Agent generate request payload
 */
export interface AgentGeneratePayload {
  inputText: string
  imageData?: string // Optional reference image (base64 data URL)
  templateCategory: AgentTemplateCategory
}

/**
 * Agent generate result
 */
export interface AgentGenerateResult {
  prompt: string // Generated prompt text
  templateCategory: AgentTemplateCategory
}

/**
 * Agent view mode state
 */
export type AgentViewMode = 'default' | 'agent'
```

- [ ] **Step 2: Add Agent message types to messages.ts**

Add after line 109 (after existing MessageType enum):

```typescript
// packages/shared/messages.ts (append to MessageType enum)

  // Agent: Prompt enhancement feature
  AGENT_GENERATE = 'AGENT_GENERATE',           // Request Agent generation
  AGENT_GENERATE_RESULT = 'AGENT_GENERATE_RESULT', // Response with generated prompt
  AGENT_EXTRACT_FROM_CS = 'AGENT_EXTRACT_FROM_CS', // Content Script extract input to Sidepanel
```

- [ ] **Step 3: Commit type definitions**

```bash
git add packages/shared/types/agent.ts packages/shared/messages.ts
git commit -m "feat(agent): add Agent type definitions and message types"
```

---

### Task 2: Create Agent Template Definitions

**Files:**
- Create: `packages/extension/src/data/agent-templates.json`
- Create: `packages/extension/src/lib/agent-templates.ts`

- [ ] **Step 1: Create template category data**

```json
// packages/extension/src/data/agent-templates.json

[
  {
    "id": "ecommerce",
    "name": "电商套图",
    "nameEn": "E-commerce",
    "keywords": ["产品主体突出", "白底/渐变背景", "光影质感", "商业摄影", "多角度展示", "细节呈现", "高级质感"],
    "description": "适用于电商产品展示，强调产品主体与商业质感",
    "descriptionEn": "For e-commerce product display, emphasizing product focus and commercial quality"
  },
  {
    "id": "poster",
    "name": "海报图",
    "nameEn": "Poster",
    "keywords": ["视觉冲击力", "主题鲜明", "构图创意", "色彩对比", "排版设计", "信息层次", "吸引眼球"],
    "description": "适用于宣传海报，强调视觉冲击与信息传达",
    "descriptionEn": "For promotional posters, emphasizing visual impact and message delivery"
  },
  {
    "id": "illustration",
    "name": "插画",
    "nameEn": "Illustration",
    "keywords": ["艺术风格", "手绘质感", "创意表达", "色彩搭配", "叙事元素", "情感渲染", "独特画风"],
    "description": "适用于艺术插画，强调创意表达与情感渲染",
    "descriptionEn": "For artistic illustrations, emphasizing creative expression and emotional rendering"
  },
  {
    "id": "logo",
    "name": "Logo",
    "nameEn": "Logo",
    "keywords": ["简洁识别", "品牌元素", "符号化", "负空间", "几何造型", "视觉记忆", "品牌调性"],
    "description": "适用于品牌Logo，强调简洁识别与品牌调性",
    "descriptionEn": "For brand logos, emphasizing simplicity and brand identity"
  },
  {
    "id": "ui",
    "name": "UI界面",
    "nameEn": "UI Interface",
    "keywords": ["现代界面", "交互设计", "用户体验", "响应式", "Material/Fluent风格", "信息架构", "视觉一致性"],
    "description": "适用于UI界面，强调现代设计与用户体验",
    "descriptionEn": "For UI interfaces, emphasizing modern design and user experience"
  },
  {
    "id": "3d",
    "name": "3D渲染",
    "nameEn": "3D Render",
    "keywords": ["三维建模", "材质纹理", "光影渲染", "场景搭建", "Blender/Cinema4D风格", "透视准确", "真实感"],
    "description": "适用于3D渲染，强调三维质感与光影效果",
    "descriptionEn": "For 3D renders, emphasizing 3D quality and lighting effects"
  }
]
```

- [ ] **Step 2: Create System Prompt builder**

```typescript
// packages/extension/src/lib/agent-templates.ts

import type { AgentTemplate, AgentTemplateCategory } from '@oh-my-prompt/shared/types/agent'
import templatesData from '@/data/agent-templates.json'

/**
 * Get all Agent templates
 */
export function getAgentTemplates(): AgentTemplate[] {
  return templatesData as AgentTemplate[]
}

/**
 * Get template by category ID
 */
export function getAgentTemplate(category: AgentTemplateCategory): AgentTemplate | undefined {
  return getAgentTemplates().find(t => t.id === category)
}

/**
 * Build System Prompt for Agent generation
 * @param category - Template category
 * @param hasImage - Whether user provided reference image
 * @returns System Prompt string
 */
export function buildAgentSystemPrompt(
  category: AgentTemplateCategory,
  hasImage: boolean
): string {
  const template = getAgentTemplate(category)
  if (!template) {
    throw new Error(`Unknown template category: ${category}`)
  }

  const keywordsText = template.keywords.join('、')

  if (hasImage) {
    return `你是提示词增强专家。用户正在生成${template.name}类型的提示词。

风格要点：${keywordsText}。

参考图片的视觉风格、色彩、构图，结合用户描述生成详细的提示词。提示词应包含：
- 主体描述（是什么）
- 风格定义（什么风格）
- 光影效果（如何照亮）
- 色彩方案（什么颜色）
- 构图布局（如何排列）
- 材质纹理（什么质感）
- 氛围情绪（什么感觉）

输出语言与输入语言一致。如果用户用中文描述，输出中文提示词；如果用英文描述，输出英文提示词。`
  }

  return `你是提示词增强专家。用户正在生成${template.name}类型的提示词。

风格要点：${keywordsText}。

将简短描述扩展为详细的提示词，包含：
- 主体描述（是什么）
- 风格定义（什么风格）
- 光影效果（如何照亮）
- 色彩方案（什么颜色）
- 构图布局（如何排列）
- 材质纹理（什么质感）
- 氛围情绪（什么感觉）

输出语言与输入语言一致。如果用户用中文描述，输出中文提示词；如果用英文描述，输出英文提示词。`
}
```

- [ ] **Step 3: Commit template definitions**

```bash
git add packages/extension/src/data/agent-templates.json packages/extension/src/lib/agent-templates.ts
git commit -m "feat(agent): add template categories and System Prompt builder"
```

---

### Task 3: Implement Agent API Call Logic

**Files:**
- Create: `packages/extension/src/lib/agent-api.ts`

- [ ] **Step 1: Create Agent API module**

```typescript
// packages/extension/src/lib/agent-api.ts

import type { ProviderConfig, AgentGeneratePayload, AgentGenerateResult } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { buildAgentSystemPrompt } from './agent-templates'

const API_TIMEOUT_MS = 300000 // 5 minutes

/**
 * Get active provider config from storage
 */
async function getActiveProviderConfig(): Promise<ProviderConfig | null> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.GET_ACTIVE_CONFIG })
  return response?.success ? response.data : null
}

/**
 * Execute Agent API call
 * Reuses Vision API infrastructure but with Agent-specific System Prompt
 */
export async function executeAgentApiCall(
  payload: AgentGeneratePayload,
  signal?: AbortSignal
): Promise<AgentGenerateResult> {
  // 1. Get active Provider Config
  const config = await getActiveProviderConfig()
  if (!config) {
    throw new Error('NO_CONFIG: 请先配置 Vision API')
  }

  // 2. Build System Prompt
  const systemPrompt = buildAgentSystemPrompt(payload.templateCategory, !!payload.imageData)

  // 3. Build headers and endpoint based on API format
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  let endpointUrl = config.apiEndpoint

  if (config.apiFormat === 'anthropic_messages') {
    headers['x-api-key'] = config.apiKey
    headers['anthropic-version'] = '2023-06-01'
    if (!endpointUrl.includes('/messages')) {
      endpointUrl = endpointUrl.replace(/\/$/, '') + '/v1/messages'
    }
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`
    if (!endpointUrl.includes('/chat/completions')) {
      endpointUrl = endpointUrl.replace(/\/$/, '') + '/v1/chat/completions'
    }
  }

  // 4. Build request body
  let requestBody: object

  if (config.apiFormat === 'anthropic_messages') {
    const imageContent = payload.imageData ? [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: payload.imageData.replace(/^data:image\/[^;]+;base64,/, '') } }
    ] : []

    requestBody = {
      model: config.selectedModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: payload.imageData ? [
            ...imageContent,
            { type: 'text', text: payload.inputText }
          ] : payload.inputText
        }
      ]
    }
  } else {
    const imageContent = payload.imageData ? [
      { type: 'image_url', image_url: { url: payload.imageData } }
    ] : []

    requestBody = {
      model: config.selectedModel,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: payload.imageData ? [
            { type: 'text', text: `${systemPrompt}\n\n用户描述：${payload.inputText}` },
            ...imageContent
          ] : `${systemPrompt}\n\n用户描述：${payload.inputText}`
        }
      ]
    }
  }

  // 5. Execute with timeout
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
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`
      try {
        const errorBody = await response.json()
        if (errorBody?.error?.message) errorDetail = errorBody.error.message
        if (errorBody?.message) errorDetail = errorBody.message
      } catch {}
      throw new Error(errorDetail)
    }

    const data = await response.json()

    // Extract prompt text
    let promptText: string
    if (config.apiFormat === 'anthropic_messages') {
      promptText = data.content?.find((c: any) => c.type === 'text')?.text || ''
    } else {
      promptText = data.choices?.[0]?.message?.content || ''
    }

    if (!promptText) throw new Error('API 返回空内容')

    return { prompt: promptText, templateCategory: payload.templateCategory }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout')
    }
    throw error
  }
}
```

- [ ] **Step 2: Commit Agent API module**

```bash
git add packages/extension/src/lib/agent-api.ts
git commit -m "feat(agent): add Agent API call logic with provider config reuse"
```

---

### Task 4: Add Agent Message Handler in Service Worker

**Files:**
- Create: `packages/extension/src/background/agent-handler.ts`
- Modify: `packages/extension/src/background/service-worker.ts`

- [ ] **Step 1: Create Agent handler module**

```typescript
// packages/extension/src/background/agent-handler.ts

import type { AgentGeneratePayload, AgentGenerateResult } from '@oh-my-prompt/shared/types'
import { MessageResponse } from '@oh-my-prompt/shared/messages'
import { executeAgentApiCall } from '../lib/agent-api'

export async function handleAgentGenerate(
  payload: AgentGeneratePayload,
  sendResponse: (response: MessageResponse<AgentGenerateResult>) => void
): Promise<boolean> {
  try {
    const result = await executeAgentApiCall(payload)
    sendResponse({ success: true, data: result })
  } catch (error) {
    console.error('[Oh My Prompt] Agent API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    sendResponse({ success: false, error: errorMessage })
  }
  return true // Async response
}
```

- [ ] **Step 2: Register handler in service worker**

Add import and case to `packages/extension/src/background/service-worker.ts`:

```typescript
// Add import after existing imports (line 15)
import { handleAgentGenerate } from './agent-handler'
import type { AgentGeneratePayload } from '@oh-my-prompt/shared/types'

// Add case in chrome.runtime.onMessage listener (after VISION_API_CALL case)
case MessageType.AGENT_GENERATE:
  handleAgentGenerate(message.payload as AgentGeneratePayload, sendResponse)
  return true
```

- [ ] **Step 3: Commit service worker changes**

```bash
git add packages/extension/src/background/agent-handler.ts packages/extension/src/background/service-worker.ts
git commit -m "feat(agent): add AGENT_GENERATE message handler"
```

---

### Task 5: Implement AgentView Component

**Files:**
- Create: `packages/extension/src/sidepanel/views/AgentView.tsx`

- [ ] **Step 1: Create AgentView component (see spec section 4.3 for full code)**

Create the full AgentView.tsx component with:
- Header with template name
- Template hint card (blue background)
- Input textarea (required)
- Image upload section (optional)
- Generate button with loading state
- Error banner with retry
- Result section with copy/save/regenerate buttons
- Save dialog for category selection

Refer to spec document sections 4.2 and 4.3 for complete UI structure and styling.

- [ ] **Step 2: Commit AgentView**

```bash
git add packages/extension/src/sidepanel/views/AgentView.tsx
git commit -m "feat(agent): add AgentView input interface component"
```

---

### Task 6: Integrate Agent into PromptListView Sidebar

**Files:**
- Modify: `packages/extension/src/sidepanel/views/PromptListView.tsx`

- [ ] **Step 1: Add Agent state**

Add after line 597:

```typescript
// Agent view state
import type { AgentTemplateCategory, AgentViewMode } from '@oh-my-prompt/shared/types/agent'
import { AgentView } from '@/sidepanel/views/AgentView'
import { getAgentTemplates, getAgentTemplate } from '@/lib/agent-templates'

const [agentViewMode, setAgentViewMode] = useState<AgentViewMode>('default')
const [agentSelectedTemplate, setAgentSelectedTemplate] = useState<AgentTemplateCategory>('ecommerce')
const [agentExtractedText, setAgentExtractedText] = useState<string>('')
```

- [ ] **Step 2: Add Agent entry button in Sidebar**

Add in sidebar section (before Resource Library button):

```tsx
{/* Agent entry with NEW tag */}
<button
  className={`sidebar-category-item ${agentViewMode === 'agent' ? 'selected' : ''}`}
  onClick={() => setAgentViewMode('agent')}
  style={{ borderLeft: agentViewMode === 'agent' ? '3px solid #A16207' : 'none' }}
>
  <div className="sidebar-category-icon-wrapper">
    <Sparkles className="sidebar-category-icon" style={{ color: '#A16207' }} />
  </div>
  <span className="sidebar-category-name" style={{ color: '#A16207' }}>Agent</span>
  <span className="sidebar-category-new-tag">NEW</span>
</button>
```

- [ ] **Step 3: Add template categories sidebar (agent mode)**

Replace sidebar content when `agentViewMode === 'agent'`:

```tsx
{agentViewMode === 'agent' ? (
  <>
    {/* Return button */}
    <button className="sidebar-category-item" onClick={() => setAgentViewMode('default')}>
      <ArrowLeft className="sidebar-category-icon" />
      <span>返回</span>
    </button>

    {/* Template categories */}
    {getAgentTemplates().map(template => (
      <button
        key={template.id}
        className={`sidebar-category-item ${agentSelectedTemplate === template.id ? 'selected' : ''}`}
        onClick={() => setAgentSelectedTemplate(template.id)}
      >
        <Sparkles className="sidebar-category-icon" />
        <Tooltip content={template.description}>
          <span>{template.name}</span>
        </Tooltip>
      </button>
    ))}
  </>
) : (
  // Default sidebar content...
)}
```

- [ ] **Step 4: Add AgentView in main content**

Show AgentView when in agent mode:

```tsx
{agentViewMode === 'agent' ? (
  <AgentView
    selectedTemplate={agentSelectedTemplate}
    extractedText={agentExtractedText}
    categories={sortableCategories}
    onSave={(prompt, categoryId, templateCategory) => {
      const template = getAgentTemplate(templateCategory)
      usePromptStore.getState().addPrompt({
        name: `Agent: ${template?.name || '生成'}`,
        content: prompt,
        categoryId,
        order: prompts.filter(p => p.categoryId === categoryId).length,
      })
      setToastMessage('已保存到库')
      setTimeout(hideToast, 2000)
    }}
  />
) : (
  // Default prompt list...
)}
```

- [ ] **Step 5: Add CSS styles for Agent elements**

Add NEW tag and Agent-specific styles to existing CSS:

```css
.sidebar-category-new-tag {
  background: #fef3c7;
  color: #92400e;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
  font-weight: 600;
}
```

- [ ] **Step 6: Commit integration**

```bash
git add packages/extension/src/sidepanel/views/PromptListView.tsx
git commit -m "feat(agent): integrate Agent entry and view into PromptListView"
```

---

### Task 7: Handle AGENT_EXTRACT_FROM_CS Message

**Files:**
- Modify: `packages/extension/src/sidepanel/views/PromptListView.tsx`

- [ ] **Step 1: Add message listener in PromptListView**

```typescript
// Listen for extracted text from Content Script
useEffect(() => {
  const handler = (message: { type: string; payload?: { inputText: string } }) => {
    if (message.type === MessageType.AGENT_EXTRACT_FROM_CS && message.payload?.inputText) {
      setAgentExtractedText(message.payload.inputText)
      setAgentViewMode('agent')
    }
  }
  chrome.runtime.onMessage.addListener(handler)
  return () => chrome.runtime.onMessage.removeListener(handler)
}, [])
```

- [ ] **Step 2: Commit message handling**

```bash
git add packages/extension/src/sidepanel/views/PromptListView.tsx
git commit -m "feat(agent): handle AGENT_EXTRACT_FROM_CS message"
```

---

## Phase 2 Tasks (Optional - Content Script Integration)

### Task 8: Add Content Script Agent Icon (Phase 2)

**Files:**
- Create: `packages/extension/src/content/agent-extractor.ts`
- Modify: `packages/extension/src/content/core/coordinator.ts`
- Modify: `packages/extension/src/content/components/DropdownApp.tsx`

This task is deferred to Phase 2 per spec requirements. Implementation involves:
1. Creating input content extractor
2. Adding Agent icon button alongside Vision icon
3. Sending extracted text to Sidepanel via AGENT_EXTRACT_FROM_CS message

---

## Testing Checklist

### Manual Testing
1. Click Agent entry → Sidebar shows template categories
2. Select template → AgentView shows template hint
3. Enter description + Generate → Loading state shown
4. Generation success → Result displayed with actions
5. Copy → Toast "已复制到剪贴板"
6. Save → Category dialog, then toast "已保存到库"
7. Return button → Back to default sidebar

### Error Cases
1. No config → Error: "请先配置 Vision API"
2. Timeout → Error banner with retry button
3. Invalid input → Toast: "请输入描述"

---

## Implementation Priority

**Phase 1 (Required):**
- Tasks 1-7: Core Sidepanel functionality

**Phase 2 (Optional):**
- Task 8: Content Script Agent icon integration

**Phase 3 (Future):**
- Generation history
- Custom template categories
- Batch generation