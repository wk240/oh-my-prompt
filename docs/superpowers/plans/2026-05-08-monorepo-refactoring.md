# Monorepo 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前单仓库 Chrome Extension 项目重构为 Monorepo 结构，为商业化转型奠定基础

**Architecture:** npm workspaces + packages/extension（开源） + packages/shared（开源类型定义）

**Tech Stack:** TypeScript, Vite, Chrome Extension Manifest V3, npm workspaces

---

## 文件结构规划

### 将创建的文件：

```
packages/
├── extension/
│   ├── src/                  # 从现有 src/ 迁移
│   │   ├── content/
│   │   ├── background/
│   │   ├── popup/
│   │   ├── sidepanel/
│   │   ├── offscreen/
│   │   ├── lib/
│   │   ├── hooks/
│   │   └── data/
│   ├── manifest.json         # 从根目录迁移
│   ├── vite.config.ts        # 从根目录迁移（调整路径）
│   ├── tsconfig.json         # 新建（继承根配置）
│   ├── postcss.config.js     # 从根目录迁移
│   ├── tailwind.config.ts    # 从根目录迁移（调整路径）
│   ├── components.json       # 从根目录迁移
│   ├── package.json          # 新建（Extension 专用）
│   └── playwright.config.ts  # 从根目录迁移
│
└── shared/
│   ├── types/
│   │   ├── prompt.ts         # 从 src/shared/types.ts 抽取
│   │   ├── storage.ts        # StorageSchema 相关类型
│   │   ├── resource.ts       # ResourcePrompt/Category 类型
│   │   ├── vision.ts         # VisionApiConfig 类型
│   │   └── sync.ts           # 新增：同步相关类型（为 Phase 3 准备）
│   ├── constants/
│   │   ├── platforms.ts      # 从 src/shared/constants.ts 抽取
│   │   └── storage.ts        # STORAGE_KEY 常量
│   ├── messages.ts           # 从 src/shared/messages.ts 迁移
│   ├── utils.ts              # 从 src/shared/utils.ts 迁移
│   ├── package.json          # 新建（Shared 包配置）
│   └── tsconfig.json         # 新建
│
根目录保留：
├── package.json              # 改为 workspaces 配置
├── tsconfig.base.json        # 新建（基础 TypeScript 配置）
├── LICENSE                   # 保持 MIT
├── README.md                 # 更新为 Monorepo 说明
├── CHANGELOG.md              # 保持
├── BUILD.md                  # 更新构建说明
├── VERSION                   # 保持
├── .gitignore                # 更新（添加 packages/web-app/）
├── docs/                     # 保持现有文档
├── assets/                   # 保持现有资源
└── .claude/                  # 保持现有 skills
```

### 将删除的文件：

```
根目录：
├── manifest.json             # 移至 packages/extension/
├── vite.config.ts            # 移至 packages/extension/
├── postcss.config.js         # 移至 packages/extension/
├── tailwind.config.ts        # 移至 packages/extension/
├── components.json           # 移至 packages/extension/
├── playwright.config.ts      # 移至 packages/extension/
├── tsconfig.json             # 改为 tsconfig.base.json
├── tsconfig.node.json        # 移至 packages/extension/

src/                          # 整个目录移至 packages/extension/src/
```

---

## Task 1: 创建根目录 Monorepo 配置

**Files:**
- Modify: `package.json`（改为 workspaces 配置）
- Create: `tsconfig.base.json`（基础 TypeScript 配置）
- Modify: `.gitignore`（添加闭源代码排除）

- [ ] **Step 1: 修改根 package.json 为 workspaces 配置**

```json
{
  "name": "oh-my-prompt-monorepo",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=@oh-my-prompt/extension",
    "build": "npm run build --workspace=@oh-my-prompt/extension",
    "preview": "npm run preview --workspace=@oh-my-prompt/extension",
    "test": "npm run test --workspace=@oh-my-prompt/extension",
    "test:ui": "npm run test:ui --workspace=@oh-my-prompt/extension",
    "test:headed": "npm run test:headed --workspace=@oh-my-prompt/extension",
    "version": "npm run version --workspace=@oh-my-prompt/extension",
    "release": "npm run release --workspace=@oh-my-prompt/extension",
    "github-release": "npm run github-release --workspace=@oh-my-prompt/extension",
    "publish": "npm run publish --workspace=@oh-my-prompt/extension"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.base.json（基础配置）**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 3: 更新 .gitignore（添加闭源代码排除）**

在现有 `.gitignore` 文件顶部添加：

```gitignore
# 闭源代码不提交到公开仓库
packages/web-app/

