# Codebase Structure

**Analysis Date:** 2026/04/28

## Directory Layout

```
oh-my-prompt/
├── src/                     # Source code
│   ├── background/          # Service worker (Manifest V3)
│   │   └── service-worker.ts  # Message routing, storage, sync
│   ├── content/             # Content script for Lovart.ai
│   │   ├── components/      # Dropdown UI React components
│   │   │   └── styles/      # Dropdown styles module
│   │   ├── content-script.ts  # Entry point
│   │   ├── input-detector.ts  # MutationObserver
│   │   ├── ui-injector.tsx    # Shadow DOM container
│   │   └── insert-handler.ts  # Prompt insertion
│   ├── popup/               # Extension popup UI
│   │   ├── components/      # Popup React components
│   │   │   └── ui/          # Radix UI primitives
│   │   ├── backup.html      # Entry HTML
│   │   ├── backup.tsx       # Entry script
│   │   ├── BackupApp.tsx    # Main component
│   │   └── index.css        # Tailwind imports
│   ├── lib/                 # Shared business logic
│   │   ├── migrations/      # Storage schema migrations
│   │   │   ├── index.ts     # Migration engine
│   │   │   ├── register.ts  # Registration helper
│   │   │   └── v1.0.ts      # Legacy format handler
│   │   ├── sync/            # Local folder sync modules
│   │   │   ├── sync-manager.ts  # Orchestration
│   │   │   ├── file-sync.ts     # File operations
│   │   │   ├── indexeddb.ts     # Handle persistence
│   │   │   ├── hash.ts          # Content deduplication
│   │   │   ├── image-sync.ts    # Image operations
│   │   │   └── image-loader-queue.ts  # Image loading
│   │   ├── store.ts         # Zustand state
│   │   ├── storage.ts       # StorageManager
│   │   ├── import-export.ts # JSON validation
│   │   ├── version-checker.ts # GitHub API
│   │   ├── resource-library.ts # Resource loading
│   │   └── utils.ts         # Utilities
│   ├── shared/              # Cross-context types/constants
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── messages.ts      # MessageType enum
│   │   ├── constants.ts     # Storage keys, limits
│   │   └── utils.ts         # Shared utilities
│   ├── data/                # Built-in data
│   │   └── built-in-data.ts # Default prompts/categories
│   ├── hooks/               # React hooks
│   │   └── use-toast.ts     # Toast notifications
│   └── global.d.ts          # Global TypeScript declarations
├── tests/                   # Playwright E2E tests
├── assets/                  # Extension icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── scripts/                 # Build/utility scripts
│   └── extract-prompts.ts   # Resource extraction
├── dist/                    # Build output (gitignored)
├── .planning/               # Planning documents
│   ├── codebase/            # Codebase analysis
│   ├── phases/              # Phase plans
│   ├── PROJECT.md           # Project overview
│   ├── STATE.md             # Current state
│   └── ROADMAP.md           # Development roadmap
├── manifest.json            # Chrome Extension manifest (MV3)
├── package.json             # Dependencies and scripts
├── vite.config.ts           # Build configuration
├── tsconfig.json            # TypeScript configuration
├── tailwind.config.ts       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS configuration
├── playwright.config.ts     # E2E test configuration
└── CLAUDE.md                # Project instructions
```

## Directory Purposes

**src/background/:**
- Purpose: Service worker context (no DOM access)
- Contains: Message handler for all 25+ MessageType operations
- Key files: `service-worker.ts` (single file, 400+ lines)

**src/content/:**
- Purpose: Lovart.ai page integration
- Contains: Input detection, Shadow DOM UI injection, React dropdown components, prompt insertion
- Key files:
  - `content-script.ts` - Entry point, coordinates InputDetector and UIInjector
  - `input-detector.ts` - MutationObserver with SPA navigation handling
  - `ui-injector.tsx` - Shadow DOM container with inline CSS
  - `insert-handler.ts` - execCommand-based insertion for Lexical

**src/content/components/:**
- Purpose: React components for dropdown UI (Shadow DOM isolated)
- Contains: 21 component files
- Key files:
  - `DropdownContainer.tsx` - Main dropdown logic (62KB, largest file)
  - `DropdownApp.tsx` - Root wrapper component
  - `PromptEditModal.tsx` - Prompt editor (22KB)
  - `PromptPreviewModal.tsx` - Preview modal (15KB)
  - `NetworkPromptCard.tsx` - Resource library card (10KB)
  - `CategorySelectDialog.tsx` - Category picker (8KB)
  - `BaseModal.tsx` - Modal base component
  - `ErrorBoundary.tsx` - Error handling wrapper

