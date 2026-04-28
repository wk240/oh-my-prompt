# Phase 11: Vision API Integration - Research

**Researched:** 2026-04-28
**Domain:** Vision AI API Integration (Anthropic Claude / OpenAI GPT-4V)
**Confidence:** MEDIUM (API formats verified via training knowledge, web verification unavailable)

## Summary

Phase 11 implements Vision API calls from Chrome Extension service worker to analyze images and generate prompts. The architecture follows the established pattern: context menu triggers URL capture → service worker opens loading page → loading page requests API call via message → service worker executes fetch → result returned to loading page for preview/insert.

**Primary recommendation:** Use fetch API from service worker with provider-specific request formatting based on baseUrl pattern detection. Anthropic format for `anthropic.com` domains, OpenAI format for `openai.com` domains.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Detect provider from baseUrl pattern:
  - `api.anthropic.com` or `anthropic.com` → Anthropic Claude format with `x-api-key` header
  - `api.openai.com` or `openai.com` → OpenAI GPT-4V format with `Authorization: Bearer` header
  - Unknown domains → fallback to Anthropic format (most common for Vision APIs)

- **D-02:** Ask AI to generate prompt directly. Include instruction in API request: "Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition." AI outputs ready-to-use prompt text.

- **D-03:** Use user's language preference for prompt output. Read `settings.resourceLanguage` from storage ('zh' or 'en'). Include language instruction in API request.

