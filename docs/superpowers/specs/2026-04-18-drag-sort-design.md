# 拖动排序功能设计文档

## 概述

为 Prompt-Script Chrome 插件添加分类和提示词的拖动排序功能，支持在 Popup 管理界面和 Content Script 下拉菜单两处进行排序操作。

## 需求总结

| 功能点 | 决策 |
|--------|------|
| 排序范围 | Popup + Content Script 两处都支持 |
| 提示词排序 | 分类内独立排序，非全局排序 |
| 交互方式 | 拖动手柄图标，直接拖动 |
| 保存时机 | 延迟 500ms 保存，避免频繁写入 |
| 最小数量限制 | 2 个及以上才显示拖动手柄 |

## 技术方案

使用 **@dnd-kit** 作为拖拽库：
- 体积小（~15KB），适合 Chrome 插件
- 支持 Shadow DOM，适配 Content Script 隔离需求
- API 现代化，与 React 19 兼容良好

## 数据模型变化

### Category 类型
已有 `order` 字段，无需修改。

### Prompt 类型
新增 `order` 字段：

```typescript
interface Prompt {
  id: string
  name: string
  content: string
  categoryId: string
  description?: string
  order: number  // 新增：分类内排序顺序
}
```

排序规则：`order` 从 0 开始，同一分类内的提示词按 `order` 升序排列。

## Store 新增方法

在 `store.ts` 新增两个排序方法：

```typescript
// 分类排序
reorderCategories: (newOrder: string[]) => void
// 参数为分类 ID 数组，按新顺序排列

// 提示词排序（分类内）
reorderPrompts: (categoryId: string, newOrder: string[]) => void
// 参数为分类 ID 和该分类内提示词的新顺序 ID 数组
```

两个方法都使用延迟保存机制（500ms debounce），避免频繁写入存储。

## Popup UI 拖动排序

### CategorySidebar 改造

- 引入 `@dnd-kit/sortable` 的 `SortableContext` 和 `useSortable`
- 每个分类项左侧添加拖动手柄图标（GripVertical）
- 仅 2 个及以上分类时显示手柄
- "全部" 分类不参与拖动（虚拟分类）

### PromptList 改造

- 引入 `SortableContext` 包裹卡片网格
- 每个 PromptCard 左上角添加拖动手柄
- 仅当前分类有 2 个及以上提示词时显示手柄
- 拖动时卡片保持网格布局，不脱离容器

## Content Script 下拉菜单拖动排序

### DropdownApp 改造

- 下拉菜单中的提示词列表支持拖动排序
- 使用 `@dnd-kit/sortable`，与 Popup 保持一致
- 每个提示词项左侧添加拖动手柄
- 仅当前分类有 2 个及以上提示词时显示手柄
- 拖动手柄样式需与 Shadow DOM 内的样式隔离

### Shadow DOM 样式

- 在 `UIInjector.getStyles()` 中添加拖动相关样式
- 拖动手柄图标使用 SVG inline，不依赖外部资源
- 拖动时的视觉反馈（hover、active 状态）

## 数据迁移与初始化

### 现有数据兼容

- 加载存储时，检查提示词是否有 `order` 字段
- 若无，自动为每个分类内的提示词按数组顺序分配 `order` 值
- 保存时自动补齐，用户无感知

### 新提示词添加

- 新建提示词时，`order` 自动设为当前分类内最大 `order + 1`
- 确保新提示词排在末尾

### 删除提示词

- 删除后不重排 `order` 值，保持其他提示词顺序不变

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/shared/types.ts` | Prompt 类型新增 order 字段 |
| `src/lib/store.ts` | 新增 reorderCategories、reorderPrompts 方法 |
| `src/popup/components/CategorySidebar.tsx` | 添加拖动排序支持 |
| `src/popup/components/PromptList.tsx` | 添加拖动排序支持 |
| `src/popup/components/PromptCard.tsx` | 添加拖动手柄组件 |
| `src/content/components/DropdownApp.tsx` | 添加拖动排序支持 |
| `src/content/ui-injector.tsx` | 添加拖动相关 Shadow DOM 样式 |
| `package.json` | 新增 @dnd-kit/core, @dnd-kit/sortable 依赖 |