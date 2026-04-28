# Architecture

**Analysis Date:** 2026/04/28

## Pattern Overview

**Overall:** Chrome Extension Three-Context Architecture

**Key Characteristics:**
- Storage-First: All state derives from `chrome.storage.local` via single key `prompt_script_data`
- Shadow DOM Isolation: Content script UI isolated from host page CSS
- Message-Based Communication: Cross-context coordination via `chrome.runtime.sendMessage`
- Singleton Storage Manager: Centralized persistence layer with migration handling
- Debounced Storage Writes: Batch rapid state changes with 300ms debounce in Zustand store

## Layers

**Content Script Layer:**
- Purpose: Run on Lovart.ai pages, inject dropdown UI, handle prompt insertion
- Location: `src/content/`
- Contains: Input detection, UI injection, dropdown components, insertion handlers
- Depends on: Service worker for storage operations (via messages), host page DOM
- Used by: User interaction on Lovart platform
- Communication: Receives `REFRESH_DATA`, `SYNC_FAILED` from service worker
- Key files:
  - `src/content/content-script.ts` - Entry point, coordinates components
  - `src/content/input-detector.ts` - MutationObserver for Lovart input (SPA detection)
  - `src/content/ui-injector.tsx` - Shadow DOM container + React mount
  - `src/content/insert-handler.ts` - Prompt text insertion (Lexical compatible)
  - `src/content/components/DropdownContainer.tsx` - Main dropdown UI (62KB, largest file)

**Background Layer (Service Worker):**
- Purpose: Message routing, storage operations, sync orchestration, version checking
- Location: `src/background/`
- Contains: Service worker with message handler switch (25+ message types)
- Depends on: chrome.storage.local, IndexedDB, File System Access API, GitHub API
- Used by: Content scripts and popup via `chrome.runtime.sendMessage`
- Communication: Responds with `{ success: boolean, data?: T, error?: string }`
- Key files:
  - `src/background/service-worker.ts` - Message routing (400+ lines)

**Popup Layer:**
- Purpose: Extension popup UI for backup management and settings
- Location: `src/popup/`
- Contains: React app with Tailwind styling, Radix UI dialogs, Zustand store
- Depends on: Service worker for storage, Zustand for local state management
- Used by: User clicking extension icon
- Communication: Sends `GET_SYNC_STATUS`, `CHECK_UPDATE`, `BACKUP_TO_FOLDER`, etc.
- Key files:
  - `src/popup/backup.html` - Entry HTML (manifest `action.default_popup`)
  - `src/popup/BackupApp.tsx` - Main popup component (21KB)

**Shared Layer:**
- Purpose: Cross-context types, constants, utilities
- Location: `src/shared/`
- Contains: TypeScript interfaces, MessageType enum, constants, utility functions
- Depends on: Nothing (pure TypeScript)
- Used by: All three contexts
- Key files:
  - `src/shared/types.ts` - Prompt, Category, StorageSchema, SyncSettings, UpdateStatus
  - `src/shared/messages.ts` - MessageType enum (25 message types)
  - `src/shared/constants.ts` - STORAGE_KEY, PLATFORM_DOMAIN, backup patterns
  - `src/shared/utils.ts` - sortPromptsByOrder, truncateText

**Library Layer:**
- Purpose: Business logic, state management, sync operations, migrations
- Location: `src/lib/`
- Contains: StorageManager, Zustand store, sync modules, import/export, migrations
- Depends on: Chrome APIs, shared types
- Used by: Popup, service worker (content script uses messages instead)
- Key files:
  - `src/lib/store.ts` - Zustand store with CRUD operations (475 lines)
  - `src/lib/storage.ts` - StorageManager singleton (185 lines)
  - `src/lib/sync/sync-manager.ts` - Sync orchestration (340 lines)
  - `src/lib/sync/file-sync.ts` - File System Access API operations (370 lines)
  - `src/lib/sync/indexeddb.ts` - Folder handle persistence
  - `src/lib/sync/hash.ts` - Content deduplication for backup history
  - `src/lib/version-checker.ts` - GitHub API version check
  - `src/lib/import-export.ts` - JSON validation and merge

