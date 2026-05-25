# 电商套图 Agent 结果体验优化设计

> 日期：2026-05-25
> 状态：待用户审核

## 背景

电商套图 Agent 目前会要求模型返回 JSON，但结果展示仍存在两个体验问题：

- 当模型返回 JSON 文本时，用户看到的是一整块原始响应，不方便阅读和操作。
- “复制全部”只是把多条提示词拼接在一起，缺少任务目标、图片顺序、每张图用途等上下文。用户把这段内容交给另一个 Agent 时，对方不一定能理解这是一个多图生成任务。

这次优化只针对电商套图模板，不改海报、插画、Logo、UI、3D 等通用 Agent 模板。

## 目标

- 将电商套图 JSON 结果解析成可阅读、可操作的卡片列表。
- 支持默认轻量卡片和展开后的结构化详情。
- 解析失败时仍提供可复制、可保存的兜底结果，不让用户面对不可操作的大段 JSON。
- 在 content script 和 sidepanel 中新增“一键插入全部提示词”能力。
- “复制全部”和“插入全部”输出同一份组织化任务包，让另一个 Agent 明确知道要按顺序生成多张图片。
- 同步优化 content script 浮层和 sidepanel 两处电商套图结果页。
- 固定底部操作栏，按钮不随结果列表滚动。

## 非目标

- 不改变电商套图表单输入项、平台配置、AI 帮写卖点逻辑。
- 不调整非电商 Agent 模板的结果展示。
- 不新增后端独立 Agent API 路由。
- 不要求模型每次都返回完美 JSON；前端必须继续容错。

## 当前状态

相关文件：

- `packages/extension/src/sidepanel/views/EcommerceView.tsx`
- `packages/extension/src/content/components/EcommercePanel.tsx`
- `packages/extension/src/lib/agent-api.ts`
- `packages/extension/src/lib/agent-templates.ts`
- `packages/shared/types/agent.ts`
- `packages/extension/src/sidepanel/index.css`
- `packages/extension/src/content/styles/dropdown-styles.ts`

Sidepanel 和 content script 当前各自实现了：

- 电商生成请求。
- JSON 解析尝试。
- 结果卡片展示。
- 单条复制、保存、插入。
- “复制全部”和“重新生成”。

这些逻辑有重复，且“复制全部”缺少组织化任务上下文。

## 设计方案

采用“共享解析器 + 共享任务包 formatter + 两端 UI 同步升级”的方案。

原则：

- 共享解析器是电商结果解析的唯一入口，`agent-api.ts`、sidepanel 和 content script 不再保留各自独立的 JSON 解析分支。
- UI 上同名操作必须语义一致。Sidepanel 和 content script 的“插入全部”都必须执行真实插入，不降级为复制。
- 生成成功后保存一份电商配置快照，结果摘要、任务包 formatter 和重新生成都基于这份快照，避免用户后续修改表单导致结果上下文漂移。

### 1. 共享电商结果解析器

新增扩展侧工具模块：

`packages/extension/src/lib/ecommerce-result-parser.ts`

职责：

- 接收 `response.data`、默认图片比例和可选原始配置。
- 优先读取 `data.ecommercePrompts`。
- 如果只有 `data.prompt`，从文本中提取包含 `prompts` 的 JSON 对象。
- 供 `packages/extension/src/lib/agent-api.ts`、`packages/extension/src/sidepanel/views/EcommerceView.tsx` 和 `packages/extension/src/content/components/EcommercePanel.tsx` 共同调用。
- 支持当前结果格式：

```ts
{
  prompts: [
    {
      type: string
      typeEn: string
      prompt: string
      aspectRatio: string
    }
  ],
  templateCategory: 'ecommerce'
}
```

- 扩展支持可选详情字段：

```ts
details?: {
  subject?: string
  scene?: string
  composition?: string
  lighting?: string
  style?: string
  sellingPoint?: string
  parameters?: string
}
```

