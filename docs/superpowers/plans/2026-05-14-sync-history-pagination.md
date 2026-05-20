# 同步历史分页功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/backup` 页面添加同步历史分页功能，每页显示 10 条记录，使用传统页码分页 UI。

**Architecture:** 后端分页方案，API 支持 page/pageSize 参数，Supabase 使用 range() 查询和 count: 'exact' 获取总数，前端组件通过 onPageChange callback 触发重新请求。

**Tech Stack:** Next.js 16, Supabase, React 19, TypeScript

---

## 文件改动清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/web-app/types/dashboard.ts` | 修改 | 添加 PaginationInfo 类型定义 |
| `packages/web-app/lib/supabase/queries.ts` | 修改 | getSyncHistory 支持分页参数，返回分页信息 |
| `packages/web-app/app/api/sync/history/route.ts` | 修改 | 解析 query 参数，返回分页响应 |
| `packages/web-app/components/dashboard/backup/SyncHistory.tsx` | 修改 | 添加 pagination prop 和分页导航 UI |
| `packages/web-app/app/backup/page.tsx` | 修改 | 添加 currentPage state，处理页码变化 |

---

### Task 1: 添加 PaginationInfo 类型定义

**Files:**
- Modify: `packages/web-app/types/dashboard.ts`

- [ ] **Step 1: 添加 PaginationInfo 类型**

在 `packages/web-app/types/dashboard.ts` 文件末尾添加：

```typescript
export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
```

- [ ] **Step 2: 验证类型定义正确**

运行: `cd packages/web-app && npx tsc --noEmit`
预期: 无类型错误

- [ ] **Step 3: 提交类型定义**

```bash
git add packages/web-app/types/dashboard.ts
git commit -m "feat: add PaginationInfo type for sync history pagination

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 修改 Supabase 查询支持分页

**Files:**
- Modify: `packages/web-app/lib/supabase/queries.ts:15-35`

- [ ] **Step 1: 导入 PaginationInfo 类型**

在 `packages/web-app/lib/supabase/queries.ts` 文件顶部 imports 中添加 `PaginationInfo`：

```typescript
import {
  SyncHistoryItem,
  Team,
  TeamMember,
  TeamPrompt,
  PaymentHistoryItem,
  PaginationInfo,
} from '@/types/dashboard';
```

- [ ] **Step 2: 修改 getSyncHistory 函数签名和实现**

替换原有的 `getSyncHistory` 函数（第 15-35 行）：

```typescript
export async function getSyncHistory(
  userId: string,
  supabase?: SupabaseClient,
  page: number = 1,
  pageSize: number = 10
): Promise<{ history: SyncHistoryItem[], pagination: PaginationInfo }> {
  const client = supabase || await getServerClient();

  // Clamp page to valid range (we'll know totalCount after query)
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await client
    .from('sync_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Adjust currentPage if it exceeds totalPages
  const currentPage = Math.min(Math.max(1, page), totalPages || 1);

  return {
    history: (data || []).map((row: any) => ({
      id: row.id,
      type: row.sync_type as 'upload' | 'download',
      timestamp: row.timestamp,
      promptCount: row.prompts_count,
      categoryCount: row.categories_count ?? 0,
      temporaryPromptCount: row.temporary_prompts_count ?? 0,
      success: true
    })),
    pagination: {
      currentPage,
      pageSize,
      totalCount,
      totalPages,
    }
  };
}
```

- [ ] **Step 3: 验证类型正确**

运行: `cd packages/web-app && npx tsc --noEmit`
预期: 无类型错误

- [ ] **Step 4: 提交 Supabase 查询修改**

```bash
git add packages/web-app/lib/supabase/queries.ts
git commit -m "feat: add pagination support to getSyncHistory query

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 修改 API 路由处理分页参数

**Files:**
- Modify: `packages/web-app/app/api/sync/history/route.ts`

- [ ] **Step 1: 解析 query 参数并调用分页查询**

替换 `packages/web-app/app/api/sync/history/route.ts` 内容：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getSyncHistory } from '@/lib/supabase/queries'

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    console.log('[Sync History API] Unauthorized:', Date.now() - startTime, 'ms')
    return auth
  }

  // Parse pagination params from query
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10)

  // Validate params
  const validPage = Math.max(1, page)
  const validPageSize = Math.min(Math.max(1, pageSize), 50) // Cap at 50

  const t1 = Date.now()
  const result = await getSyncHistory(auth.userId, auth.supabase, validPage, validPageSize)
  console.log('[Sync History API] getSyncHistory():', Date.now() - t1, 'ms')

  console.log('[Sync History API] Total:', Date.now() - startTime, 'ms')
  return NextResponse.json({
    history: result.history,
    pagination: result.pagination,
  })
}
```

- [ ] **Step 2: 验证类型正确**

运行: `cd packages/web-app && npx tsc --noEmit`
预期: 无类型错误

- [ ] **Step 3: 提交 API 路由修改**

```bash
git add packages/web-app/app/api/sync/history/route.ts
git commit -m "feat: add pagination params to sync history API

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 修改 SyncHistory 组件添加分页 UI

