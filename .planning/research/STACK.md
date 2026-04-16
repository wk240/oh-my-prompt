# Stack Research

**Domain:** Chrome Extension (Manifest V3)
**Researched:** 2026-04-16
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.x | Primary language | Type safety, better IDE support, widely adopted for extensions |
| Chrome Extension Manifest V3 | - | Extension platform | Required by Chrome since 2024, modern security model |
| Vite | 6.x | Build tool | Fast HMR, native ES modules, excellent extension support via @crxjs/vite-plugin |
| React | 19.x | UI framework | Component-based, Shadow DOM compatible, familiar to most developers |
| chrome.storage.local | - | Data persistence | Native API, synchronous access, quota sufficient for prompt data |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @crxjs/vite-plugin | 2.x | Vite CRX bundler | Required for building extension with Vite |
| Zustand | 5.x | State management | Lightweight, no providers, perfect for extension popup |
| uuid | 11.x | ID generation | For prompt IDs, category IDs |
| react-shadow-dom | - | Shadow DOM integration | For isolated content script UI |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Chrome DevTools | Extension debugging | Use chrome://extensions for reload |
| web-ext | Firefox testing | Optional, for cross-browser testing |
| ESLint + Prettier | Code quality | Standard TypeScript config |

## Installation

```bash
# Core
npm install react react-dom zustand uuid

# Build tools
npm install -D vite @crxjs/vite-plugin typescript @types/chrome @types/react @types/react-dom

# Dev tools
npm install -D eslint prettier eslint-config-prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vite + @crxjs | webpack + webpack-extension-reloader | Legacy projects, complex bundling needs |
| React | Vue/Svelte | Team preference, smaller bundle needed |
| Zustand | Redux/Jotai | Complex state logic, team familiarity |
| TypeScript | JavaScript | Quick prototypes, no build step needed |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Manifest V2 | Deprecated, will be blocked by Chrome | Manifest V3 |
| jQuery | Large, conflicts with host page | React/Vue or vanilla DOM |
| chrome.storage.sync for large data | 100KB limit, sync conflicts | chrome.storage.local |
| Background pages | Removed in V3 | Service workers |
| Remote code execution | Blocked in V3 | Bundle all code locally |
| eval() / new Function() | Blocked by CSP | Static code only |

## Sources

- Chrome Extension Manifest V3 official docs
- @crxjs/vite-plugin documentation
- Zustand documentation
- Chrome Web Store best practices

---
*Stack research for: Chrome Extension (Manifest V3)*
*Researched: 2026-04-16*