- 兼容模型返回 `sections` 或 `metadata` 时的常见字段名，尽量映射到 `details`。
- 详情字段映射建议：
  - `subject`：`subject`、`product`、`mainSubject`、`主体`、`产品主体`。
  - `scene`：`scene`、`background`、`environment`、`场景`、`背景`。
  - `composition`：`composition`、`layout`、`camera`、`构图`、`镜头`。
  - `lighting`：`lighting`、`light`、`光影`、`灯光`。
  - `style`：`style`、`visualStyle`、`mood`、`风格`、`调性`。
  - `sellingPoint`：`sellingPoint`、`benefit`、`feature`、`卖点`、`核心卖点`。
  - `parameters`：`parameters`、`params`、`negativePrompt`、`参数`、`补充参数`。
- 解析失败时返回一个兜底结果：

```ts
{
  prompts: [
    {
      type: '原始生成结果',
      typeEn: 'Raw Result',
      prompt: rawText,
      aspectRatio: fallbackAspectRatio
    }
  ],
  templateCategory: 'ecommerce',
  rawText
}
```

解析器应保持纯函数，便于单元测试。

如果 `prompts` 为空数组、全部 prompt 无效，或提取到的 JSON 不符合结构，但原始文本存在，则进入“原始生成结果”兜底卡片；只有原始文本也为空时才向 UI 返回“生成结果为空”错误。

### 2. 共享批量任务包 Formatter

新增扩展侧工具模块：

`packages/extension/src/lib/ecommerce-prompt-bundle.ts`

职责：

- 输入 `EcommerceGenerateResult` 和生成时保存的电商配置快照。
- 输出用于“复制全部”和“插入全部”的组织化文本。

输出格式示例：

```text
任务目标：请根据以下 7 条提示词分别生成 7 张电商商品图，保持同一产品、同一品牌调性和统一视觉系列感。

生成要求：
- 每条提示词对应一张独立图片，不要合并成单张图。
- 按编号顺序生成。
- 所有图片比例：1:1。
- 主体产品保持一致，并遵循亚马逊 / 中国市场的电商展示习惯。
- 不要输出解释、分析或 Markdown 表格，只按顺序生成对应图片。

01｜白底主图｜用途：电商主图
提示词：...

02｜场景图｜用途：生活场景展示
提示词：...
```

规则：

- 不简单拼接提示词。
- 明确“多张独立图片”的目的。
- 保留顺序编号。
- 使用图片类型作为用途提示。
- 当存在 `details` 时，批量文本仍以完整 `prompt` 为主，避免下游 Agent 收到过碎的信息。
- 平台、市场、语言、比例和套图结构来自生成时配置快照，不读取当前表单状态。

### 3. UI 结果卡片

Sidepanel 和 content script 都采用同一交互结构：

- 结果页仍覆盖表单视图。
- 顶部显示返回按钮、标题、总张数。
- 增加结果摘要区：平台、市场、语言、比例、套图结构。
- 结果列表展示轻量卡片：
  - 图片类型标签。
  - 图片比例。
  - 提示词预览。
  - 单条插入、复制、保存按钮。
  - 展开详情入口。
- 展开详情后展示：
  - 主体。
  - 场景。
  - 构图。
  - 光影。
  - 风格。
  - 卖点。
  - 参数。
  - 完整提示词。
- 只有存在值的详情字段才显示。

解析失败时：

- 卡片类型显示“原始生成结果”。
- 内容显示解析后的可读文本或完整原文。
- 保留复制、保存、重新生成能力。
- 不把用户锁在错误状态。

### 4. 固定底部操作栏

Sidepanel 和 content script 结果页都固定底部操作栏，不随结果列表滚动。

按钮顺序固定为：

1. 重新生成
2. 复制全部
3. 插入全部

行为：

- `重新生成`：沿用当前配置重新调用生成。
- `复制全部`：复制组织化任务包。
- `插入全部`：插入同一份组织化任务包。

