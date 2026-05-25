# 电商套图 Agent 面板 — 设计文档

> 日期：2026-05-22
> 状态：待实现
> 分支：v2.0.0

## 一、背景

当前 Agent 模式对 6 个模板类别（电商套图、海报图、插画、Logo、UI界面、3D渲染）使用同一套通用 UI：一个文本输入框 + 可选单图上传 + 生成按钮。电商套图作为最高频的使用场景，需要专属面板来提供更专业的电商生图体验。

参考竞品（美图秀秀 AI 商品图）的左侧面板设计，实现电商专属的套图生成面板。

## 二、参考 UI 结构

参考 HTML 展示的竞品面板包含以下区块：

| 区块 | 功能 | 说明 |
|------|------|------|
| 商品原图 | 单图上传 | 单个上传区域，点击上传商品原图，上传后显示缩略图+文件名+删除按钮 |
| 生成设置 | 下拉选择 | 平台（亚马逊等）、市场（中国等）、语言（中文等）、比例（1:1等） |
| 商品卖点&要求 | 文本输入 + AI帮写 | textarea + AI自动生成卖点按钮 |
| 套图结构配置 | 可展开选项卡片 | 智能匹配（默认，简单卡片）/ 自定义配置（可展开卡片，含4行计数器：白底图/场景图/卖点图/其他） |
| 底部 | 生成按钮 | "一键生成爆款套图 (7张)" |
| 生成结果 | 全屏替换视图 | 表单完全替换为结果视图：顶部返回栏+可滚动结果卡片+底部操作栏 |

## 三、实现方案

### 3.1 架构决策

**条件渲染替换**：当 `selectedTemplate === 'ecommerce'` 时，渲染 `EcommercePanel`/`EcommerceView` 替代通用的 `AgentPanel`/`AgentView`。不在现有组件中添加大量条件逻辑。

### 3.2 数据模型

#### 新增类型（`packages/shared/types/agent.ts`）

```typescript
// 电商平台
export type EcommercePlatform = 'amazon' | 'taobao' | 'jd' | 'pinduoduo' | 'temu' | 'shein'

// 目标市场
export type EcommerceMarket = 'china' | 'usa' | 'europe' | 'japan' | 'southeast_asia'

// 输出语言
export type EcommerceLanguage = 'zh' | 'en' | 'ja'

// 图片比例
export type EcommerceAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'

// 电商配置
export interface EcommerceConfig {
  platform: EcommercePlatform
  market: EcommerceMarket
  language: EcommerceLanguage
  aspectRatio: EcommerceAspectRatio
  sellingPoints: string
  setStructure: 'smart' | 'custom'
  customCounts?: EcommerceCustomCounts  // 自定义配置时的各类型数量
}

// 自定义套图各类型数量
export interface EcommerceCustomCounts {
  whiteBg: number      // 白底图数量
  scene: number        // 场景图数量
  sellingPoint: number // 卖点图数量
  other: number        // 其他图数量（AI智能匹配）
}

// 电商结构化生成结果
export interface EcommerceGenerateResult {
  prompts: Array<{
    type: string        // 如 '主图', '场景图', '细节图'
    typeEn: string      // 如 'Main Image', 'Scene Image'
    prompt: string      // 生成的提示词
    aspectRatio: string // 如 '1:1'
  }>
  templateCategory: 'ecommerce'
}
```

#### 扩展现有类型

```typescript
// AgentGeneratePayload 新增字段
export interface AgentGeneratePayload {
  inputText: string
  imageData?: string
  productImage?: string           // 新增：单张商品原图（替换原 productImages 数组）
  templateCategory: AgentTemplateCategory
  ecommerceConfig?: EcommerceConfig  // 新增：电商专属配置
}

// AgentGenerateResult 新增字段
export interface AgentGenerateResult {
  prompt: string
  templateCategory: AgentTemplateCategory
  ecommercePrompts?: EcommerceGenerateResult  // 新增：结构化多提示词结果
}
```

### 3.3 配置数据

**`packages/extension/src/data/ecommerce-config.json`**