# Supabase 配置不提交
packages/web-app/supabase/

# 环境变量
.env
.env.local
.env.production

# Stripe 密钥
stripe-keys.txt

# 现有的忽略项保持不变
node_modules/
dist/
...
```

- [ ] **Step 4: 验证根配置正确**

运行：`cat package.json | grep workspaces`
预期输出：`"workspaces": ["packages/*"]`

运行：`cat tsconfig.base.json | grep strict`
预期输出：`"strict": true`

- [ ] **Step 5: Commit 根配置**

```bash
git add package.json tsconfig.base.json .gitignore
git commit -m "feat: configure monorepo structure with npm workspaces

- Add workspaces configuration to root package.json
- Create tsconfig.base.json for shared TypeScript settings
- Update .gitignore to exclude closed-source packages/web-app"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 2: 创建 packages 目录结构

**Files:**
- Create: `packages/` 目录
- Create: `packages/extension/` 目录
- Create: `packages/shared/` 目录

- [ ] **Step 1: 创建 packages 目录结构**

```bash
mkdir -p packages/extension
mkdir -p packages/shared/types
mkdir -p packages/shared/constants
```

运行：`ls -la packages/`
预期输出：显示 `extension` 和 `shared` 目录

- [ ] **Step 2: Commit 目录结构**

```bash
git add packages/
git commit -m "feat: create packages directory structure

- Create packages/extension for open-source extension code
- Create packages/shared for shared type definitions"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 3: 创建 packages/shared 包

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/types/prompt.ts`
- Create: `packages/shared/types/storage.ts`
- Create: `packages/shared/types/resource.ts`
- Create: `packages/shared/types/vision.ts`
- Create: `packages/shared/types/sync.ts`（为 Phase 3 准备）
- Create: `packages/shared/constants/storage.ts`
- Create: `packages/shared/constants/platforms.ts`
- Create: `packages/shared/messages.ts`
- Create: `packages/shared/utils.ts`
- Create: `packages/shared/index.ts`（导出所有模块）

- [ ] **Step 1: 创建 packages/shared/package.json**

```json
{
  "name": "@oh-my-prompt/shared",
  "version": "1.4.0",
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts",
    "./types": "./types/index.ts",
    "./constants": "./constants/index.ts",
    "./messages": "./messages.ts",
    "./utils": "./utils.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: 创建 packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "**/*.ts"
  ]
}
```

- [ ] **Step 3: 创建 packages/shared/types/prompt.ts（从 src/shared/types.ts 抽取 Prompt 相关）**

```typescript
// packages/shared/types/prompt.ts

// Phase 2: Prompt types
export interface Prompt {
  id: string
  name: string
  nameEn?: string // English name for bilingual support
  content: string
  contentEn?: string // English content for bilingual support
  categoryId: string
  description?: string // Optional description for display in selection UI
  descriptionEn?: string // English description for bilingual support
  order: number // 分类内排序顺序
  // Image support fields (optional)
  localImage?: string // Local image relative path, e.g. "images/{id}.jpg"
  remoteImageUrl?: string // Original network URL (record source, optional)
}

// Phase 3: Category types
export interface Category {
  id: string
  name: string
  nameEn?: string // English name for bilingual support
  order: number
}

// User data container - all prompts and categories owned by user
export interface UserData {
  prompts: Prompt[]
  categories: Category[]
}
```

- [ ] **Step 4: 创建 packages/shared/types/storage.ts（从 src/shared/types.ts 抽取 Storage 相关）**

