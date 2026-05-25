# AGENTS.md

This file defines how Codex should work in this repository. Keep execution practical, verify with real commands, and prefer small safe changes.

## Project Overview

**Oh My Prompt** is a Chrome extension (Manifest V3) for one-click prompt insertion on AI platforms.

### Primary Goal
- Let users insert managed prompt templates quickly in host-page input editors.

### Supported Platforms (current)
- Lovart
- ChatGPT
- Codex.ai / Claude.ai style editors
- Gemini
- LibLib
- 即梦
- Kimi
- 星流
- RunningHub

## Monorepo Structure

```text
packages/
├── extension/   # Chrome extension (core product)
├── web-app/     # Next.js web app (auth, callback, website)
└── shared/      # Shared types/constants/messages
```

Key areas:
- `packages/extension/src/content/`: platform detection + UI injection + insertion strategies
- `packages/extension/src/background/`: service worker message routing and orchestration
- `packages/extension/src/sidepanel/`: main CRUD/settings/sync UI
- `packages/extension/src/popup/`: quick settings and provider config
- `packages/extension/src/lib/sync/`: cloud/local backup sync strategies
- `packages/shared/messages.ts`: cross-context message enum contracts

## Tech Constraints

- Must use Manifest V3 patterns (no MV2 fallback).
- Avoid `eval` / remote code execution.
- Prefer `chrome.storage.local` (not `chrome.storage.sync`) for prompt data.
- Content-script UI must remain Shadow DOM isolated from host CSS.

## Commands (Verified)

Run from repo root:

```bash
# Extension
npm run dev
npm run build
npm run preview
npm run test
npm run test:ui
npm run test:headed

# Extension unit checks
npm run typecheck --workspace=@oh-my-prompt/extension
npm run test:unit --workspace=@oh-my-prompt/extension
npm run test:unit:watch --workspace=@oh-my-prompt/extension

# Web app
npm run web:dev
npm run web:build
npm run web:start

# Shared package maintenance
npm run sync-shared
npm run check-shared
```

## OAuth Dev Checklist

When testing extension OAuth callback locally:

1. Start extension dev build: `npm run dev`.
2. Start web app dev server: `npm run web:dev`.
3. Load extension from `packages/extension/dist/` in `chrome://extensions`.
4. Supabase Auth config:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/extension/callback`

Reason: development callback URL is wired in extension dev config; production build targets `https://oh-my-prompt.com`.

## Architecture Rules

### Storage and state
- Single storage key: `prompt_script_data`.
- Source of truth is persisted storage schema, not transient UI state.
- Prompt ordering is explicit via `order` field.

### Messaging
- Use typed messages from `@oh-my-prompt/shared/messages`.
- For async `sendResponse`, service worker must `return true`.
- Response shape should remain `{ success, data?, error? }`.

### Prompt/category semantics
- `'all'` is filter-only, not a real category entity.
- `'temporary'` is pseudo-category backed by `temporaryPrompts`.

### Platform integration
- New platform integration flow:
  1. Add `packages/extension/src/content/platforms/<platform>/config.ts`.
  2. Register in platform coordinator/registry.
  3. Reuse default inserter unless editor-specific strategy is required (Lexical/ProseMirror/custom).

## Coding Conventions

- Use `@/` alias inside extension package.
- Shared imports should come from `@oh-my-prompt/shared/...`.
- Use `crypto.randomUUID()` for new IDs.
- Log prefix: `[Oh My Prompt]`.
- For rich editors, prefer insertion path compatible with React/editor tracking and dispatch corresponding events.

## Agent Working Agreement (Codex)

- Make minimal, targeted changes; avoid unrelated refactors.
- Before editing, inspect relevant files and current scripts to avoid stale assumptions.
- After changes, run the smallest meaningful verification command.
- If tests cannot run, state exactly what was not verified.
- Prefer updating docs when behavior/contracts change.

## Deprecated / Removed Workflow

- GSD plugin workflow is no longer used in this repository.
- Do not require `/gsd-*` commands.
- If any old docs mention GSD commands, treat them as historical and remove/update when touched.

## High-Risk Areas to Double-Check

- Cross-context messaging changes (`content` / `background` / `sidepanel` / `popup`).
- Sync logic (`SyncOrchestrator`, cloud/local strategy coordination).
- Provider config persistence and auth-dependent behavior.
- Platform selector changes that can silently break UI injection.

## Reference Files

- Root: `package.json`
- Extension manifest: `packages/extension/manifest.json`
- Extension Vite configs:
  - `packages/extension/vite.config.base.ts`
  - `packages/extension/vite.config.dev.ts`
  - `packages/extension/vite.config.prod.ts`
- Shared message contracts: `packages/shared/messages.ts`