## Data Flow

**Storage Read Flow:**
1. Popup/Content calls `usePromptStore.getState().loadFromStorage()` or sends `GET_STORAGE` message
2. Service worker calls `StorageManager.getData()`
3. StorageManager reads from `chrome.storage.local` key `prompt_script_data`
4. Migration applied if legacy format detected (`isLegacyFormat()` check)
5. Schema validated for required fields (`userData`, `settings`)
6. Data returned to caller, Zustand state updated (popup) or message response sent (content)

**Storage Write Flow:**
1. User action triggers Zustand store CRUD operation
2. Store updates local state immediately
3. `saveToStorage()` or `debouncedSaveToStorage()` called (300ms debounce for rapid changes)
4. Message `SET_STORAGE` sent to service worker with `userData` payload
5. Service worker merges with existing settings, saves to `chrome.storage.local`
6. Service worker calls `triggerSync(userData)` if sync enabled
7. Sync writes to local folder via File System Access API (with content hash deduplication)
8. Response returned with `{ syncSuccess: boolean }` for UI feedback

**Prompt Insertion Flow:**
1. User clicks prompt in dropdown on Lovart.ai
2. `DropdownContainer` calls `InsertHandler.insertPrompt(inputElement, content)`
3. Handler checks element type (form control vs contenteditable)
4. For Lexical editor: Uses `document.execCommand('insertText', false, text)`
5. Dispatches `input` and `change` events for Lovart recognition
6. Calls native value setter for React tracking (form controls)
7. Fallback DOM manipulation if execCommand fails

**Sync Flow:**
1. `saveToStorage()` completes in popup
2. Service worker calls `triggerSync(userData)`
3. Check `syncEnabled` in settings - if false, mark `hasUnsyncedChanges: true`
4. Get folder handle from IndexedDB
5. Compute content hash via `computeUserDataHash()`
6. Write `omps-latest.json` with version, userData, backupTime, contentHash
7. Create history backup (`omps-backup-{timestamp}.json`) only if hash changed
8. Cleanup old backups exceeding 100 limit
9. Update `lastSyncTime`, clear `hasUnsyncedChanges`
10. If sync fails: Set `hasUnsyncedChanges: true`, broadcast `SYNC_FAILED`

**State Management:**
- Zustand store (`usePromptStore`) manages prompts, categories, selectedCategoryId
- Storage as single source of truth
- Store synced to storage after each CRUD operation
- Debounced saves (300ms) batch rapid changes during drag reorder
- `flushSave()` ensures data saved before popup closes
- `migratePromptOrders()` assigns order field if missing (backward compatibility)

## Key Abstractions

**StorageSchema:**
- Purpose: Root data structure for all extension data
- Structure: `{ version, userData: { prompts, categories }, settings: SyncSettings, _migrationComplete }`
- Location: `src/shared/types.ts`
- Pattern: Single-key storage (`prompt_script_data`)

**MessageType:**
- Purpose: Type-safe cross-context communication
- Enum: 25 message types (PING, GET_STORAGE, SET_STORAGE, INSERT_PROMPT, BACKUP_TO_FOLDER, SAVE_IMAGE, READ_IMAGE, DELETE_IMAGE, GET_FOLDER_HANDLE, SAVE_FOLDER_HANDLE, GET_SYNC_STATUS, SET_UNSYNCED_FLAG, SYNC_FAILED, OPEN_BACKUP_PAGE, REFRESH_DATA, CHECK_UPDATE, GET_UPDATE_STATUS, CLEAR_UPDATE_STATUS, OPEN_EXTENSIONS, EXPORT_DATA, DISMISS_BACKUP_WARNING, RESTORE_PERMISSION, SET_SETTINGS_ONLY)
- Pattern: Request/response with `{ success, data?, error? }`