```json
{
  "platforms": [
    { "id": "amazon", "name": "亚马逊", "nameEn": "Amazon" },
    { "id": "taobao", "name": "淘宝", "nameEn": "Taobao" },
    { "id": "jd", "name": "京东", "nameEn": "JD.com" },
    { "id": "pinduoduo", "name": "拼多多", "nameEn": "Pinduoduo" },
    { "id": "temu", "name": "Temu", "nameEn": "Temu" },
    { "id": "shein", "name": "Shein", "nameEn": "Shein" }
  ],
  "markets": [
    { "id": "china", "name": "中国", "nameEn": "China" },
    { "id": "usa", "name": "美国", "nameEn": "USA" },
    { "id": "europe", "name": "欧洲", "nameEn": "Europe" },
    { "id": "japan", "name": "日本", "nameEn": "Japan" },
    { "id": "southeast_asia", "name": "东南亚", "nameEn": "Southeast Asia" }
  ],
  "languages": [
    { "id": "zh", "name": "中文", "nameEn": "Chinese" },
    { "id": "en", "name": "English", "nameEn": "English" },
    { "id": "ja", "name": "日本語", "nameEn": "Japanese" }
  ],
  "aspectRatios": [
    { "id": "1:1", "name": "1:1" },
    { "id": "4:3", "name": "4:3" },
    { "id": "3:4", "name": "3:4" },
    { "id": "16:9", "name": "16:9" },
    { "id": "9:16", "name": "9:16" }
  ]
}
```

### 3.4 电商系统提示词

**`packages/extension/src/lib/agent-templates.ts`** 新增函数：

#### `buildEcommerceSystemPrompt(config, hasProductImages)`

比通用提示词更结构化，包含：
- 平台专属规则（如亚马逊要求纯白背景 RGB 255,255,255）
- 市场惯例
- 语言匹配指令
- 比例指导
- 卖点整合
- **JSON 格式输出指令**（指导 AI 返回结构化多提示词结果）

```
你是电商套图提示词专家。根据用户提供的商品信息和参考图片，生成一套完整的电商产品展示图片提示词。

## 平台要求
[平台专属规则，如：亚马逊主图必须纯白背景，产品占85%以上面积...]

## 市场惯例
[市场相关约定]

## 输出语言
[语言匹配指令]

## 图片比例
所有图片比例为 {aspectRatio}。

## 商品卖点
{sellingPoints}

## 输出格式
请以JSON格式输出：
{
  "prompts": [
    { "type": "图片类型（中文）", "typeEn": "图片类型（英文）", "prompt": "详细提示词", "aspectRatio": "比例" }
  ]
}

## 套图结构
[智能匹配：AI决定最优图片类型组合 / 自定义：按用户指定数量生成各类型]
[自定义配置时：白底图 N 张、场景图 N 张、卖点图 N 张、其他 N 张（AI智能匹配类型）]
```

#### `buildEcommerceAiWritePrompt(platform, language)`

"AI帮写"功能专用提示词，从商品图片生成卖点描述。

#### `getPlatformRules(platform)`

各平台规则映射：

| 平台 | 规则摘要 |
|------|----------|
| 亚马逊 | 主图纯白背景，产品占85%+，禁水印/文字/Logo |
| 淘宝 | 白底或浅色渐变，促销文字≤20%面积，建议5张图 |
| 京东 | 白底主图，产品居中，允许品牌Logo水印 |
| 拼多多 | 突出产品主体，背景简洁，强调性价比 |
| Temu | 白底或场景图，英文标注为主，面向海外 |
| Shein | 时尚感强，场景图为主，模特展示优先 |

### 3.5 UI 组件

#### EcommercePanel（内容脚本版本）

**文件**：`packages/extension/src/content/components/EcommercePanel.tsx`

Props 与 AgentPanel 一致，内部状态扩展：

```typescript
const [productImage, setProductImage] = useState<string | null>(null)  // 单张商品原图
const [platform, setPlatform] = useState<EcommercePlatform>('amazon')
const [market, setMarket] = useState<EcommerceMarket>('china')
const [language, setLanguage] = useState<EcommerceLanguage>('zh')
const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>('1:1')
const [sellingPoints, setSellingPoints] = useState('')
const [setStructure, setSetStructure] = useState<'smart' | 'custom'>('smart')
const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>({ whiteBg: 1, scene: 2, sellingPoint: 2, other: 2 })
const [isAiWriting, setIsAiWriting] = useState(false)
const [viewMode, setViewMode] = useState<'form' | 'result'>('form')  // 表单视图 / 结果视图
const [ecommerceResult, setEcommerceResult] = useState<EcommerceGenerateResult | null>(null)
```

