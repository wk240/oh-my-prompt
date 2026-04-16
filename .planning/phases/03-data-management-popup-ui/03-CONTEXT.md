# Phase 3: Data Management & Popup UI - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

实现提示词CRUD、分类管理、导入导出功能。Popup作为管理界面，用户在此新增、编辑、删除提示词和分类。这是数据管理阶段，不涉及Lovart页面Content Script修改（Phase 2已实现）或错误处理完善（Phase 4）。

</domain>

<decisions>
## Implementation Decisions

### Popup布局结构
- **D-01:** 左侧分类侧边栏(~80px) + 右侧提示词列表(~220px)，总宽度300px
- **D-02:** 分类侧边栏显示纯文本分类名，无图标，选中状态使用accent色高亮
- **D-03:** 提示词列表为卡片样式，每个卡片显示名称+内容预览(~50字符截断)

### 提示词编辑方式
- **D-04:** 点击卡片不触发编辑，仅三点菜单内「编辑」选项触发编辑Dialog
- **D-05:** 编辑Dialog包含名称input、内容textarea、所属分类下拉，底部「保存」+「取消」按钮
- **D-06:** 删除通过三点菜单内「删除」选项触发，弹出确认Dialog
- **D-07:** 三点菜单(DropdownMenu)位于卡片右侧，包含「编辑」「删除」两个选项

### 导入导出交互
- **D-08:** 导入/导出图标按钮位于顶部标题栏右侧(与标题同一行)
- **D-09:** 导入流程：点击图标→Chrome文件选择器→解析JSON→格式验证→成功保存并刷新列表/失败显示Toast"导入失败，JSON格式不正确"
- **D-10:** 导出格式为StorageSchema结构(prompts、categories、version字段)，文件名 lovart-prompts-{YYYY-MM-DD}.json
- **D-11:** 导出流程：点击图标→直接触发chrome.downloads.download API→文件保存到用户默认下载目录

### 空状态和边界处理
- **D-12:** 空状态显示插图+提示文字"暂无提示词，点击下方「添加提示词」创建第一个模板"+底部「添加提示词」按钮
- **D-13:** 「添加提示词」按钮固定在Popup底部，始终可见
- **D-14:** 「添加分类」按钮位于分类列表底部，点击弹出添加Dialog(分类名字段)
- **D-15:** 删除最后分类时，其提示词自动移至默认分类，删除后自动选中新默认分类
- **D-16:** 系统预创建"默认"分类(id: "default")，不可删除、不可编辑名称

### Claude's Discretion
以下方面使用标准Chrome Extension Popup模式，无需用户决策：
- **卡片hover/active状态样式** — 遵循shadcn/ui默认交互状态
- **Toast持续时间** — 标准3-4秒自动消失
- **确认Dialog文案** — 遵循UI-SPEC定义的Delete确认文案
- **ScrollArea滚动行为** — 遵循shadcn/ui ScrollArea默认行为
- **分类列表滚动** — 分类数量超过可视区域时启用滚动

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chrome Extension Patterns
- No external specs — requirements fully captured in decisions above

### Project Context
- `.planning/PROJECT.md` — 项目愿景、约束、核心价值
- `.planning/REQUIREMENTS.md` — MGMT-01~06, DATA-01~04需求定义
- `.planning/ROADMAP.md` — Phase 3目标、交付物、成功标准、Pitfall避坑指南
- `.planning/phases/03-data-management-popup-ui/03-UI-SPEC.md` — UI设计合约（shadcn组件、spacing scale、copywriting）

### Prior Phase Context
- `.planning/phases/01-foundation-manifest-setup/01-CONTEXT.md` — Lovart域名匹配决策（*.lovart.ai/*）、消息架构
- `.planning/phases/02-lovart-integration-content-script/02-CONTEXT.md` — Shadow DOM隔离、闪电图标、插入行为、光标位置插入

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/types.ts` — Prompt、Category、StorageSchema interfaces已定义，Phase 3可直接使用
- `src/shared/messages.ts` — GET_STORAGE、SET_STORAGE MessageType已定义，Storage访问消息协议已建立
- `src/content/sample-data.ts` — SAMPLE_PROMPTS、SAMPLE_CATEGORIES数据结构可作为默认数据模板
- `manifest.json` — Popup入口已配置，Phase 3填充实际内容

### Established Patterns
- Message protocol: chrome.runtime.sendMessage用于Content Script与Service Worker通信
- TypeScript strict mode: 使用underscore前缀处理unused parameters
- Console log prefix: `[Lovart Injector]`作为日志标识
- shadcn/ui: UI-SPEC已确认使用shadcn组件库

### Integration Points
- Popup (`src/popup/`)将从骨架扩展为完整管理界面
- Service Worker (`src/background/service-worker.ts`)需新增GET_STORAGE/SET_STORAGE消息处理
- Content Script下拉菜单(Phase 2)将从Storage读取实际提示词数据，不再使用SAMPLE_PROMPTS
- Storage Manager需实现chrome.storage.local CRUD操作

</code_context>

<specifics>
## Specific Ideas

- 点击卡片不直接编辑，避免误触发编辑操作
- 导入/导出放在顶部节省底部空间，但图标需明确含义
- 默认分类不可删除，保证删除其他分类时有接收目标

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Scope creep items noted:
- 提示词搜索/过滤功能 — 属于v2 UX-01，不在Phase 3范围
- 提示词拖拽排序 — 属于v2 VIS-02，不在Phase 3范围
- 提示词收藏/固定 — 属于v2 UX-02，不在Phase 3范围

</deferred>

---

*Phase: 03-data-management-popup-ui*
*Context gathered: 2026-04-16*