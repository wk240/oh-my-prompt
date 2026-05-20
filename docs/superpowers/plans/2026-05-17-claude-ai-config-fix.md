# Claude.ai 平台配置修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新 Claude.ai 平台配置以适配新版 UI，使触发按钮能正确注入。

**Architecture:** 直接修改 `claude-ai/config.ts`，更新输入检测选择器和 UI 注入锚点选择器。

**Tech Stack:** TypeScript, Chrome Extension

---

### Task 1: 更新 Claude.ai 配置文件

**Files:**
- Modify: `packages/extension/src/content/platforms/claude-ai/config.ts`

- [ ] **Step 1: 更新配置文件**

修改输入检测选择器，添加 `data-testid` 作为优先选择器；更新 UI 注入锚点使用 `aria-label` 属性。

```typescript
/**
 * Claude.ai Platform Config
 */

import type { PlatformConfig } from '../base/types'

export const claudeAiConfig: PlatformConfig = {
  id: 'claude-ai',
  name: 'Claude.ai',

  urlPatterns: [
    { type: 'domain', value: 'claude.ai' },
  ],

  inputDetection: {
    selectors: [
      'div[data-testid="chat-input"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      '.ProseMirror[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: 'button[aria-label="Add files, connectors, and more"]',
    position: 'before',
  },
}
```

- [ ] **Step 2: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交修改**

```bash
git add packages/extension/src/content/platforms/claude-ai/config.ts
git commit -m "fix: update Claude.ai platform config for new UI"
```

---

### Task 2: 验证功能

**Files:**
- 无文件修改，仅测试验证

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`

- [ ] **Step 2: 在 Chrome 中加载扩展**

1. 打开 `chrome://extensions`
2. 启用开发者模式
3. 加载 `packages/extension/dist/` 目录

- [ ] **Step 3: 访问 Claude.ai 测试页面**

1. 打开 `https://claude.ai/chat/` 或任意对话页面
2. 确认输入框被检测到（可通过 console 日志 `[Oh My Prompt] Input detected` 确认）
3. 确认触发按钮出现在"添加文件"按钮左侧
4. 点击触发按钮，选择提示词，确认能正确插入到输入框

---

**Spec Coverage:**
- 输入检测选择器更新 ✓ Task 1
- UI 注入锚点更新 ✓ Task 1
- 测试验证 ✓ Task 2

**No Placeholders:** 已检查，无 TBD/TODO 等占位符。