# Phase 12: Prompt Insertion - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

生成的提示词能够正确送达用户。这是Phase 12，紧接Phase 11的Vision API Integration，负责将Vision AI生成的提示词交付给用户。

**Success Criteria (from ROADMAP):**
1. User sees prompt preview in dialog before insertion (with confirm/cancel options)
2. When user confirms on Lovart page, prompt is inserted into Lovart input field
3. When user confirms on non-Lovart page, prompt is copied to clipboard with notification toast
4. User can cancel the preview dialog to discard the generated prompt

**In scope:**
- Lovart page detection from loading page
- Message routing: Loading → SW → CS → InsertHandler
- Clipboard copy on non-Lovart pages
- Save to "临时" category feature (new)
- Completion feedback and page close
- Error handling with fallback
- Vision API response format update (dependency on Phase 11)

**Out of scope:**
- Context menu creation and URL capture (Phase 9)
- API key storage and configuration UI (Phase 10)
- Vision API call logic (Phase 11)
- Prompt editing before save (future enhancement)
- Batch processing multiple prompts (Out of Scope per REQUIREMENTS.md)

</domain>

<decisions>
## Implementation Decisions

### Lovart Page Detection
- **D-01:** Loading页面通过`chrome.tabs.query()`获取当前活动tab，检查URL是否匹配`lovart.ai`域名（包含`*.lovart.ai/*`）。简单直接，无需content script参与。

### Lovart Insertion Path
- **D-02:** 使用标准消息路径：Loading页面 → Service Worker → Content Script → InsertHandler。
  - Loading页面发送`INSERT_PROMPT`消息到service worker（包含prompt数据）
  - Service worker转发到Lovart tab的content script（使用`chrome.tabs.sendMessage`）
  - Content Script调用`InsertHandler.insertPrompt()`插入Lovart输入框
  - 利用现有消息架构，路径清晰

### Clipboard + Save Feature (New)
- **D-03:** 新增"保存并插入"功能。用户点击确认后：
  - 在Lovart页面：插入到输入框 + 保存到"临时"分类
  - 在其他页面：复制到剪贴板 + 保存到"临时"分类
- **D-04:** "临时"分类固定名称为"临时"，中文命名。首次保存时自动创建（如果不存在）。
- **D-05:** 临时分类中的提示词由用户手动清理（与普通分类相同管理方式）。
- **D-06:** 保存到临时分类的提示词数据来自Vision API结构化响应。

### Vision API Response Format (Dependency)
- **D-07:** Vision API返回结构化对象：
  ```typescript
  {
    name: string,       // 从AI响应提取的名称
    prompt: string,     // 生成的提示词内容
    tags: string[],     // AI分析标签
    previewImage: string, // 源图片URL或缩略图
    timestamp: string   // 生成时间戳
  }
  ```
- **D-08:** 此结构需要更新Phase 11的Vision API实现（响应解析逻辑）。

### Completion Feedback
- **D-09:** 成功后在Loading页面显示简单文字反馈：
  - Lovart插入："已插入Lovart输入框"
  - Clipboard复制："已复制到剪贴板"
  - 保存："已保存到临时分类"
- **D-10:** 显示反馈后1秒自动关闭Loading页面。简单直接，无需用户手动点击关闭。

### Error Handling & Fallback
- **D-11:** Lovart插入失败时：保存仍成功 + 显示简单错误文字（如"插入失败，请手动粘贴"）。提示词已保存，用户可从下拉菜单选用。
- **D-12:** 用户在Lovart页面但输入框未检测到时：Fallback到clipboard复制 + 保存流程。保持用户工作流不中断。
- **D-13:** Clipboard复制失败时：显示错误文字，用户可手动复制（提示词已保存到临时分类）。

### Claude's Discretion
- Loading页面的按钮布局（"确认"、"取消"、"保存并插入"排列）
- 成功/失败反馈的具体文字内容
- 自动关闭的延迟时间（建议1秒）
- 错误判断的具体条件（content script响应超时阈值）
- Lovart URL匹配的具体规则（正则表达式）
- 临时分类的icon选择

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chrome Extension Patterns
- Chrome Tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
  - `chrome.tabs.query()` for getting active tab
  - `chrome.tabs.sendMessage()` for sending to content script
- Clipboard API: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
  - `navigator.clipboard.writeText()` for copying text

### Project Context
- `.planning/PROJECT.md` — 项目愿景、v1.3.0里程碑目标
- `.planning/REQUIREMENTS.md` — INSERT-01~03需求定义
- `.planning/ROADMAP.md` — Phase 12目标、成功标准

### Prior Phase Context
- `.planning/phases/11-vision-api-integration/11-CONTEXT.md` — Vision API调用、Loading页面结构、API响应格式（需要更新）
- `.planning/phases/10-api-key-management/10-CONTEXT.md` — VisionApiConfig类型、API配置消息类型
- `.planning/phases/09-context-menu-foundation/09-CONTEXT.md` — Context menu click handler、captured_image_url存储键
- `.planning/phases/02-lovart-integration-content-script/02-CONTEXT.md` — InsertHandler实现、Lovart输入框检测、INSERT_PROMPT消息类型

