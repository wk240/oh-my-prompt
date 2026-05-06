# Architecture

**Analysis Date:** 2026/05/06

## Pattern Overview

**Overall:** Platform-Configured Content Script with Shadow DOM Isolation

**Key Characteristics:**
- Multi-platform matching via URL patterns (domain, pathname, regex)
- Strategy pattern for platform-specific input insertion (Lexical, ProseMirror, native)
- Shadow DOM isolation for content script UI (no host page CSS conflicts)
- Message-based communication across extension contexts
- Debounced storage sync with retry mechanism for context invalidation
- Offscreen document for File System Access API (Service Worker cannot request permissions)

## Layers

**Content Script Layer:**
- Purpose: Runs on all URLs, detects input elements, injects dropdown UI, handles Vision modal
- Location: `src/content/`
- Contains: Platform matching, input detection, React dropdown, Vision modal, image hover button
- Depends on: Platform configs, chrome.runtime.sendMessage for storage, Zustand store (in-memory state)
- Used by: Injected into web pages by manifest

**Background Service Worker:**
- Purpose: Message routing, storage operations, version check, context menu, API calls
- Location: `src/background/service-worker.ts`
- Contains: Message handlers for 25+ MessageType enums, context menu setup, side panel behavior
- Depends on: chrome.storage.local, StorageManager, sync-manager, vision-api, offscreen-manager
- Used by: Content scripts, popup pages via chrome.runtime.sendMessage

**Popup/Sidepanel Layer:**
- Purpose: Extension UI for prompt/category management, settings, backup operations
- Location: `src/popup/`, `src/sidepanel/`
- Contains: React apps with Zustand store, Tailwind styling, Radix UI dialogs
- Depends on: chrome.storage.local, chrome.runtime.sendMessage, chrome.tabs
- Used by: User via extension icon click, context menu actions

**Offscreen Document:**
- Purpose: File System Access API operations (requires DOM context for permissions)
- Location: `src/offscreen/offscreen.ts`
- Contains: File sync, image save/read/delete, permission check/request, API config encryption
- Depends on: FileSystemDirectoryHandle from IndexedDB, Web Crypto API for encryption
- Used by: Service worker via `sendToOffscreen()` function

## Data Flow

**Prompt Insertion Flow:**

1. User clicks dropdown item in content script
2. Dropdown calls `inserter.insert(inputElement, promptText)` 
3. Inserter uses `execCommand('insertText')` for rich editors or native value setter for form controls
4. Events dispatched: `input`, `change`, `beforeinput` (for React tracking)
5. Prompt inserted into host page input field

**Storage Sync Flow:**

1. User modifies prompt/category in popup or content script
2. Zustand store `saveToStorage()` called (debounced 300ms)
3. `chrome.runtime.sendMessage({ type: SET_STORAGE })` to service worker
4. Service worker merges settings, saves to chrome.storage.local
5. `triggerSync()` called if syncEnabled
6. Service worker routes to offscreen document for file operations
7. Offscreen document writes JSON backup to user folder

**Vision API Flow:**

1. User right-clicks image → context menu
2. Service worker receives `contextMenus.onClicked`
3. Service worker sends `OPEN_VISION_MODAL` to content script
4. VisionModalManager creates Shadow DOM modal
5. TaskQueueManager adds task, calls `VISION_API_CALL` to service worker
6. Service worker compresses image, calls configured Vision API
7. Result returned, saved to temporary library
8. User can transfer to category or insert to input

**State Management:**
- Zustand store in popup/sidepanel: `usePromptStore` with prompts, categories, temporaryPrompts
- Zustand store in content script: `useTaskQueueStore` for Vision API task queue
- Debounced save pattern: `debouncedSaveToStorage()` batches rapid updates
- Retry mechanism: `sendMessageWithRetry()` handles extension context invalidation (3 retries)

## Key Abstractions