- **D-04:** Open extension page (`src/popup/loading.html`) after context menu click. Page shows:
  - Loading spinner + "正在分析图片..." text
  - After API returns: generated prompt with Preview/Cancel buttons (integrates Phase 12 preview)
  - Seamless flow: loading → preview → confirm/insert

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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Scope creep items noted:
- Prompt insertion into Lovart input field (Phase 12)
- Clipboard copy on non-Lovart pages (Phase 12)
- Usage analytics/logging (Out of Scope per REQUIREMENTS.md)
- Batch processing multiple images (Out of Scope per REQUIREMENTS.md)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VISION-01 | Service worker calls Vision API with captured image URL | Provider detection pattern (D-01), fetch API architecture, Anthropic/OpenAI request formats |
| VISION-02 | API returns prompt text suitable for Lovart image generation | System prompt design (D-02), language preference (D-03), response parsing patterns |
| VISION-03 | Loading indicator shown during API call | Extension page architecture (D-04), React state management, spinner component patterns |
| VISION-04 | Clear error messages shown for API failures | Error classification patterns, UX response buttons (D-05), retry logic |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vision API request execution | Background / Service Worker | — | Service worker can make cross-origin fetch requests without CORS restrictions; API key must remain in secure context |
| Loading UI state management | Popup / Extension Page | — | Extension page provides isolated React context for UI state; communicates with service worker via messages |
| Provider detection logic | Background / Service Worker | — | Detection happens before API call, service worker owns the request construction |
| Error classification and handling | Background / Service Worker | Popup / Extension Page | Service worker classifies errors, extension page displays UI response options |
| Result preview display | Popup / Extension Page | — | Preview UI lives in extension page, receives result via message from service worker |
| Prompt insertion coordination | Background / Service Worker | Content Script (Phase 12) | Service worker coordinates with content script for Lovart insertion; clipboard for other pages |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fetch API | Native | HTTP requests | Chrome service worker native capability, no library needed [VERIFIED: Chrome Extension API] |
| React | 19.x | Loading page UI | Established pattern in popup layer [VERIFIED: existing popup files] |
| Tailwind CSS | 3.x | Loading page styling | Consistent with popup styling [VERIFIED: SettingsApp.tsx] |
| Radix UI Dialog | - | Error dialogs | Established pattern [VERIFIED: src/popup/components/ui/dialog.tsx] |
| lucide-react | - | Icons (spinner, buttons) | Established icon library [VERIFIED: SettingsApp.tsx imports] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MessageType enum | Existing | Cross-context messaging | All service worker ↔ popup communication [VERIFIED: src/shared/messages.ts] |
| VisionApiConfig | Existing | API configuration interface | Type safety for API config [VERIFIED: src/shared/types.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | axios | Native fetch sufficient for single API call; axios adds dependency weight |
| Extension page loading UI | Content script overlay | Extension page provides better isolation and React ecosystem support; content script would require Shadow DOM |

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User Action Flow                                  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 9: Context Menu Click                                             │
│  ┌─────────────────────┐                                                 │
│  │ chrome.contextMenus │ ────► Capture imageUrl ────►                    │
│  │    onClicked        │        chrome.storage.local                     │
│  └─────────────────────┘        { _capturedImageUrl }                    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 11: Vision API Integration                                        │
│                                                                           │
│  ┌─────────────────────┐    ┌─────────────────────┐                      │
│  │ Service Worker      │    │ Extension Page      │                      │
│  │                     │◄───│ loading.html        │                      │
│  │ 1. Open loading page│    │ LoadingApp.tsx      │                      │
│  │    chrome.tabs.create                    │         │                      │
│  │                     │    │ ┌─────────────────┐ │                      │
│  │ 2. Handle API call  │◄───│ │ Request API    │ │                      │
│  │    message          │    │ │ VISION_API_CALL│ │                      │
│  │                     │    │ └─────────────────┘ │                      │
│  │ 3. Provider detect  │    │         │           │                      │
│  │    (baseUrl pattern)│    │         ▼           │                      │
│  │                     │    │ ┌─────────────────┐ │                      │
│  │ 4. Build request    │───►│ │ Loading State  │ │                      │
│  │    (Anthropic/OpenAI)    │ │ (spinner)      │ │                      │
│  │                     │    │ └─────────────────┘ │                      │
│  │ 5. Execute fetch    │    │         │           │                      │
│  │    (timeout 30s)    │    │         ▼           │                      │
│  │                     │    │ ┌─────────────────┐ │                      │
│  │ 6. Parse response   │───►│ │ Result Preview │ │                      │
│  │    or classify error│    │ │ or Error UI    │ │                      │
│  │                     │    │ └─────────────────┘ │                      │
│  └─────────────────────┘    └─────────────────────┘                      │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 12: Prompt Insertion                                              │
│  (Preview → Confirm → Insert to Lovart / Clipboard)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── popup/                    # Extension pages (Phase 11 adds)
│   ├── loading.html          # NEW - Loading page entry HTML
│   ├── loading.tsx           # NEW - Loading page entry TypeScript
│   ├── LoadingApp.tsx        # NEW - Main loading UI component
│   ├── components/ui/        # Existing Radix UI primitives
│   └── index.css             # Existing Tailwind CSS
│
├── background/               # Service worker (Phase 11 extends)
│   └── service-worker.ts     # Add Vision API call handlers
│
├── lib/                      # NEW optional module
│   └── vision-api.ts         # Optional: API call abstraction
│
├── shared/                   # Cross-context (Phase 11 extends)
│   ├── messages.ts           # Add VISION_API_CALL, VISION_API_RESULT, VISION_API_ERROR
│   ├── types.ts              # VisionApiConfig already exists
│   └── constants.ts          # CAPTURED_IMAGE_STORAGE_KEY already exists
```

### Pattern 1: Provider Detection from BaseUrl

**What:** Determine API request format based on URL domain pattern.

**When to use:** Before constructing Vision API request.

**Example:**
```typescript
// Source: [ASSUMED] - Training knowledge, not verified via tools
function detectProvider(baseUrl: string): 'anthropic' | 'openai' {
  const normalizedUrl = baseUrl.toLowerCase()
  if (normalizedUrl.includes('anthropic.com')) {
    return 'anthropic'
  }
  if (normalizedUrl.includes('openai.com')) {
    return 'openai'
  }
  // Default fallback (D-01)
  return 'anthropic'
}
```

### Pattern 2: Anthropic Claude Vision API Request

**What:** Construct request for Anthropic Claude Vision API.

**When to use:** Provider detection returns 'anthropic'.

**Example:**
```typescript
// Source: [ASSUMED] - Training knowledge based on Anthropic API docs
// Headers required:
// - x-api-key: {apiKey}
// - anthropic-version: "2023-06-01" (or current version)
// - Content-Type: "application/json"

interface AnthropicRequest {
  model: string // e.g., "claude-3-5-sonnet-20241022"
  max_tokens: number // e.g., 1024
  messages: Array<{
    role: "user"
    content: Array<{
      type: "image"
      source: {
        type: "base64" | "url"
        media_type?: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
        data?: string // base64 encoded image
        url?: string // HTTP URL
      }
    } | {
      type: "text"
      text: string // system prompt instruction
    }>
  }>
}

// Example request body:
const anthropicRequest: AnthropicRequest = {
  model: modelName,
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "url",
          url: imageUrl // HTTP URL to image
        }
      },
      {
        type: "text",
        text: "Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition. Please respond in Chinese."
      }
    ]
  }]
}