**src/content/styles/:**
- Purpose: Dropdown style module
- Contains: `dropdown-styles.ts` - Style definitions for Shadow DOM

**src/popup/:**
- Purpose: Extension popup (backup management UI)
- Contains: React app with Tailwind styling, Zustand state
- Key files:
  - `backup.html` - Entry HTML (manifest `action.default_popup`)
  - `BackupApp.tsx` - Main popup component (21KB)
  - `index.css` - Tailwind CSS imports and custom properties

**src/popup/components/:**
- Purpose: Popup React components
- Contains: Modal dialogs, error handling
- Key files:
  - `ErrorBoundary.tsx` - Error wrapper
  - Subdirectory `ui/` - Radix UI primitives (button, dialog, toast)

**src/popup/components/ui/:**
- Purpose: Radix UI primitive wrappers (shadcn/ui style)
- Contains: Button, dialog, toast components
- Key files: `button.tsx`, `dialog.tsx`, `toast.tsx`

**src/lib/:**
- Purpose: Business logic shared across contexts
- Contains: Zustand store, StorageManager, sync modules, migrations
- Key files:
  - `store.ts` - Zustand store with CRUD and debounced saves (475 lines)
  - `storage.ts` - StorageManager singleton (185 lines)
  - `import-export.ts` - JSON validation and merge
  - `version-checker.ts` - GitHub release checking
  - `resource-library.ts` - Resource prompt loading
  - `utils.ts` - Utility functions

**src/lib/migrations/:**
- Purpose: Storage schema migration handlers
- Contains: Migration registry and version-specific migrations
- Key files:
  - `index.ts` - Migration engine with `migrate()`, `isLegacyFormat()`
  - `register.ts` - `registerMigration()` helper
  - `v1.0.ts` - Legacy flat format to nested userData conversion

**src/lib/sync/:**
- Purpose: Local folder backup/sync functionality
- Contains: File System Access API operations, IndexedDB, sync orchestration
- Key files:
  - `sync-manager.ts` - Orchestration (340 lines)
  - `file-sync.ts` - File operations, backup history (370 lines)
  - `indexeddb.ts` - FileSystemDirectoryHandle persistence
  - `hash.ts` - Content hash for deduplication
  - `image-sync.ts` - Image save operations
  - `image-loader-queue.ts` - Async image loading queue

**src/shared/:**
- Purpose: Cross-context types and constants
- Contains: TypeScript interfaces, MessageType enum, constants
- Key files:
  - `types.ts` - Prompt, Category, UserData, StorageSchema, SyncSettings, UpdateStatus, ResourcePrompt
  - `messages.ts` - MessageType enum (25 types), Message/MessageResponse interfaces
  - `constants.ts` - STORAGE_KEY, PLATFORM_DOMAIN, BACKUP_FILE_NAME, MAX_BACKUP_HISTORY, etc.
  - `utils.ts` - sortPromptsByOrder, truncateText

**src/data/:**
- Purpose: Default/built-in data for new installations
- Contains: Built-in prompts and categories
- Key files: `built-in-data.ts`

**src/hooks/:**
- Purpose: React hooks for popup
- Contains: Toast notification hook
- Key files: `use-toast.ts`

## Key File Locations

**Entry Points:**
- `src/content/content-script.ts`: Content script entry (manifest injected)
- `src/background/service-worker.ts`: Service worker entry
- `src/popup/backup.html`: Popup entry (manifest `action.default_popup`)
- `manifest.json`: Extension manifest definition

**Configuration:**
- `vite.config.ts`: Build config with CRX plugin, React plugin, code splitting
- `tsconfig.json`: TypeScript config (strict mode, ES2020, `@/*` alias)
- `tailwind.config.ts`: Tailwind theme config
- `postcss.config.js`: PostCSS config
- `playwright.config.ts`: E2E test config

**Core Logic:**
- `src/lib/store.ts`: Zustand state management
- `src/lib/storage.ts`: Storage persistence
- `src/lib/sync/sync-manager.ts`: Backup orchestration
- `src/shared/types.ts`: Data schema definitions
- `src/shared/messages.ts`: Communication protocol

