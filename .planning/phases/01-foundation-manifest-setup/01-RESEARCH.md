# Phase 01: Foundation & Manifest Setup - Research

**Researched:** 2026-04-16
**Status:** Research complete

---

## Domain Overview

Phase 1 establishes the Chrome Extension foundation using Manifest V3. This is a standard pattern with well-documented best practices. No novel technical challenges — focus is on correct configuration and project structure.

**Key question:** How do I set up a minimal, loadable Chrome Extension skeleton with Manifest V3, TypeScript, Vite, and React?

---

## Technical Approach

### 1. Manifest V3 Structure

Chrome Extension Manifest V3 requires:

```json
{
  "manifest_version": 3,
  "name": "Lovart Prompt Injector",
  "version": "1.0.0",
  "description": "一键插入预设提示词，提升Lovart平台创作效率",

  // Service Worker (replaces background pages)
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },

  // Content Script injection
  "content_scripts": [{
    "matches": ["*://*.lovart.ai/*"],
    "js": ["src/content/content-script.ts"],
    "run_at": "document_idle"
  }],

  // Popup UI
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "assets/icon-16.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png"
    }
  },

  // Permissions (minimal for Phase 1)
  "permissions": ["activeTab"],

  // Icons for extension management
  "icons": {
    "16": "assets/icon-16.png",
    "48": "assets/icon-48.png",
    "128": "assets/icon-128.png"
  }
}
```

**Critical V3 differences from V2:**
- `background.service_worker` instead of `background.pages`
- `action` instead of `browser_action`
- No remote code execution (all code must be bundled)
- CSP restrictions block `eval()` and `new Function()`

### 2. Project Directory Structure

```
lovart-prompt-injector/
├── manifest.json              # Extension manifest (V3)
├── vite.config.ts             # Vite + CRXJS configuration
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── src/
│   ├── background/
│   │   └── service-worker.ts  # Service Worker entry
│   ├── content/
│   │   └── content-script.ts  # Content Script entry
│   ├── popup/
│   │   ├── popup.html         # Popup HTML entry
│   │   ├── popup.tsx          # Popup React entry
│   │   └── App.tsx            # Root component
│   │   └── index.css          # Popup styles
│   └── shared/
│       ├── types.ts           # Shared TypeScript types
│       ├── constants.ts       # Shared constants
│       └── messages.ts        # Message type definitions
├── assets/
│   ├── icon-16.png            # Placeholder icons
│   ├── icon-48.png
│   └── icon-128.png
└── dist/                      # Build output
```

### 3. Build Configuration (Vite + @crxjs/vite-plugin)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import crx from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
```

**Why @crxjs/vite-plugin:**
- Hot Module Replacement (HMR) for extension development
- Automatic manifest.json handling
- TypeScript support out of the box
- No manual bundling needed

### 4. Message Architecture

Phase 1 establishes message routing infrastructure:

**Message Types (src/shared/messages.ts):**
```typescript
export enum MessageType {
  PING = 'PING',           // Health check
  GET_STORAGE = 'GET_STORAGE', // Request storage data (Phase 3)
  SET_STORAGE = 'SET_STORAGE', // Store data (Phase 3)
  INSERT_PROMPT = 'INSERT_PROMPT' // Insert prompt (Phase 2)
}

export interface Message<T = unknown> {
  type: MessageType
  payload?: T
}

export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
```

**Service Worker Message Handler (src/background/service-worker.ts):**
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case MessageType.PING:
      sendResponse({ success: true, data: 'pong' })
      break
    // Future handlers for GET_STORAGE, SET_STORAGE, INSERT_PROMPT
    default:
      sendResponse({ success: false, error: 'Unknown message type' })
  }
  return true // Required for async response
})
```

**Content Script Ping Test (src/content/content-script.ts):**
```typescript
// Phase 1: Empty skeleton, just verify injection
console.log('[Lovart Injector] Content script loaded')

// Test message routing
chrome.runtime.sendMessage({ type: MessageType.PING }, (response) => {
  console.log('[Lovart Injector] Ping response:', response)
})
```

### 5. Dependencies

**package.json:**
```json
{
  "name": "lovart-prompt-injector",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "@types/chrome": "^0.0.260",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0"
  }
}
```

**Note:** Zustand and uuid added in Phase 3 (data management). Shadow DOM utilities added in Phase 2.

### 6. Placeholder Icons

Phase 1 uses simple placeholder icons. Create minimal PNG files:
- 16x16, 48x48, 128x128 sizes
- Simple gray circle or transparent placeholder
- Real icons designed in Phase 4 (Polish)

---

## Validation Architecture

### Testable Components

| Component | Test Method | Validation Criteria |
|-----------|-------------|---------------------|
| Manifest.json | Chrome load test | No manifest parse errors |
| Service Worker | Message ping test | PING → PONG response |
| Content Script | Injection verification | Console log appears on Lovart pages |
| Popup | UI render test | Popup opens, shows "Hello" text |
| Build | Vite build test | dist/ output exists, no build errors |

### Test Protocol

**Manual Test Flow (Phase 1):**
1. `npm run dev` — start dev server
2. Load unpacked extension from `dist/` in Chrome
3. Verify:
   - chrome://extensions shows no errors
   - Extension icon appears in toolbar
   - Click icon → popup opens (shows placeholder UI)
   - Navigate to lovart.ai → content script logs
   - Service Worker responds to PING message

**Automated Test Setup (deferred to Phase 4):**
- Jest/Vitest for unit tests
- Puppeteer for extension E2E tests
- Test coverage for message routing

---

## Pitfalls Avoided

From ROADMAP.md:

| Pitfall | How Phase 1 Avoids |
|---------|---------------------|
| Manifest V2 patterns | Use V3 format: `service_worker`, `action`, module type |
| Content Script storage access | Message routing infrastructure enables Phase 3 storage access via Service Worker |

---

## Dependencies Analysis

**Phase 1 is independent** — establishes foundation for:
- Phase 2: Uses message routing for prompt insertion
- Phase 3: Uses message routing for storage operations

No external dependencies beyond Chrome Extension APIs.

---

## Implementation Priorities

| Priority | Component | Rationale |
|----------|-----------|-----------|
| P0 | manifest.json | Required for extension load |
| P0 | vite.config.ts + package.json | Required for build |
| P1 | Service Worker skeleton | Message routing infrastructure |
| P1 | Content Script skeleton | Injection verification |
| P2 | Popup skeleton | UI placeholder |
| P2 | Placeholder icons | Toolbar display |

---

## Research Sources

- Chrome Extension Manifest V3 Documentation (developer.chrome.com)
- @crxjs/vite-plugin GitHub repository
- Chrome Extension Samples (github.com/GoogleChrome/chrome-extensions-samples)
- PROJECT.md tech stack recommendations

---

## RESEARCH COMPLETE

Phase 1 research complete. Ready for planning.

**Key findings:**
1. Manifest V3 requires `service_worker`, not `background.pages`
2. @crxjs/vite-plugin handles HMR and bundling
3. Message routing infrastructure is critical for Phase 2 and 3
4. Content Script matches `*://*.lovart.ai/*` per CONTEXT.md D-01

**Planning can proceed with:**
- Standard Manifest V3 template
- Vite + React + TypeScript setup
- Minimal skeleton for each component
- Message type definitions for future phases