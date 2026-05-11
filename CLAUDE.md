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

### Extension (Chrome Plugin)

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

# Unit tests (Vitest)
npm run test:unit      # Run unit tests
npm run test:unit:watch # Watch mode
```

After running `npm run dev`, load the extension from `packages/extension/dist/` folder in Chrome via `chrome://extensions` (enable Developer Mode).

**Note:** `manifest.json` is at `packages/extension/manifest.json` (imported by vite configs), not in `src/`. Vite configs are split: `vite.config.base.ts` (shared), `vite.config.dev.ts` (development), `vite.config.prod.ts` (production).

**⚠️ Dev Environment Checklist (OAuth Login):**

开发时如需测试 OAuth 登录，必须满足以下条件：

1. ✅ 运行 `npm run dev`（Extension dev server, port 5173）—— **不能用 `npm run build`**
2. ✅ 运行 `npm run web:dev`（Web app dev server, port 3000）
3. ✅ Chrome 加载 `packages/extension/dist/` 目录（dev 构建输出）
4. ✅ Supabase Dashboard 配置:
   - Authentication → URL Configuration
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/extension/callback`

**原因:** `DEV_WEB_APP_URL` 仅在 `vite.config.dev.ts` 中定义，生产构建回退到 `https://oh-my-prompt.com`。

### Web App (Next.js)

```bash
# Development (port 3000)
npm run web:dev

# Production build
npm run web:build

# Production start (port 3000)
npm run web:start
```

Or run directly in `packages/web-app/`:
```bash
cd packages/web-app
npm run dev
npm run build
npm run start
```

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| Chrome Extension Manifest V3 | - | Extension platform |
| Vite + @crxjs/vite-plugin | 6.x / 2.x | Build tool with CRX bundler |
| React | 19.x | UI framework |
| Zustand | 5.x | State management (popup/sidepanel) |
| Radix UI primitives | - | UI components (dialogs, dropdowns) |
| Tailwind CSS | 3.x | Styling (popup/sidepanel) |
| Supabase | 2.x | Cloud sync backend |
| chrome.storage.local | - | Data persistence |
| @dnd-kit | 6.x/10.x | Drag-and-drop reorder |

### What NOT to Use
- Manifest V2 (deprecated)
- jQuery (conflicts with host page)
- chrome.storage.sync for large data (100KB limit)
- Remote code execution / eval() (blocked by CSP)
<!-- GSD:stack-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

### Monorepo Structure

```
packages/
├── extension/          # Chrome Extension（开源）
│   ├── src/
│   │   ├── content/    # Content scripts (Shadow DOM isolated)
│   │   │   ├── core/        # Core modules (shared across platforms)
│   │   │   │   ├── coordinator.ts  # Entry point, platform matching
│   │   │   │   ├── detector.ts     # Config-driven input detection
│   │   │   │   └── injector.tsx    # Config-driven UI injection
│   │   │   ├── platforms/    # Platform configs and strategies
│   │   │   │   ├── registry.ts     # URL → Platform matching
│   │   │   │   ├── base/           # Types and default strategies
│   │   │   │   ├── lovart/         # Lovart (Lexical editor)
│   │   │   │   ├── chatgpt/        # ChatGPT
│   │   │   │   ├── claude-ai/      # Claude.ai (ProseMirror)
│   │   │   │   ├── gemini/         # Gemini
│   │   │   │   ├── liblib/         # LibLib (国内)
│   │   │   │   ├── jimeng/         # 即梦 (国内)
│   │   │   │   ├── kimi/           # Kimi (Lexical)
│   │   │   │   ├── xingliu/        # 星流 (Lexical)
│   │   │   │   └── ...
│   │   │   ├── components/    # Dropdown UI React components
│   │   │   └── vision-modal-manager.tsx
│   │   ├── background/   # Service worker (no DOM access)
│   │   ├── popup/        # Quick settings, Vision API provider config
│   │   ├── sidepanel/    # Main prompt management UI (CRUD, settings, sync)
│   │   ├── lib/          # Utilities
│   │   │   ├── store.ts        # Zustand store
│   │   │   ├── storage.ts      # StorageManager
│   │   │   ├── import-export.ts
│   │   │   ├── version-checker.ts
│   │   │   ├── resource-library.ts
│   │   │   └── sync/           # Local folder backup sync
│   │   ├── offscreen/    # Offscreen documents
│   │   ├── hooks/        # React hooks
│   │   └── data/         # Built-in data
│   ├── manifest.json
│   ├── vite.config.base.ts  # Shared config
│   ├── vite.config.dev.ts   # Development overrides
│   └── vite.config.prod.ts  # Production overrides
│
├── web-app/            # Web App (Next.js 16)
│   ├── app/            # Next.js app router pages
│   ├── components/     # React components
│   ├── lib/            # Utilities and API clients
│   ├── supabase/       # Supabase configuration
│   ├── tests/          # Playwright E2E tests
│   └── public/         # Static assets
│
└── shared/             # Shared types（开源）
    ├── types/
    │   ├── prompt.ts
    │   ├── storage.ts
    │   ├── sync.ts     # Cloud sync types
    │   └── ...
    ├── constants/
    ├── messages.ts     # MessageType enum
    └── utils.ts
```

