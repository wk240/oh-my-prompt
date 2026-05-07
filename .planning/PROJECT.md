# Lovart Prompt Injector

## What This Is

一个Chrome浏览器插件，用于在AI设计/绘图平台的输入框中一键插入预设的提示词模板。支持多平台（Lovart、ChatGPT、Claude.ai、Gemini、LibLib、即梦等），用户通过输入框旁的下拉菜单选择提示词，提示词按用途分类管理，支持内置编辑和数据导入导出。插件已发布v1.3版本，完整实现核心功能和 Vision API 图片转提示词功能。

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

**Shipped v1.3.0:** 12,000+ LOC TypeScript + React. Chrome Extension Manifest V3.
Tech stack: Vite, @crxjs/vite-plugin, React, Zustand, Shadow DOM.
Supported platforms: Lovart, ChatGPT, Claude.ai, Gemini, LibLib, 即梦, Kimi, 星流.

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
| 多平台架构 (v1.3) | 可扩展支持更多AI平台 | ✓ Good |
| 右键菜单图片转提示词 (v1.3) | Vision API赋能新场景 | ✓ Good |

---
*Last updated: 2026-04-28 after v1.3.0 milestone initialization*

## Current Milestone: v2.0 网络版 + 团队协作

**Goal:** 将Oh My Prompt从单一Chrome Extension扩展为Extension + Web App混合架构，提供团队共享提示词库、云端同步、订阅付费功能。

**Target features:**

1. **用户认证系统**
   - 邮箱注册登录
   - Google OAuth
   - Extension账号关联

2. **云端存储与同步**
   - Extension与云端双向自动同步
   - 个人提示词库跨设备同步
   - 团队共享提示词库

3. **团队协作**
   - 团队创建与管理
   - 角色分级权限（管理员/编辑者/成员）
   - 付费团队不限人数

4. **订阅付费**
   - 免费版：个人使用
   - 付费版（¥9/月或¥99/年）：团队功能 + Vision API额度 + 云存储空间 + 优先客服
   - 国内支付（微信/支付宝）+ 国际支付双轨

5. **Web App管理界面**
   - 提示词库管理
   - 团队管理
   - 订阅管理
   - 账户设置

**Key context:**
- Extension仍是快捷插入主入口
- Web App作为后台管理界面
- 定价策略：低价走量（¥9/月）
- 核心价值：团队共享提示词库

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