**PlatformConfig:**
- Purpose: Defines platform-specific matching and UI injection
- Examples: `src/content/platforms/lovart/config.ts`, `src/content/platforms/chatgpt/config.ts`
- Pattern: URL patterns + input selectors + UI anchor + optional inserter strategy
- Structure:
  ```typescript
  interface PlatformConfig {
    id: string
    name: string
    urlPatterns: UrlPattern[]  // domain, pathname, regex
    inputDetection: InputDetectionConfig  // selectors, debounceMs, validate
    uiInjection: UIInjectionConfig  // anchorSelector, position, customButton
    strategies?: { inserter?: InsertStrategy }
  }
  ```

**InsertStrategy:**
- Purpose: Platform-specific prompt insertion (handles Lexical, ProseMirror, native editors)
- Examples: `DefaultInserter` (most platforms), `LovartInserter` (Lexical)
- Pattern: Interface with `insert(element, text)` and `clear(element)` methods
- Implementation: `execCommand('insertText')` + native value setter + event dispatch

**StorageManager:**
- Purpose: Singleton for chrome.storage.local operations with migration support
- Examples: `src/lib/storage.ts`
- Pattern: getInstance() singleton, getData()/saveData() with legacy migration
- Handles: Empty storage (first install), legacy format migration, version mismatch

**SyncManager:**
- Purpose: Local folder backup sync orchestration
- Examples: `src/lib/sync/sync-manager.ts`
- Pattern: triggerSync() → offscreen → file operations, permission management
- Features: Permission restore, version history, backup restore

## Entry Points

**Content Script Entry:**
- Location: `src/content/core/coordinator.ts`
- Triggers: Manifest `<all_urls>` match pattern, runs at `document_idle`
- Responsibilities: Platform matching, Detector/Injector setup, message listener, Port connection, Vision modal lifecycle

**Service Worker Entry:**
- Location: `src/background/service-worker.ts`
- Triggers: Extension install/start, message listener, context menu click
- Responsibilities: Message routing (25+ handlers), context menu creation, initial sync, side panel behavior

**Popup Entry:**
- Location: `src/popup/backup.tsx`, `src/popup/settings.tsx`, etc.
- Triggers: Extension icon click (opens side panel), context menu "settings" action
- Responsibilities: Prompt CRUD, category management, backup operations, settings

**Offscreen Entry:**
- Location: `src/offscreen/offscreen.ts`
- Triggers: Service worker calls `ensureOffscreenDocument()`
- Responsibilities: File sync, image operations, permission requests, API config encryption

## Error Handling

**Strategy:** Classified error types with user-friendly messages

**Patterns:**
- Vision API errors classified by `classifyApiError()`: `invalid_key`, `network`, `rate_limit`, `unsupported_image`, `timeout`
- Each error type maps to UI action: `settings`, `retry`, `close`
- Sync errors: `permission_lost`, `folder_lost`, `write_failed`, `unknown`
- Storage errors: Graceful fallback to defaults without persisting (data loss risk noted in logs)
- Message retry: 3 retries with exponential backoff (50ms, 150ms, 300ms) for context invalidation

**Error Boundaries:**
- React ErrorBoundary in VisionModalManager wraps VisionModal component
- Catches rendering errors in Shadow DOM

## Cross-Cutting Concerns

**Logging:** 
- Prefix: `[Oh My Prompt]` for easy filtering
- Vision API: Logs baseUrl, modelName, image size - NEVER apiKey

**Validation:**
- Vision API: HTTPS required for baseUrl, HTTP/HTTPS for imageUrl
- Image size: 5MB limit (`MAX_IMAGE_SIZE`)
- File extension: jpg, jpeg, png, webp, gif allowed

**Authentication:**
- Vision API key stored locally, encrypted for backup
- No remote auth service - user self-manages API keys

**Security:**
- API key never logged (rule T-11-01)
- HTTPS enforced for Vision API endpoints (rule T-11-02)
- Shadow DOM closed mode for Vision modal (style isolation + security)
- API config encrypted with AES-GCM before backup

---

*Architecture analysis: 2026/05/06*