### Codebase Patterns
- `.planning/codebase/ARCHITECTURE.md` — Storage-First架构、Service Worker消息处理、Message protocol
- `.planning/codebase/CONVENTIONS.md` — Console log prefix `[Oh My Prompt]`、TypeScript strict mode
- `.planning/codebase/INTEGRATIONS.md` — chrome.storage.local使用模式、Message response format

### Code Files (from scout)
- `src/content/insert-handler.ts` — InsertHandler类，`insertPrompt()`方法
- `src/popup/LoadingApp.tsx` — Loading页面UI，preview/confirm/cancel逻辑（需要更新）
- `src/shared/messages.ts` — MessageType枚举，INSERT_PROMPT类型
- `src/shared/types.ts` — Prompt interface，Category interface，StorageSchema
- `src/lib/store.ts` — Zustand store，addPrompt()方法用于保存提示词

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/content/insert-handler.ts`: InsertHandler类完整实现，支持form controls和rich text editors
- `src/popup/LoadingApp.tsx`: Loading页面已有preview UI、confirm/cancel按钮，需要扩展：
  - 新增"保存并插入"按钮（或合并为单一"确认"按钮）
  - Lovart页面检测逻辑
  - Clipboard复制逻辑
  - 保存到临时分类逻辑
  - 成功/失败反馈显示
- `src/shared/messages.ts`: INSERT_PROMPT MessageType已存在，可直接使用
- `src/lib/store.ts`: `addPrompt()`方法用于保存提示词到store
- `src/shared/types.ts`: Prompt interface（id, name, content, categoryId, order, tags?, previewImage?）

### Established Patterns
- Message protocol: `chrome.runtime.sendMessage` for Loading → SW
- Message to content script: Service worker uses `chrome.tabs.sendMessage(tabId, message)`
- Message response: `{ success: boolean, data?: T, error?: string }`
- Console log prefix: `[Oh My Prompt]`
- Storage pattern: `chrome.storage.local` with `StorageSchema`
- Store pattern: Zustand store with CRUD methods
- Popup styling: Tailwind CSS, Radix UI primitives

### Integration Points
- `src/popup/LoadingApp.tsx`:
  - Add Lovart page detection on mount (using `chrome.tabs.query()`)
  - Add clipboard copy logic (using `navigator.clipboard.writeText()`)
  - Add save to "临时" category logic (using `chrome.runtime.sendMessage` to service worker)
  - Update button UI (confirm → save+insert/copy)
  - Add success/error feedback display
  - Add auto-close after 1 second
- `src/background/service-worker.ts`:
  - Add INSERT_PROMPT message handler (forward to content script)
  - Add SAVE_PROMPT message handler (save to storage via store.addPrompt())
  - Add logic to create "临时" category if not exists
  - Update Vision API handler to return structured response (D-07)
- `src/content/content-script.ts`:
  - Add INSERT_PROMPT message handler (call InsertHandler.insertPrompt())
  - Send response back to service worker (success/failure)
- `src/lib/vision-api.ts` (Phase 11):
  - Update response parsing to extract name, tags, previewImage from AI response
- `src/shared/types.ts`:
  - Add optional `tags` and `previewImage` fields to Prompt interface
  - Define VisionApiResponse interface (name, prompt, tags, previewImage, timestamp)

### Pitfalls to Avoid
- Lovart URL检测需要匹配子域名（*.lovart.ai）
- Clipboard API需要页面focus才能工作（Loading页面是独立的扩展页面，应该可以）
- INSERT_PROMPT消息需要包含tabId才能正确路由到Lovart tab
- "临时"分类创建需要检查是否存在（避免重复创建）
- 保存提示词需要分配order字段（max order + 1）
- Vision API结构化响应提取需要设计prompt（让AI返回结构化JSON）

</code_context>

<specifics>
## Specific Ideas

- "保存并插入"按钮合并为单一"确认"按钮，用户点击后自动：保存到临时 + 插入/复制
- 临时分类命名"临时"（中文），与其他分类命名风格一致
- 成功反馈简短："已保存并插入" / "已保存并复制"
- 错误反馈简洁："插入失败，请手动粘贴"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Scope creep items noted:
- Prompt编辑功能（用户在preview页面修改生成的提示词）— future enhancement
- 分类选择功能（保存时让用户选择目标分类）— future enhancement
- 使用记录/统计（Out of Scope per REQUIREMENTS.md）

## Phase 11 Dependency Update

Phase 12 requires Phase 11's Vision API to return structured response. Update needed:
- Modify `src/lib/vision-api.ts` response parsing to extract: name, tags, previewImage
- Modify `src/popup/LoadingApp.tsx` to handle structured response
- Modify `src/shared/types.ts` to add VisionApiResponse interface

This can be done as part of Phase 12 planning or as a separate task.

</deferred>

---

*Phase: 12-prompt-insertion*
*Context gathered: 2026-04-28*