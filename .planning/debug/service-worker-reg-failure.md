---
status: resolved
trigger: Service worker registration failed. Status code: 15 + Uncaught ReferenceError: Cannot access 'l' before initialization
created: 2026-04-20
updated: 2026-04-20
---

## Symptoms

- **Expected behavior:** Extension loads normally, service worker initializes
- **Actual behavior:** Service worker registration fails (status code: 15), JavaScript initialization error "Cannot access 'l' before initialization"
- **Error messages:** "Service worker registration failed. Status code: 15" and "Uncaught ReferenceError: Cannot access 'l' before initialization"
- **Timeline:** Started recently (new issue from recent changes)
- **Reproduction:** Load unpacked extension from dist/ folder in chrome://extensions

## Current Focus

hypothesis: Circular dependency in migrations module causes TDZ error in bundled code
next_action: Fix the circular dependency by restructuring migrations

## Evidence

- timestamp: 2026-04-20T17:30
  type: code_analysis
  source: dist/assets/storage-D9T6yGr1.js
  finding: Bundled code shows `b({version:"1.0",handler:w})` called BEFORE `const l=[]` is defined
  details: |
    The bundled output order is:
    1. function w(e){...} // migrateFromLegacy
    2. b({version:"1.0",handler:w}) // registerMigration called
    3. function d(e,t){...}
    4. const l=[] // migrations array initialized HERE
    5. function b(e){l.push(e)...} // registerMigration uses l
    
    This is a Temporal Dead Zone (TDZ) error - l.push() is called before l is declared.

- timestamp: 2026-04-20T17:35
  type: dependency_analysis
  source: src/lib/migrations/index.ts + src/lib/migrations/v1.0.ts
  finding: Circular dependency between migrations modules
  details: |
    migrations/index.ts exports:
      - registerMigration (function b)
      - migrations array (const l)
    migrations/index.ts imports:
      - import './v1.0' (side effect import at end of file)
    
    migrations/v1.0.ts imports:
      - registerMigration from './index'
      - isLegacyFormat from './index'
    migrations/v1.0.ts calls:
      - registerMigration({version:'1.0', handler: migrateFromLegacy}) at module eval
    
    The circular import causes the bundler to emit registerMigration call before migrations array initialization.

## Root Cause

**Circular dependency in migrations module causes TDZ error in bundled output.**

The `migrations/v1.0.ts` file imports `registerMigration` from `migrations/index.ts` and calls it at module evaluation time. However, `migrations/index.ts` also imports `v1.0.ts` as a side effect. The bundler places the `registerMigration` call before the `migrations` array (`const l=[]`) is initialized, causing the TDZ error when `l.push()` is executed.

## Resolution

root_cause: Circular dependency between migrations/index.ts and migrations/v1.0.ts causes registerMigration to be called before migrations array is initialized (TDZ error in bundled code)
fix: Created central registration pattern - new register.ts module imports v1_0Migration and calls registerMigration after migrations array is initialized
files_changed:
  - src/lib/migrations/register.ts (new)
  - src/lib/migrations/v1.0.ts (refactored to export v1_0Migration constant)
  - src/lib/storage.ts (added import './migrations/register')

## Verification

- timestamp: 2026-04-20T18:00
  type: build_verification
  result: BUILD PASSED - TypeScript compiled and Vite build succeeded
  details: |
    - New storage-BfYs1d4u.js bundle generated
    - Extension rebuild successful
    - User should reload extension in chrome://extensions to verify fix