```typescript
// packages/shared/types/storage.ts

import type { UserData } from './prompt'

// Sync settings for local folder backup
export interface SyncSettings {
  showBuiltin: boolean // Show resource library reference in UI
  syncEnabled: boolean // Auto-sync to local folder enabled
  lastSyncTime?: number // Timestamp of last successful sync
  hasUnsyncedChanges?: boolean // Flag to show backup reminder after reorder
  dismissedBackupWarning?: boolean // User dismissed the backup warning dialog
  resourceLanguage?: 'zh' | 'en' // Language preference for resource library, default 'zh'
  visionEnabled?: boolean // Vision modal (image-to-prompt) feature enabled, default true
  visionDefaultFormat?: 'natural' | 'json' // Vision default save format
}

// New storage schema with nested structure
export interface StorageSchema {
  version: string // From manifest, dynamic read
  userData: UserData // User's prompts and categories
  settings: SyncSettings // Sync and display settings
  temporaryPrompts?: import('./prompt').Prompt[] // Temporary library prompts (independent storage)
  _migrationComplete?: boolean // Prevents re-migration
}

// Legacy schema for migration detection
export interface LegacyStorageSchema {
  prompts: import('./prompt').Prompt[]
  categories: import('./prompt').Category[]
  version: string
}

// Update notification status
export interface UpdateStatus {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  downloadUrl: string
  releaseNotes?: string
  checkedAt: number
}
```

- [ ] **Step 5: 创建 packages/shared/types/resource.ts（从 src/shared/types.ts 抽取 Resource 相关）**

```typescript
// packages/shared/types/resource.ts

import type { Prompt, Category } from './prompt'

// Resource library prompt types (from local JSON data)
export interface ResourcePrompt extends Prompt {
  sourceCategory?: string // Original category from source
  previewImage?: string // Preview image URL
  author?: string // Original author name, e.g. "宝玉"
  authorUrl?: string // Author attribution link, e.g. "https://x.com/..."
  // Bilingual fields (optional, supports progressive translation)
  nameEn?: string // English name
  contentEn?: string // English content
  descriptionEn?: string // English description
}

// Resource library category metadata
export interface ResourceCategory extends Category {
  count: number // Number of prompts in category
}
```

- [ ] **Step 6: 创建 packages/shared/types/vision.ts（从 src/shared/types.ts 抽取 Vision 相关）**

```typescript
// packages/shared/types/vision.ts

// Phase 10: Vision API configuration
export interface VisionApiConfig {
  baseUrl: string // API endpoint base URL
  apiKey: string // User-provided API key
  modelName: string // Model identifier (e.g., 'claude-3-5-sonnet-20241022')
  apiFormat: 'openai' | 'anthropic' // Request format type (user-selected)
  configuredAt?: number // Timestamp of configuration (optional)
}

// Provider API configuration (multi-provider support)
export interface ProviderConfig {
  id: string                    // UUID (crypto.randomUUID())
  name: string                  // Display name (e.g., "OpenRouter")
  baseUrl: string               // API endpoint
  apiKey: string                // User-provided API key
  modelName: string             // Default model for this provider
  apiFormat: 'openai' | 'anthropic' // Request format
  isDefault?: boolean           // Default provider flag
  configuredAt?: number         // Configuration timestamp
}
```

- [ ] **Step 7: 创建 packages/shared/types/sync.ts（新增：为 Phase 3 云端同步准备）**

```typescript
// packages/shared/types/sync.ts

import type { Prompt, Category } from './prompt'

// Sync status for tracking cloud synchronization
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'not_logged_in'

// Sync payload for uploading to cloud
export interface SyncPayload {
  prompts: Prompt[]
  categories: Category[]
  timestamp: number
}

// Sync result from cloud API
export interface SyncResult {
  success: boolean
  error?: 'NOT_LOGGED_IN' | 'SYNC_FAILED' | 'NETWORK_ERROR' | 'INVALID_DATA'
  promptsCount?: number
  categoriesCount?: number
  syncedAt?: number
}

// Cloud user info (for authentication)
export interface CloudUser {
  id: string
  email?: string
  name?: string
  avatarUrl?: string
  subscriptionStatus: 'free' | 'pro' | 'team'
}

// Team member (for team collaboration feature)
export interface TeamMember {
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: number
}
```

- [ ] **Step 8: 创建 packages/shared/types/index.ts（导出所有类型）**

```typescript
// packages/shared/types/index.ts

export * from './prompt'
export * from './storage'
export * from './resource'
export * from './vision'
export * from './sync'
```

- [ ] **Step 9: 创建 packages/shared/constants/storage.ts（从 src/shared/constants.ts 抽取）**

先读取现有的 constants.ts：
```bash
cat src/shared/constants.ts
```