UI 区块：

1. **商品原图** — 单个上传区域，点击触发文件选择，上传后显示缩略图+文件名+删除按钮
2. **生成设置** — 4个 `<select>` 下拉框（平台/市场/语言/比例）
3. **商品卖点&要求** — textarea + "AI 帮写"按钮（灯泡图标）
4. **套图结构配置** — 两个可展开选项卡片（单选）：
   - **智能匹配**（默认选中）：简单卡片，checkbox + 标题 + 描述文字
   - **自定义配置**：可展开卡片，checkbox + 标题 + 展开后显示4行计数器：
     - 白底图：标签 + 描述 + −/+ 计数器
     - 场景图：标签 + 描述 + −/+ 计数器
     - 卖点图：标签 + 描述 + −/+ 计数器
     - 其他：标签 + "AI智能匹配"标签 + −/+ 计数器
5. **生成按钮** — "一键生成电商套图"
6. **结果视图**（全屏替换表单）：
   - 顶部栏：← 返回按钮 | "生成结果" 标题 | "N 张" 数量
   - 可滚动区域：结果卡片列表，每张卡片显示图片类型标签 + 提示词文本 + 复制/保存操作
   - 底部固定栏："一键复制全部"（实心主色按钮）+ "重新生成"（描边次要按钮）
   - 点击 "← 返回" 返回表单视图，保留所有配置状态
   - 点击 "重新生成" 返回表单视图并自动触发生成

样式：Portal 渲染，CSS 类添加到 `dropdown-styles.ts`，前缀 `ecommerce-*`

#### EcommerceView（侧边栏版本）

**文件**：`packages/extension/src/sidepanel/views/EcommerceView.tsx`

与 EcommercePanel 功能相同，使用 Tailwind + `sidepanel/index.css` 中的 `ecommerce-*` 类。侧边栏空间更大，布局稍宽。

### 3.6 集成路由

#### DropdownContainer.tsx

```tsx
{agentViewMode === 'agent' ? (
  agentSelectedTemplate === 'ecommerce' ? (
    <EcommercePanel ... />
  ) : (
    <AgentPanel ... />
  )
) : ...}
```

#### PromptListView.tsx

```tsx
agentViewMode === 'agent' ? (
  agentSelectedTemplate === 'ecommerce' ? (
    <EcommerceView ... />
  ) : (
    <AgentView ... />
  )
) : ...
```

### 3.7 API 层修改

#### `agent-api.ts`

- 当 `templateCategory === 'ecommerce'` 且 `ecommerceConfig` 存在时，使用 `buildEcommerceSystemPrompt` 替代通用提示词
- `productImage` 作为单个 image content block 传入 API 请求（Anthropic: `{ type: 'image', source: ... }`，OpenAI: `{ type: 'image_url', image_url: ... }`）
- 自定义配置时，`customCounts` 传入提示词构建器，指导 AI 生成指定数量的各类型图片
- 结果解析：尝试 JSON.parse → `EcommerceGenerateResult`，失败则回退纯文本

#### `agent-handler.ts`

新增 `handleEcommerceAiWrite` 处理 "AI帮写" 请求

#### `service-worker.ts`

路由 `AGENT_ECOMMERCE_AI_WRITE` 消息类型

#### `vision-proxy.ts`（Web App）

新增服务端 `buildEcommerceSystemPrompt`，处理单商品图片

#### `route.ts`（Web App API）

接受 `ecommerceConfig` 和 `productImage` 字段

### 3.8 消息类型

**`packages/shared/messages.ts`** 新增：

```typescript
AGENT_ECOMMERCE_AI_WRITE = 'AGENT_ECOMMERCE_AI_WRITE'
```

## 四、MVP 范围

### 包含

- 单张商品原图上传（点击上传 → 缩略图预览 → 删除）
- 平台/市场/语言/比例下拉选择
- 商品卖点 textarea + "AI帮写"按钮
- 智能匹配套图结构（默认选中，简单卡片）
- 自定义配置套图结构（可展开卡片 + 4行计数器：白底图/场景图/卖点图/其他）
- 生成结构化多提示词输出
- 全屏结果视图替换（← 返回保留配置 / 重新生成 / 一键复制全部）
- 结果卡片列表展示（类型标签 + 提示词 + 复制/保存）
- 保存到分类对话框

