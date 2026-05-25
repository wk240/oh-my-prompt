# AGENTS.md

This file defines how Codex should work inside `packages/extension`. It extends the root repository instructions and focuses on the Chrome extension product.

## Package Purpose

`@oh-my-prompt/extension` is the Manifest V3 Chrome extension for Oh My Prompt. It injects prompt-management UI into supported AI platforms, stores prompt data locally, coordinates sync/auth/provider settings, and routes insertion requests across extension contexts.

Primary user promise:
- Managed prompts should be easy to create, organize, sync, and insert into the active platform editor without breaking the host page.

## Local Map

```text
src/
├── background/     # MV3 service worker, message routing, sync orchestration
├── content/        # platform detection, Shadow DOM UI injection, insertion logic
├── data/           # bundled provider/e-commerce/resource-library data
├── hooks/          # shared React hooks for extension UIs
├── lib/            # storage, migrations, provider config, sync/cloud helpers
├── offscreen/      # offscreen document support for local backup flows
├── popup/          # action popup UI
└── sidepanel/      # main prompt CRUD/settings/sync UI
```

Reference files:
- `manifest.json`
- `vite.config.base.ts`
- `vite.config.dev.ts`
- `vite.config.prod.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `../shared/messages.ts`

## Commands

Run from the repository root unless a task explicitly needs this package as cwd.

```bash
npm run dev --workspace=@oh-my-prompt/extension
npm run build --workspace=@oh-my-prompt/extension
npm run typecheck --workspace=@oh-my-prompt/extension
npm run test:unit --workspace=@oh-my-prompt/extension
npm run test --workspace=@oh-my-prompt/extension
npm run test:ui --workspace=@oh-my-prompt/extension
npm run test:headed --workspace=@oh-my-prompt/extension
```

Smallest useful verification:
- Type-only or low-risk TS changes: `npm run typecheck --workspace=@oh-my-prompt/extension`
- Logic with unit coverage: `npm run test:unit --workspace=@oh-my-prompt/extension`
- Manifest/build/config/content bundling changes: `npm run build --workspace=@oh-my-prompt/extension`
- UI or insertion behavior changes: run the focused unit/build check first, then use browser/manual extension verification when practical.

## Hard Constraints

- Keep Manifest V3 patterns. Do not introduce MV2 APIs or assumptions.
- Do not use `eval`, remote code execution, or remotely hosted executable scripts.
- Prompt data belongs in `chrome.storage.local`, under the canonical storage key `prompt_script_data`.
- Content-script UI must remain isolated from host pages through Shadow DOM.
- Use typed message contracts from `@oh-my-prompt/shared/messages`.
- Preserve message response shape: `{ success, data?, error? }`.
- For async `sendResponse`, return `true` from the listener.
- Prefer `@/` imports inside this package and `@oh-my-prompt/shared/...` for shared contracts.
- Use `crypto.randomUUID()` for new IDs.
- Use the log prefix `[Oh My Prompt]`.

## Architecture Rules

### Storage

- Treat persisted storage schema as the source of truth.
- Preserve explicit prompt/category ordering through the `order` field.
- `'all'` is a filter-only category and must not be persisted as a real category.
- `'temporary'` is a pseudo-category backed by `temporaryPrompts`.
- When changing storage shape, inspect migrations and add/update tests around backward compatibility.

### Messaging

- Add or change message types in `../shared/messages.ts` first, then update senders and receivers together.
- Check all affected contexts: `background`, `content`, `sidepanel`, `popup`, and `offscreen`.
- Avoid stringly typed messages in new code.
- Keep service worker handlers resilient to missing payloads, unreachable tabs, and extension context teardown.

### Platform Injection

- New platform flow:
  1. Add `src/content/platforms/<platform>/config.ts`.
  2. Register it in `src/content/core/coordinator.ts` or the active registry path.
  3. Reuse the default inserter unless the editor requires a specific strategy.
  4. Add focused tests or manual verification notes for selector and insertion behavior.
- Prefer stable editor selectors and feature checks over brittle class-name chains.
- For rich editors, use insertion paths compatible with React/editor state tracking and dispatch the relevant input/composition/change events.
- Never let content UI styling leak into host pages.

### Background And Sync

- Service worker code must tolerate suspension and restart.
- Do not rely on long-lived in-memory state for user data.
- Sync changes require extra care around conflict handling, auth state, local backup permissions, and user-visible error reporting.
- Preserve existing cloud/local sync strategy boundaries unless the task is explicitly about changing them.

### UI

- Sidepanel is the primary management surface; popup should stay quick and focused.
- Keep UI states explicit: loading, empty, error, success, disabled, and permission-required states should be distinguishable where user action depends on them.
- Follow the existing React, Tailwind, Radix, lucide-react, and Zustand patterns before adding new dependencies.
- Use lucide icons for icon buttons when available.
- Avoid broad visual refactors when fixing behavior.

## High-Risk Areas

Double-check these before and after edits:
- Cross-context messaging and `sendResponse` lifetimes.
- Storage schema, migrations, import/export, and prompt ordering.
- Sync orchestration and auth/provider config persistence.
- Content selectors and insertion strategies for supported platforms.
- Shadow DOM mounting, cleanup, and duplicate injection prevention.
- Manifest permissions, host permissions, CSP, and web accessible resources.
- Build output paths expected by Chrome extension loading from `dist/`.

## Working Style For Codex

- Inspect the relevant files before editing; avoid stale assumptions from memory.
- Make minimal, targeted changes and leave unrelated files alone.
- If the work touches behavior, add or update focused tests when the existing test harness can cover it.
- If the work changes user-visible behavior, update nearby docs or comments only when they would prevent future mistakes.
- Prefer real verification commands over reasoning alone. If verification cannot run, state exactly what was not verified and why.
- Do not change release/version scripts unless the task is explicitly release-related.
- Do not resurrect deprecated GSD workflows or `/gsd-*` commands.

## Review Checklist Before Finishing

- Does the change preserve MV3 constraints and extension CSP?
- Are message types imported from `@oh-my-prompt/shared/messages`?
- Do async message handlers return `true`?
- Does storage remain compatible with `prompt_script_data` and existing migrations?
- Will content-script UI stay Shadow DOM isolated and avoid duplicate injection?
- Did the smallest meaningful verification command pass?
