# Lovart Prompt Injector

## What This Is

一个Chrome浏览器插件，用于在Lovart AI设计/绘图平台的输入框中一键插入预设的提示词模板。用户通过输入框旁的下拉菜单选择提示词，提示词按用途分类管理，支持内置编辑和数据导入导出。插件已发布v1.0版本，完整实现核心功能。

## Core Value

一键插入预设提示词，提升Lovart平台创作效率。

## Requirements

### Validated

- ✓ 用户可在Lovart输入框旁看到下拉菜单按钮 — v1.0
- ✓ 用户可通过下拉菜单选择并插入预设提示词 — v1.0
- ✓ 用户可按用途分类管理提示词模板 — v1.0
- ✓ 用户可在插件内新增、编辑、删除提示词 — v1.0
- ✓ 用户可导出提示词数据为JSON文件 — v1.0
- ✓ 用户可导入JSON文件恢复提示词数据 — v1.0
- ✓ 插件数据本地持久化存储 — v1.0
- ✓ Lovart平台识别插入的提示词 — v1.0
- ✓ 下拉菜单样式美观且与Lovart风格协调 — v1.0
- ✓ 扩展仅在Lovart平台页面激活 — v1.0

### Active

(None — all v1 requirements validated)

### Out of Scope

- 云端自动同步 — 用户选择手动导入导出即可满足跨设备需求 ✓ Still valid
- Firefox支持 — 初期专注Chrome系浏览器，后续可扩展 ✓ Still valid
- 多人/团队协作 — 个人使用场景 ✓ Still valid
- 使用历史/统计功能 — 基础功能优先 ✓ Still valid
- 实时协作编辑 — 个人本地使用 ✓ Still valid
- AI自动生成提示词 — API成本不可控，质量不稳定 ✓ Still valid

## Context

**平台背景：** Lovart是一个AI设计/绘图平台，用户通过输入提示词来生成图像。提示词的质量和结构直接影响生成效果。

**用户痛点：** 设计师/创作者经常需要使用固定的风格模板、技术参数等提示词，每次手动输入重复内容效率低。现有方案可能是复制粘贴外部文档，不够便捷。

**目标用户：** 个人创作者，在多台设备上使用Lovart平台。

**提示词内容类型：** 风格描述、主题设定、技术参数（光照、角度、构图）、质量/尺寸设定等模板化内容。

**Shipped v1.0:** 12,000 LOC TypeScript + React. Chrome Extension Manifest V3.
Tech stack: Vite, @crxjs/vite-plugin, React, Zustand, Shadow DOM.

## Constraints

- **Tech stack:** Chrome Extension (Manifest V3) — 现代Chrome插件标准 ✓ Implemented
- **平台依赖:** 需适配Lovart平台的页面结构和输入框元素 ✓ Implemented via MutationObserver
- **数据存储:** chrome.storage.local 本地存储，容量有限制 ✓ Implemented
- **浏览器支持:** Chrome/Edge/Brave等Chromium系浏览器 ✓ Supported

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + Vite + React | 2025 Chrome Extension标准栈 | ✓ Good |
| Shadow DOM隔离 | 避免CSS冲突 | ✓ Good |
| 手动导入导出同步 | 无需后端开发，MVP最快实现 | ✓ Good |
| 按用途分类管理 | 符合用户心智模型，便于查找 | ✓ Good |
| Lightning bolt图标 | 暗示"快速/一键"效率价值 | ✓ Good |
| MutationObserver检测 | 处理SPA动态渲染 | ✓ Good |
| History API interception | SPA导航检测更可靠 | ✓ Good |
| Toast on CRUD actions | 用户操作反馈 | ✓ Good |
| Large dataset limit (100) | 下拉性能优化 | ✓ Good |
| 插入后保持下拉打开 | 支持连续插入多个提示词 | ✓ Good |

---
*Last updated: 2026-04-19 after v1.1.0 milestone initialization*

## Current Milestone: v1.1.0 网络提示词数据源接入

**Goal:** 实时接入GitHub开源Prompt数据源，用户可在线浏览、搜索、收藏网络提示词

**Target features:**
- 下拉菜单增加"在线库"入口，实时浏览Nano Banana数据源
- 支持在线搜索/分类筛选网络prompts
- 用户选择收藏的prompt自动缓存到本地，离线可用
- 预留数据源扩展接口架构（方便未来接入更多数据源）
- 优先接入 Nano Banana (900+ 图像生成prompts)

**Key context:**
- 实时调用GitHub raw文件或API获取数据
- Chrome Extension CSP限制：需通过background service worker代理网络请求
- 本地缓存已收藏prompts到chrome.storage.local
- 数据源接口需要抽象设计，便于扩展

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state