// Response format:
interface AnthropicResponse {
  content: Array<{
    type: "text"
    text: string // Generated prompt
  }>
}
```

### Pattern 3: OpenAI GPT-4V API Request

**What:** Construct request for OpenAI GPT-4V API.

**When to use:** Provider detection returns 'openai'.

**Example:**
```typescript
// Source: [ASSUMED] - Training knowledge based on OpenAI API docs
// Headers required:
// - Authorization: Bearer {apiKey}
// - Content-Type: "application/json"

interface OpenAIRequest {
  model: string // e.g., "gpt-4-vision-preview", "gpt-4o"
  messages: Array<{
    role: "user"
    content: Array<{
      type: "text"
      text: string // system prompt instruction
    } | {
      type: "image_url"
      image_url: {
        url: string // HTTP URL or base64 data URL
        detail?: "low" | "high" | "auto"
      }
    }>
  }>
  max_tokens?: number
}

// Example request body:
const openaiRequest: OpenAIRequest = {
  model: modelName,
  messages: [{
    role: "user",
    content: [
      {
        type: "text",
        text: "Analyze this image and generate a detailed image generation prompt that can recreate it. Focus on style, subject, lighting, composition. Please respond in Chinese."
      },
      {
        type: "image_url",
        image_url: {
          url: imageUrl // HTTP URL to image
        }
      }
    ]
  }],
  max_tokens: 1024
}

// Response format:
interface OpenAIResponse {
  choices: Array<{
    message: {
      role: "assistant"
      content: string // Generated prompt
    }
  }>
}
```

### Pattern 4: Extension Page Message Protocol

**What:** Communication between loading page and service worker.

**When to use:** Requesting API call, receiving results, handling errors.

**Example:**
```typescript
// Source: [VERIFIED: src/shared/messages.ts existing patterns]

// NEW MessageType entries to add:
enum MessageType {
  // ... existing entries ...
  VISION_API_CALL = 'VISION_API_CALL',     // Request API call from loading page
  VISION_API_RESULT = 'VISION_API_RESULT', // Response with generated prompt
  VISION_API_ERROR = 'VISION_API_ERROR'    // Error classification for UI
}

// Request payload:
interface VisionApiCallPayload {
  imageUrl: string
}

// Result payload:
interface VisionApiResultPayload {
  prompt: string
}

// Error payload:
interface VisionApiErrorPayload {
  type: 'invalid_key' | 'network' | 'rate_limit' | 'unsupported_image' | 'timeout'
  message: string
}

// Service worker handler pattern (following existing convention):
case MessageType.VISION_API_CALL:
  const callPayload = message.payload as VisionApiCallPayload
  // Execute API call logic
  executeVisionApiCall(callPayload.imageUrl)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(error => {
      const errorPayload = classifyError(error)
      sendResponse({ success: false, error: errorPayload })
    })
  return true // Required for async response
