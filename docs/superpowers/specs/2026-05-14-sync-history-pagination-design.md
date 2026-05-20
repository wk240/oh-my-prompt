# 同步历史分页功能设计

**日期:** 2026-05-14
**状态:** 待实现

## 概述

为 `/backup` 页面的同步历史列表添加分页功能，每页最多显示 10 条记录，使用传统页码分页 UI（`< 1 2 3 ... >`）。

## 技术方案

采用**后端分页**，API 支持分页参数，每次只请求当前页数据。

## 改动范围

### 1. API 端点 (`/api/sync/history/route.ts`)

**请求参数:**
- `page` (可选, 默认 1) - 当前页码
- `pageSize` (可选, 默认 10) - 每页条数

**响应格式:**
```typescript
{
  history: SyncHistoryItem[],
  pagination: {
    currentPage: number,
    pageSize: number,
    totalCount: number,
    totalPages: number
  }
}
```

### 2. Supabase Query (`lib/supabase/queries.ts`)

修改 `getSyncHistory()` 函数：

```typescript
export async function getSyncHistory(
  userId: string,
  supabase?: SupabaseClient,
  page: number = 1,
  pageSize: number = 10
): Promise<{ history: SyncHistoryItem[], pagination: PaginationInfo }>
```

实现：
- 使用 `.range(from, to)` 进行分页查询
- 使用 `{ count: 'exact' }` 获取总记录数
- 计算 `totalPages = Math.ceil(count / pageSize)`

### 3. 类型定义 (`types/dashboard.ts`)

新增分页类型：

```typescript
export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
```

### 4. 前端组件

**`SyncHistory.tsx`**
- 接收 `pagination` prop
- 新增分页导航 UI
- 通过 `onPageChange` callback 通知父组件页码变化

**`backup/page.tsx`**
- 添加 `currentPage` state
- `fetchData()` 函数传递 page 参数
- 监听 `onPageChange` 重新请求数据

## 分页 UI 设计

**样式:** 简洁模式 `< 上一页 | 页码 | 下一页 >`

**显示规则:**
- 当前页高亮（不同背景色）
- 总页数 ≤ 5：显示全部页码 `1 2 3 4 5`
- 总页数 > 5：显示 `1 ... 3 4 5 ... 10`（当前页周围显示 2 页）
- 首页时"上一页"禁用，末页时"下一页"禁用

## 错误处理

- 无效 page 参数（< 1 或 > totalPages）：返回第一页或最后一页
- API 错误时显示错误信息，不渲染分页 UI

## 性能考虑

- 分页查询使用 Supabase 索引 `idx_sync_logs_user_id`（已存在）
- 每次请求仅返回 10 条，响应体积小
- `count: 'exact'` 性能开销可控（sync_logs 表数据量预计不大）

## 测试要点

1. 验证 API 分页参数正确传递
2. 验证 Supabase range 计算正确（from = (page-1) * pageSize, to = from + pageSize - 1）
3. 验证边界情况：空数据、单页数据、超出范围页码
4. 验证 UI：当前页高亮、禁用状态、页码省略显示