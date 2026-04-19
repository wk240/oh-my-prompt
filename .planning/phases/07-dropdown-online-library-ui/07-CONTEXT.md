# Phase 7: Dropdown Online Library UI - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

用户可浏览和预览网络提示词。在现有下拉菜单中增加"在线库"入口，用户可按ProviderCategory分类浏览网络提示词、在卡片中预览缩略图、点击弹出Modal查看完整内容、通过"加载更多"按钮分页浏览大数据集。

**In scope:**
- Sidebar增加虚拟"在线库"入口，点击切换显示网络提示词模式
- NetworkPromptCard组件，显示previewImage缩略图 + 名称 + 分类标签
- ProviderCategory sidebar替换（切换到"在线库"时，侧边栏分类列表替换为ProviderCategory）
- Modal overlay显示完整提示词内容 + 来源信息
- "加载更多"按钮分页（50条/页）
- Header显示缓存状态（fetchTimestamp、isExpired提示）
- Loading/empty/error states

**Out of scope:**
- 搜索功能（Phase 8）
- 收藏功能（Phase 8）
- 图片预览详细实现（previewImage URL加载失败处理延后）
- 刷新缓存按钮（Phase 7+ 增强功能）

</domain>

<decisions>
## Implementation Decisions

### Tab Structure
- **D-01:** Sidebar增加虚拟"在线库"分类入口，位于"全部分类"下方
- **D-02:** 点击"在线库"后，主内容区切换显示网络提示词，侧边栏分类列表替换为ProviderCategory
- **D-03:** 切换回本地分类时，恢复原有本地分类列表和本地提示词显示

### Card Layout
- **D-04:** NetworkPromptCard组件使用卡片布局，显示previewImage缩略图（左/上方）+ 名称 + ProviderCategory标签
- **D-05:** 卡片尺寸适中（约120x80px缩略图），支持hover效果
- **D-06:** previewImage加载失败时显示fallback占位图

### Preview Expand
- **D-07:** 点击卡片弹出Modal overlay，显示完整提示词内容 + 来源信息（sourceProvider、sourceCategory）
- **D-08:** Modal包含关闭按钮，点击外部区域可关闭
- **D-09:** Modal预留"收藏"按钮位置（Phase 8实现功能）

### Pagination UX
- **D-10:** 使用"加载更多"按钮分页，位于主内容区底部
- **D-11:** 每页50条提示词，点击按钮加载下一页，已加载内容保留
- **D-12:** 显示已加载条数和总数（如"已加载 50/900 条")

### Category Filter
- **D-13:** 切换到"在线库"时，侧边栏分类列表替换为ProviderCategory列表（17个分类）
- **D-14:** ProviderCategory显示分类名称 + 条数（如"3D Miniatures · 52条")
- **D-15:** 点击ProviderCategory后，主内容区过滤显示该分类下的网络提示词

### Cache Status Display
- **D-16:** 主内容区Header显示缓存状态（如"上次更新: 2026-04-19 12:00")
- **D-17:** isExpired=true时显示"数据已过期"提示，建议用户稍后刷新
- **D-18:** isFromCache=true时可选显示"离线模式"标识

### Claude's Discretion
- NetworkPromptCard具体样式细节（border-radius、阴影、间距）
- Modal overlay尺寸和动画效果
- "加载更多"按钮样式和loading状态
- Header状态栏布局和样式

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 类型定义
- `src/shared/types.ts` — NetworkPrompt、ProviderCategory类型定义（Phase 5）
- `src/shared/messages.ts` — GET_NETWORK_CACHE、NetworkDataResponse、CacheDataResponse（Phase 6）

### 现有Dropdown组件
- `src/content/components/DropdownContainer.tsx` — 主下拉容器，sidebar + main content布局，Portal渲染
- `src/content/components/DropdownApp.tsx` — Root协调组件，状态管理
- `src/content/components/PromptItem.tsx` — 现有list布局参考

### Service Worker消息模式
- `src/background/service-worker.ts` — GET_NETWORK_CACHE handler实现，消息响应格式
- `src/lib/storage.ts` — StorageManager singleton模式参考

### 需求背景
- `.planning/REQUIREMENTS.md` — NET-02需求详情（预览网络提示词完整内容）
- `.planning/ROADMAP.md` — Phase 7 Success Criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DropdownContainer.tsx`: sidebar-categories + dropdown-main结构可直接复用
- `SortableCategoryItem`: 可作为ProviderCategory sidebar item参考
- `Portal渲染模式`: getPortalContainer() + getDropdownStyles()模式已验证
- `MessageType.GET_NETWORK_CACHE`: 已实现的缓存获取handler
- `CacheDataResponse`: 包含fetchTimestamp、isFromCache、isExpired flags

### Established Patterns
- Sidebar分类列表: onClick切换selectedCategoryId，主内容区filter显示
- Portal渲染: createPortal()渲染到document.body，避免Shadow DOM CSS冲突
- Loading state: isLoading ? "加载中..." : content渲染
- Empty state: filteredPrompts.length === 0 ? empty-message : items渲染

### Integration Points
- DropdownContainer sidebar: 添加"在线库"虚拟入口，点击切换isOnlineLibrary模式
- Sidebar categories: 根据isOnlineLibrary显示本地Category或ProviderCategory列表
- Main content: 根据isOnlineLibrary渲染本地PromptItem或NetworkPromptCard
- Header: 添加缓存状态显示区域
- Modal overlay: 新组件，点击NetworkPromptCard触发

</code_context>

<specifics>
## Specific Ideas

- 卡片布局网格化（2列或3列），充分利用空间显示缩略图
- Modal overlay使用淡入动画，居中显示
- "加载更多"按钮带loading spinner状态
- Header状态栏紧凑显示，不占用过多空间

</specifics>

<deferred>
## Deferred Ideas

- 搜索功能（Phase 8: NET-01）
- 收藏功能（Phase 8: NET-03）
- 刷新缓存按钮（Phase 7+ UI增强）
- 图片预览详细实现（previewImage URL加载失败fallback占位图延后）
- 无限滚动替代"加载更多"（未来增强）

</deferred>

---

*Phase: 07-dropdown-online-library-ui*
*Context gathered: 2026-04-19*