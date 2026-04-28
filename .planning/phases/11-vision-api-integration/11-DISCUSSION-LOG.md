# Phase 11: Vision API Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 11-vision-api-integration
**Areas discussed:** API Request Format, Prompt Generation Strategy, Loading & Progress UX, Error Handling UX

---

## API Request Format

| Option | Description | Selected |
|--------|-------------|----------|
| Detect provider from baseUrl | Anthropic domains → Anthropic format/headers. OpenAI domains → OpenAI format/headers. Unknown → fallback to Anthropic. | ✓ |
| Explicit provider selection | Add provider dropdown in Settings. User explicitly selects Claude/OpenAI/Other. | |
| Assume Anthropic format only | Standardize to Anthropic format. Less flexible but simpler. | |

**User's choice:** Detect provider from baseUrl (Recommended)
**Notes:** Most flexible approach. No UI changes needed. Anthropic as fallback for custom/self-hosted APIs.

---

## Provider Detection Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Anthropic as default fallback | Unknown baseUrl → use Anthropic format. Most common for Vision APIs. | ✓ |
| Strict: only Anthropic/OpenAI | Show error if baseUrl is neither. Less flexible. | |
| Manual format selection | Add format dropdown in Settings. More control, more UI. | |

**User's choice:** Anthropic as default fallback (Recommended)
**Notes:** Self-hosted/custom APIs can still work with Anthropic-compatible format.

---

## Prompt Output Style

| Option | Description | Selected |
|--------|-------------|----------|
| Ask AI to generate prompt | Include instruction in request asking AI to generate image generation prompt. AI outputs ready-to-use text. | ✓ |
| Raw description output | AI describes image in detail. User edits to make prompt. | |
| Post-process with template | AI description → code fills prompt template slots. More structured but complex. | |

**User's choice:** Ask AI to generate prompt (Recommended)
**Notes:** Include instruction: "Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition."

---

## Prompt Language

| Option | Description | Selected |
|--------|-------------|----------|
| Use user's language preference | Read settings.resourceLanguage ('zh' or 'en'). Include language instruction in request. | ✓ |
| Always English | Most image generation platforms work best with English. | |
| Always Chinese | Lovart is Chinese platform, Chinese prompts may be more natural. | |

**User's choice:** Use user's language preference (Recommended)
**Notes:** Uses existing `settings.resourceLanguage` setting from StorageSchema. Default is 'zh'.

---

## Loading UX

| Option | Description | Selected |
|--------|-------------|----------|
| Open loading page | After context menu click, open extension page with spinner + "正在分析图片...". Page updates with result. | ✓ |
| Browser notification | Show notification during processing. Update when done. Less intrusive but may be disabled. | |
| Page overlay injection | Inject loading overlay via content script. Most integrated but requires injection on all pages. | |

**User's choice:** Open loading page (Recommended)
**Notes:** Opens `src/popup/loading.html` via `chrome.tabs.create()`. Clear visual feedback.

---

## Loading Page Content After API

| Option | Description | Selected |
|--------|-------------|----------|
| Loading → Preview | Spinner → generated prompt with Preview/Cancel buttons. Integrates Phase 12 preview. Seamless flow. | ✓ |
| Loading only, preview separate | Spinner only. Close page after API. Phase 12 handles preview separately. | |
| Show image + loading + prompt | Spinner + image thumbnail being analyzed. More context, more complex. | |

**User's choice:** Loading → Preview (Recommended)
**Notes:** Single page handles entire flow: loading → preview → confirm/cancel. No need for separate Phase 12 preview dialog.

---

## Error Display

| Option | Description | Selected |
|--------|-------------|----------|
| Error message on loading page | Replace spinner with error + action buttons. User sees what went wrong and can act. | ✓ |
| Notification + close | Close loading page, show notification. Less integrated. | |
| Toast on current page | Toast-style alert via content script. Most integrated but complex. | |

**User's choice:** Error message on loading page (Recommended)
**Notes:** Same page, clear feedback. No need to navigate elsewhere.

---

## Error Action Buttons

| Option | Description | Selected |
|--------|-------------|----------|
| Specific action buttons | Invalid key → "重新配置". Network/rate limit → "重新尝试". Unsupported image → "关闭". | ✓ |
| Generic retry/close buttons | All errors show retry/close. Simpler but retry may not work for all errors. | |
| Focus on configuration | All errors show "重新配置" + "关闭". Assumes config errors are most common. | |

**User's choice:** Specific action buttons (Recommended)
**Notes:** Clear, actionable. User knows what to do for each error type.

---

## Claude's Discretion

Areas where user said "you decide" or deferred to Claude:
- Exact system prompt text for prompt generation instruction
- Timeout duration for API calls
- Retry count limit for rate limit/network errors
- Loading page exact layout (spinner style, text position)
- Image size/format validation before API call
- Specific error message text for each error type

---

## Deferred Ideas

No scope creep discussed. User stayed within phase boundaries.

---

*Discussion log: 2026-04-28*