**Content Script Logic:**
- `src/content/input-detector.ts`: Lovart input detection
- `src/content/ui-injector.tsx`: Shadow DOM injection
- `src/content/insert-handler.ts`: Prompt insertion
- `src/content/components/DropdownContainer.tsx`: Dropdown UI

## Naming Conventions

**Files:**
- TypeScript logic: `*.ts` (camelCase: `storage.ts`, `sync-manager.ts`)
- React components: `*.tsx` (PascalCase: `DropdownApp.tsx`, `PromptEditModal.tsx`)
- UI primitives: lowercase (button.tsx, dialog.tsx, toast.tsx)
- Constants file: `constants.ts`

**Directories:**
- Context-based: `background/`, `content/`, `popup/`, `shared/`, `lib/`
- Feature subdirs: `components/`, `sync/`, `migrations/`, `data/`
- UI primitives: `ui/` (Radix/shadcn style)

**Imports:**
- Path alias: `@/` for src-relative imports (`import { foo } from '@/lib/utils'`)
- Relative: Same-directory imports
- Configured in: `tsconfig.json` (paths), `vite.config.ts` (resolve.alias)

**Constants:**
- UPPER_SNAKE_CASE: `STORAGE_KEY`, `BACKUP_FILE_NAME`, `MAX_BACKUP_HISTORY`

## Where to Add New Code

**New Feature (Lovart dropdown UI):**
- Primary code: `src/content/components/` - Add new React component
- Integration: `src/content/components/DropdownContainer.tsx` - Import and render
- Styles: Inline CSS in `src/content/ui-injector.tsx` `getStyles()` method
- No Tailwind access (Shadow DOM isolation)

**New Feature (Popup UI):**
- Primary code: `src/popup/components/` - Add new React component
- Integration: `src/popup/BackupApp.tsx` - Import and add to layout
- Use Radix UI primitives from `src/popup/components/ui/`
- Tailwind CSS available

**New Storage Field:**
- Types: `src/shared/types.ts` - Add to `StorageSchema`, `UserData`, or `SyncSettings`
- Defaults: `src/lib/storage.ts` - Update `getDefaultData()` or `getDefaultSettings()`
- Migration: `src/lib/migrations/` - Create new migration file if breaking change
- Store: `src/lib/store.ts` - Add state and actions if needed

**New Message Type:**
- Enum: `src/shared/messages.ts` - Add to `MessageType`
- Handler: `src/background/service-worker.ts` - Add switch case with `return true` for async
- Caller: Use `chrome.runtime.sendMessage({ type: MessageType.NEW_TYPE })`

**New Sync Feature:**
- Location: `src/lib/sync/` - Add to existing files or new module
- Manager: `src/lib/sync/sync-manager.ts` - Export new functions
- Service worker: `src/background/service-worker.ts` - Add message handling
- UI: `src/popup/BackupApp.tsx` - Add UI controls

**New Utility Function:**
- Cross-context: `src/shared/utils.ts` - Pure functions, no Chrome APIs
- Context-specific: `src/lib/utils.ts` - For storage, sync operations

**New Built-in Prompt:**
- Data: `src/data/built-in-data.ts` - Add to `BUILT_IN_PROMPTS` array
- Ensure unique ID (`crypto.randomUUID()`), correct `categoryId`, `order` field

## Special Directories

**dist/:**
- Purpose: Production build output
- Generated: Yes (`npm run build`)
- Committed: No (gitignored)
- Usage: Load as unpacked extension in `chrome://extensions`

**assets/:**
- Purpose: Extension icons
- Files: `icon-16.png`, `icon-48.png`, `icon-128.png`
- Committed: Yes
- Referenced: manifest.json icons and action.default_icon

**.planning/:**
- Purpose: GSD workflow planning artifacts
- Generated: Yes (by GSD commands)
- Committed: Yes
- Contains: `phases/`, `codebase/`, `PROJECT.md`, `STATE.md`, `ROADMAP.md`

**scripts/:**
- Purpose: Build/utility scripts
- Contains: `extract-prompts.ts` (resource library extraction)
- Committed: Yes

**tests/:**
- Purpose: Playwright E2E tests
- Contains: Test specifications
- Config: `playwright.config.ts`

---

*Structure analysis: 2026/04/28*