**Files:**
- Modify: `packages/web-app/components/dashboard/backup/SyncHistory.tsx`

- [ ] **Step 1: 添加 pagination prop 和 onPageChange callback**

替换 `packages/web-app/components/dashboard/backup/SyncHistory.tsx` 内容：

```typescript
'use client';

import { PaginationInfo } from '@/types/dashboard';

interface SyncHistoryProps {
  history: Array<{
    id: string;
    type: 'upload' | 'download';
    timestamp: string;
    promptCount: number;
    categoryCount: number;
    temporaryPromptCount: number;
    success: boolean;
  }>;
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}

export default function SyncHistory({ history, pagination, onPageChange }: SyncHistoryProps) {
  const { currentPage, totalPages } = pagination;

  // Generate page numbers to display
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [1];

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) {
      pages.push('ellipsis');
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages - 1) {
      pages.push('ellipsis');
    }

    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="bg-surface-container border border-outline-variant/20 rounded-lg">
      <div className="px-6 py-4 border-b border-outline-variant/20">
        <h3 className="font-medium text-on-background">同步历史</h3>
      </div>
      <div className="divide-y divide-outline-variant/20">
        {history.length === 0 ? (
          <div className="px-6 py-8 text-center text-on-surface-variant">
            暂无同步记录
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-sm text-on-background">
                  {new Date(item.timestamp).toLocaleString('zh-CN')}
                </span>
                <span className="text-sm text-on-surface-variant">
                  {item.type === 'upload' ? '上传' : '下载'}
                </span>
                <span className="text-sm text-on-surface-variant">
                  {item.promptCount} 提示词
                </span>
                <span className="text-sm text-on-surface-variant">
                  {item.categoryCount ?? 0} 分类
                </span>
                <span className="text-sm text-on-surface-variant">
                  {item.temporaryPromptCount ?? 0} 临时提示词
                </span>
              </div>
              {item.success ? (
                <span className="text-primary bg-primary/10 px-2 py-1 rounded text-xs">
                  ✓ 成功
                </span>
              ) : (
                <span className="text-error bg-error/10 px-2 py-1 rounded text-xs">
                  ✗ 失败
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 flex items-center justify-center gap-2 border-t border-outline-variant/20">
          {/* Previous button */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm rounded border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            上一页
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {pageNumbers.map((page, index) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-on-surface-variant">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`px-3 py-1 text-sm rounded border transition-colors ${
                    page === currentPage
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {page}
                </button>
              )
            )}
          </div>

          {/* Next button */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm rounded border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证类型正确**

运行: `cd packages/web-app && npx tsc --noEmit`
预期: 无类型错误

- [ ] **Step 3: 提交 SyncHistory 组件修改**

```bash
git add packages/web-app/components/dashboard/backup/SyncHistory.tsx
git commit -m "feat: add pagination UI to SyncHistory component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 修改 backup page 处理分页状态

**Files:**
- Modify: `packages/web-app/app/backup/page.tsx`

- [ ] **Step 1: 添加 currentPage state 和 pagination 状态**

修改 `packages/web-app/app/backup/page.tsx`，替换相关部分：

1. 在 state 声明部分（第 24-27 行后）添加：
```typescript
const [currentPage, setCurrentPage] = useState(1)
const [pagination, setPagination] = useState<PaginationInfo>({
  currentPage: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 0,
})
```

2. 在 imports 中添加 `PaginationInfo`：
```typescript
import { SyncStatus, SyncHistoryItem, PaginationInfo } from '@/types/dashboard'
```

3. 修改 `fetchData` 函数（第 29-55 行）：
```typescript
const fetchData = async (page: number = 1) => {
  try {
    const [statusRes, historyRes] = await Promise.all([
      fetch('/api/sync/status'),
      fetch(`/api/sync/history?page=${page}&pageSize=10`),
    ])

    if (statusRes.ok && historyRes.ok) {
      const statusData = await statusRes.json()
      const historyData = await historyRes.json()
      setStatus(statusData)
      setHistory(historyData.history || [])
      setPagination(historyData.pagination)
      setCurrentPage(historyData.pagination.currentPage)
    } else {
      // API 不存在时使用默认数据
      setStatus(defaultStatus)
      setHistory([])
      setError('云端同步功能暂未开放，请先配置本地备份')
    }
  } catch {
    // 网络错误时使用默认数据
    setStatus(defaultStatus)
    setHistory([])
    setError('暂无法获取同步状态')
  } finally {
    setLoading(false)
  }
}
```

4. 修改 useEffect 中 fetchData 调用：
```typescript
useEffect(() => {
  if (user) {
    fetchData(currentPage)
  }
}, [user])
```

5. 添加 handlePageChange 函数：
```typescript
const handlePageChange = (page: number) => {
  setCurrentPage(page)
  fetchData(page)
}
```

6. 修改 SyncHistory 组件调用（第 116 行）：
```typescript
<SyncHistory history={history} pagination={pagination} onPageChange={handlePageChange} />
```

完整修改后的 `packages/web-app/app/backup/page.tsx`：

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import SyncStats from '@/components/dashboard/backup/SyncStats'
import SyncHistory from '@/components/dashboard/backup/SyncHistory'
import { SyncStatus, SyncHistoryItem, PaginationInfo } from '@/types/dashboard'

const defaultStatus: SyncStatus = {
  lastSyncedAt: null,
  promptCount: 0,
  categoryCount: 0,
  temporaryPromptsCount: 0,
  hasUnsyncedChanges: false,
}

const defaultPagination: PaginationInfo = {
  currentPage: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 0,
}

export default function BackupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useUser()

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [history, setHistory] = useState<SyncHistoryItem[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>(defaultPagination)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async (page: number = 1) => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/sync/status'),
        fetch(`/api/sync/history?page=${page}&pageSize=10`),
      ])

      if (statusRes.ok && historyRes.ok) {
        const statusData = await statusRes.json()
        const historyData = await historyRes.json()
        setStatus(statusData)
        setHistory(historyData.history || [])
        setPagination(historyData.pagination)
      } else {
        // API 不存在时使用默认数据
        setStatus(defaultStatus)
        setHistory([])
        setPagination(defaultPagination)
        setError('云端同步功能暂未开放，请先配置本地备份')
      }
    } catch {
      // 网络错误时使用默认数据
      setStatus(defaultStatus)
      setHistory([])
      setPagination(defaultPagination)
      setError('暂无法获取同步状态')
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (page: number) => {
    fetchData(page)
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      fetchData(1)
    }
  }, [user])

  // Auth loading or redirecting
  if (authLoading || !user) {
    return (
      <div className="flex flex-col min-h-screen relative z-10">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-on-surface-variant">加载中...</div>
        </div>
        <Footer />
      </div>
    )
  }

  // Data loading
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen relative z-10">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-on-surface-variant">加载中...</div>
        </div>
        <Footer />
      </div>
    )
  }

  const displayStatus = status || defaultStatus

  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-8 flex-1">
        <div className="space-y-8">
          {error && (
            <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-lg text-secondary">
              {error}
            </div>
          )}

          <section>
            <h2 className="text-lg font-semibold text-on-background mb-4">
              云端同步状态
            </h2>
            <SyncStats status={displayStatus} />
          </section>

          <section>
            <SyncHistory history={history} pagination={pagination} onPageChange={handlePageChange} />
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: 验证类型正确**

运行: `cd packages/web-app && npx tsc --noEmit`
预期: 无类型错误

- [ ] **Step 3: 提交 backup page 修改**

```bash
git add packages/web-app/app/backup/page.tsx
git commit -m "feat: add pagination state handling to backup page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 验证完整功能

- [ ] **Step 1: 启动开发服务器**

运行: `cd packages/web-app && npm run dev`
预期: 开发服务器在 localhost:3000 启动

- [ ] **Step 2: 手动测试功能**

在浏览器访问 `http://localhost:3000/backup`（需要登录）：
1. 验证分页 UI 正确显示
2. 点击页码切换页面
3. 验证上一页/下一页按钮在边界时禁用
4. 验证页码省略显示（总页数 > 5 时）

- [ ] **Step 3: 运行构建验证**

运行: `cd packages/web-app && npm run build`
预期: 构建成功，无错误

- [ ] **Step 4: 提交所有改动汇总（如有遗漏）**

```bash
git status
# 如果有未提交的文件，添加并提交
```

---

## Self-Review Checklist

- [x] Spec coverage: 所有 spec 要求都有对应 task
  - PaginationInfo 类型 → Task 1
  - getSyncHistory 分页 → Task 2
  - API 路改动 → Task 3
  - SyncHistory 分页 UI → Task 4
  - backup page 状态管理 → Task 5
- [x] Placeholder scan: 无 TBD/TODO/模糊描述
- [x] Type consistency: 类型定义一致（PaginationInfo 在各 task 中统一使用）