```

### Pattern 5: Error Classification for UX

**What:** Map API errors to user-friendly error types with action buttons.

**When to use:** API call fails, before sending error response.

**Example:**
```typescript
// Source: [ASSUMED] - Standard error handling patterns

interface ClassifiedError {
  type: 'invalid_key' | 'network' | 'rate_limit' | 'unsupported_image' | 'timeout'
  message: string // User-friendly message
  action: 'reconfigure' | 'retry' | 'close'
}

function classifyApiError(error: unknown): ClassifiedError {
  if (error instanceof Error) {
    // Anthropic/OpenAI specific error codes
    if (error.message.includes('401') || error.message.includes('invalid_api_key')) {
      return {
        type: 'invalid_key',
        message: 'API Key 无效，请检查配置',
        action: 'reconfigure'
      }
    }
    if (error.message.includes('429') || error.message.includes('rate_limit')) {
      return {
        type: 'rate_limit',
        message: 'API 调用频率超限，请稍后重试',
        action: 'retry'
      }
    }
    if (error.message.includes('timeout')) {
      return {
        type: 'timeout',
        message: 'API 响应超时，请重试',
        action: 'retry'
      }
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return {
        type: 'network',
        message: '网络连接失败，请检查网络后重试',
        action: 'retry'
      }
    }
  }
  // Generic error
  return {
    type: 'network',
    message: '发生未知错误，请重试',
    action: 'retry'
  }
}
```

### Anti-Patterns to Avoid

- **API key in console logs:** Never log apiKey in any console output (security requirement AUTH-02) [VERIFIED: SettingsApp.tsx pattern]
- **Missing anthropic-version header:** Anthropic API requires this header; omitting causes 400 error [ASSUMED]
- **Direct image URL in Anthropic base64 source:** Use `type: "url"` for HTTP URLs, not `type: "base64"` with data [ASSUMED]
- **Infinite retry loops:** Implement max retry count (D-05 suggests 3) for rate_limit/network errors
- **Blocking loading page during timeout:** Use AbortController for fetch timeout, not Promise.race with setTimeout

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP request timeout | setTimeout race | AbortController with fetch timeout | Clean abort, proper error handling, native browser support |
| Provider detection regex | Complex URL parsing | Simple `includes()` check per D-01 | URL patterns are predictable; over-engineering unnecessary |
| Error classification enum | String error types | Typed ClassifiedError interface | Type safety for error handling flow |
| Loading spinner animation | Custom CSS animation | Tailwind animate-spin + lucide-react Loader2 | Established patterns in codebase |

**Key insight:** Vision API integration is a single request-response flow. Keep implementation minimal — no need for retry queues, caching, or complex state management beyond loading → result → error states.

## Common Pitfalls

### Pitfall 1: Missing anthropic-version Header

**What goes wrong:** Anthropic API returns 400 Bad Request with "missing required header" error.

**Why it happens:** Anthropic API requires `anthropic-version` header (e.g., `2023-06-01`) to specify API version.

**How to avoid:** Always include `anthropic-version: "2023-06-01"` header in Anthropic requests.

**Warning signs:** 400 response code, "invalid_request_error" in response body.

### Pitfall 2: OpenAI image_url Content Type

**What goes wrong:** OpenAI API returns 400 for malformed image content.

**Why it happens:** OpenAI uses `type: "image_url"` with nested `image_url: { url: "..." }` structure, different from Anthropic's `type: "image"` with `source` structure.

**How to avoid:** Use correct OpenAI structure per D-01 provider detection.

**Warning signs:** Response parsing fails, unexpected content structure.

### Pitfall 3: Service Worker Async Response

**What goes wrong:** Message response not received in loading page.

**Why it happens:** Chrome requires `return true` from message listener to keep async response channel open.

**How to avoid:** Always `return true` at end of message handler with async operations [VERIFIED: service-worker.ts pattern].

**Warning signs:** sendResponse callback never fires, loading page hangs.

### Pitfall 4: CORS in Service Worker

**What goes wrong:** Fetch fails with CORS error for image URLs.

**Why it happens:** Service worker has relaxed CORS compared to content scripts, but some image hosts may still block.

**How to avoid:** Service worker can fetch most URLs; if CORS fails, consider converting to base64 via additional fetch (adds latency).

**Warning signs:** TypeError: Failed to fetch, CORS headers missing.

### Pitfall 5: API Timeout Handling

**What goes wrong:** Loading page shows spinner indefinitely if API hangs.

**Why it happens:** Vision API calls can take 2-10+ seconds; network issues may cause indefinite wait.

**How to avoid:** Use AbortController with 30-second timeout (D-05 discretion), classify as 'timeout' error.

**Warning signs:** Spinner shows for >30 seconds, no state transition.

## Code Examples

### Loading Page Entry (loading.html)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>图片转提示词 - Oh My Prompt</title>
  <link rel="stylesheet" href="./index.css">
</head>
<body class="bg-gray-50">
  <div id="root"></div>
  <script type="module" src="./loading.tsx"></script>
</body>
</html>
```

