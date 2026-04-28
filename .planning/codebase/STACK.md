# Technology Stack

**Analysis Date:** 2026/04/28

## Languages

**Primary:**
- TypeScript 5.x - Entire codebase (`src/**/*.ts`, `src/**/*.tsx`)
- Target: ES2020 (per `tsconfig.json`)

**Secondary:**
- JSON - Configuration files, manifest, built-in data
- CSS - Tailwind CSS for popup styling (inline CSS for content script Shadow DOM)

## Runtime

**Environment:**
- Chrome Extension Manifest V3 - Chromium-based browsers (Chrome, Edge, Brave)
- ES2020 target with ESM modules (`"type": "module"` in package.json)
- No Node.js runtime in production (extension runs entirely in browser)

**Package Manager:**
- npm - Package management
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.x (`react`, `react-dom`) - UI framework for popup and content script dropdown
- Chrome Extension Manifest V3 - Extension platform (service worker, content scripts, popup)
- Vite 6.x (`vite`) - Build tool with hot reload for development
- @crxjs/vite-plugin 2.x - Chrome Extension bundler for Vite

**Testing:**
- Playwright 1.59.x (`@playwright/test`) - E2E testing framework
- Config: `playwright.config.ts` (Chromium only, base URL localhost:5173)

**Build/Dev:**
- @vitejs/plugin-react 4.x - React support for Vite
- TypeScript 5.x - Type checking (`tsc --noEmit` before build)
- Tailwind CSS 3.x - CSS framework (popup only)
- PostCSS 8.x + autoprefixer 10.x - CSS processing

## Key Dependencies

**Critical:**
- Zustand 5.x (`zustand`) - State management for popup store with CRUD operations
- @dnd-kit/core 6.x, @dnd-kit/sortable 10.x - Drag-and-drop for prompt/category reordering
- @radix-ui/react-* (dialog, alert-dialog, dropdown-menu, select, scroll-area, separator, toast, slot) - Headless UI primitives
- Lucide React 1.x (`lucide-react`) - Icon library
- class-variance-authority, clsx, tailwind-merge - CSS utility libraries for component variants

**Infrastructure:**
- @types/chrome 0.0.260 - Chrome Extension API TypeScript types
- tailwindcss-animate 1.x - Animation utilities for Tailwind

## Configuration

**Environment:**
- No `.env` file - Extension runs in browser context, no server-side secrets
- Settings stored in `chrome.storage.local` via `StorageSchema`
- TypeScript: `tsconfig.json` - Strict mode, path alias `@/*` -> `./src/*`

**Build:**
- `vite.config.ts` - CRX plugin, React plugin, code splitting (vendor-react, vendor-icons, vendor-dnd, vendor-zustand)
- `tailwind.config.ts` - Dark mode `class`, custom theme colors, animation keyframes
- `postcss.config.js` - Tailwind and autoprefixer plugins
- `manifest.json` - Chrome Extension manifest (MV3)

## Platform Requirements

**Development:**
- Node.js (ES2020 support required)
- npm package manager
- Chrome/Edge/Brave browser with Developer Mode enabled

**Production:**
- Chromium-based browser (Chrome 88+, Edge, Brave)
- Extension loaded via `chrome://extensions` (unpacked from `dist/`)
- Optional: Local filesystem for backup sync (File System Access API)

---

*Stack analysis: 2026/04/28*