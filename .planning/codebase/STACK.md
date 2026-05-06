# Technology Stack

**Analysis Date:** 2026/05/06

## Languages

**Primary:**
- TypeScript 5.x - Used throughout all source files with ES2020 target, strict mode enabled (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- JavaScript (ESM) - Manifest V3 uses `type: "module"` for service worker

**Secondary:**
- HTML - Popup pages (`backup.html`, `settings.html`, `loading.html`, `api-config.html`, `sidepanel.html`, `offscreen.html`)
- CSS - Tailwind CSS utility classes, Shadow DOM inline styles in `VisionModalManager.getStyles()`

## Runtime

**Environment:**
- Chrome Extension Manifest V3 - Modern extension platform
- Chromium browsers - Chrome, Edge, Brave supported

**Package Manager:**
- npm - Lockfile present: `package-lock.json`

## Frameworks

**Core:**
- React 19.x - UI framework for popup, sidepanel, and content script dropdown/VisionModal
- Vite 6.x - Build tool with hot reload (`npm run dev`)
- @crxjs/vite-plugin 2.x - Chrome Extension bundler, handles manifest and HMR

**State Management:**
- Zustand 5.x - Reactive state for prompts/categories CRUD with debounced storage sync
- Custom TaskQueueStore - Zustand store for Vision API task queue (`src/content/core/task-queue-store.ts`)

**UI Components:**
- Radix UI primitives - Dialog, AlertDialog, DropdownMenu, ScrollArea, Select, Separator, Slot, Toast
- @dnd-kit - Drag and drop for category/prompt reorder (core, sortable, utilities)
- Lucide-react - Icon library

**Styling:**
- Tailwind CSS 3.x - Utility-first CSS for popup/sidepanel
- tailwindcss-animate - Animation variants
- Shadow DOM inline styles - Content script UI isolation (no external CSS)

**Testing:**
- Playwright - E2E testing framework (config: `playwright.config.ts`, tests in `tests/` directory)

## Key Dependencies

**Critical:**
- `zustand` 5.0.12 - State management with debounced `saveToStorage()`, retry mechanism for extension context invalidation
- `@crxjs/vite-plugin` 2.x - Handles CRX bundling, manifest transformation, content script HMR
- `class-variance-authority` 0.7.1 - Variant-based component styling
- `clsx` 2.1.1 + `tailwind-merge` 3.5.0 - Conditional class merging

**Build:**
- `vite` 6.x - Dev server, production build with manual chunks:
  - `vendor-react` - React ecosystem
  - `vendor-icons` - Lucide icons
  - `vendor-dnd` - @dnd-kit
  - `vendor-zustand` - Zustand
  - `resource-library` - Large JSON data (5MB+)

**Type Definitions:**
- `@types/chrome` 0.0.260 - Chrome Extension API types
- `@types/node` 25.6.0 - Node.js types for build scripts
- `@types/react` 19.0.0, `@types/react-dom` 19.0.0 - React types

## Configuration

**TypeScript:**
- Target: ES2020, Module: ESNext
- Module resolution: bundler
- Path alias: `@/*` → `./src/*`
- JSX: react-jsx

**Build:**
- `vite.config.ts` - CRX plugin, manual chunks, multiple HTML entry points
- `manifest.json` - Extension permissions, content scripts, side panel

**Tailwind:**
- `tailwind.config.ts` - Theme customization, animation variants
- `postcss.config.js` - PostCSS with autoprefixer

**Playwright:**
- `playwright.config.ts` - E2E test configuration

## Platform Requirements

**Development:**
- Node.js (version not specified in `.nvmrc` or `.python-version`)
- Chromium browser with Developer Mode enabled

**Production:**
- Chrome/Edge/Brave browser (Chromium-based)
- Manifest V3 compatible

**Permissions Required:**
- `activeTab`, `downloads`, `storage`, `tabs`, `alarms`, `contextMenus`, `sidePanel`, `scripting`, `offscreen`
- Host permissions: `https://raw.githubusercontent.com/*`, `https://api.github.com/*`, `https://*/*`

---

*Stack analysis: 2026/05/06*