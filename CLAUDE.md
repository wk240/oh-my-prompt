# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Oh My Prompt**

一个Chrome浏览器插件，用于在AI设计/绘图平台的输入框中一键插入预设的提示词模板。支持多平台（Lovart、ChatGPT、Claude.ai、Gemini、Kimi、星流等），用户通过输入框旁的下拉菜单选择提示词，提示词按用途分类管理，支持内置编辑和数据导入导出。

**Core Value:** 一键插入预设提示词，提升创作效率。

### Constraints

- **Tech stack:** Chrome Extension (Manifest V3) — 现代Chrome插件标准
- **平台支持:** 多平台架构，当前支持 Lovart、ChatGPT、Claude.ai、Gemini、LibLib、即梦、Kimi、星流
- **数据存储:** chrome.storage.local 本地存储，容量有限制
- **浏览器支持:** Chrome/Edge/Brave等Chromium系浏览器
<!-- GSD:project-end -->

## Commands

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# TypeScript check (no emit)
npx tsc --noEmit

# E2E tests (Playwright - tests/ directory currently empty)
npm run test           # Run all tests
npm run test:ui        # Interactive test UI
npm run test:headed    # Run with visible browser
```

After running `npm run dev`, load the extension from `dist/` folder in Chrome via `chrome://extensions` (enable Developer Mode).

**Note:** `manifest.json` is at project root (imported by `vite.config.ts`), not in `src/`.

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| Chrome Extension Manifest V3 | - | Extension platform |
| Vite + @crxjs/vite-plugin | 6.x / 2.x | Build tool with CRX bundler |
| React | 19.x | UI framework |
| Zustand | 5.x | State management (popup only) |
| Radix UI primitives | - | UI components (popup dialogs) |
| Tailwind CSS | 3.x | Styling (popup only) |
| chrome.storage.local | - | Data persistence |

### What NOT to Use
- Manifest V2 (deprecated)
- jQuery (conflicts with host page)
- chrome.storage.sync for large data (100KB limit)
- Remote code execution / eval() (blocked by CSP)
<!-- GSD:stack-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

### Three-Part Extension Structure

```
src/
├── content/           # Runs on supported platforms (Shadow DOM isolated)
│   ├── core/               # Core modules (shared across platforms)
│   │   ├── coordinator.ts  # Entry point, platform matching
│   │   ├── detector.ts     # Config-driven input detection
│   │   └── injector.tsx    # Config-driven UI injection
│   │
│   ├── platforms/          # Platform configs and strategies
│   │   ├── registry.ts     # URL → Platform matching
│   │   ├── base/           # Types and default strategies
│   │   │   ├── types.ts           # PlatformConfig, UrlPattern, etc.
│   │   │   ├── strategy-interface.ts  # InsertStrategy, DetectStrategy
│   │   │   └── default-strategies.ts  # DefaultInserter
│   │   ├── lovart/         # Lovart (Lexical editor)
│   │   │   ├── config.ts
│   │   │   └── strategies.ts
│   │   ├── chatgpt/        # ChatGPT
│   │   ├── claude-ai/      # Claude.ai (ProseMirror)
│   │   ├── gemini/         # Gemini
│   │   ├── liblib/         # LibLib (国内)
│   │   ├── jimeng/         # 即梦 (国内)
│   │   ├── kimi/           # Kimi (Lexical)
│   │   ├── xingliu/        # 星流 (Lexical)
│   │   └── ...             # More platforms
│   │
│   ├── components/         # Dropdown UI React components
│   │   ├── DropdownApp.tsx # Main dropdown with InsertStrategy prop
│   │   ├── TriggerButton.tsx
│   │   └── ...
│   │
│   ├── styles/             # Shadow DOM styles
│   └── vision-modal-manager.tsx  # Vision modal for image-to-prompt
│
├── background/        # Service worker (no DOM access)
│   └── service-worker.ts    # Message routing, storage ops
│
├── popup/             # Extension popup (React + Tailwind)
│   ├── backup.html           # Backup management popup (default action)
│   ├── backup.tsx            # BackupApp component
│   ├── App.tsx               # Main management UI (unused in current build)
│   ├── components/           # Category list, prompt editor, dialogs
│   └── components/ui/       # Radix UI primitives (button, dialog, etc.)
│
├── lib/               # Shared utilities
│   ├── store.ts             # Zustand store (CRUD + storage sync)
│   ├── storage.ts           # StorageManager singleton
│   ├── import-export.ts     # JSON download/upload
│   ├── version-checker.ts   # GitHub release version check
│   ├── resource-library.ts  # Resource prompt data loading
│   └── sync/                # Local folder backup sync
│       ├── sync-manager.ts  # Sync orchestration
│       ├── file-sync.ts     # File System Access API operations
│       └── indexeddb.ts     # Folder handle persistence
│
├── shared/            # Cross-context shared
│   ├── types.ts             # Prompt, Category, StorageSchema
│   ├── messages.ts          # MessageType enum for communication
│   └── constants.ts         # STORAGE_KEY, PLATFORM_DOMAIN
│
├── data/              # Initial data
│   └── built-in-data.ts     # Default prompts and categories
```

