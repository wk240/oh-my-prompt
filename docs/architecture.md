# Architecture Overview

> **受众:** 开发者接手本项目、贡献者理解系统设计

## Project Identity

**Oh My Prompt** 是一款 Chrome 浏览器扩展 + Web App，用于在 AI 设计平台的输入框中一键插入预设提示词模板。

**Core Value:** 保存常用提示词，创作时一键插入，不再重复输入。

**Supported Platforms:** Lovart、ChatGPT、Claude.ai、Gemini、LibLib、即梦、Kimi、星流（可扩展）

**Components:**
- **Extension** - Chrome Extension（开源）— 页面内一键插入、侧边栏管理
- **Web App** - Next.js Web App（闭源）— 官网、云同步、用户认证
- **Shared** - 共享类型定义（开源）— TypeScript 类型、常量

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Oh My Prompt System                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Chrome Extension (MV3)                            │   │
│  ├──────────────────┬──────────────────┬───────────────────────────────┤   │
│  │   Content Script │   Background     │      Popup/Sidepanel           │   │
│  │   (Shadow DOM)   │   Service Worker │      (React + Tailwind)        │   │
│  │                  │                  │                                │   │
│  │  ┌─────────────┐ │  ┌─────────────┐ │  ┌───────────────────────────┐ │   │
│  │  │ Coordinator │ │  │ Message     │ │  │ Backup Management         │ │   │
│  │  │ Detector    │ │  │ Routing     │ │  │ Prompt CRUD               │ │   │
│  │  │ Injector    │ │  │ Storage Ops │ │  │ Import/Export             │ │   │
│  │  │ Dropdown UI │ │  │ Sync Manager│ │  │ Resource Library          │ │   │
│  │  │ Vision Modal│ │  │ Cloud Auth  │ │  │ Provider Config           │ │   │
│  │  └─────────────┘ │  └─────────────┘ │  └───────────────────────────┘ │   │
│  │        ↓         │        ↓         │          ↓                     │   │
│  │  Platform Config │  chrome.storage  │   chrome.storage.local         │   │
│  │  (多平台策略)    │  .local          │                                │   │
│  └──────────────────┴──────────────────┴───────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Web App (Next.js 16)                             │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────────────┐ │   │
│  │  │ Home Page   │  │ Dashboard   │  │ API Routes                    │ │   │
│  │  │ (Marketing) │  │ (Cloud Sync)│  │ /api/sync/upload/download     │ │   │
│  │  │             │  │             │  │ /api/auth/extension/callback  │ │   │
│  │  └─────────────┘  └─────────────┘  └───────────────────────────────┘ │   │
│  │        ↓                ↓                    ↓                        │   │
│  │  Static Assets    Supabase Auth        Supabase Database             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Shared Package (Types)                           │   │
│  │  types/prompt.ts, storage.ts, vision.ts, sync.ts, messages.ts       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Extension Components

| Context | DOM Access | Storage Access | Responsibilities |
|---------|------------|----------------|------------------|
| Content Script | Yes (host page) | Via messaging | UI injection, prompt insertion |
| Background | No | Direct | Storage ops, sync, message routing, cloud auth |
| Popup/Sidepanel | Own DOM | Direct | Prompt management, backup UI, provider config |

## Web App Components

| Component | Purpose |
|-----------|---------|
| Home Page | Marketing, SEO, download links |
| Dashboard | Cloud sync status, user settings |
| API Routes | Extension → Supabase bridge (auth, sync) |
| Supabase | PostgreSQL database, OAuth authentication

## Data Model

### StorageSchema (single key: `prompt_script_data`)

```typescript
interface StorageSchema {
  version: string              // 数据版本（从 manifest 动态读取）
  userData: UserData           // 用户数据（嵌套结构）
  settings: SyncSettings       // 同步和显示设置
  temporaryPrompts?: Prompt[]  // 临时库提示词（独立存储）
  _migrationComplete?: boolean // 防止重复迁移
}

interface UserData {
  prompts: Prompt[]            // 用户提示词列表
  categories: Category[]       // 用户分类列表
}

interface Category {
  id: string
  name: string
  nameEn?: string              // 英文名称（双语支持）
  order: number
}

interface Prompt {
  id: string
  categoryId: string
  name: string
  nameEn?: string              // 英文名称（双语支持）
  content: string
  contentEn?: string           // 英文内容（双语支持）
  description?: string         // 可选描述
  descriptionEn?: string       // 英文描述
  order: number                // 分类内排序
  localImage?: string          // 本地图片路径
  remoteImageUrl?: string      // 原始网络 URL
}

interface SyncSettings {
  showBuiltin: boolean         // 显示资源库引用
  syncEnabled: boolean         // 本地文件夹同步开关
  lastSyncTime?: number        // 最后同步时间
  hasUnsyncedChanges?: boolean // 未同步变更标记
  dismissedBackupWarning?: boolean
  resourceLanguage?: 'zh' | 'en'
  visionEnabled?: boolean      // Vision 功能开关
  visionDefaultFormat?: 'natural' | 'json'
}
```

