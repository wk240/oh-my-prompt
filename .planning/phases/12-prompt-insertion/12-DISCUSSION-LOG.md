# Phase 12: Prompt Insertion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 12-prompt-insertion
**Areas discussed:** Lovart检测方式, Lovart插入路径, Clipboard通知方式, 完成后反馈, Save功能流程, 分类设计, Prompt命名, Vision API响应格式, 临时分类创建时机, 失败处理, Lovart未检测fallback

---

## Lovart检测方式

| Option | Description | Selected |
|--------|-------------|----------|
| 检查tab URL | 通过chrome.tabs.query()获取当前活动tab，检查URL是否匹配 lovart.ai域名。简单直接，无需content script参与。 | ✓ |
| ping content script | 向当前tab发送ping消息，等待content script响应。如果响应成功说明在Lovart页面。更精确但需要content script处理额外消息类型。 | |
| 状态报告机制 | 让content script定期向service worker报告"我在Lovart"，service worker存储状态，Loading页面查询service worker。更复杂，状态可能过期。 | |

**User's choice:** 检查tab URL
**Notes:** Simple and direct approach, no need for content script participation.

---

## Lovart插入路径

| Option | Description | Selected |
|--------|-------------|----------|
| Loading → SW → CS → Insert | Loading页面发送INSERT_PROMPT消息到service worker，service worker转发到Lovart tab的content script，content script调用InsertHandler插入。路径清晰，利用现有消息架构。 | ✓ |
| SW直接操作Lovart tab | Service worker直接打开Lovart页面（如果未打开）并执行插入。需要更多代码，可能打断用户当前工作流。 | |

**User's choice:** Loading → SW → CS → Insert
**Notes:** Uses existing message architecture, clear path.

---

## Clipboard通知方式

| Option | Description | Selected |
|--------|-------------|----------|
| 简单文字反馈 | Loading页面使用navigator.clipboard.writeText()直接复制，显示简单的"已复制到剪贴板"文字提示，然后关闭页面。简单直接，无需Toast组件依赖。 | |
| Toast通知 | 复制后发送消息到service worker，service worker通知Lovart tab的content script显示Toast。复杂路径，非Lovart页面无法显示Toast。 | |
| 复制后打开Lovart | 复制成功后打开Lovart页面并插入提示词，告诉用户"已复制，请去Lovart粘贴"。可能打断用户工作流。 | |

**User's choice:** 自定义 — 不止要复制，还需要有一键保存的功能，保存是保存到扩展缓存中，后续可以在lovart中直接选中并生图
**Notes:** User requested a new feature: save to extension storage for later use in Lovart dropdown menu.

---

## Save功能范围

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 12内实现 | Phase 12新增"保存"按钮，用户可将生成的提示词保存到本地提示词库（需要选择分类）。保存后提示词出现在Lovart下拉菜单中供后续使用。 | ✓ |
| 推迟到独立Phase | 保持Phase 12专注于插入/复制。保存功能作为独立Phase，后续规划详细实现（包括分类选择、命名、编辑等UI）。 | |

**User's choice:** Phase 12内实现
**Notes:** Expand Phase 12 scope to include save feature.

---

## 保存功能的交互流程

| Option | Description | Selected |
|--------|-------------|----------|
| 保存按钮 + 分类选择 | Preview页面增加"保存"按钮，用户点击后弹出分类选择对话框（类似Phase 8的收藏流程），保存到选定分类。保存成功后显示Toast，可选择继续插入或完成。 | |
| 保存并插入（固定分类） | Preview页面增加"保存并插入"按钮，一键保存到固定分类（如"AI生成"）并插入Lovart。简化流程但用户无法选择分类。 | ✓ |

**User's choice:** 保存并插入（固定分类）
**Notes:** Simplified flow, fixed category.

---

## 保存的提示词放入哪个固定分类？

| Option | Description | Selected |
|--------|-------------|----------|
| "AI生成"分类 | 自动创建"AI生成"分类（如果不存在），所有保存的AI生成提示词归于此分类。命名清晰，符合用户心智模型。 | |
| "Vision生成"分类 | 自动创建"Vision生成"分类，强调来源是Vision API。技术导向命名。 | |
| Settings配置默认分类 | 允许用户在Settings中配置默认保存分类，而非固定分类。更灵活但需要额外Settings UI。 | |

**User's choice:** 自定义 — "临时"
**Notes:** User chose "临时" (temporary) as the fixed category name.

---

## 临时分类中的提示词如何管理？

