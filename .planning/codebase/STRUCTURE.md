# Codebase Structure

**Analysis Date:** 2026/05/06

## Directory Layout

```
oh-my-prompt/
├── src/                    # Source code
│   ├── background/         # Service worker
│   ├── content/            # Content script (runs on all URLs)
│   ├── popup/              # Extension popup pages
│   ├── sidepanel/          # Side panel UI
│   ├── lib/                # Shared utilities
│   ├── shared/             # Cross-context types/messages
│   ├── data/               # Built-in data, resource library
│   ├── offscreen/          # Offscreen document for file ops
│   └── hooks/              # React hooks (currently empty)
├── assets/                 # Extension icons (16, 48, 128px)
├── tests/                  # Playwright E2E tests
├── dist/                   # Build output (loaded as extension)
├── .planning/              # GSD planning artifacts
├── manifest.json           # Extension manifest (MV3)
├── vite.config.ts          # Vite + CRX build config
├── tsconfig.json           # TypeScript config
├── tailwind.config.ts      # Tailwind CSS config
├── playwright.config.ts    # E2E test config
├── package.json            # Dependencies
└── CLAUDE.md               # Project instructions
```

## Directory Purposes

**src/background:**
- Purpose: Service worker (Manifest V3 background)
- Contains: Message handlers, context menu, sync orchestration
- Key files: `src/background/service-worker.ts` (980 lines, 25+ message handlers)

**src/content:**
- Purpose: Content script injected into all URLs
- Contains: Platform matching, input detection, dropdown UI, Vision modal
- Key files: 
  - `src/content/core/coordinator.ts` - Entry point, lifecycle management
  - `src/content/core/detector.ts` - MutationObserver-based input detection
  - `src/content/vision-modal-manager.tsx` - Shadow DOM modal container
  - `src/content/image-hover-button-manager.ts` - Universal image hover button

**src/content/platforms:**
- Purpose: Platform-specific configurations and strategies
- Contains: 8 platform configs (Lovart, ChatGPT, Claude.ai, Gemini, LibLib, Jimeng, Xingliu, Kimi)
- Key files: 
  - `src/content/platforms/base/types.ts` - PlatformConfig, UrlPattern, InsertStrategy interfaces
  - `src/content/platforms/base/default-strategies.ts` - DefaultInserter for most platforms
  - `src/content/platforms/{platform}/config.ts` - Each platform's config

**src/content/components:**
- Purpose: React components for dropdown UI (Shadow DOM isolated)
- Contains: Dropdown, modals, list items, toasts
- Key files:
  - `src/content/components/DropdownApp.tsx` - Main dropdown with platform inserter
  - `src/content/components/VisionModal.tsx` - Image-to-prompt modal
  - `src/content/components/PromptEditModal.tsx` - Prompt editor

**src/popup:**
- Purpose: Extension popup pages (React + Tailwind)
- Contains: Backup page, settings page, API config page, loading page
- Key files:
  - `src/popup/backup.tsx` - BackupApp entry
  - `src/popup/BackupApp.tsx` - Backup management UI
  - `src/popup/SettingsApp.tsx` - Settings center
  - `src/popup/ApiConfigApp.tsx` - Vision API configuration
  - `src/popup/components/ui/` - Radix UI primitives (button, dialog, etc.)

**src/sidepanel:**
- Purpose: Chrome side panel UI (React + Tailwind)
- Contains: Prompt library, quick insert, input status indicator
- Key files: 
  - `src/sidepanel/sidepanel.tsx` - Entry point
  - `src/sidepanel/SidePanelApp.tsx` - Main app

**src/lib:**
- Purpose: Shared utilities for all contexts
- Contains: Storage, state management, sync, Vision API, migrations
- Key files:
  - `src/lib/store.ts` - Zustand store with CRUD + debounced sync
  - `src/lib/storage.ts` - StorageManager singleton
  - `src/lib/sync/sync-manager.ts` - Backup sync orchestration
  - `src/lib/sync/file-sync.ts` - File System Access API operations
  - `src/lib/sync/indexeddb.ts` - Folder handle persistence
  - `src/lib/vision-api.ts` - Vision API request/response handling
  - `src/lib/offscreen-manager.ts` - Offscreen document lifecycle
  - `src/lib/migrations/` - Schema migrations (v1.0, v1.3)

**src/shared:**
- Purpose: Cross-context shared code (types, messages, constants)
- Contains: TypeScript interfaces, MessageType enum, constants
- Key files:
  - `src/shared/types.ts` - Prompt, Category, StorageSchema, VisionApiConfig, etc.
  - `src/shared/messages.ts` - MessageType enum (25+ types), Message/MessageResponse interfaces
  - `src/shared/constants.ts` - STORAGE_KEY, BACKUP_FILE_NAME, MAX_IMAGE_SIZE, etc.
  - `src/shared/utils.ts` - Sorting helpers