### ProviderConfigs (Multi-provider Vision API)

```typescript
interface ProviderConfigsStorage {
  configs: ProviderConfig[]    // 多 Provider 配置
  activeConfigId: string       // 当前激活的配置 ID
}

interface ProviderConfig {
  providerId: string
  apiKey: string
  apiEndpoint: string
  apiFormat: 'chat_completions' | 'messages'  // OpenAI 或 Anthropic 格式
  selectedModel: string
}
```

## Platform Configuration System

每个平台在 `src/content/platforms/{platform}/` 定义配置：

```typescript
interface PlatformConfig {
  id: string
  name: string
  urlPatterns: UrlPattern[]  // URL 匹配规则
  inputDetection: {          // 输入框检测
    selectors: string[]
    debounceMs?: number
  }
  uiInjection: {             // UI 注入位置
    anchorSelector: string
    position: 'before' | 'after' | 'prepend' | 'append'
  }
  strategies?: {             // 自定义策略（可选）
    inserter?: InsertStrategy
    detector?: DetectStrategy
  }
}
```

### Add New Platform

1. 创建 `src/content/platforms/{platform}/config.ts`
2. 实现 `PlatformConfig` 接口
3. 在 `src/content/platforms/registry.ts` 注册

大多数平台使用 `DefaultInserter`。Lexical/ProseMirror 编辑器需要自定义策略。

## Key Features

### 1. Prompt Insertion (Content Script)

- **Detection:** MutationObserver + History API interception
- **UI:** Shadow DOM isolated dropdown
- **Insertion:** `execCommand('insertText')` + React event dispatch

### 2. Vision API Integration (Multi-provider)

- **Trigger:** 右键菜单 "转提示词" 或图片悬停按钮
- **Providers:** OpenAI GPT-4V, Anthropic Claude Vision, 自定义 Provider
- **Flow:** 图片 → Vision API → 提示词 → 插入输入框/临时库
- **Config:** 多 Provider 配置存储，支持切换

### 3. Local Folder Backup

- **API:** File System Access API
- **Persistence:** IndexedDB (folder handle)
- **Files:** `omps-latest.json` + `omps-backup-{timestamp}.json`
- **Auto-restore:** 扩展更新后自动恢复文件夹权限

### 4. Cloud Sync (Supabase)

- **Auth:** OAuth (Google, GitHub) via Extension → Web App callback
- **API Routes:** `/api/sync/upload`, `/api/sync/download`, `/api/sync/status`
- **Storage:** Supabase PostgreSQL (prompts, categories, temporary_prompts)
- **Flow:** Extension storage → Web App API → Supabase

#### Sync Entry and Identity Policy

- Auto-sync entry is `SET_STORAGE -> debouncedTriggerSync -> SyncOrchestrator.triggerSync`.
- Sync dedupe state is persisted in `syncStatus.guard` so MV3 service-worker restarts do not erase upload guards.
- Identity is ID-first; `name` is display-only and must not merge entities.
- Legacy personal duplicates are handled only by explicit typed `idAliasMap` entries.

### 5. Temporary Library

- **Purpose:** Vision 生成的提示词独立存储
- **Storage:** `temporaryPrompts` in StorageSchema
- **Transfer:** 可转移到永久分类

## Communication Patterns

| Sender | Receiver | Method |
|--------|----------|--------|
| Content → Background | Storage ops | `chrome.runtime.sendMessage` |
| Popup → Content | Refresh UI | `chrome.tabs.sendMessage` |
| Background → All | Storage changed | Native `chrome.storage.onChanged` |
| Extension → Web App | Cloud sync, OAuth | HTTP fetch to `api/*` routes |
| Web App → Supabase | Database ops | Supabase SDK |

Message types defined in `packages/shared/messages.ts` (MessageType enum, 50+ types).

## Security Constraints

- **No remote code execution:** CSP blocks `eval()`, inline scripts
- **API keys:** Stored in `chrome.storage.local`, never transmitted to third parties
- **Images:** Base64 stored locally, 5MB limit per image

## Build System

### Extension
- **Toolchain:** Vite + @crxjs/vite-plugin
- **Output:** `packages/extension/dist/` directory
- **Manifest:** Root `manifest.json`, transformed by CRX plugin

### Web App
- **Toolchain:** Next.js 16
- **Output:** `packages/web-app/.next/` (dev), deployed to Vercel
- **API:** Server-side routes for sync and auth
- **Repo:** `packages/web-app` is a git submodule (`wk240/oh-my-prompt-web-app`)
- **Deployment:** Manual (`vercel deploy --prod`), auto-deploy disabled via `vercel.json`

### Shared
- **TypeScript:** Shared types imported by both Extension and Web App
- **Path alias:** `@oh-my-prompt/shared/types`

---

*Last updated: 2026-05-20*
