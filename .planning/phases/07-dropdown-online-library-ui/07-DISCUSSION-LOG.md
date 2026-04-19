# Phase 7: Dropdown Online Library UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 07-dropdown-online-library-ui
**Areas discussed:** Tab structure, Card vs List, Preview expand, Pagination UX, Category filter, Cache status display

---

## Tab Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar entry | 虚拟"在线库"分类入口，点击后主内容区显示网络提示词 | ✓ |
| Top-level tabs | 顶部"本地/在线"Tab栏切换，两个模式完全分离 | |

**User's choice:** Sidebar entry (Recommended)
**Notes:** 保持现有布局一致性，侧边栏增加虚拟入口，点击切换显示模式

---

## Card vs List

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse list | 名称+截断预览+来源标签，保持一致性，不显示previewImage | |
| Card layout with image | 新增卡片组件，显示previewImage缩略图+名称+分类标签 | ✓ |

**User's choice:** Card layout with image
**Notes:** 网络提示词有previewImage字段，使用卡片布局显示缩略图更视觉化

---

## Preview Expand

| Option | Description | Selected |
|--------|-------------|----------|
| Modal overlay | 弹出层显示完整内容+来源信息+收藏按钮，点击外部关闭 | ✓ |
| Inline expand | 原地展开显示完整内容，不离开列表 | |
| Side panel | 右侧固定panel显示详情，split view风格 | |

**User's choice:** Modal overlay (Recommended)
**Notes:** 交互清晰，弹出层显示完整内容，预留收藏按钮位置（Phase 8）

---

## Pagination UX

| Option | Description | Selected |
|--------|-------------|----------|
| Page navigation | 底部页码导航（上一页/下一页 + 页码数字） | |
| Load more button | 底部"加载更多"按钮，点击加载下一页，已加载内容保留 | ✓ |
| Infinite scroll | 滚动到底部自动加载下一页 | |

**User's choice:** Load more button
**Notes:** 点击加载下一页，已加载内容保留，显示已加载条数和总数

---

## Category Filter

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar replacement | 切换到"在线库"时，侧边栏分类列表替换为ProviderCategory | ✓ |
| Dropdown filter | 主内容区顶部增加下拉分类选择器 | |
| Tag tabs | 主内容区顶部横向标签栏切换分类 | |

**User's choice:** Sidebar replacement (Recommended)
**Notes:** 保持侧边栏布局一致性，切换到网络模式时替换为17个ProviderCategory

---

## Cache Status Display

| Option | Description | Selected |
|--------|-------------|----------|
| Header status | 主内容区头部显示"上次更新"时间戳，isExpired时显示"数据已过期"提示 | ✓ |
| In-content indicator | 卡片区域顶部显示状态提示条 | |
| No display | 不显示缓存状态 | |

**User's choice:** Header status (Recommended)
**Notes:** 头部显示fetchTimestamp，isExpired时显示过期提示，isFromCache可选显示"离线模式"标识

---

## Claude's Discretion

- NetworkPromptCard具体样式细节（border-radius、阴影、间距）
- Modal overlay尺寸和动画效果
- "加载更多"按钮样式和loading状态
- Header状态栏布局和样式

## Deferred Ideas

- 搜索功能（Phase 8: NET-01）
- 收藏功能（Phase 8: NET-03）
- 刷新缓存按钮（Phase 7+ UI增强）
- 图片预览详细实现（previewImage URL加载失败fallback占位图延后）
- 无限滚动替代"加载更多"（未来增强）