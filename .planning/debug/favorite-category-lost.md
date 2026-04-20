---
status: resolved
trigger: 资源库点击收藏后分类列表丢失原分类
created: 2026-04-20
updated: 2026-04-20
---

## Symptoms

- **Expected behavior**: 分类列表保持不变，将新收藏的prompt加入到原有的分类中
- **Actual behavior**: 原分类中资源消失
- **Error messages**: 无
- **Timeline**: 未知
- **Reproduction steps**: 打开资源库页面 → 点击某个资源的收藏按钮 → 查看分类列表

## Current Focus

hypothesis: 数据同步问题 - content script未订阅Zustand store更新
test: 验证DropdownApp与store的数据流
expecting: DropdownApp使用独立state而非store订阅
next_action: verified
reasoning_checkpoint: null
tdd_checkpoint: null

## Evidence

- timestamp: 2026-04-20T-initial
  source: code-analysis
  type: architecture
  content: |
    **数据流分析**:
    1. DropdownApp.tsx (line 20-21): 使用本地 useState 存储 prompts/categories
    2. DropdownApp.tsx (line 25-55): 仅在初始化时加载一次数据 (useEffect deps: [])
    3. DropdownContainer.tsx (line 1052-1057): CategorySelectDialog 接收 sortableCategories
    4. sortableCategories 源于 localCategories → propCategories → DropdownApp.state
    5. handleConfirmCollect (line 612-633): 使用 usePromptStore.getState() 直接操作store
    6. store更新后，DropdownApp.state 保持stale，不会触发重新渲染

- timestamp: 2026-04-20T-analysis
  source: code-comparison
  type: pattern
  content: |
    **Popup vs Content Script 状态管理差异**:
    - Popup: 使用 usePromptStore() hook订阅store，响应式更新
    - Content Script: 使用 chrome.runtime.sendMessage 一次性加载，无订阅机制
    - handleConfirmCollect: usePromptStore.getState() 直接访问store，不触发组件更新

## Eliminated

- Not a component rendering issue
- Not a portal/z-index issue
- Not a storage save failure

## Resolution

root_cause: |
  **Content script状态同步缺失**: DropdownApp.tsx使用本地useState管理categories，
  仅初始化时从chrome.storage加载一次。当handleConfirmCollect通过
  usePromptStore.getState().addCategory()更新store后，DropdownApp的本地state
  保持stale，导致CategorySelectDialog无法获取最新分类列表。

  具体影响路径:
  1. 用户进入资源库模式 (isResourceLibrary=true)
  2. 点击收藏 → CategorySelectDialog打开
  3. sortableCategories源于localCategories（stale）
  4. 如果用户之前有自定义分类，store中有但本地state无 → 分类列表为空或缺失

fix: |
  **方案A (推荐): DropdownApp订阅Zustand store**
  - 将DropdownApp的categories改为从usePromptStore订阅
  - 确保store更新时组件自动重新渲染

  **方案B: 收藏后重新加载storage**
  - handleConfirmCollect完成后调用chrome.runtime.sendMessage重新加载
  - 较简单但非响应式，可能有竞态条件

  **实现位置**:
  - src/content/components/DropdownApp.tsx: 改用usePromptStore订阅
  - 或 src/content/components/DropdownContainer.tsx: handleConfirmCollect后刷新

verification: |
  测试步骤:
  1. 首次使用插件（无自定义分类）
  2. 进入资源库，点击收藏
  3. 创建新分类 → 确认收藏
  4. 再次点击另一个资源的收藏
  5. 验证CategorySelectDialog显示刚创建的分类

files_changed: []