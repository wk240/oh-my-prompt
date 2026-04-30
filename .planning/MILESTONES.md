# Milestones

## v1.0 MVP (Shipped: 2026-04-16)

**Phases completed:** 4 phases, 27 plans, 54 tasks

**Key accomplishments:**

- npm project initialized with TypeScript, Vite, React, and @crxjs/vite-plugin for Chrome Extension Manifest V3 development
- Chrome Extension Manifest V3 registration with Lovart.ai content script injection and minimal activeTab permission
- Minimal placeholder PNG icons for Chrome Extension toolbar and management page display
- TypeScript message protocol with MessageType enum and generic Message/MessageResponse interfaces for extension communication
- Service Worker with PING message routing and placeholder handlers for future storage and prompt operations
- Content Script with PING message test for Service Worker routing verification on Lovart pages
- React Popup UI with 300px layout, system font styling, and phase progress display
- Chrome Extension build verified and loaded successfully with working message routing
- Enhanced error handling with Toast notifications across import/export, storage operations, and CRUD actions
- Enhanced SPA navigation persistence with history API interception and periodic health checks
- Implemented edge case handling: default category protection, empty state differentiation, large dataset safeguards

---

## v1.1.0 网络提示词数据源接入 (Shipped: 2026-04-19)

**Phases completed:** 3 phases, 13 plans

**Key accomplishments:**

- Network provider foundation for prompts.chat data source
- Network cache layer for offline access
- Dropdown online library UI with 276 prompts from prompts.chat
- Resource library integration in popup

---

## v1.2.0 双语支持与图片功能 (Shipped: 2026-04-27)

**Phases completed:** Integrated into v1.2.x releases

**Key accomplishments:**

- Chinese/English bilingual support for built-in prompts and resource library
- Prompt image upload/edit support (60x40 thumbnail preview)
- Content hash deduplication for backup history
- Thumbnail batch loading optimization with lazy loading and queue mechanism
- Global language switch in resource library header

---

## v1.3.0 Image to Prompt (Shipped: 2026-04-28)

**Phases completed:** 4 phases, 12 plans

**Key accomplishments:**

- Multi-platform support: Lovart, ChatGPT, Claude.ai, Gemini, LibLib, 即梦
- Context menu integration: right-click any image to generate prompt
- Vision API integration with Claude Vision / GPT-4V support
- API key management in popup settings
- Clipboard fallback for non-supported pages
- Sidepanel universal input detection

---