### 不包含（Phase 2）

- 自定义配置套图结构（需要图片类型选择器 UI）
- 爆款风格分析按钮（需要额外 API/数据）
- 价格/美豆显示（需要订阅状态集成）
- 结果图片预览（需要图片生成 API，不仅是提示词）

## 五、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 组件策略 | 条件渲染替换 | 保持组件简洁，避免单组件过度条件逻辑 |
| 商品图上传 | 单图上传（非3列网格） | 原型验证后确认单图更简洁，减少用户决策负担 |
| 套图结构配置 | 可展开选项卡片+计数器 | 参考竞品交互模式，智能匹配/自定义配置用卡片式单选，自定义展开后用计数器行 |
| 结果展示 | 全屏替换表单视图 | 空间利用最大化，结果卡片有充足展示空间，返回按钮保留配置状态 |
| 结果格式 | JSON 解析 + 纯文本回退 | AI 输出不稳定，需健壮的解析策略 |
| 下拉样式 | 原生 `<select>` + 自定义 CSS | Portal 上下文中原生 select 可靠，避免复杂自定义组件 |
| AI帮写 | 独立消息类型 | 与主生成流程解耦，系统提示词不同 |
| 状态同步 | 不同步 | 内容脚本/侧边栏各自维护状态，避免跨上下文复杂度 |

## 六、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/shared/types/agent.ts` | 修改 | 新增电商类型、EcommerceConfig（含 customCounts）、EcommerceCustomCounts、扩展 Payload（productImage 单图） |
| `packages/shared/messages.ts` | 修改 | 新增 AGENT_ECOMMERCE_AI_WRITE |
| `packages/extension/src/data/ecommerce-config.json` | 新建 | 下拉选项配置数据 |
| `packages/extension/src/lib/agent-templates.ts` | 修改 | 新增 buildEcommerceSystemPrompt（含自定义计数）、buildEcommerceAiWritePrompt、getPlatformRules |
| `packages/extension/src/content/components/EcommercePanel.tsx` | 新建 | 内容脚本电商面板（单图上传+可展开结构卡片+全屏结果视图） |
| `packages/extension/src/sidepanel/views/EcommerceView.tsx` | 新建 | 侧边栏电商视图（同上，Tailwind样式） |
| `packages/extension/src/content/styles/dropdown-styles.ts` | 修改 | 新增 ecommerce-* CSS 类（含单图上传、可展开卡片、计数器、结果视图样式） |
| `packages/extension/src/sidepanel/index.css` | 修改 | 新增 ecommerce-* CSS 类（同上） |
| `packages/extension/src/content/components/DropdownContainer.tsx` | 修改 | 条件渲染 EcommercePanel |
| `packages/extension/src/sidepanel/views/PromptListView.tsx` | 修改 | 条件渲染 EcommerceView |
| `packages/extension/src/lib/agent-api.ts` | 修改 | 处理 ecommerceConfig、productImage 单图、JSON 结果解析 |
| `packages/extension/src/background/agent-handler.ts` | 修改 | 新增 handleEcommerceAiWrite |
| `packages/extension/src/background/service-worker.ts` | 修改 | 路由 AGENT_ECOMMERCE_AI_WRITE |
| `packages/web-app/lib/vision-proxy.ts` | 修改 | 新增服务端电商提示词构建器 |
| `packages/web-app/app/api/vision/generate/route.ts` | 修改 | 接受 ecommerceConfig 和 productImage |

## 七、Sidepanel EcommerceView 对齐设计

> 2026-05-22 新增：完全对齐 ContentScript EcommercePanel 的样式和功能

### 7.1 背景

当前 Sidepanel 的 `EcommerceView.tsx` 与 ContentScript 的 `EcommercePanel.tsx` 存在显著差异，需要完全对齐。

### 7.2 差异对比

| 特性 | ContentScript (EcommercePanel) | Sidepanel (EcommerceView) | 对齐目标 |
|------|----------------------------|-------------------------|---------|
| 商品图片上传 | 单图上传 | 3图网格 | → 单图上传 |
| 套图结构选择 | 卡片式 + checkbox + 说明 | 简单按钮切换 | → 卡片式选择 |
| 自定义计数器 | 有（白底图、场景图、卖点图、其他图） | 无 | → 添加计数器 UI |
| 结果视图 | 全屏覆盖式（viewMode 状态） | 表单下方内嵌 | → 全屏结果视图 |
| 插入按钮 | 有（onInsert prop） | 无 | → 添加插入按钮 |

