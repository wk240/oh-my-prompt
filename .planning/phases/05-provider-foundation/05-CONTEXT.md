# Phase 5: Provider Foundation - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extension可获取并解析网络提示词数据源。建立DataSourceProvider抽象接口和NanoBananaProvider实现，使Service Worker能够响应网络提示词请求并返回解析后的数据。

**In scope:**
- DataSourceProvider接口定义（fetch/parse/getCategories三方法）
- NanoBananaProvider实现，解析GitHub README.md中的900+ prompts
- Service Worker网络请求handler（FETCH_NETWORK_PROMPTS消息）
- NetworkPrompt类型定义（继承Prompt）

**Out of scope:**
- 缓存逻辑（Phase 6）
- UI显示（Phase 7）
- 图片预览实现（Phase 7）
- 搜索/收藏功能（Phase 8）

</domain>

<decisions>
## Implementation Decisions

### Provider接口设计
- **D-01:** DataSourceProvider接口包含三个基础方法：fetch()、parse()、getCategories()
- **D-02:** 不包含错误回调、重试配置、健康检查等扩展方法，保持接口简洁
- **D-03:** parse()返回NetworkPrompt[]数组，getCategories()返回数据源分类列表

### 网络请求策略
- **D-04:** 使用GitHub Raw URL直接请求（无需API密钥，无速率限制）
- **D-05:** Nano Banana数据源URL: `https://raw.githubusercontent.com/devanshug2307/Awesome-Nano-Banana-Prompts/main/README.md`
- **D-06:** 请求超时值10秒，失败返回错误响应
- **D-07:** 不设置额外请求头，使用浏览器默认行为

### 网络提示词类型设计
- **D-08:** NetworkPrompt继承Prompt类型，增加可选字段
- **D-09:** 新增字段：`sourceProvider?: string`（数据源名称）、`sourceCategory?: string`（原始分类）、`previewImage?: string`（预览图片URL）
- **D-10:** previewImage字段仅存储URL，图片显示逻辑延后至Phase 7实现

### Claude's Discretion
- Markdown解析的具体正则规则
- Service Worker请求失败时的响应格式细节
- NetworkPrompt字段的命名风格（camelCase保持一致性）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 类型定义
- `src/shared/types.ts` — Prompt、Category、StorageSchema现有类型定义
- `src/shared/messages.ts` — MessageType enum消息类型定义模式

### Service Worker模式
- `src/background/service-worker.ts` — 现有消息处理模式，onMessage listener结构
- `src/lib/storage.ts` — StorageManager单例模式，可作为Provider实现参考

### 数据源参考
- `.claude/projects/-Users-panwenkang-workspace-projects-prompt-script/memory/reference_prompt-data-sources.md` — Nano Banana数据源详细说明，字段结构

### 约束背景
- `.planning/PROJECT.md` — Chrome Extension CSP限制说明（Content Script无法直接fetch）
- `.planning/REQUIREMENTS.md` — NET-05、NET-06需求详情

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MessageType` enum: 可扩展添加FETCH_NETWORK_PROMPTS、GET_NETWORK_CATEGORIES等新消息类型
- `Message<T>` / `MessageResponse<T>`: 泛型消息结构，可直接复用
- `StorageManager.getInstance()`: 单例模式，Provider类可采用类似设计
- `chrome.runtime.sendMessage()` + `return true`: 异步消息响应模式已验证

### Established Patterns
- Service Worker消息分发: switch-case结构处理不同MessageType
- 类型定义位置: `src/shared/types.ts`集中管理
- 错误响应格式: `{ success: false, error: string }`统一格式

### Integration Points
- Service Worker: 添加新的MessageType case处理网络请求
- 消息类型: 在`src/shared/messages.ts`添加FETCH_NETWORK_PROMPTS等
- 类型系统: 在`src/shared/types.ts`添加NetworkPrompt interface

</code_context>

<specifics>
## Specific Ideas

- Nano Banana README.md格式：每个prompt包含标题、内容、分类标签、预览图片链接
- Provider接口保持最小化，后续Phase可按需扩展
- 网络请求通过Service Worker代理，符合Chrome Extension CSP要求

</specifics>

<deferred>
## Deferred Ideas

- 图片预览实现（Phase 7 UI阶段处理）
- 重试逻辑/错误回调扩展（按需添加）
- 多Provider管理器（单一数据源优先，后续扩展时设计）

</deferred>

---

*Phase: 05-provider-foundation*
*Context gathered: 2026-04-19*