### Communication Patterns

| Context | Access | Pattern |
|---------|--------|---------|
| Content Script | chrome.runtime.sendMessage | Message to service worker for storage |
| Service Worker | chrome.storage.local | Direct storage access, message routing |
| Popup | chrome.storage.local + sendMessage | Direct storage + notify content script |
| Content ↔ Popup | chrome.tabs.sendMessage | Tab-targeted messaging |

### Data Flow

1. **Storage-First:** All state derives from `chrome.storage.local` via `StorageSchema`
2. **Message Types:** See `src/shared/messages.ts` for full MessageType enum (25 types including `PING`, `GET_STORAGE`, `SET_STORAGE`, `INSERT_PROMPT`, `BACKUP_TO_FOLDER`, `SAVE_IMAGE`, `READ_IMAGE`, `DELETE_IMAGE`, `GET_FOLDER_HANDLE`, `SAVE_FOLDER_HANDLE`, `GET_SYNC_STATUS`, `SET_UNSYNCED_FLAG`, `SYNC_FAILED`, `OPEN_BACKUP_PAGE`, `REFRESH_DATA`, `CHECK_UPDATE`, `GET_UPDATE_STATUS`, `CLEAR_UPDATE_STATUS`, `OPEN_EXTENSIONS`, `EXPORT_DATA`, `DISMISS_BACKUP_WARNING`, `RESTORE_PERMISSION`, `SET_SETTINGS_ONLY`)
3. **Zustand Sync:** Popup store calls `saveToStorage()` after each CRUD operation, which triggers auto-sync if enabled

### Platform Configuration

Each platform requires a `config.ts` in `src/content/platforms/{platform}/` with:

```typescript
export const platformConfig: PlatformConfig = {
  id: 'platform-id',
  name: 'Platform Name',
  urlPatterns: [{ type: 'domain', value: 'platform.com' }],
  inputDetection: {
    selectors: ['input-selector-1', 'input-selector-2'],
    debounceMs: 100,  // optional
  },
  uiInjection: {
    anchorSelector: '.anchor-element',
    position: 'before' | 'after' | 'prepend' | 'append',
  },
  strategies: { inserter: new CustomInserter() },  // optional
}
```

- `urlPatterns`: URL matching rules (domain, pathname, full, regex)
- `inputDetection.selectors`: Input element selectors in priority order
- `uiInjection`: Anchor selector + position for button placement

Complex platforms can override strategies (e.g., Lexical/ProseMirror editors). Most use `DefaultInserter`.

To add a new platform:
1. Create `src/content/platforms/{platform}/config.ts`
2. Import and `registerPlatform()` in `coordinator.ts`

### Manifest Configuration

Content script uses `<all_urls>` match pattern. The coordinator matches platform internally and exits early on non-supported pages. This enables universal Vision modal functionality while keeping platform-specific prompt insertion.

### Local Folder Sync

Uses File System Access API for automatic backup to user-selected folder:
- Folder handle persisted in IndexedDB (survives browser restart)
- Backup files named: `omps-backup-{timestamp}.json` + `omps-latest.json`
- `triggerSync()` called after each `saveToStorage()` when sync enabled
- Version history available via `listBackupVersions()`
- Restore from any backup version via `restoreFromBackup()`
<!-- GSD:architecture-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Path Alias
- Use `@/` for imports: `import { foo } from '@/lib/utils'`

### Storage Key
- Single key `prompt_script_data` stores entire `StorageSchema` object

### Category ID
- `'all'` is reserved for "show all prompts" filter (not a real category)

### Shadow DOM Isolation
- Content script UI must use Shadow DOM to prevent host page CSS conflicts
- All styles defined inline in `UIInjector.getStyles()`

### React Editor Compatibility
- Use `execCommand('insertText')` instead of direct DOM manipulation
- Dispatch both `input` and `change` events after insertion
- Call native value setter for form controls (React tracking)

### Console Logging
- Prefix all logs: `[Oh My Prompt]` for easy filtering

### Message Response Pattern
- Service worker must `return true` for async `sendResponse`
- Response format: `{ success: boolean, data?: T, error?: string }`

### ID Generation
- Use `crypto.randomUUID()` for all new IDs (Prompts, Categories)

### Prompt Order Field
- Prompts have `order` field for sorting within category
- Migration: `migratePromptOrders()` assigns order if missing
- Max order calculation: `Math.max(...categoryPrompts.map(p => p.order))`
<!-- GSD:conventions-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->