Content script 有宿主页面输入框上下文，`插入全部` 直接调用已有 `onInsert` 能力，把组织化任务包插入当前宿主编辑器。

Sidepanel 的 `插入全部` 使用现有可用的一键插入通道，将同一份组织化任务包插入目标输入框。若插入通道不可用，应禁用按钮或显示明确错误，不自动降级为复制，避免同名操作语义漂移。

布局约束：

- 结果滚动区必须预留底部操作栏高度的 `padding-bottom`，避免最后一张卡片被遮挡。
- 固定底栏使用明确 z-index，并限定在 sidepanel 页面或 Shadow DOM 浮层内部，不能覆盖宿主页面其他区域。
- 底部按钮触控高度不小于 44px，窄屏下允许按钮文字换行或收缩，不产生横向滚动。
- 375px、768px、1024px 视口下验证长提示词、展开详情和底部按钮不重叠。

### 5. 两端同步范围

必须同步修改：

- `packages/extension/src/lib/agent-api.ts`
- `packages/extension/src/sidepanel/views/EcommerceView.tsx`
- `packages/extension/src/content/components/EcommercePanel.tsx`
- `packages/extension/src/sidepanel/index.css`
- `packages/extension/src/content/styles/dropdown-styles.ts`

两端共享：

- 结果解析器。
- 批量任务包 formatter。
- 结果类型扩展。

不共享 React 组件，避免把 content script 的内联/浮层约束和 sidepanel 的页面布局绑在一起。

## 数据类型调整

扩展 `packages/shared/types/agent.ts`：

```ts
export interface EcommercePromptDetails {
  subject?: string
  scene?: string
  composition?: string
  lighting?: string
  style?: string
  sellingPoint?: string
  parameters?: string
}

export interface EcommerceGenerateResult {
  prompts: Array<{
    type: string
    typeEn: string
    prompt: string
    aspectRatio: string
    details?: EcommercePromptDetails
  }>
  templateCategory: 'ecommerce'
  rawText?: string
}
```

字段均为可选扩展，兼容当前已生成结果。

## 错误处理

- JSON 提取失败：展示原始结果兜底卡片。
- `prompts` 为空数组：如果存在原始文本，展示原始结果兜底卡片；如果原始文本也为空，展示“生成结果为空”错误。
- 单条 prompt 缺失：跳过该条；如果全部无效且存在原始文本，进入兜底卡片。
- 剪贴板写入失败：显示现有 toast。
- 插入通道不可用：禁用“插入全部”或显示明确错误，不降级为复制。

## 测试计划

最小验证：

- `npm run typecheck --workspace=@oh-my-prompt/extension`
- `npm run test:unit --workspace=@oh-my-prompt/extension`

建议新增单元测试：

- 标准 JSON 可解析为多张提示词。
- 带包裹文字的 JSON 可被提取。
- Markdown 代码块包裹的 JSON 可被提取。
- 前后文中存在多个 JSON 片段时，优先提取包含有效 `prompts` 数组的对象。
- 详情字段可被规范化。
- 非 JSON 文本可回退为原始结果。
- `prompts` 为空、单条 prompt 缺失、全部 prompt 无效时，按原始文本是否存在分别进入兜底或空结果错误。
- 批量任务包包含任务目标、生成要求、编号、图片类型、提示词。
- 批量任务包使用生成时配置快照，不受当前表单状态变化影响。

手动验证：

- Sidepanel 电商结果页：固定底部按钮、展开详情、复制全部、插入全部、重新生成。
- Content script 电商浮层：同样验证固定底部按钮和插入宿主输入框。
- 长结果列表滚动时，底部按钮始终可点击。
- 375px、768px、1024px 宽度下，底部按钮、长提示词和展开详情不遮挡、不横向溢出。

## 原型

本次讨论过程中创建了临时原型：

`http://localhost:64556`

原型用于确认交互方向，不作为正式实现文件。