创建文件：
```typescript
// packages/shared/constants/storage.ts

// Storage key for chrome.storage.local
export const STORAGE_KEY = 'prompt_script_data'

// Platform domain identifiers
export const PLATFORM_DOMAIN = {
  LOVART: 'lovart',
  CHATGPT: 'chatgpt',
  CLAUDE: 'claude-ai',
  GEMINI: 'gemini',
  LIBLIB: 'liblib',
  JIMENG: 'jimeng',
  KIMI: 'kimi',
  XINGLIU: 'xingliu'
} as const
```

- [ ] **Step 10: 创建 packages/shared/constants/platforms.ts（从 src/shared/constants.ts 抽取平台相关）**

```typescript
// packages/shared/constants/platforms.ts

// Supported platform list (for extension)
export const SUPPORTED_PLATFORMS = [
  { id: 'lovart', name: 'Lovart', domain: 'lovart.com' },
  { id: 'chatgpt', name: 'ChatGPT', domain: 'chatgpt.com' },
  { id: 'claude-ai', name: 'Claude', domain: 'claude.ai' },
  { id: 'gemini', name: 'Gemini', domain: 'gemini.google.com' },
  { id: 'liblib', name: 'LibLib', domain: 'liblib.art' },
  { id: 'jimeng', name: '即梦', domain: 'jimeng.jianying.com' },
  { id: 'kimi', name: 'Kimi', domain: 'kimi.moonshot.cn' },
  { id: 'xingliu', name: '星流', domain: 'xingliu.art' }
] as const

export type PlatformId = typeof SUPPORTED_PLATFORMS[number]['id']
```

- [ ] **Step 11: 创建 packages/shared/constants/index.ts**

```typescript
// packages/shared/constants/index.ts

export * from './storage'
export * from './platforms'
```

- [ ] **Step 12: 迁移 packages/shared/messages.ts（从 src/shared/messages.ts）**

先读取现有文件：
```bash
cp src/shared/messages.ts packages/shared/messages.ts
```

- [ ] **Step 13: 迁移 packages/shared/utils.ts（从 src/shared/utils.ts）**

先读取现有文件：
```bash
cp src/shared/utils.ts packages/shared/utils.ts
```

- [ ] **Step 14: 创建 packages/shared/index.ts（统一导出入口）**

```typescript
// packages/shared/index.ts

// Export all types
export * from './types'

// Export all constants
export * from './constants'

// Export messages
export * from './messages'

// Export utilities
export * from './utils'
```

- [ ] **Step 15: 验证 shared 包 TypeScript 配置正确**

运行：`cd packages/shared && npm run typecheck`
预期输出：无错误（类型检查通过）

- [ ] **Step 16: Commit shared 包**

```bash
git add packages/shared/
git commit -m "feat: create @oh-my-prompt/shared package

- Extract Prompt, Category, Storage types from src/shared/types.ts
- Add SyncStatus/SyncPayload types for cloud synchronization (Phase 3)
- Move constants, messages, and utilities to shared package
- Configure TypeScript for shared package"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 4: 迁移 Extension 代码到 packages/extension

**Files:**
- Create: `packages/extension/src/`（从现有 `src/` 迁移）
- Move: `manifest.json` → `packages/extension/manifest.json`
- Move: `vite.config.ts` → `packages/extension/vite.config.ts`（调整路径）
- Move: `postcss.config.js` → `packages/extension/postcss.config.js`
- Move: `tailwind.config.ts` → `packages/extension/tailwind.config.ts`（调整路径）
- Move: `components.json` → `packages/extension/components.json`
- Move: `playwright.config.ts` → `packages/extension/playwright.config.ts`
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Move: `tsconfig.node.json` → `packages/extension/tsconfig.node.json`

- [ ] **Step 1: 迁移 src 目录到 packages/extension/src**

```bash
cp -r src packages/extension/src
```

运行：`ls packages/extension/src/`
预期输出：显示 content, background, popup, sidepanel, offscreen, lib, hooks, shared, data 等目录

- [ ] **Step 2: 迁移配置文件到 packages/extension**

```bash
cp manifest.json packages/extension/manifest.json
cp postcss.config.js packages/extension/postcss.config.js
cp components.json packages/extension/components.json
cp playwright.config.ts packages/extension/playwright.config.ts
cp tsconfig.node.json packages/extension/tsconfig.node.json
```

- [ ] **Step 3: 创建 packages/extension/package.json**

从现有 package.json 复制依赖和脚本，添加 shared 包依赖：

```json
{
  "name": "@oh-my-prompt/extension",
  "version": "1.4.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "version": "npx tsx ../../.claude/skills/release/scripts/version.ts",
    "release": "npx tsx ../../.claude/skills/release/scripts/release.ts",
    "github-release": "npx tsx ../../.claude/skills/release/scripts/github-release.ts",
    "publish": "npx tsx ../../.claude/skills/release/scripts/github-release.ts",
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed"
  },
  "dependencies": {
    "@oh-my-prompt/shared": "workspace:*",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toast": "^1.2.15",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.8.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.5.0",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "@playwright/test": "^1.59.1",
    "@types/chrome": "^0.0.260",
    "@types/node": "^25.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.5.0",
    "postcss": "^8.5.10",
    "tailwindcss": "^3.4.19",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.0.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 4: 创建 packages/extension/tsconfig.json**

继承基础配置，添加路径别名：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"],
      "@oh-my-prompt/shared": ["../shared"]
    }
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts"],
  "references": [
    { "path": "../shared" }
  ]
}
```

- [ ] **Step 5: 迁移并调整 vite.config.ts**

复制并修改路径：

```typescript
// packages/extension/vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import path from 'path'
import manifest from './manifest.json'

