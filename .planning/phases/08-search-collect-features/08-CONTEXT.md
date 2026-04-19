# Phase 8: Search & Collect Features - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

用户可搜索并收藏网络提示词到本地存储。搜索功能支持实时搜索网络提示词标题和内容（substring match），收藏功能允许用户选择目标分类或创建新分类后保存到本地。

**In scope:**
- Header内展开式搜索UI（搜索图标点击展开输入框）
- 300ms debounce实时搜索
- 搜索匹配name + content字段（substring match）
- Modal内激活"收藏"按钮
- 分类选择器dialog（选择现有分类或新建）
- 收藏成功后Toast提示
- 收藏的prompt立即出现在本地分类中

**Out of scope:**
- 高级搜索（正则、模糊匹配）— MVP substring match足够
- 批量收藏 — 单个收藏优先
- 一键插入（不收藏直接插入）— Future enhancement
- 收藏历史记录 — 无后端存储限制
- 搜索结果排序 — 按原有顺序即可

</domain>

<decisions>
## Implementation Decisions

### Search UI Layout
- **D-01:** 搜索图标在CacheStatusHeader右侧，点击后输入框从右侧滑出展开
- **D-02:** 搜索图标使用Lucide Search图标（14x14px），与现有Settings/Close图标风格一致
- **D-03:** 展开时输入框宽度约200px，placeholder为"搜索提示词..."
- **D-04:** 输入框展开时显示关闭按钮（X图标），点击收起输入框并清空搜索词

### Search Behavior
- **D-05:** Debounce延迟300ms，避免每次按键触发搜索
- **D-06:** 搜索匹配name字段和content字段（substring match，toLowerCase比较）
- **D-07:** 搜索词为空时显示全部网络提示词（无过滤）
- **D-08:** 搜索结果替换paginatedNetworkPrompts，保持50条/页分页逻辑

### Collect Trigger Position
- **D-09:** 激活PromptPreviewModal内现有的disabled"收藏"按钮（Phase 7 D-09预留）
- **D-10:** 不在NetworkPromptCard上直接添加收藏按钮 — 避免UI冗余，用户先预览再收藏

### Category Selector UI
- **D-11:** 使用Portal渲染的inline styled dialog（参考PromptPreviewModal样式）
- **D-12:** Dialog显示现有本地分类列表（Category[]）+ "新建分类"输入框
- **D-13:** 分类列表使用radio select风格，选中后高亮
- **D-14:** "新建分类"输入框在分类列表下方，带"创建"按钮
- **D-15:** Dialog header: "选择收藏分类"，footer: "取消" + "确认收藏"

### Collect Success Feedback
- **D-16:** 收藏成功后Toast提示"已收藏到 [分类名]"
- **D-17:** 使用现有use-toast hook（src/hooks/use-toast.ts）
- **D-18:** Toast显示2秒后自动消失
- **D-19:** 收藏成功后Modal保持打开，用户可继续预览或关闭

### Claude's Discretion
- 搜索输入框动画效果（slide、fade等）
- 分类选择器dialog尺寸和滚动行为
- Toast位置（Portal右上角或其他）
- 搜索无结果时的empty state文案

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 类型定义
- `src/shared/types.ts` — Prompt、NetworkPrompt、Category类型定义
- `src/shared/messages.ts` — MessageType、MessageResponse格式

### 现有组件模式
- `src/content/components/DropdownContainer.tsx` — isOnlineLibrary状态、CacheStatusHeader位置、Portal渲染
- `src/content/components/PromptPreviewModal.tsx` — Modal overlay模式、收藏按钮位置、escape/overlay close
- `src/content/components/NetworkPromptCard.tsx` — 卡片点击触发Modal
- `src/content/components/CacheStatusHeader.tsx` — Header布局参考，搜索图标放置位置

### Store和工具
- `src/lib/store.ts` — addPrompt、addCategory函数实现
- `src/hooks/use-toast.ts` — Toast hook实现

### 需求背景
- `.planning/REQUIREMENTS.md` — NET-01（搜索）、NET-03（收藏）需求详情
- `.planning/ROADMAP.md` — Phase 8 Success Criteria
- `.planning/phases/07-dropdown-online-library-ui/07-CONTEXT.md` — Phase 7决策（D-09预留收藏按钮）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CacheStatusHeader.tsx`: Header布局已验证，搜索图标可放在右侧
- `PromptPreviewModal.tsx`: Portal Modal模式已验证，收藏按钮位置已预留（disabled状态）
- `use-toast.ts`: Toast hook已实现，可直接调用
- `store.addPrompt()`: 收藏逻辑可复用（添加prompt到本地存储）
- `store.addCategory()`: 新建分类逻辑可复用

### Established Patterns
- Portal渲染: createPortal()渲染到document.body，inline styles避免CSS冲突
- Debounce: 使用setTimeout + clearTimeout模式（store.ts已有saveDebounceTimer）
- 分类选择: Dropdown sidebar的selectedCategoryId模式可参考
- Toast: toast({ title, description })调用模式

### Integration Points
- DropdownContainer: 添加searchQuery状态、filteredNetworkPrompts计算
- CacheStatusHeader: 扩展为包含搜索图标+展开输入框
- PromptPreviewModal: 激活收藏按钮，添加onClick handler
- 新组件: CategorySelectDialog（Portal渲染的分类选择器）
- Store: 收藏时调用addPrompt，新建分类时调用addCategory

</code_context>

<specifics>
## Specific Ideas

- 搜索图标点击后输入框从右侧滑入（transform + transition）
- 分类选择器dialog使用淡入动画，居中显示
- Toast固定在Portal右上角（不影响Modal显示）
- 搜索无结果显示"未找到匹配的提示词"

</specifics>

<deferred>
## Deferred Ideas

- 批量收藏功能 — Future enhancement
- 一键插入（不收藏直接插入）— Future enhancement
- 搜索历史记录 — 无后端存储限制
- 高级搜索（正则、模糊匹配）— MVP substring match足够
- 搜索结果排序/相关性评分 — 按原有顺序即可
- NetworkPromptCard直接收藏按钮 — 避免UI冗余

</deferred>

---

*Phase: 08-search-collect-features*
*Context gathered: 2026-04-19*