### LoadingApp Component Structure

```typescript
// Source: [VERIFIED: pattern from SettingsApp.tsx]

import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Loader2, Check, RefreshCw, Settings, X } from 'lucide-react'
import { MessageType } from '../shared/messages'

interface LoadingAppState {
  status: 'loading' | 'success' | 'error'
  prompt?: string
  errorType?: 'invalid_key' | 'network' | 'rate_limit' | 'unsupported_image' | 'timeout'
  errorMessage?: string
}

function LoadingApp() {
  const [state, setState] = useState<LoadingAppState>({ status: 'loading' })

  useEffect(() => {
    // Request API call on mount
    requestApiCall()
  }, [])

  const requestApiCall = async () => {
    setState({ status: 'loading' })
    // Get captured image URL from storage
    const imageUrl = await getImageUrlFromStorage()
    if (!imageUrl) {
      setState({ status: 'error', errorType: 'network', errorMessage: '未找到图片URL' })
      return
    }
    // Send API call request to service worker
    const response = await chrome.runtime.sendMessage({
      type: MessageType.VISION_API_CALL,
      payload: { imageUrl }
    })
    if (response.success) {
      setState({ status: 'success', prompt: response.data.prompt })
    } else {
      setState({ status: 'error', errorType: response.error.type, errorMessage: response.error.message })
    }
  }

  const handleRetry = () => requestApiCall()

  const handleReconfigure = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
    window.close()
  }

  const handleClose = () => window.close()

  return (
    <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      {/* Loading state */}
      {state.status === 'loading' && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-600">正在分析图片...</p>
        </div>
      )}

      {/* Success state */}
      {state.status === 'success' && (
        <div className="space-y-4">
          <p className="text-sm font-medium">生成的提示词：</p>
          <div className="bg-gray-50 p-3 rounded text-sm text-gray-800 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
            {state.prompt}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConfirm}>
              <Check className="w-4 h-4" />
              确认插入
            </Button>
            <Button variant="outline" onClick={handleClose}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {state.status === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-red-500">{state.errorMessage}</p>
          <div className="flex gap-2">
            {state.errorType === 'invalid_key' && (
              <Button onClick={handleReconfigure}>
                <Settings className="w-4 h-4" />
                重新配置
              </Button>
            )}
            {['network', 'rate_limit', 'timeout'].includes(state.errorType!) && (
              <Button onClick={handleRetry}>
                <RefreshCw className="w-4 h-4" />
                重新尝试
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              <X className="w-4 h-4" />
              关闭
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

### Service Worker Vision API Handler

```typescript
// Source: [VERIFIED: pattern from existing service-worker.ts handlers]