export default defineConfig({
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
})
```

- [ ] **Step 6: 迁移并调整 tailwind.config.ts**

复制并修改路径：

```typescript
// packages/extension/tailwind.config.ts

import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
  ],
  // ... 其他配置保持不变
}

export default config
```

- [ ] **Step 7: 验证配置文件已正确迁移**

运行：`ls packages/extension/`
预期输出：显示 manifest.json, vite.config.ts, package.json, tsconfig.json 等文件

- [ ] **Step 8: Commit extension 配置迁移**

```bash
git add packages/extension/
git commit -m "feat: migrate extension code to packages/extension

- Copy src/ to packages/extension/src/
- Move manifest.json, vite.config.ts, tailwind.config.ts
- Add @oh-my-prompt/shared dependency
- Configure TypeScript references to shared package"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 5: 更新 Extension 中的导入路径

**Files:**
- Modify: `packages/extension/src/` 下所有使用 `@/shared` 的文件
- 目标：将 `@/shared` 改为 `@oh-my-prompt/shared`

- [ ] **Step 1: 查找所有使用 @/shared 的文件**

运行：`grep -r "@/shared" packages/extension/src/ --include="*.ts" --include="*.tsx" | cut -d: -f1 | sort | uniq`
预期输出：列出所有需要修改的文件路径

- [ ] **Step 2: 批量替换导入路径**

运行替换命令：
```bash
find packages/extension/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's|from "@/shared|from "@oh-my-prompt/shared|g' {} +
```

- [ ] **Step 3: 验证替换成功**

运行：`grep -r "@/shared" packages/extension/src/ --include="*.ts" --include="*.tsx"`
预期输出：无匹配（所有导入已更新）

运行：`grep -r "@oh-my-prompt/shared" packages/extension/src/ --include="*.ts" | head -5`
预期输出：显示已更新的导入示例

- [ ] **Step 4: 检查导入路径的完整性**

查看一个典型文件的导入：
```bash
head -20 packages/extension/src/lib/store.ts
```

确认导入已更新为：
```typescript
import type { StorageSchema, Prompt, Category } from '@oh-my-prompt/shared'
```

- [ ] **Step 5: Commit 导入路径更新**

```bash
git add packages/extension/src/
git commit -m "refactor: update imports from @/shared to @oh-my-prompt/shared

- Replace all '@/shared' imports with '@oh-my-prompt/shared'
- Ensure type definitions reference shared package correctly"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 6: 删除根目录的旧文件

**Files:**
- Delete: 根目录的 `src/`
- Delete: 根目录的配置文件（已迁移到 packages/extension）

- [ ] **Step 1: 删除根目录的 src/**

```bash
rm -rf src/
```

运行：`ls src/`
预期输出：`ls: src/: No such file or directory`

- [ ] **Step 2: 删除根目录已迁移的配置文件**

```bash
rm manifest.json
rm vite.config.ts
rm postcss.config.js
rm tailwind.config.ts
rm components.json
rm playwright.config.ts
rm tsconfig.node.json
rm tsconfig.json  # 将改名为 tsconfig.base.json，已创建
```

- [ ] **Step 3: 验证根目录清理完成**

运行：`ls -la | grep -E "^-" | grep -v ".gitignore"`
预期输出：只显示 README.md, LICENSE, CHANGELOG.md, BUILD.md, VERSION, package.json, tsconfig.base.json, package-lock.json

- [ ] **Step 4: Commit 删除旧文件**

```bash
git add -A
git commit -m "refactor: remove old monolith structure

