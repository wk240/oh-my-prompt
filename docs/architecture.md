# Architecture Overview

> **受众:** 开发者接手本项目、贡献者理解系统设计

## Project Identity

**Oh My Prompt** 是一款 Chrome 浏览器扩展，用于在 AI 设计平台的输入框中一键插入预设提示词模板。

**Core Value:** 保存常用提示词，创作时一键插入，不再重复输入。

**Supported Platforms:** Lovart、ChatGPT、Claude.ai、Gemini、LibLib、即梦、Kimi、星流（可扩展）

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                    │
├──────────────────┬──────────────────┬───────────────────────┤
│   Content Script │   Background     │      Popup/Sidepanel   │
│   (Shadow DOM)   │   Service Worker │      (React + Tailwind)│
│                  │                  │                        │
│  ┌─────────────┐ │  ┌─────────────┐ │  ┌───────────────────┐ │
│  │ Coordinator │ │  │ Message     │ │  │ Backup Management │ │
│  │ Detector    │ │  │ Routing     │ │  │ Prompt CRUD       │ │
│  │ Injector    │ │  │ Storage Ops │ │  │ Import/Export     │ │
│  │ Dropdown UI │ │  │ Sync Manager│ │  │ Resource Library  │ │
│  │ Vision Modal│ │  │             │ │  │                   │ │
│  └─────────────┘ │  └─────────────┘ │  └───────────────────┘ │
│        ↓         │        ↓         │          ↓             │
│  Platform Config │  chrome.storage  │   chrome.storage.local │
│  (多平台策略)    │  .local          │                        │
└──────────────────┴──────────────────┴───────────────────────┘
```

## Three-Part Extension

| Context | DOM Access | Storage Access | Responsibilities |
|---------|------------|----------------|------------------|
| Content Script | Yes (host page) | Via messaging | UI injection, prompt insertion |
| Background | No | Direct | Storage ops, sync, message routing |
| Popup/Sidepanel | Own DOM | Direct | Prompt management, backup UI |

## Data Model

### StorageSchema (single key: `prompt_script_data`)

```typescript
interface StorageSchema {
  version: string           // 数据版本
  categories: Category[]    // 分类列表
  prompts: Prompt[]         // 提示词列表
  settings: Settings        // 用户设置
  visionApiConfig?: VisionApiConfig  // Vision API 配置
}

interface Category {
  id: string
  name: string
  order: number
  createdAt: string
}

interface Prompt {
  id: string
  categoryId: string
  title: string
  content: string
  order: number
  imageId?: string  // 缩略图 ID
  imageB64?: string // Base64 图片数据
  createdAt: string
  updatedAt: string
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

### 2. Vision API Integration (v1.3.0)

- **Trigger:** 右键菜单 "转提示词"
- **Providers:** OpenAI GPT-4V, Anthropic Claude Vision
- **Flow:** 图片 → Vision API → 提示词 → 插入输入框/剪贴板

### 3. Local Folder Backup

- **API:** File System Access API
- **Persistence:** IndexedDB (folder handle)
- **Files:** `omps-latest.json` + `omps-backup-{timestamp}.json`

## Communication Patterns

| Sender | Receiver | Method |
|--------|----------|--------|
| Content → Background | Storage ops | `chrome.runtime.sendMessage` |
| Popup → Content | Refresh UI | `chrome.tabs.sendMessage` |
| Background → All | Storage changed | Native `chrome.storage.onChanged` |

Message types defined in `src/shared/messages.ts` (MessageType enum).

## Security Constraints

- **No remote code execution:** CSP blocks `eval()`, inline scripts
- **API keys:** Stored in `chrome.storage.local`, never transmitted to third parties
- **Images:** Base64 stored locally, 5MB limit per image

## Build System

- **Toolchain:** Vite + @crxjs/vite-plugin
- **Output:** `dist/` directory
- **Manifest:** Root `manifest.json`, transformed by CRX plugin

---

*Last updated: 2026-05-06*