**StorageManager Singleton:**
- Purpose: Centralized storage operations with migration handling
- Location: `src/lib/storage.ts`
- Pattern: `getInstance()`, `getData()` (handles migration), `saveData()`, `updateSettings()`, `updateUserData()`
- Handles: First install (initialize), legacy format migration, version update

**InsertHandler Class:**
- Purpose: React/Lexical-compatible text insertion
- Location: `src/content/insert-handler.ts`
- Pattern: `execCommand('insertText')` + native value setter + event dispatch
- Handles: HTMLInputElement, HTMLTextAreaElement, contenteditable (Lexical)

**InputDetector Class:**
- Purpose: MutationObserver for detecting Lovart input element in SPA
- Location: `src/content/input-detector.ts`
- Pattern: Debounced detection (100ms), history API interception for SPA navigation, periodic health check (30s)
- Selectors: `[data-testid="agent-message-input"]`, `[data-lexical-editor="true"]`

**UIInjector Class:**
- Purpose: Shadow DOM container for CSS isolation from host page
- Location: `src/content/ui-injector.tsx`
- Pattern: Create host element, attach Shadow DOM, inject inline styles via `getStyles()`, mount React root
- Insertion: BEFORE `[data-testid="agent-input-bottom-more-button"]`

**SyncManager:**
- Purpose: Orchestrate local folder backup sync
- Location: `src/lib/sync/sync-manager.ts`
- Pattern: `triggerSync()` after storage writes, `enableSync()`, `disableSync()`, `restorePermission()`, `getBackupVersions()`, `restoreFromBackup()`

## Entry Points

**Content Script Entry:**
- Location: `src/content/content-script.ts`
- Triggers: Lovart page load (manifest `content_scripts` matches)
- Responsibilities: Initialize InputDetector, UIInjector, handle `REFRESH_DATA`/`SYNC_FAILED` messages, cleanup on unload

**Service Worker Entry:**
- Location: `src/background/service-worker.ts`
- Triggers: Extension install/update, browser start, messages received
- Responsibilities: Message routing (25+ handlers), storage ops, sync triggering, version checking, image save/read/delete

**Popup Entry:**
- Location: `src/popup/backup.html` -> `src/popup/backup.tsx` -> `BackupApp.tsx`
- Triggers: Extension icon click (manifest `action.default_popup`)
- Responsibilities: Sync status display, folder selection, backup history, restore operations, update checking

## Error Handling

**Strategy:** Console logging with `[Oh My Prompt]` prefix, graceful fallbacks

**Patterns:**
- Storage errors: Return default data WITHOUT persisting (transient error handling)
- Message handlers: `return true` for async `sendResponse` (Chrome requirement)
- Response format: `{ success: false, error: 'message' }` for failures
- Insert errors: Return boolean `false`, log to console
- Sync errors: Set `hasUnsyncedChanges: true`, broadcast `SYNC_FAILED` to content scripts
- Migration errors: Throw with step version info for debugging

**Error Boundaries:**
- Content script: `ErrorBoundary` component wraps `DropdownApp` (`src/content/components/ErrorBoundary.tsx`)
- Popup: Error states in UI with retry buttons

## Cross-Cutting Concerns

**Logging:** `[Oh My Prompt]` prefix throughout all contexts for easy console filtering

**Validation:**
- TypeScript strict mode
- Import validation: `validateImportData()` in `src/lib/import-export.ts`
- Legacy format detection: `isLegacyFormat()` in `src/lib/migrations/index.ts`
- Storage validation: Check `userData`, `settings` fields in `getData()`
- Backup file validation in `readBackupFile()`

**Migration:**
- Registry pattern in `src/lib/migrations/`
- `registerMigration()` for adding version handlers
- Version comparison via `semverCompare()` (major.minor)
- `_migrationComplete` flag prevents re-migration

**CSS Isolation:**
- Content script: Shadow DOM with inline styles (`UIInjector.getStyles()`, 750+ lines of CSS)
- Dropdown portal: `mousedown.preventDefault()` preserves input focus
- Popup: Tailwind CSS (no isolation needed, separate extension context)

---

*Architecture analysis: 2026/04/28*