| Option | Description | Selected |
|--------|-------------|----------|
| 手动清理临时分类 | 临时提示词保存后可使用，但不会永久保留。建议：保存到临时分类后显示Toast，提示词在下拉菜单中可用。用户可手动删除或清空临时分类。 | ✓ |
| 插入后自动删除 | 临时提示词在插入后自动删除，仅保存至下次使用机会。复杂：需要跟踪"已使用"状态，可能用户想保留多次使用。 | |

**User's choice:** 手动清理临时分类
**Notes:** Same as regular category management.

---

## 完成后反馈

| Option | Description | Selected |
|--------|-------------|----------|
| 简单文字 + 自动关闭 | 成功后在Loading页面显示简单的成功文字（如"已插入Lovart输入框"、"已复制到剪贴板"、"已保存到临时分类"），1秒后自动关闭页面。简单直接。 | ✓ |
| 详细Toast + 手动关闭 | 成功后显示详细Toast，包含操作详情和下一步指引，用户手动点击关闭。信息更丰富但增加用户操作步骤。 | |

**User's choice:** 简单文字 + 自动关闭
**Notes:** 1 second delay before auto-close.

---

## 保存到临时分类的提示词如何命名？

| Option | Description | Selected |
|--------|-------------|----------|
| 时间戳命名 | 使用时间戳命名，如"2026-04-28 14:30"。简洁、唯一、易于识别顺序。 | |
| 用户输入名称 | 保存时弹出小型输入框让用户输入名称。更灵活但增加操作步骤。 | |

**User's choice:** 自定义 — AI返回内容中获取命名，其他字段包含时间戳、标签、预览图
**Notes:** Vision API should return structured response with: name, prompt, tags, previewImage, timestamp.

---

## Vision API响应包含哪些字段？

| Option | Description | Selected |
|--------|-------------|----------|
| 结构化响应 | Vision API返回结构化对象：{name: string, prompt: string, tags: string[], previewImage: string, timestamp: string}。name从AI响应提取或AI主动生成，其他字段自动填充。 | ✓ |
| 原始文本 + 后处理 | Vision API只返回原始prompt文本，其他字段（name、tags、预览图）由Phase 12自行处理/生成。name用时间戳，tags为空，预览图用原始图片URL。 | |

**User's choice:** 结构化响应
**Notes:** Requires update to Phase 11's Vision API implementation.

---

## "临时"分类何时创建？

| Option | Description | Selected |
|--------|-------------|----------|
| 首次保存时创建 | 首次保存时检查"临时"分类是否存在，不存在则自动创建。减少初始化逻辑，分类仅在需要时出现。 | ✓ |
| 安装时预创建 | 扩展安装时自动创建"临时"分类。分类预先存在，但可能用户从未使用Vision功能。 | |

**User's choice:** 首次保存时创建
**Notes:** Lazy creation pattern.

---

## Lovart插入失败时如何处理？

| Option | Description | Selected |
|--------|-------------|----------|
| 保存仍成功 + 错误提示 | 插入失败时显示简单错误文字（如"插入失败，请手动粘贴"），提示词仍保存到临时分类，用户可从下拉菜单选用。 | ✓ |
| 详细错误 + 重试选项 | 插入失败时弹出Toast提示详细错误，用户可选择重试或取消。复杂但信息丰富。 | |

**User's choice:** 保存仍成功 + 错误提示
**Notes:** Graceful degradation.

---

## 用户在Lovart页面但输入框未检测到时如何处理？

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback到clipboard | 如果URL匹配lovart.ai但content script未响应或未检测到输入框，fallback到clipboard复制 + 保存流程。保持用户工作流不中断。 | ✓ |
| 显示错误等待重试 | 如果检测失败，显示错误并等待用户手动刷新Lovart页面后重试。中断用户工作流。 | |

**User's choice:** Fallback到clipboard
**Notes:** Graceful degradation, maintain user workflow.

---

## Claude's Discretion

- Loading页面的按钮布局（"确认"、"取消"、"保存并插入"排列）
- 成功/失败反馈的具体文字内容
- 自动关闭的延迟时间（建议1秒）
- 错误判断的具体条件（content script响应超时阈值）
- Lovart URL匹配的具体规则（正则表达式）
- 临时分类的icon选择

---

## Deferred Ideas

- Prompt编辑功能（用户在preview页面修改生成的提示词）— future enhancement
- 分类选择功能（保存时让用户选择目标分类）— future enhancement
- 使用记录/统计（Out of Scope per REQUIREMENTS.md）

---

*Discussion log generated: 2026-04-28*