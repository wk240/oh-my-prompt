# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Oh My Prompt**

一个Chrome浏览器插件，用于在AI设计/绘图平台的输入框中一键插入预设的提示词模板。支持多平台（Lovart、ChatGPT、Claude.ai、Gemini、Kimi、星流、RunningHub等），用户通过输入框旁的下拉菜单选择提示词，提示词按用途分类管理，支持内置编辑和数据导入导出。内置Agent模式，通过AI模板增强提示词生成。

**Core Value:** 一键插入预设提示词，提升创作效率。

### Constraints

- **Tech stack:** Chrome Extension (Manifest V3)
- **平台支持:** Lovart、ChatGPT、Claude.ai、Gemini、LibLib、即梦、Kimi、星流、RunningHub
- **数据存储:** `chrome.storage.local`
- **浏览器支持:** Chromium 系（Chrome/Edge/Brave）

## Commands (Verified)

### Extension

```bash
npm run dev
npm run build
npm run preview
npm run test
npm run test:ui
npm run test:headed
npm run typecheck --workspace=@oh-my-prompt/extension
npm run test:unit --workspace=@oh-my-prompt/extension
npm run test:unit:watch --workspace=@oh-my-prompt/extension
```

### Web App

```bash
npm run web:dev
npm run web:build
npm run web:start
```

### Shared

```bash
npm run sync-shared
npm run check-shared
```

After running `npm run dev`, load extension from `packages/extension/dist/` via `chrome://extensions`.

## OAuth Dev Checklist

1. Run `npm run dev` (extension dev build)
2. Run `npm run web:dev` (web app on port 3000)
3. Load extension from `packages/extension/dist/`
4. Supabase Auth:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/extension/callback`

## Architecture

### Monorepo

```text
packages/
├── extension/   # Chrome Extension core
├── web-app/     # Next.js app
└── shared/      # shared contracts/types
```

### Key paths

- `packages/extension/src/content/`: platform detection/injection/insert strategies
- `packages/extension/src/background/`: service worker router and handlers
- `packages/extension/src/sidepanel/`: main prompt CRUD/settings/sync UI
- `packages/extension/src/popup/`: quick settings/provider config
- `packages/extension/src/lib/sync/`: cloud/local sync orchestration
- `packages/shared/messages.ts`: message type contracts

### Data and messaging rules

- Storage key: `prompt_script_data`
- Keep `MessageType` contracts in `packages/shared/messages.ts`
- Async `sendResponse` handlers must `return true`
- Message response shape: `{ success: boolean, data?: T, error?: string }`

### Prompt/category semantics

- `'all'` is filter-only (not a stored category)
- `'temporary'` maps to `temporaryPrompts` (pseudo-category)

### Platform extension flow

1. Add `packages/extension/src/content/platforms/<platform>/config.ts`
2. Register in platform registry/coordinator
3. Use default inserter unless editor-specific strategy is required

## Conventions

- Extension path alias: `@/` -> `packages/extension/src/`
- Shared imports: `@oh-my-prompt/shared/...`
- ID generation: `crypto.randomUUID()`
- Log prefix: `[Oh My Prompt]`
- Keep content UI Shadow DOM isolated

## Agent Working Agreement

- Make focused, minimal changes
- Verify assumptions using real files/scripts before editing
- Run the smallest meaningful validation command after changes
- If unable to run tests, explicitly report what was not verified

## Deprecated Workflow Notice

- GSD plugin workflow has been removed from this project.
- Do **not** require `/gsd-*` commands.
- If old docs mention GSD steps, treat them as historical and update when touched.
