# Roadmap: Lovart Prompt Injector

**Created:** 2026-04-16
**Granularity:** Standard
**Phases:** 4

---

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Foundation | 可加载的扩展骨架和通信基础设施 | EXT-01, EXT-04 | 3 |
| 2 | Lovart Integration | Content Script注入Lovart，下拉UI显示，提示词插入 | CORE-01~04, EXT-02~03 | 4 |
| 3 | Data Management | 提示词CRUD、分类管理、导入导出 | MGMT-01~06, DATA-01~04 | 5 |
| 4 | Polish & Testing | 端到端测试、错误处理、边界情况 | - | 4 |

**Total requirements mapped:** 18
**Unmapped:** 0 ✓

---

## Phase 1: Foundation & Manifest Setup

**Goal:** 建立可加载的Chrome扩展骨架，配置Manifest V3，实现基础消息通信

**Requirements:**
- EXT-01: 扩展仅在Lovart平台页面激活
- EXT-04: 扩展图标显示在浏览器工具栏

**Deliverables:**
- Manifest.json (V3格式)
- 项目结构 (TypeScript + Vite + React)
- Service Worker骨架（消息路由）
- Content Script骨架（空注入）
- Popup骨架（空界面）
- 扩展可成功加载到Chrome

**Success Criteria:**
1. 扩展在Chrome中成功加载，无manifest错误
2. 扩展仅在Lovart域名激活（content_scripts匹配规则正确）
3. Service Worker能接收并响应消息
4. Popup界面可打开（即使为空）

**Avoids Pitfalls:**
- Pitfall 1: Manifest V2模式 — 使用正确的V3格式
- Pitfall 2: Content Script存储访问 — 建立消息路由基础设施

**UI hint:** no

---

## Phase 2: Lovart Integration & Content Script

**Goal:** Content Script检测Lovart输入框，显示下拉菜单，实现提示词一键插入

**Requirements:**
- CORE-01: 用户可在Lovart输入框旁看到下拉菜单按钮
- CORE-02: 用户可通过下拉菜单选择预设提示词
- CORE-03: 用户选择提示词后可一键插入到Lovart输入框
- CORE-04: Lovart平台识别插入的提示词
- EXT-02: Lovart页面样式不受扩展影响
- EXT-03: 下拉菜单样式美观

**Deliverables:**
- InputDetector: MutationObserver检测输入框
- Dropdown UI: Shadow DOM隔离的下拉菜单
- InsertHandler: 插入提示词并分发事件
- 预设示例提示词数据
- 下拉菜单样式（CSS）

**Success Criteria:**
1. Lovart页面加载后，输入框旁出现下拉按钮
2. 点击按钮显示下拉菜单，列出示例提示词
3. 选择提示词后，文本插入到Lovart输入框
4. Lovart submit按钮激活（识别输入变化）
5. Lovart页面原有样式无变化

**Avoids Pitfalls:**
- Pitfall 3: DOM注入时机 — MutationObserver处理SPA延迟渲染
- Pitfall 4: CSS冲突 — Shadow DOM完全隔离
- Pitfall 6: 事件分发 — 正确dispatch input/change事件

**UI hint:** yes

---

## Phase 3: Data Management & Popup UI

**Goal:** 实现提示词CRUD、分类管理、导入导出功能

**Requirements:**
- MGMT-01: 用户可按用途分类管理提示词模板
- MGMT-02~04: 用户可新增、编辑、删除提示词
- MGMT-05~06: 用户可新增、删除分类
- DATA-01: 提示词数据本地持久化存储
- DATA-02~04: 导入导出JSON，格式验证

**Deliverables:**
- Popup管理界面（分类列表、提示词编辑器）
- Storage Manager（chrome.storage.local操作）
- Import/Export handler（JSON处理）
- Zustand状态管理
- 空状态UI处理
- 默认分类逻辑

**Success Criteria:**
1. Popup显示分类列表和提示词列表
2. 用户可新增/编辑/删除提示词，数据持久化
3. 用户可新增/删除分类
4. 用户可导出JSON文件，包含所有数据
5. 用户可导入JSON文件，数据正确恢复
6. 无效JSON导入时显示错误提示

**Avoids Pitfalls:**
- Pitfall 5: 存储配额 — 监控数据大小，提供警告

**UI hint:** yes

---

## Phase 4: Polish & End-to-End Testing

**Goal:** 完善错误处理、边界情况，进行完整功能测试

**Requirements:**
- 无新增需求，验证已有需求的完整性

**Deliverables:**
- 错误处理和提示UI
- 边界情况处理（空数据、大数据量）
- 端到端测试流程
- 用户指南（README）
- 扩展打包（.crx准备）

**Success Criteria:**
1. Lovart页面刷新/导航后扩展仍正常工作
2. 删除最后一个分类时有合理处理
3. 导入大量数据时无性能问题
4. 所有18个需求功能点验证通过
5. README包含安装和使用说明

**UI hint:** no

---

## Phase Dependencies

```
Phase 1 (Foundation)
    └──required by──> Phase 2 (Lovart Integration)
                         └──required by──> Phase 3 (Data Management)
                                              └──required by──> Phase 4 (Polish)
```

Phase ordering rationale:
- Phase 1 establishes message routing required by Phase 2
- Phase 2 provides input injection target for Phase 3 prompts
- Phase 3 manages data that Phase 2 displays
- Phase 4 validates all previous phases

---

## Research Flags

**Phase 2 needs investigation:**
- Lovart输入框元素结构 — 需实际页面分析确定选择器
- Lovart事件响应机制 — 需测试确定需dispatch哪些事件

**Standard patterns (no additional research):**
- Phase 1: Manifest V3 template
- Phase 3: Storage CRUD pattern
- Phase 4: Testing methodology

---

*Roadmap created: 2026-04-16*
*Total phases: 4*
*Total requirements: 18*