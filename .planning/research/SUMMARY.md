# Project Research Summary

**Project:** Lovart Prompt Injector
**Domain:** Chrome Extension (Manifest V3) / Prompt Management
**Researched:** 2026-04-16
**Confidence:** HIGH

## Executive Summary

Lovart Prompt Injector是一个Chrome浏览器插件，用于在Lovart AI设计平台的输入框中一键插入预设提示词。基于Chrome Extension Manifest V3标准，采用TypeScript + React + Vite技术栈构建。

核心架构包括三个主要组件：Content Script（注入Lovart页面，检测输入框并显示下拉UI）、Service Worker（协调组件通信，处理存储操作）、Popup（提示词管理界面）。数据通过chrome.storage.local本地持久化，用户可通过导入导出JSON实现跨设备同步。

主要风险包括：Manifest V3迁移陷阱（避免使用V2模式）、Content Script存储访问限制（需通过消息路由）、DOM注入时机问题（SPA动态渲染导致元素延迟出现）、CSS样式冲突（需使用Shadow DOM隔离）、存储配额限制（10MB上限）。

## Key Findings

### Recommended Stack

基于Chrome Extension Manifest V3的最新标准，推荐使用TypeScript作为主语言，Vite配合@crxjs/vite-plugin作为构建工具，React用于UI组件开发，Zustand进行状态管理，chrome.storage.local进行数据持久化。

**Core technologies:**
- **TypeScript 5.x:** 类型安全，IDE支持完善 — 扩展开发标准选择
- **Vite 6.x + @crxjs/vite-plugin:** 快速HMR，原生ES模块，专为扩展优化
- **React 19.x:** 组件化开发，Shadow DOM兼容 — 管理UI和下拉组件
- **Zustand 5.x:** 轻量状态管理，无Provider依赖 — Popup状态管理
- **chrome.storage.local:** 原生API，同步访问，配额充足（10MB） — 提示词数据存储

### Expected Features

基于AIPRM、PromptPerfect等提示词管理扩展的分析，用户期望的核心功能包括：

**Must have (table stakes):**
- 提示词选择UI — 用户需要看到并选择提示词
- 一键插入 — 核心价值，直接插入输入框
- 分类组织 — 结构化组织提示词
- 增删改提示词 — 基础管理能力
- 本地持久化 — 数据跨会话保存
- 导入导出JSON — 无后端跨设备同步

**Should have (competitive):**
- 搜索过滤 — 大量提示词时的查找便利
- 键盘快捷键 — 效率用户需求
- 收藏/固定 — 快速访问常用提示词

**Defer (v2+):**
- 提示词模板/变量 — 动态提示词占位符替换
- 暗色模式 — 视觉偏好
- 拖拽排序 — 可视化分类管理

### Architecture Approach

标准Chrome Extension架构，包含三个隔离的执行上下文：

**Major components:**
1. **Content Script** — 运行在Lovart页面上下文，负责：检测输入框元素、渲染Shadow DOM隔离的下拉UI、执行提示词插入
2. **Service Worker** — 扩展后台协调器，负责：消息路由、存储操作、导入导出处理
3. **Popup** — 扩展管理界面，负责：分类列表、提示词编辑器、导入导出UI

通信模式：Content Script ↔ Service Worker（chrome.runtime.sendMessage）、Popup ↔ Storage（直接API）、Popup ↔ Content Script（chrome.tabs.sendMessage）。

### Critical Pitfalls

1. **Manifest V2模式在V3中使用** — 确保manifest.json使用service_worker而非background.scripts，避免远程代码加载
2. **Content Script直接访问存储** — Content Script无法直接使用chrome.storage，需通过消息请求Service Worker代理
3. **DOM注入时机问题** — Lovart作为SPA动态渲染，需用MutationObserver监听元素创建而非假设元素已存在
4. **CSS与宿主页面冲突** — 使用Shadow DOM完全隔离样式，避免污染Lovart页面
5. **事件分发未触发Lovart响应** — 仅设置value不够，需分发input/change事件让React框架感知变化

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Manifest Setup
**Rationale:** 所有后续开发的基础，必须首先正确配置Manifest V3和项目结构
**Delivers:** 可加载的扩展骨架、消息通信基础设施、存储访问验证
**Addresses:** Manifest V2陷阱、Content Script存储访问陷阱
**Avoids:** Pitfall 1 (V2 patterns), Pitfall 2 (storage access)

### Phase 2: Lovart Integration & Content Script
**Rationale:** 核心功能实现，Content Script注入并检测Lovart输入框
**Delivers:** 下拉UI显示、输入框检测、提示词插入
**Uses:** React, Shadow DOM, MutationObserver
**Implements:** Content Script组件（InputDetector, Dropdown, InsertHandler）
**Avoids:** Pitfall 3 (timing), Pitfall 4 (CSS conflicts), Pitfall 6 (event dispatch)

### Phase 3: Storage & Data Management
**Rationale:** 数据持久化和管理，让用户能够保存和管理提示词
**Delivers:** 提示词CRUD、分类管理、导入导出
**Uses:** chrome.storage.local, Zustand
**Implements:** Service Worker storage handlers, Popup management UI
**Avoids:** Pitfall 5 (quota), Import validation

### Phase 4: Polish & UX Enhancement
**Rationale:** 完善用户体验，添加搜索、键盘快捷键等增强功能
**Delivers:** 搜索过滤、收藏固定、键盘快捷键、空状态处理
**Uses:** Virtualized lists (可选，大数据量时)

### Phase Ordering Rationale

- Phase 1先于Phase 2：消息通信是Content Script获取数据的前提
- Phase 2先于Phase 3：用户先能看到基本功能，再添加管理能力
- Phase 3先于Phase 4：数据管理是增强功能的基础
- Pitfall prevention映射到每个阶段，在开发时就避免问题

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Lovart输入框元素结构需实际页面分析，选择器可能需调整
- **Phase 2:** Lovart事件响应机制需实际测试验证

Phases with standard patterns (skip research-phase):
- **Phase 1:** Manifest V3配置有标准模板
- **Phase 3:** 存储和导入导出是通用模式
- **Phase 4:** 搜索和UI增强是常见功能

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Vite + React + TypeScript是2025年扩展开发标准 |
| Features | HIGH | 参考同类产品AIPRM、PromptPerfect的功能设计 |
| Architecture | HIGH | Manifest V3标准架构，Shadow DOM隔离模式成熟 |
| Pitfalls | HIGH | 官方文档明确V3限制，社区有大量迁移经验 |

**Overall confidence:** HIGH

### Gaps to Address

- **Lovart元素选择器:** 需在实际页面分析输入框结构，选择器可能需动态适配
- **Lovart事件机制:** 需实际测试确定需要分发哪些事件才能触发响应
- **Lovart页面变化:** SPA可能在加载过程中重新渲染，需处理动态变化

---

*Research completed: 2026-04-16*
*Ready for roadmap: yes*