# Phase 8: Search & Collect Features - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 08-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 08-search-collect-features
**Areas discussed:** 搜索UI布局

---

## 搜索UI布局

| Option | Description | Selected |
|--------|-------------|----------|
| Header内展开式 | 搜索图标在Header右侧，点击后输入框滑出展开 | ✓ |
| 独立搜索栏 | Header下方独立一行，始终显示输入框 | |
| Modal内搜索 | 仅在Modal内显示搜索框 | |

**User's choice:** Header内展开式 (推荐)
**Notes:** 紧凑、不占额外空间，与现有CacheStatusHeader布局兼容

---

## 搜索延迟（debounce）

| Option | Description | Selected |
|--------|-------------|----------|
| 300ms debounce | 输入后等待300ms再搜索 | ✓ |
| 500ms debounce | 更保守的性能优化 | |
| 无debounce | 每次按键立即搜索 | |

**User's choice:** 300ms debounce (推荐)
**Notes:** 响应快、性能好，标准debounce值

---

## 搜索匹配范围

| Option | Description | Selected |
|--------|-------------|----------|
| 标题+内容 | 同时搜索name和content字段 | ✓ |
| 仅标题 | 仅搜索name字段 | |

**User's choice:** 标题+内容 (推荐)
**Notes:** 符合ROADMAP Success Criteria #2，substring match

---

## 搜索框展开方式

| Option | Description | Selected |
|--------|-------------|----------|
| 图标点击展开 | 搜索图标点击后输入框从右侧滑出 | ✓ |
| 图标+输入框并排 | 搜索图标和输入框始终并排显示 | |
| 自动展开 | 切换到在线库后自动展开搜索框 | |

**User's choice:** 图标点击展开 (推荐)
**Notes:** 紧凑、流畅，用户可控

---

## Claude's Discretion

The following areas were deferred to Claude's discretion:
- 收藏触发位置 — Modal内激活现有按钮（Phase 7 D-09已预留）
- 分类选择器UI — Portal inline styled dialog（参考PromptPreviewModal）
- 收藏成功反馈 — Toast提示（use-toast hook已存在）
- 搜索输入框动画效果
- 分类选择器dialog尺寸和滚动行为
- Toast位置和持续时间
- 搜索无结果时empty state文案

---

## Deferred Ideas

- 批量收藏功能 — Future enhancement
- 一键插入（不收藏直接插入）— Future enhancement
- 搜索历史记录 — 无后端存储限制
- 高级搜索（正则、模糊匹配）— MVP substring match足够
- NetworkPromptCard直接收藏按钮 — 避免UI冗余

---

*Discussion log created: 2026-04-19*