**src/data:**
- Purpose: Built-in prompts/categories, resource library JSON
- Contains: Default data, resource library categories
- Key files: 
  - `src/data/built-in-data.ts` - BUILT_IN_PROMPTS, BUILT_IN_CATEGORIES
  - `src/data/resource-library/` - Large JSON data (5MB+, separate chunk)

**src/offscreen:**
- Purpose: Offscreen document for File System Access API
- Contains: File sync, image operations, permission handling
- Key files:
  - `src/offscreen/offscreen.ts` - Message handlers for file operations
  - `src/offscreen/offscreen.html` - HTML entry

## Key File Locations

**Entry Points:**
- `src/background/service-worker.ts`: Manifest background script
- `src/content/core/coordinator.ts`: Manifest content script (all URLs)
- `src/popup/backup.html`: Default action popup
- `src/popup/settings.html`: Settings center
- `src/sidepanel/sidepanel.html`: Side panel (action click)
- `src/offscreen/offscreen.html`: Offscreen document

**Configuration:**
- `manifest.json`: Extension metadata, permissions, content scripts
- `vite.config.ts`: Build config with manual chunks, HTML entries
- `tsconfig.json`: TypeScript config with path alias
- `tailwind.config.ts`: Tailwind theme

**Core Logic:**
- `src/lib/store.ts`: Zustand state management (CRUD, reorder, sync)
- `src/lib/storage.ts`: StorageManager singleton
- `src/lib/sync/sync-manager.ts`: Backup orchestration
- `src/lib/vision-api.ts`: Vision API integration
- `src/content/platforms/registry.ts`: Platform matching
- `src/content/platforms/base/types.ts`: Core interfaces

**Types:**
- `src/shared/types.ts`: All data structures (Prompt, Category, StorageSchema, VisionApiConfig, etc.)
- `src/shared/messages.ts`: MessageType enum, communication interfaces

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `DropdownApp.tsx`, `VisionModal.tsx`)
- Utilities: camelCase (e.g., `storage.ts`, `sync-manager.ts`)
- Platform configs: `{platform}/config.ts` (e.g., `lovart/config.ts`)
- HTML pages: lowercase (e.g., `backup.html`, `settings.html`)

**Directories:**
- Platform directories: lowercase (e.g., `lovart/`, `chatgpt/`)
- Component directories: lowercase (e.g., `components/`, `ui/`)
- Utility directories: lowercase (e.g., `sync/`, `migrations/`)

**Path Alias:**
- Use `@/*` for imports: `import { foo } from '@/lib/utils'`
- Resolves to `./src/*`

## Where to Add New Code

**New Platform:**
1. Create `src/content/platforms/{platform}/config.ts`
2. Define `PlatformConfig` with urlPatterns, inputDetection, uiInjection
3. Optionally create custom `InsertStrategy` if needed (Lexical/ProseMirror editors)
4. Import and `registerPlatform()` in `src/content/core/coordinator.ts`

**New Feature (Content Script):**
1. Add MessageType in `src/shared/messages.ts`
2. Add handler in `src/background/service-worker.ts`
3. Add handler in `src/content/core/coordinator.ts` (if content script needs to respond)
4. Create UI component in `src/content/components/`
5. Use Shadow DOM for style isolation

**New Feature (Popup):**
1. Create page in `src/popup/` (e.g., `new-feature.html`, `new-feature.tsx`)
2. Add to `vite.config.ts` `rollupOptions.input`
3. Create React app component with Zustand store
4. Use Tailwind CSS for styling

**New Storage Field:**
1. Add type in `src/shared/types.ts`
2. Add migration in `src/lib/migrations/` if breaking change
3. Register migration in `src/lib/migrations/register.ts`
4. Update StorageManager defaults

**New Utility:**
- Shared helpers: `src/lib/{utility-name}.ts`
- Cross-context types: `src/shared/types.ts`
- Constants: `src/shared/constants.ts`

## Special Directories

**src/content/platforms:**
- Purpose: Platform-specific configs and strategies
- Contains: 8 platforms (Lovart, ChatGPT, Claude.ai, Gemini, LibLib, Jimeng, Xingliu, Kimi)
- Pattern: Each platform has `config.ts`, optionally `strategies.ts`

**src/lib/sync:**
- Purpose: Local folder backup system
- Contains: sync-manager, file-sync, indexeddb, api-config-sync
- Uses: File System Access API, IndexedDB, Web Crypto API for encryption

**src/lib/migrations:**
- Purpose: Schema migration system
- Contains: index.ts (migration runner), v1.0.ts, v1.3.ts, register.ts
- Pattern: Each version has migration file, registered in register.ts

**src/data/resource-library:**
- Purpose: Large JSON data for online prompt library
- Size: 5MB+ (separate chunk in build)
- Generated: Likely from external source (not manually edited)

**.planning:**
- Purpose: GSD workflow artifacts
- Contains: phases/, milestones/, codebase/, debug/, quick/, research/
- Committed: Yes (for workflow continuity)

---

*Structure analysis: 2026/05/06*