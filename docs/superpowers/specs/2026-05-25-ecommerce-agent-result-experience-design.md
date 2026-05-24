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
- 新增“一键插入全部提示词”能力。
- “复制全部”和“插入全部”输出组织化任务包，让另一个 Agent 明确知道要按顺序生成多张图片。
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

### 1. 共享电商结果解析器

新增扩展侧工具模块：

`packages/extension/src/lib/ecommerce-result-parser.ts`

职责：

- 接收 `response.data`、默认图片比例和可选原始配置。
- 优先读取 `data.ecommercePrompts`。
- 如果只有 `data.prompt`，从文本中提取包含 `prompts` 的 JSON 对象。
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

### 2. 共享批量任务包 Formatter

新增扩展侧工具模块：

`packages/extension/src/lib/ecommerce-prompt-bundle.ts`

职责：

- 输入 `EcommerceGenerateResult` 和电商配置摘要。
- 输出用于“复制全部”和“插入全部”的组织化文本。

输出格式示例：

```text
任务目标：请根据以下 7 条提示词分别生成 7 张电商商品图，保持同一产品、同一品牌调性和统一视觉系列感。

生成要求：
- 每条提示词对应一张独立图片，不要合并成单张图。
- 按编号顺序生成。
- 所有图片比例：1:1。
- 主体产品保持一致，并遵循亚马逊 / 中国市场的电商展示习惯。

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

Sidepanel 当前没有稳定的宿主编辑器上下文，`插入全部` 的本次实现定义为：复制组织化任务包并显示“已复制，请在输入框中粘贴”。按钮仍显示在第三位，避免两端视觉结构不一致。若后续新增 active tab 插入通道，再升级为真实插入。

### 5. 两端同步范围

必须同步修改：

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
- `prompts` 为空数组：展示“生成结果为空”错误。
- 单条 prompt 缺失：跳过该条；如果全部无效，进入兜底卡片。
- 剪贴板写入失败：显示现有 toast。
- content script 无 `onInsert`：`插入全部` 降级为复制组织化任务包并显示粘贴提示，避免空操作。

## 测试计划

最小验证：

- `npm run typecheck --workspace=@oh-my-prompt/extension`
- `npm run test:unit --workspace=@oh-my-prompt/extension`

建议新增单元测试：

- 标准 JSON 可解析为多张提示词。
- 带包裹文字的 JSON 可被提取。
- 详情字段可被规范化。
- 非 JSON 文本可回退为原始结果。
- 批量任务包包含任务目标、生成要求、编号、图片类型、提示词。

手动验证：

- Sidepanel 电商结果页：固定底部按钮、展开详情、复制全部、插入全部、重新生成。
- Content script 电商浮层：同样验证固定底部按钮和插入宿主输入框。
- 长结果列表滚动时，底部按钮始终可点击。

## 原型

本次讨论过程中创建了临时原型：

`http://localhost:64556`

原型用于确认交互方向，不作为正式实现文件。
