# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Oh My Prompt Script**

一个Chrome浏览器插件，用于在Lovart AI设计/绘图平台的输入框中一键插入预设的提示词模板。用户通过输入框旁的下拉菜单选择提示词，提示词按用途分类管理，支持内置编辑和数据导入导出。

**Core Value:** 一键插入预设提示词，提升创作效率。

### Constraints

- **Tech stack:** Chrome Extension (Manifest V3) — 现代Chrome插件标准
- **平台依赖:** 需适配目标平台的页面结构和输入框元素
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
```

After running `npm run dev`, load the extension from `dist/` folder in Chrome via `chrome://extensions` (enable Developer Mode).

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
├── content/           # Runs on Lovart pages (Shadow DOM isolated)
│   ├── content-script.ts    # Entry point, coordinates components
│   ├── input-detector.ts    # MutationObserver for Lovart input
│   ├── ui-injector.tsx      # Shadow DOM container + React mount
│   ├── insert-handler.ts    # Prompt text insertion
│   └── components/          # Dropdown UI React components
│
├── background/        # Service worker (no DOM access)
│   └── service-worker.ts    # Message routing, storage ops
│
├── popup/             # Extension popup (React + Tailwind)
│   ├── App.tsx              # Main management UI
│   ├── components/          # Category list, prompt editor, dialogs
│   └── components/ui/       # Radix UI primitives (button, dialog, etc.)
│
├── lib/               # Shared utilities
│   ├── store.ts             # Zustand store (CRUD + storage sync)
│   ├── storage.ts           # StorageManager singleton
│   ├── import-export.ts     # JSON download/upload
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
2. **Message Types:** `GET_STORAGE`, `SET_STORAGE`, `PING`, `INSERT_PROMPT`, `OPEN_SETTINGS`
3. **Zustand Sync:** Popup store calls `saveToStorage()` after each CRUD operation

### Lovart Platform Integration

Content script detects Lovart's Lexical editor input element:
- Primary selector: `[data-testid="agent-message-input"]`
- Alternative: `[data-lexical-editor="true"]`
- UI injection target: `[data-testid="agent-input-bottom-more-button"]`

Prompt insertion uses `execCommand('insertText')` for React/Lexical compatibility, followed by input/change event dispatch.
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
- Prefix all logs: `[Oh My Prompt Script]` for easy filtering

### Message Response Pattern
- Service worker must `return true` for async `sendResponse`
- Response format: `{ success: boolean, data?: T, error?: string }`
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