// Add to message handler switch:
case MessageType.VISION_API_CALL:
  const callPayload = message.payload as { imageUrl: string }
  if (!callPayload || !callPayload.imageUrl) {
    sendResponse({ success: false, error: { type: 'network', message: '无效的图片URL' } })
    return true
  }

  executeVisionApiCall(callPayload.imageUrl)
    .then(prompt => sendResponse({ success: true, data: { prompt } }))
    .catch(error => {
      const classified = classifyApiError(error)
      sendResponse({ success: false, error: classified })
    })
  return true

// New function:
async function executeVisionApiCall(imageUrl: string): Promise<string> {
  // Get API config from storage
  const config = await getApiConfig()
  if (!config) {
    throw new Error('API not configured')
  }

  // Get language preference
  const language = await getLanguagePreference()
  const languageInstruction = language === 'zh' 
    ? '请用中文回复。' 
    : 'Please respond in English.'

  // Detect provider
  const provider = detectProvider(config.baseUrl)

  // Build request based on provider
  const request = buildVisionRequest(provider, config, imageUrl, languageInstruction)

  // Execute with timeout
  const response = await fetchWithTimeout(config.baseUrl, request, 30000)

  // Parse response
  return parseVisionResponse(provider, response)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline error handling in service worker | ClassifiedError interface with action mapping | Phase 11 design | Type-safe error flow, better UX |
| Promise.race for timeout | AbortController for fetch timeout | Modern fetch API | Cleaner abort, proper cleanup |
| Content script overlay for loading | Extension page for loading | Phase 11 design (D-04) | Better React ecosystem, Shadow DOM avoided |

**Deprecated/outdated:**
- Promise.race with setTimeout for fetch timeout: Use AbortController instead (native support, cleaner)

## Assumptions Log

> Claims tagged [ASSUMED] need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Anthropic Vision API request format with `type: "image"` and `source` object | Pattern 2 | API returns 400, integration fails |
| A2 | Anthropic requires `anthropic-version: "2023-06-01"` header | Pattern 2, Pitfall 1 | API returns 400 missing header error |
| A3 | OpenAI uses `type: "image_url"` with nested structure | Pattern 3, Pitfall 2 | API returns 400 malformed content |
| A4 | Anthropic Vision API accepts HTTP URLs in `source.type: "url"` | Pattern 2 | May need base64 conversion for CORS |
| A5 | Service worker can fetch external image URLs without CORS restrictions | Pitfall 4 | CORS errors require base64 fallback |
| A6 | Anthropic response contains `content[].text` with generated prompt | Pattern 2 | Response parsing fails |
| A7 | OpenAI response contains `choices[].message.content` | Pattern 3 | Response parsing fails |
| A8 | Current Anthropic API version is `2023-06-01` | Pattern 2 | May need newer version |

**Recommendation:** Before implementation, verify API formats with official documentation or test endpoints.

## Open Questions

1. **Anthropic URL vs Base64 for Image Input**
   - What we know: Anthropic docs mention both URL and base64 source types.
   - What's unclear: Whether URL type requires CORS-accessible image or works with any HTTP URL.
   - Recommendation: Test with URL type first; fallback to base64 if CORS fails.

2. **Image Size/Format Validation**
   - What we know: Vision APIs have limits (e.g., 20MB for Anthropic).
   - What's unclear: Which formats are "unsupported" per D-05.
   - Recommendation: Implement size check (>20MB reject), allow standard formats (jpeg, png, gif, webp).

3. **System Prompt Effectiveness**
   - What we know: D-02 defines prompt generation instruction.
   - What's unclear: Whether generated prompts are "suitable for Lovart" without refinement.
   - Recommendation: Test with sample images, iterate system prompt in Claude's discretion.

4. **Retry Logic Details**
   - What we know: D-05 suggests max 3 retries.
   - What's unclear: Whether retry button should track remaining retries.
   - Recommendation: Implement simple retry button with max 3 attempts tracked in component state.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Chrome Extension fetch API | Vision API calls | ✓ | Native | — |
| React 19.x | Loading page UI | ✓ | Existing | — |
| Tailwind CSS | Loading page styling | ✓ | Existing | — |
| Radix UI Dialog | Error dialogs | ✓ | Existing | — |
| lucide-react | Icons | ✓ | Existing | — |
| AbortController | Fetch timeout | ✓ | Native | setTimeout race |

**Missing dependencies with no fallback:**
- None — all dependencies available.

**Missing dependencies with fallback:**
- None — native APIs sufficient.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (existing) |
| Config file | playwright.config.ts (implicit) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:headed` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VISION-01 | Service worker calls Vision API | integration | Mock API response test | ❌ Wave 0 |
| VISION-02 | API returns prompt text | integration | Mock API with fixture response | ❌ Wave 0 |
| VISION-03 | Loading indicator shown | UI | Visual snapshot test | ❌ Wave 0 |
| VISION-04 | Error messages displayed | UI | Mock error response test | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test` (if tests exist)
- **Per wave merge:** `npm run test:headed`
- **Phase gate:** All VISION tests green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/vision-api.test.ts` — Mock API call tests (VISION-01, VISION-02)
- [ ] `tests/loading-ui.test.ts` — Loading page UI tests (VISION-03, VISION-04)
- [ ] `tests/fixtures/mock-api.ts` — Mock Vision API responses for testing

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | API key validation before use |
| V3 Session Management | no | No session state |
| V4 Access Control | yes | API key not exposed in logs (AUTH-02) |
| V5 Input Validation | yes | URL format validation, image size check |
| V6 Cryptography | no | No encryption needed (HTTPS transport) |

### Known Threat Patterns for Chrome Extension + API

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in logs | Information Disclosure | Never log apiKey [VERIFIED: SettingsApp.tsx] |
| API key in localStorage | Information Disclosure | Use chrome.storage.local (isolated per extension) |
| Malicious image URL | Tampering | Validate URL starts with http/https (Phase 9 pattern) |
| XSS via prompt content | Tampering | Sanitize prompt before display (React handles by default) |
| API response injection | Tampering | Validate response structure before use |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: src/shared/types.ts] - VisionApiConfig interface structure
- [VERIFIED: src/shared/messages.ts] - MessageType enum, MessageResponse format
- [VERIFIED: src/background/service-worker.ts] - Message handler patterns, API config storage
- [VERIFIED: src/popup/SettingsApp.tsx] - Popup React patterns, error handling, button styles
- [VERIFIED: manifest.json] - tabs permission for loading page

### Secondary (MEDIUM confidence)
- [VERIFIED: src/popup/components/ui/button.tsx] - Button variants for error actions
- [VERIFIED: src/popup/components/ui/dialog.tsx] - Dialog component patterns
- [VERIFIED: vite.config.ts] - Extension page build configuration
- [VERIFIED: src/shared/constants.ts] - CAPTURED_IMAGE_STORAGE_KEY, VISION_API_CONFIG_STORAGE_KEY

### Tertiary (LOW confidence - needs verification)
- [ASSUMED] - Anthropic Vision API request format (Pattern 2)
- [ASSUMED] - Anthropic anthropic-version header requirement (Pitfall 1)
- [ASSUMED] - OpenAI Vision API request format (Pattern 3)
- [ASSUMED] - Anthropic/OpenAI response parsing structures

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies verified in existing codebase
- Architecture: HIGH - Pattern follows existing service worker ↔ popup communication
- API formats: LOW - [ASSUMED] claims need verification with official docs
- Pitfalls: MEDIUM - Based on standard HTTP/API patterns, some provider-specific

**Research date:** 2026-04-28
**Valid until:** 7 days (fast-moving API landscape, Anthropic/OpenAI may update specs)