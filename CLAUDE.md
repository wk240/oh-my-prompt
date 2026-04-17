<!-- GSD:project-start source:PROJECT.md -->
## Project

**Prompt-Script**

一个Chrome浏览器插件，用于在Lovart AI设计/绘图平台的输入框中一键插入预设的提示词模板。用户通过输入框旁的下拉菜单选择提示词，提示词按用途分类管理，支持内置编辑和数据导入导出。

**Core Value:** 一键插入预设提示词，提升创作效率。

### Constraints

- **Tech stack:** Chrome Extension (Manifest V3) — 现代Chrome插件标准
- **平台依赖:** 需适配目标平台的页面结构和输入框元素
- **数据存储:** chrome.storage.local 本地存储，容量有限制
- **浏览器支持:** Chrome/Edge/Brave等Chromium系浏览器
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
# Core
# Build tools
# Dev tools
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

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
