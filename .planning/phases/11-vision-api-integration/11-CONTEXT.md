# Phase 11: Vision API Integration - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

扩展能够调用Vision AI分析图片并生成提示词。这是Phase 11，紧接Phase 10的API Key Management，为Phase 12的Prompt Insertion准备Vision API调用能力。

**Success Criteria (from ROADMAP):**
1. Service worker successfully calls Vision API with captured image URL
2. API returns prompt text suitable for Lovart image generation
3. Loading indicator is shown during API call (visual feedback for 2-10 sec latency)
4. Clear error messages shown for API failures (rate limit, invalid key, network error, unsupported image)
5. User sees generated prompt content before insertion

**In scope:**
- Vision API call architecture (service worker → extension page flow)
- API request format detection (Anthropic vs OpenAI)
- Prompt generation instruction design
- Loading page UI design (spinner → preview transition)
- Error handling UX (specific action buttons per error type)

**Out of scope:**
- Context menu creation and URL capture (Phase 9)
- API key storage and configuration UI (Phase 10)
- Prompt insertion into Lovart input field (Phase 12)
- Clipboard copy on non-Lovart pages (Phase 12)

</domain>

<decisions>
## Implementation Decisions

### API Request Format
- **D-01:** Detect provider from baseUrl pattern:
  - `api.anthropic.com` or `anthropic.com` → Anthropic Claude format with `x-api-key` header
  - `api.openai.com` or `openai.com` → OpenAI GPT-4V format with `Authorization: Bearer` header
  - Unknown domains → fallback to Anthropic format (most common for Vision APIs)

### Prompt Generation Strategy
- **D-02:** Ask AI to generate prompt directly. Include instruction in API request: "Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition." AI outputs ready-to-use prompt text.
- **D-03:** Use user's language preference for prompt output. Read `settings.resourceLanguage` from storage ('zh' or 'en'). Include language instruction in API request.

### Loading & Progress UX
- **D-04:** Open extension page (`src/popup/loading.html`) after context menu click. Page shows:
  - Loading spinner + "正在分析图片..." text
  - After API returns: generated prompt with Preview/Cancel buttons (integrates Phase 12 preview)
  - Seamless flow: loading → preview → confirm/insert

### Error Handling UX
- **D-05:** Error message on loading page with specific action buttons:
  - Invalid key error → Show error + "重新配置" button → opens settings page
  - Network/rate limit error → Show error + "重新尝试" button → retry API call
  - Unsupported image error → Show error + "关闭" button → close page
  - API timeout → Show error + "重新尝试" button → retry API call

### Claude's Discretion
- Exact system prompt text for prompt generation instruction
- Timeout duration for API calls (suggest 30 seconds)
- Retry count limit for rate limit/network errors (suggest 3 retries max)
- Loading page exact layout (spinner style, text position, button placement)
- Image size/format validation before API call (which formats are unsupported)
- Specific error message text for each error type

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision API Documentation
- Anthropic Claude Vision API: https://docs.anthropic.com/en/docs/build-with-claude/vision
  - Request format: `messages` with `content` array containing `image` and `text` types
  - Header: `x-api-key` for API key, `anthropic-version` header required
  - Image source: `{"type": "base64", "media_type": "...", "data": "..."}` or URL reference
- OpenAI GPT-4V API: https://platform.openai.com/docs/guides/vision
  - Request format: `messages` with `content` array containing `image_url` and `text` types
  - Header: `Authorization: Bearer {api_key}`
  - Image URL: `{"type": "image_url", "image_url": {"url": "..."}}`

### Project Context
- `.planning/PROJECT.md` — 项目愿景、v1.3.0里程碑目标
- `.planning/REQUIREMENTS.md` — VISION-01~04需求定义
- `.planning/ROADMAP.md` — Phase 11目标、成功标准

### Prior Phase Context
- `.planning/phases/09-context-menu-foundation/09-CONTEXT.md` — Context menu click handler、captured_image_url存储键
- `.planning/phases/10-api-key-management/10-CONTEXT.md` — VisionApiConfig类型、_visionApiConfig存储键、GET/SET/DELETE_API_CONFIG消息类型

### Codebase Patterns
- `.planning/codebase/ARCHITECTURE.md` — Storage-First架构、Service Worker消息处理、Message protocol
- `.planning/codebase/CONVENTIONS.md` — Console log prefix `[Oh My Prompt]`、TypeScript strict mode
- `.planning/codebase/INTEGRATIONS.md` — chrome.storage.local使用模式、Message response format

### Code Files (from scout)
- `src/shared/types.ts` — VisionApiConfig interface (baseUrl, apiKey, modelName, configuredAt)
- `src/shared/messages.ts` — GET_API_CONFIG, SET_API_CONFIG, DELETE_API_CONFIG MessageType entries
- `src/background/service-worker.ts` — Context menu click handler at line ~474, onboarding detection, message routing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/types.ts`: VisionApiConfig interface already defined
- `src/shared/messages.ts`: API config MessageType entries already added (GET_API_CONFIG, SET_API_CONFIG, DELETE_API_CONFIG)
- `src/background/service-worker.ts`: Context menu click handler, onboarding detection logic
- `src/popup/SettingsApp.tsx`: Settings UI with API config fields (baseUrl, apiKey, modelName)
- `src/popup/components/ui/button.tsx`: Button component for loading page buttons
- `manifest.json`: `tabs` permission for opening loading page via `chrome.tabs.create()`

### Established Patterns
- Message protocol: `chrome.runtime.sendMessage` for cross-context communication
- Message response: `{ success: boolean, data?: T, error?: string }`
- Console log prefix: `[Oh My Prompt]`
- Storage pattern: `chrome.storage.local` with `_visionApiConfig` key for API config
- Popup styling: Tailwind CSS, Radix UI primitives

### Integration Points
- `src/background/service-worker.ts`:
  - Add Vision API call logic after context menu click (after onboarding check)
  - Add provider detection logic (baseUrl pattern matching)
  - Open loading page via `chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/loading.html') })`
  - Handle API call result → send message to loading page
- `src/popup/`:
  - Create `loading.html` (entry HTML)
  - Create `loading.tsx` (entry TypeScript)
  - Create `LoadingApp.tsx` (main component with spinner → preview/error states)
- `src/shared/messages.ts`:
  - Add `VISION_API_CALL`, `VISION_API_RESULT`, `VISION_API_ERROR` MessageType entries (optional, for loading page communication)
- `src/lib/`:
  - Optional: Create `vision-api.ts` for API call logic abstraction (provider detection, request formatting, response parsing)

### Pitfalls to Avoid
- API key should never appear in console logs (security)
- Anthropic API requires `anthropic-version` header (check current version: `2023-06-01`)
- OpenAI image URL format different from Anthropic (image_url vs image source)
- Loading page should handle window close during API call (cleanup)
- Network errors should have retry limit (avoid infinite retry loop)

</code_context>

<specifics>
## Specific Ideas

- Loading page title: "图片转提示词" (matches context menu text "转提示词")
- Loading spinner: Simple CSS spinner, minimal visual footprint
- Prompt preview: Show full prompt text with word wrap, scrollable if long
- Error messages: Clear, user-friendly text (not technical error codes)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Scope creep items noted:
- Prompt insertion into Lovart input field (Phase 12)
- Clipboard copy on non-Lovart pages (Phase 12)
- Usage analytics/logging (Out of Scope per REQUIREMENTS.md)
- Batch processing multiple images (Out of Scope per REQUIREMENTS.md)

</deferred>

---

*Phase: 11-vision-api-integration*
*Context gathered: 2026-04-28*