### 7.3 状态管理变更

```typescript
// 新增状态
const [productImage, setProductImage] = useState<string | null>(null)
const [productImageName, setProductImageName] = useState('')
const [viewMode, setViewMode] = useState<'form' | 'result'>('form')
const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>({
  whiteBg: 1,
  scene: 2,
  sellingPoint: 2,
  other: 2,
})

// 移除状态
// productImages: string[] → 删除
// MAX_IMAGES = 3 → 删除
// fileInputRefs: useRef<(HTMLInputElement | null)[]>([null, null, null]) → 删除
```

### 7.4 UI 改动

#### 商品图片上传

从 3图网格改为单图上传区域：
- 移除 `productImages: string[]` 状态
- 新增 `productImage: string | null` 和 `productImageName: string` 状态
- 单个文件 input ref
- 上传区域显示文件名和预览图

#### 套图结构选择

从按钮切换改为卡片式选择：
- 每个选项为独立卡片
- 卡片包含 checkbox、标题、说明
- 智能配图卡片：显示 "AI 自动规划套图数量与类型"
- 自定义配图卡片：显示计数器 UI（白底图/场景图/卖点图/其他图）
- 场景图、卖点图带 "AI" 标签

#### 自定义计数器

计数器 UI 规范：
- 每行：名称 + 描述 + +/- 按钮
- 数量范围：0-10
- 点击 +/- 时 `e.stopPropagation()` 防止触发卡片选择

#### 结果视图

从内嵌显示改为全屏覆盖式：
- 新增 `viewMode: 'form' | 'result'` 状态
- 生成成功后切换到 `viewMode: 'result'`
- Header：返回按钮 + 标题 + 数量统计
- Body：提示词卡片列表（类型标签 + 提示词 + 操作按钮）
- Footer：复制全部 + 重新生成按钮

#### 插入按钮

Sidepanel 没有输入框上下文，插入按钮处理：
- 点击后：复制到剪贴板
- 显示 toast: "已复制，请在输入框中粘贴"
- 结果卡片操作栏添加插入图标（箭头向上）

### 7.5 CSS 类名规范

沿用 Sidepanel 的 CSS 类名风格（来自 `index.css`），同时借鉴 ContentScript 的 `ecommerce-panel-*` 类名：

- `.ecommerce-view` → 保留容器类名
- `.ecommerce-section` → 改为 `.ecommerce-panel-section`
- `.ecommerce-label` → 改为 `.ecommerce-panel-label`
- `.ecommerce-select-row` → 改为 `.ecommerce-panel-select-row`
- `.ecommerce-textarea-section` → 改为 `.ecommerce-panel-textarea-section`
- 新增：`.ecommerce-panel-structure-card`、`.ecommerce-panel-counter-*` 等

### 7.6 文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/extension/src/sidepanel/views/EcommerceView.tsx` | 重构 | 完全对齐 EcommercePanel |
| `packages/extension/src/sidepanel/index.css` | 修改 | 新增 ecommerce-panel-* CSS 类名 |
| `packages/shared/types/agent.ts` | 确保 | EcommerceCustomCounts 类型已定义 |

---

## 八、验证步骤

1. `npm run dev` — 加载扩展，导航到支持的平台
2. 打开下拉菜单 → 点击 "Agent" → 选择 "电商套图" → 验证 EcommercePanel 渲染
3. 上传 1 张商品原图 → 验证缩略图+文件名+删除按钮显示
4. 切换平台/市场/语言/比例 → 验证下拉框更新
5. 点击 "AI帮写" → 验证从上传图片生成卖点
6. 切换套图结构：智能匹配（默认选中）/ 自定义配置（展开计数器行）→ 验证计数器 +/− 操作
7. 点击生成 → 验证全屏结果视图替换表单，结果卡片列表展示
8. 点击 "← 返回" → 验证返回表单且配置保留
9. 点击 "一键复制全部" / "重新生成" → 验证操作正常
10. 打开侧边栏 → 同样流程验证 EcommerceView
11. `npx tsc --noEmit` — 验证无类型错误