- Delete src/ directory (moved to packages/extension/src/)
- Remove root-level config files (moved to packages/extension/)
- Keep only monorepo root files"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 7: 安装 Monorepo 依赖

**Files:**
- Modify: `package-lock.json`（重新生成）

- [ ] **Step 1: 清理旧的 node_modules**

```bash
rm -rf node_modules
rm package-lock.json
```

- [ ] **Step 2: 安装 Monorepo 依赖**

```bash
npm install
```

预期输出：安装所有依赖，包括 workspace 依赖

- [ ] **Step 3: 验证 workspace 依赖已正确链接**

运行：`ls -la node_modules/@oh-my-prompt/`
预期输出：显示 `shared` 目录（符号链接到 `packages/shared`）

运行：`cat node_modules/@oh-my-prompt/shared/package.json | grep name`
预期输出：`"name": "@oh-my-prompt/shared"`

- [ ] **Step 4: Commit 依赖安装**

```bash
git add package-lock.json
git commit -m "chore: reinstall dependencies for monorepo structure

- Regenerate package-lock.json with workspace references
- Verify @oh-my-prompt/shared symlink correctly"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 8: 验证 Extension 构建正常

**Files:**
- Build: `packages/extension/dist/`

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
cd packages/extension
npm run typecheck
```

预期输出：无错误，类型检查通过

如果出现错误，检查导入路径是否正确：
```bash
grep -r "@oh-my-prompt/shared" packages/extension/src/ | head -10
``

- [ ] **Step 2: 运行 Extension 构建**

```bash
npm run build
```

预期输出：构建成功，生成 `packages/extension/dist/` 目录

- [ ] **Step 3: 验证构建产物**

运行：`ls packages/extension/dist/`
预期输出：显示 manifest.json, content scripts, background script, popup html 等

- [ ] **Step 4: 验证 Chrome Extension 可加载**

1. 打开 Chrome 浏览器
2. 进入 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `packages/extension/dist/` 目录

预期结果：Extension 成功加载，显示在扩展列表中

- [ ] **Step 5: 测试 Extension 功能**

1. 访问支持的平台（如 Lovart.com）
2. 检查输入框旁的 Dropdown 按钮
3. 测试提示词插入功能

预期结果：Extension 功能正常

- [ ] **Step 6: Commit 构建验证**

```bash
git add packages/extension/dist/
git commit -m "test: verify extension build and functionality

- TypeScript typecheck passes
- Extension builds successfully
- Chrome extension loads and works correctly"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 9: 更根文档说明 Monorepo 结构

**Files:**
- Modify: `README.md`（更新项目说明）
- Modify: `BUILD.md`（更新构建说明）
- Modify: `CLAUDE.md`（更新项目结构说明）

- [ ] **Step 1: 更新 README.md**

在文件顶部添加 Monorepo 说明：

```markdown
# Oh My Prompt

一个 Chrome Extension，用于在 AI 设计/绘图平台一键插入预设提示词模板。

## 项目结构

本项目采用 **Monorepo** 架构：

```
packages/
├── extension/      # Chrome Extension（开源）
│   ├── src/        # Extension 源码
│   └── dist/       # 构建产物
│
└── shared/         # 共享类型定义（开源）
    ├── types/      # TypeScript 类型
    └── constants/  # 常量定义
```

## 开发

\`\`\`bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck --workspace=@oh-my-prompt/extension
\`\`\`

## 架构

详见 [docs/superpowers/specs/2026-05-08-commercialization-architecture-design.md](商业化架构设计)

## License

MIT License - Extension 和 Shared 包开源

---

后续部分保持不变...
```

- [ ] **Step 2: 更新 BUILD.md**

更新构建路径说明：