### Import Convention

- Extension imports shared types: `import { Prompt } from '@oh-my-prompt/shared/types'`
- Path alias: `@/` resolves to `packages/extension/src/`

### Commands

```bash
# Run from root directory
npm run dev
npm run build
npm run test
```

### Communication Patterns

| Context | Access | Pattern |
|---------|--------|---------|
| Content Script | chrome.runtime.sendMessage | Message to service worker for storage |
| Service Worker | chrome.storage.local | Direct storage access, message routing |
| Popup | chrome.storage.local + sendMessage | Direct storage + notify content script |
| Sidepanel | Port connection + sendMessage | Real-time status from content script |
| Content ↔ Popup | chrome.tabs.sendMessage | Tab-targeted messaging |
| Content ↔ Sidepanel | chrome.runtime.Port | Bi-directional connection (input status) |
| Service Worker ↔ Offscreen | sendToOffscreen() | File system operations, permissions |

### Data Flow

1. **Storage-First:** All state derives from `chrome.storage.local` via `StorageSchema`
2. **Message Types:** See `packages/shared/messages.ts` for full MessageType enum (50+ types including storage, sync, vision API, provider config, offscreen, sidepanel communication, and temporary library operations)
3. **Zustand Sync:** Popup store calls `saveToStorage()` after each CRUD operation, which triggers auto-sync if enabled

### Platform Configuration

Each platform requires a `config.ts` in `packages/extension/src/content/platforms/{platform}/` with:

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
1. Create `packages/extension/src/content/platforms/{platform}/config.ts`
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

### Key UI Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Sidepanel | Main prompt management (CRUD, settings, sync) | `packages/extension/src/sidepanel/` |
| Popup | Quick settings, Vision API provider config | `packages/extension/src/popup/` |
| Vision Modal | In-page image-to-prompt conversion | `packages/extension/src/content/vision-modal-manager.tsx` |
| Dropdown | Prompt selection on platform pages | `packages/extension/src/content/components/` |

### Offscreen Document

Critical for file system operations that require DOM context:
- Handles permission requests (preserves user gesture)
- Reads/writes backup files via File System Access API
- Caches folder handle for quick permission checks
- Communication: Service Worker → `sendToOffscreen()` → Offscreen Document

### Vision API & Provider Config

Multi-provider architecture (replaces legacy single `VisionApiConfig`):
- `ProviderConfig`: apiKey, apiEndpoint, apiFormat, selectedModel, providerId
- `ProviderConfigsStorage`: configs array + activeConfigId
- Supports OpenAI chat_completions and Anthropic messages formats
- Active config used for image-to-prompt conversion (Vision Modal)
- Encrypted backup sync via `syncApiConfigToFolder()`

### Temporary Library

Independent storage for Vision-generated prompts:
- `temporaryPrompts` array in `StorageSchema`
- Prompts with `categoryId: 'temporary'` (not in category system)
- Transfer to permanent categories via `TRANSFER_TEMPORARY_PROMPT`
- Local image storage when folder configured

### Sync Orchestrator

Cloud-first decision matrix for backup sync:
- `SyncOrchestrator`: coordinates Cloud + Local strategies
- `CloudSyncStrategy`: Supabase cloud backup (requires auth)
- `LocalSyncStrategy`: Local folder backup (File System Access API)
- Status query via `GET_UNIFIED_SYNC_STATUS`
<!-- GSD:architecture-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Path Alias
- Use `@/` for imports: `import { foo } from '@/lib/utils'`
- Import shared types: `import { Prompt } from '@oh-my-prompt/shared/types'`

### Storage Key
- Single key `prompt_script_data` stores entire `StorageSchema` object

### Category ID
- `'all'` is reserved for "show all prompts" filter (not a real category)
- `'temporary'` is a pseudo-category for Vision-generated prompts (stored in `temporaryPrompts`, not `userData.prompts`)

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