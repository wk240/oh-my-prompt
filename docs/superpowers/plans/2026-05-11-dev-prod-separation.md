# Dev/Prod Environment Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split vite.config.ts into base/dev/prod configurations to enable automatic WEB_APP_URL environment switching via npm scripts.

**Architecture:** Create three config files: base (shared), dev (injects localhost URL), prod (fallback to production URL). Modify package.json scripts to select config file per command.

**Tech Stack:** Vite 6.x, @crxjs/vite-plugin 2.x, TypeScript 5.x

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `packages/extension/vite.config.base.ts` | Create | Shared base configuration (plugins, resolve, server, build) |
| `packages/extension/vite.config.dev.ts` | Create | Development config, inherits base, injects DEV_WEB_APP_URL |
| `packages/extension/vite.config.prod.ts` | Create | Production config, inherits base, no DEV_WEB_APP_URL injection |
| `packages/extension/vite.config.ts` | Delete | Replaced by three config files |
| `packages/extension/package.json` | Modify | Update dev/build/preview scripts to use correct config |

---

### Task 1: Create vite.config.base.ts

**Files:**
- Create: `packages/extension/vite.config.base.ts`

- [ ] **Step 1: Create base config file with shared configuration**

Create `packages/extension/vite.config.base.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'path'
import manifest from './manifest.json'

export const baseConfig = {
  plugins: [
    react(),
    crx({ manifest })
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@oh-my-prompt/shared': path.resolve(__dirname, '../shared')
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
      protocol: 'ws',
      host: 'localhost'
    },
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: 'src/sidepanel/sidepanel.html',
        offscreen: 'src/offscreen/offscreen.html'
      },
      output: {
        manualChunks(id) {
          // Extract React ecosystem into separate chunk
          if (id.includes('react') || id.includes('react-dom')) {
            return 'vendor-react'
          }
          // Extract lucide-react icons
          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
          // Extract dnd-kit drag-and-drop library
          if (id.includes('@dnd-kit')) {
            return 'vendor-dnd'
          }
          // Extract zustand state management
          if (id.includes('zustand')) {
            return 'vendor-zustand'
          }
          // Extract resource library JSON data (5MB+) - separate from code
          if (id.includes('resource-library/categories') || id.includes('resource-library/index.json')) {
            return 'resource-library'
          }
        }
      }
    }
  }
}
```

---

### Task 2: Create vite.config.dev.ts

**Files:**
- Create: `packages/extension/vite.config.dev.ts`

- [ ] **Step 1: Create dev config file**

Create `packages/extension/vite.config.dev.ts`:

```ts
import { defineConfig } from 'vite'
import { baseConfig } from './vite.config.base'

export default defineConfig({
  ...baseConfig,
  define: {
    DEV_WEB_APP_URL: '"http://localhost:3000"',
  },
})
```

---

### Task 3: Create vite.config.prod.ts

**Files:**
- Create: `packages/extension/vite.config.prod.ts`

- [ ] **Step 1: Create prod config file**

Create `packages/extension/vite.config.prod.ts`:

```ts
import { defineConfig } from 'vite'
import { baseConfig } from './vite.config.base'

export default defineConfig({
  ...baseConfig,
  // DEV_WEB_APP_URL not defined - fallback to https://oh-my-prompt.com
  build: {
    ...baseConfig.build,
    sourcemap: false, // Production builds don't need sourcemaps
  },
})
```

---

### Task 4: Modify package.json scripts

**Files:**
- Modify: `packages/extension/package.json` (lines 5-9, scripts section)

- [ ] **Step 1: Update scripts to use environment-specific config files**

Modify `packages/extension/package.json` scripts section:

```json
{
  "scripts": {
    "dev": "vite --config vite.config.dev.ts",
    "build": "tsc && vite build --config vite.config.prod.ts",
    "preview": "vite preview --config vite.config.prod.ts",
    "typecheck": "tsc --noEmit",
    "version": "npx tsx ../../.claude/skills/release/scripts/version.ts",
    "release": "npx tsx ../../.claude/skills/release/scripts/release.ts",
    "github-release": "npx tsx ../../.claude/skills/release/scripts/github-release.ts",
    "publish": "npx tsx ../../.claude/skills/release/scripts/github-release.ts",
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest"
  }
}
```

---

### Task 5: Delete old vite.config.ts

**Files:**
- Delete: `packages/extension/vite.config.ts`

- [ ] **Step 1: Remove the old unified config file**

Run:
```bash
rm packages/extension/vite.config.ts
```

---

### Task 6: Verify TypeScript compilation

- [ ] **Step 1: Run TypeScript check to ensure no type errors**

Run:
```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: No type errors, compilation passes.

---

### Task 7: Verify development build uses localhost URL

- [ ] **Step 1: Run dev build and check WEB_APP_URL in output**

Run:
```bash
cd packages/extension && npm run dev
```

Wait for build to complete (watch mode starts). Then check the output JS file:

```bash
grep -r "localhost:3000" packages/extension/dist/assets/*.js | head -5
```

Expected: Should find `localhost:3000` in the built JS files.

- [ ] **Step 2: Stop dev server**

Press Ctrl+C to stop the dev server.

---

### Task 8: Verify production build uses production URL

- [ ] **Step 1: Run production build**

Run:
```bash
npm run build --workspace=@oh-my-prompt/extension
```

Expected: Build completes successfully, no errors.

- [ ] **Step 2: Check WEB_APP_URL in production output**

Run:
```bash
grep -r "oh-my-prompt.com" packages/extension/dist/assets/*.js | head -5
```

Expected: Should find `oh-my-prompt.com` (the production URL).

- [ ] **Step 3: Verify localhost NOT in production output**

Run:
```bash
grep -r "localhost:3000" packages/extension/dist/assets/*.js
```

Expected: No matches (localhost should NOT appear in production build).

---

### Task 9: Commit changes

- [ ] **Step 1: Stage all changes**

Run:
```bash
git add packages/extension/vite.config.base.ts
git add packages/extension/vite.config.dev.ts
git add packages/extension/vite.config.prod.ts
git add packages/extension/package.json
git add packages/extension/vite.config.ts  # deletion
```

- [ ] **Step 2: Commit with descriptive message**

Run:
```bash
git commit -m "$(cat <<'EOF'
refactor(build): split vite config into base/dev/prod files

- Create vite.config.base.ts with shared configuration
- Create vite.config.dev.ts injecting localhost:3000 URL
- Create vite.config.prod.ts using production URL fallback
- Update package.json scripts to use environment-specific configs
- Remove old unified vite.config.ts

This enables automatic WEB_APP_URL switching:
- npm run dev → localhost:3000
- npm run build → https://oh-my-prompt.com

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

| Spec Requirement | Covered by Task |
|------------------|-----------------|
| vite.config.base.ts with shared config | Task 1 |
| vite.config.dev.ts with DEV_WEB_APP_URL injection | Task 2 |
| vite.config.prod.ts without DEV_WEB_APP_URL | Task 3 |
| package.json scripts updated | Task 4 |
| Old vite.config.ts deleted | Task 5 |
| Dev build uses localhost:3000 | Task 7 |
| Prod build uses oh-my-prompt.com | Task 8 |
| Prod build sourcemap disabled | Task 3 (Step 1) |

**Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**Type consistency:** `baseConfig` exported as const object, imported correctly in dev/prod configs.