```markdown
# 构建说明

## 项目结构

Monorepo 架构：
- `packages/extension/` - Extension 源码
- `packages/shared/` - 共享类型定义

## 开发

\`\`\`bash
# 从根目录运行
npm run dev

# 或进入 extension 目录
cd packages/extension
npm run dev
\`\`\`

## 构建

\`\`\`bash
npm run build
\`\`\`

构建产物在 `packages/extension/dist/`。

## 加载 Extension

1. Chrome → `chrome://extensions/`
2. 启用"开发者模式"
3. 加载 `packages/extension/dist/`
```

- [ ] **Step 3: 更新 CLAUDE.md**

更新 Architecture 部分：

```markdown
## Architecture

### Monorepo Structure

```
packages/
├── extension/          # Chrome Extension（开源）
│   ├── src/
│   │   ├── content/    # Content scripts
│   │   ├── background/ # Service worker
│   │   ├── popup/      # Popup UI
│   │   ├── sidepanel/  # Sidepanel UI
│   │   ├── lib/        # Utilities
│   │   └── data/       # Built-in data
│   ├── manifest.json
│   └── vite.config.ts
│
└── shared/             # Shared types（开源）
    ├── types/
    │   ├── prompt.ts
    │   ├── storage.ts
    │   ├── sync.ts     # Cloud sync types
    │   └── ...
    ├── constants/
    ├── messages.ts
    └── utils.ts
```

### Import Convention

- Extension imports shared types: `import type { Prompt } from '@oh-my-prompt/shared'`
- Path alias: `@/` resolves to `packages/extension/src/`

### Commands

\`\`\`bash
# Run from root directory
npm run dev
npm run build
npm run test
\`\`\`
```

- [ ] **Step 4: Commit 文档更新**

```bash
git add README.md BUILD.md CLAUDE.md
git commit -m "docs: update documentation for monorepo structure

- Add monorepo explanation to README.md
- Update BUILD.md build paths
- Update CLAUDE.md Architecture section"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 10: 最终验证和清理

**Files:**
- Verify: 所有功能正常
- Clean: 临时文件清理

- [ ] **Step 1: 验证 TypeScript 类型一致性**

运行：`cd packages/shared && npm run typecheck`
预期输出：类型检查通过

运行：`cd packages/extension && npm run typecheck`
预期输出：类型检查通过

- [ ] **Step 2: 验证开发服务器正常**

```bash
npm run dev
```

预期输出：Vite dev server 启动，显示 URL

- [ ] **Step 3: 验证所有脚本正常**

```bash
npm run build    # 构建成功
npm run preview  # 预览服务器启动
```

- [ ] **Step 4: 检查 Git 状态**

运行：`git status`
预期输出：无未提交的改动（所有文件已 commit）

- [ ] **Step 5: 创建迁移完成标签**

```bash
git tag -a v1.4.0-monorepo -m "Monorepo refactoring complete"
git push origin v1.4.0-monorepo
```

- [ ] **Step 6: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete monorepo refactoring

Monorepo structure ready for commercialization:
- packages/extension: Open-source Chrome Extension
- packages/shared: Shared type definitions
- packages/web-app: Placeholder for closed-source web app (Phase 2)

Next: Phase 2 - Web-app foundation"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Self-Review Checklist

完成计划后，检查以下内容：

1. **Spec coverage**: 是否覆盖了设计文档 Phase 1 的所有任务？
   - ✅ 创建 Monorepo 结构
   - ✅ 迁移 src/ 到 packages/extension/src/
   - ✅ 创建 packages/shared/ 并抽取类型定义
   - ✅ 配置 npm workspaces
   - ✅ 确保 Extension 构建正常

2. **Placeholder scan**: 是否有 TBD/TODO/模糊描述？
   - ✅ 无 placeholder，所有代码已完整提供

3. **Type consistency**: 类型名称和签名是否一致？
   - ✅ Prompt, Category, StorageSchema 等类型定义一致
   - ✅ 导入路径统一为 `@oh-my-prompt/shared`

4. **File paths**: 所有文件路径是否精确？
   - ✅ 所有路径使用绝对或相对于项目根的路径

5. **Commands**: 所有命令是否可执行且有预期输出？
   - ✅ 所有命令提供预期输出验证

---

## Execution Handoff

计划完成并保存到 `docs/superpowers/plans/2026-05-08-monorepo-refactoring.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）** - 每个 Task 启动新 subagent，实时 review，快速迭代
2. **Inline Execution** - 在当前 session 执行，批量执行 + checkpoint review

**你选择哪种方式？**