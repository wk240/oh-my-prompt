# Phase 2-3: Web-app Completion & Extension Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 2 (Web-app基础搭建) and Phase 3 (Extension云端同步), enabling users to sync prompts to cloud and manage via web dashboard.

**Architecture:** Extension uses Supabase JS SDK for OAuth authentication and cloud sync API calls. Web-app provides auth callback, dashboard UI, and CRUD APIs. Both share types via @oh-my-prompt/shared package.

**Tech Stack:** Supabase Auth (OAuth), @supabase/supabase-js, Next.js 16, React 19, Chrome Extension Manifest V3

---

## File Structure

### Phase 2 Files (Web-app Completion)

| File | Purpose |
|------|---------|
| `packages/web-app/app/auth/callback/route.ts` | OAuth callback handler, exchanges code for session |
| `packages/web-app/app/dashboard/page.tsx` | Dashboard entry, redirects to prompts or shows landing |
| `packages/web-app/app/dashboard/prompts/page.tsx` | Prompts list view with CRUD actions |
| `packages/web-app/app/dashboard/prompts/[id]/page.tsx` | Single prompt edit view |
| `packages/web-app/app/dashboard/layout.tsx` | Dashboard layout with sidebar and user menu |
| `packages/web-app/app/api/prompts/route.ts` | GET/POST for prompts list |
| `packages/web-app/app/api/prompts/[id]/route.ts` | GET/PUT/DELETE for single prompt |
| `packages/web-app/app/api/categories/route.ts` | GET/POST for categories |
| `packages/web-app/components/dashboard/PromptCard.tsx` | Prompt card component for list |
| `packages/web-app/components/dashboard/CategoryFilter.tsx` | Category filter dropdown |
| `packages/web-app/components/dashboard/UserMenu.tsx` | User avatar with logout |

### Phase 3 Files (Extension Cloud Sync)

| File | Purpose |
|------|---------|
| `packages/extension/src/lib/cloud-sync/supabase-client.ts` | Supabase client initialization with anon key |
| `packages/extension/src/lib/cloud-sync/auth-service.ts` | Auth state management, OAuth flow trigger |
| `packages/extension/src/lib/cloud-sync/cloud-sync-service.ts` | Upload/download sync logic |
| `packages/extension/src/sidepanel/settings/CloudSyncSection.tsx` | Cloud sync UI in settings tab |
| `packages/extension/src/sidepanel/settings/components/CloudSyncStatusCard.tsx` | Status display component |
| `packages/extension/src/sidepanel/settings/components/AuthModal.tsx` | OAuth login modal |
| `packages/extension/src/sidepanel/views/SettingsView.tsx` | Modified: add 'cloud-sync' tab |
| `packages/extension/src/background/service-worker.ts` | Modified: handle OAuth callback from web-app |
| `packages/extension/package.json` | Modified: add @supabase/supabase-js dependency |
| `packages/shared/types/auth.ts` | Auth state types for both packages |

---

## Phase 2: Web-app Completion

### Task 1: Apply Database Migration to Supabase

**Files:**
- Existing: `packages/web-app/supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Read migration file content**

Read the migration SQL from `packages/web-app/supabase/migrations/001_initial_schema.sql` to verify it's correct.

- [ ] **Step 2: Apply migration via Supabase MCP tool**

Call `mcp__plugin_supabase_supabase__apply_migration` with:
- project_id: `futfxudabvjfldlismun`
- name: `initial_schema`
- query: (content from Step 1)

- [ ] **Step 3: Verify tables created**

Call `mcp__plugin_supabase_supabase__list_tables` with project_id `futfxudabvjfldlismun`, schemas `["public"]`, verbose `true` to confirm:
- categories table exists with columns: id, user_id, name, sort_order, created_at
- prompts table exists with columns: id, user_id, category_id, title, content, platform, is_public, sort_order, created_at, updated_at
- teams, team_members, team_prompts, sync_logs, user_subscriptions tables exist

- [ ] **Step 4: Check RLS policies**

Call `mcp__plugin_supabase_supabase__execute_sql` with query:
```sql
SELECT schemaname, tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';
```

Expected: Each table has appropriate RLS policies (SELECT, INSERT, UPDATE, DELETE for user-owned tables).

---

### Task 2: Create OAuth Callback Route

**Files:**
- Create: `packages/web-app/app/auth/callback/route.ts`

- [ ] **Step 1: Create auth callback route**

```typescript
// packages/web-app/app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Successful auth - redirect to dashboard
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth failed - redirect to home with error
  return NextResponse.redirect(`${origin}/?auth=failed`)
}
```

- [ ] **Step 2: Test callback route locally**

Run: `cd packages/web-app && npm run dev`
Navigate to: `http://localhost:3000/auth/callback?code=test`
Expected: Redirects to `/` (since test code is invalid)

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/auth/callback/route.ts
git commit -m "feat(web): add OAuth callback route for Supabase auth"
```

---

### Task 3: Create Dashboard Layout

**Files:**
- Create: `packages/web-app/app/dashboard/layout.tsx`
- Create: `packages/web-app/components/dashboard/UserMenu.tsx`
- Create: `packages/web-app/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Create UserMenu component**

```typescript
// packages/web-app/components/dashboard/UserMenu.tsx
'use client'

import { createClient } from '@/lib/supabase/server'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUser() {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    const supabase = await createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return <div className="w-8 h-8 rounded-full bg-gray-200" />

  if (!user) {
    return (
      <a href="/" className="text-sm text-gray-600 hover:text-gray-900">
        登录
      </a>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-gray-700">{user.email}</div>
      <button
        onClick={handleLogout}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        退出
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create Sidebar component**

```typescript
// packages/web-app/components/dashboard/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard/prompts', label: '提示词管理' },
  { href: '/dashboard/settings', label: '设置' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 h-full bg-slate-50 border-r border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <Link href="/" className="text-xl font-bold text-slate-900">
          Oh My Prompt
        </Link>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm ${
                  pathname === item.href
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-slate-200">
        <UserMenu />
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Create dashboard layout**

```typescript
// packages/web-app/app/dashboard/layout.tsx
import { Sidebar } from '@/components/dashboard/Sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen flex">
      <Sidebar />
      <main className="flex-1 h-full overflow-auto bg-white">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Create dashboard entry page**

```typescript
// packages/web-app/app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  redirect('/dashboard/prompts')
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/dashboard/ packages/web-app/components/dashboard/
git commit -m "feat(web): add dashboard layout with sidebar and user menu"
```

---

### Task 4: Create Prompts CRUD API

**Files:**
- Create: `packages/web-app/app/api/prompts/route.ts`
- Create: `packages/web-app/app/api/prompts/[id]/route.ts`
- Create: `packages/web-app/app/api/categories/route.ts`

- [ ] **Step 1: Create prompts list API (GET/POST)**

```typescript
// packages/web-app/app/api/prompts/route.ts
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')

  let query = supabase
    .from('prompts')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data: prompts, error } = await query

  if (error) {
    return NextResponse.json({ success: false, error: 'FETCH_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: prompts?.map(p => ({
      id: p.id,
      name: p.title,
      nameEn: p.title_en,
      content: p.content,
      contentEn: p.content_en,
      categoryId: p.category_id,
      description: p.description,
      descriptionEn: p.description_en,
      order: p.sort_order,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }))
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const body = await request.json()

  const { data: prompt, error } = await supabase
    .from('prompts')
    .insert({
      user_id: user.id,
      category_id: body.categoryId,
      title: body.name,
      title_en: body.nameEn,
      content: body.content,
      content_en: body.contentEn,
      description: body.description,
      description_en: body.descriptionEn,
      sort_order: body.order ?? 0
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: 'CREATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id: prompt.id,
      name: prompt.title,
      nameEn: prompt.title_en,
      content: prompt.content,
      contentEn: prompt.content_en,
      categoryId: prompt.category_id,
      order: prompt.sort_order
    }
  })
}
```

- [ ] **Step 2: Create single prompt API (GET/PUT/DELETE)**

```typescript
// packages/web-app/app/api/prompts/[id]/route.ts
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const { id } = await params

  const { data: prompt, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !prompt) {
    return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id: prompt.id,
      name: prompt.title,
      nameEn: prompt.title_en,
      content: prompt.content,
      contentEn: prompt.content_en,
      categoryId: prompt.category_id,
      description: prompt.description,
      descriptionEn: prompt.description_en,
      order: prompt.sort_order
    }
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const { data: prompt, error } = await supabase
    .from('prompts')
    .update({
      title: body.name,
      title_en: body.nameEn,
      content: body.content,
      content_en: body.contentEn,
      category_id: body.categoryId,
      description: body.description,
      description_en: body.descriptionEn,
      sort_order: body.order,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: 'UPDATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id: prompt.id,
      name: prompt.title,
      categoryId: prompt.category_id
    }
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const { id } = await params

  const { error } = await supabase
    .from('prompts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ success: false, error: 'DELETE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create categories API (GET/POST)**

```typescript
// packages/web-app/app/api/categories/route.ts
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: 'FETCH_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: categories?.map(c => ({
      id: c.id,
      name: c.name,
      nameEn: c.name_en,
      order: c.sort_order
    }))
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const body = await request.json()

  const { data: category, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name: body.name,
      name_en: body.nameEn,
      sort_order: body.order ?? 0
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: 'CREATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id: category.id,
      name: category.name,
      nameEn: category.name_en,
      order: category.sort_order
    }
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/api/prompts/ packages/web-app/app/api/categories/
git commit -m "feat(web): add prompts and categories CRUD API endpoints"
```

---

### Task 5: Create Dashboard Prompts View

**Files:**
- Create: `packages/web-app/app/dashboard/prompts/page.tsx`
- Create: `packages/web-app/components/dashboard/PromptCard.tsx`
- Create: `packages/web-app/components/dashboard/CategoryFilter.tsx`
- Create: `packages/web-app/components/dashboard/CreatePromptDialog.tsx`

- [ ] **Step 1: Create PromptCard component**

```typescript
// packages/web-app/components/dashboard/PromptCard.tsx
'use client'

import Link from 'next/link'
import type { Prompt } from '@oh-my-prompt/shared/types'

interface PromptCardProps {
  prompt: Prompt
  categoryName?: string
  onDelete: (id: string) => void
}

export function PromptCard({ prompt, categoryName, onDelete }: PromptCardProps) {
  return (
    <div className="p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/prompts/${prompt.id}`}
            className="text-lg font-medium text-slate-900 hover:text-blue-600"
          >
            {prompt.name}
          </Link>
          {categoryName && (
            <div className="text-sm text-slate-500 mt-1">{categoryName}</div>
          )}
          <div className="text-sm text-slate-600 mt-2 line-clamp-2">
            {prompt.content.slice(0, 100)}...
          </div>
        </div>
        <button
          onClick={() => onDelete(prompt.id)}
          className="text-sm text-red-500 hover:text-red-700 ml-4"
        >
          删除
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create CategoryFilter component**

```typescript
// packages/web-app/components/dashboard/CategoryFilter.tsx
'use client'

import type { Category } from '@oh-my-prompt/shared/types'

interface CategoryFilterProps {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function CategoryFilter({ categories, selectedId, onSelect }: CategoryFilterProps) {
  return (
    <select
      value={selectedId ?? ''}
      onChange={e => onSelect(e.target.value || null)}
      className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
    >
      <option value="">全部分类</option>
      {categories.map(cat => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 3: Create prompts list page**

```typescript
// packages/web-app/app/dashboard/prompts/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { PromptCard } from '@/components/dashboard/PromptCard'
import { CategoryFilter } from '@/components/dashboard/CategoryFilter'
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const [promptsRes, categoriesRes] = await Promise.all([
        fetch('/api/prompts'),
        fetch('/api/categories')
      ])

      if (promptsRes.ok) {
        const data = await promptsRes.json()
        setPrompts(data.data || [])
      }

      if (categoriesRes.ok) {
        const data = await categoriesRes.json()
        setCategories(data.data || [])
      }

      setLoading(false)
    }
    loadData()
  }, [])

  const filteredPrompts = selectedCategoryId
    ? prompts.filter(p => p.categoryId === selectedCategoryId)
    : prompts

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setPrompts(prompts.filter(p => p.id !== id))
    }
  }

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId)
    return cat?.name
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">提示词管理</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          新建提示词
        </button>
      </div>

      <div className="mb-4">
        <CategoryFilter
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      </div>

      <div className="space-y-3">
        {filteredPrompts.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            暂无提示词，点击上方按钮创建
          </div>
        ) : (
          filteredPrompts.map(prompt => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              categoryName={getCategoryName(prompt.categoryId)}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/dashboard/prompts/ packages/web-app/components/dashboard/
git commit -m "feat(web): add prompts list page with filter and delete"
```

---

## Phase 3: Extension Cloud Sync

### Task 6: Add Supabase Dependency to Extension

**Files:**
- Modify: `packages/extension/package.json`

- [ ] **Step 1: Add @supabase/supabase-js dependency**

Edit `packages/extension/package.json`, add to dependencies:
```json
"@supabase/supabase-js": "^2.105.4"
```

- [ ] **Step 2: Install dependency**

Run: `npm install`
Expected: @supabase/supabase-js added to extension's node_modules

- [ ] **Step 3: Commit**

```bash
git add packages/extension/package.json package-lock.json
git commit -m "feat(ext): add @supabase/supabase-js dependency for cloud sync"
```

---

### Task 7: Create Shared Auth Types

**Files:**
- Create: `packages/shared/types/auth.ts`

- [ ] **Step 1: Create auth types**

```typescript
// packages/shared/types/auth.ts
// Auth state for cloud sync feature

export type AuthStatus = 'checking' | 'logged_in' | 'not_logged_in'

export interface CloudAuthState {
  status: AuthStatus
  user?: {
    id: string
    email?: string
  }
  subscription?: {
    planType: 'free' | 'pro' | 'team'
    status: 'active' | 'inactive' | 'expired'
  }
  lastSyncAt?: number
}

export interface OAuthProvider {
  name: 'google' | 'github'
  label: string
  icon: string
}
```

- [ ] **Step 2: Export from shared index**

Edit `packages/shared/index.ts`, add export:
```typescript
export * from './types/auth'
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/types/auth.ts packages/shared/index.ts
git commit -m "feat(shared): add auth types for cloud sync"
```

---

### Task 8: Create Supabase Client for Extension

**Files:**
- Create: `packages/extension/src/lib/cloud-sync/supabase-client.ts`

- [ ] **Step 1: Create Supabase client module**

```typescript
// packages/extension/src/lib/cloud-sync/supabase-client.ts
import { createClient } from '@supabase/supabase-js'

// Supabase project configuration
// Using publishable key (sb_publishable_*) for secure authentication
const SUPABASE_URL = 'https://futfxudabvjfldlismun.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_s2b-9rHPAhA0wP2ZlSsHsw_G3ZP4b93'

// Singleton client instance
let clientInstance: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          // Use chrome.storage.local for session persistence
          getItem: async (key: string) => {
            const result = await chrome.storage.local.get(key)
            return result[key] || null
          },
          setItem: async (key: string, value: string) => {
            await chrome.storage.local.set({ [key]: value })
          },
          removeItem: async (key: string) => {
            await chrome.storage.local.remove(key)
          }
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false // We handle OAuth callback via web-app
      }
    })
  }
  return clientInstance
}

// Clear client instance (for logout)
export function clearSupabaseClient() {
  clientInstance = null
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/lib/cloud-sync/supabase-client.ts
git commit -m "feat(ext): add Supabase client with chrome.storage persistence"
```

---

### Task 9: Create Auth Service for Extension

**Files:**
- Create: `packages/extension/src/lib/cloud-sync/auth-service.ts`

- [ ] **Step 1: Create auth service**

```typescript
// packages/extension/src/lib/cloud-sync/auth-service.ts
import { getSupabaseClient, clearSupabaseClient } from './supabase-client'
import type { CloudAuthState, AuthStatus } from '@oh-my-prompt/shared/types/auth'

const WEB_APP_URL = 'https://ohmyprompt.com' // Replace with actual domain or localhost for dev

export async function getAuthState(): Promise<CloudAuthState> {
  const supabase = getSupabaseClient()

  try {
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return { status: 'not_logged_in' }
    }

    // Get subscription status from sync/status API
    const statusRes = await fetch(`${WEB_APP_URL}/api/sync/status`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (!statusRes.ok) {
      return {
        status: 'logged_in',
        user: { id: session.user.id, email: session.user.email }
      }
    }

    const statusData = await statusRes.json()

    return {
      status: 'logged_in',
      user: statusData.user,
      subscription: statusData.subscription,
      lastSyncAt: statusData.lastSyncAt
    }
  } catch (error) {
    console.error('[Oh My Prompt] Auth state check failed:', error)
    return { status: 'not_logged_in' }
  }
}

export async function signInWithOAuth(provider: 'google' | 'github'): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${WEB_APP_URL}/auth/callback`,
        skipBrowserRedirect: true // We open in new tab manually
      }
    })

    if (error) {
      return { success: false, error: error.message }
    }

    // Open OAuth URL in new tab
    if (data.url) {
      chrome.tabs.create({ url: data.url })
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'OAuth initiation failed' }
  }
}

export async function signOut(): Promise<{ success: boolean }> {
  const supabase = getSupabaseClient()

  try {
    await supabase.auth.signOut()
    clearSupabaseClient()

    // Clear stored session from chrome.storage.local
    await chrome.storage.local.remove([
      'supabase.auth.token',
      'supabase.auth.expires_at'
    ])

    return { success: true }
  } catch (error) {
    return { success: true } // Still clear client
  }
}

export async function waitForAuthCallback(timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const state = await getAuthState()
    if (state.status === 'logged_in') {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  return false
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/lib/cloud-sync/auth-service.ts
git commit -m "feat(ext): add auth service with OAuth and session management"
```

---

### Task 10: Create Cloud Sync Service for Extension

**Files:**
- Create: `packages/extension/src/lib/cloud-sync/cloud-sync-service.ts`

- [ ] **Step 1: Create cloud sync service**

```typescript
// packages/extension/src/lib/cloud-sync/cloud-sync-service.ts
import { getSupabaseClient } from './supabase-client'
import { getAuthState } from './auth-service'
import type { SyncPayload, SyncResult } from '@oh-my-prompt/shared/types/sync'
import type { Prompt, Category } from '@oh-my-prompt/shared/types/prompt'
import type { StorageSchema } from '@oh-my-prompt/shared/types/storage'

const WEB_APP_URL = 'https://ohmyprompt.com'

export async function uploadToCloud(): Promise<SyncResult> {
  const authState = await getAuthState()

  if (authState.status !== 'logged_in') {
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  // Read local data from chrome.storage.local
  const storageData = await chrome.storage.local.get('prompt_script_data')
  const localData: StorageSchema = storageData.prompt_script_data

  if (!localData?.userData) {
    return { success: false, error: 'INVALID_DATA' }
  }

  const payload: SyncPayload = {
    prompts: localData.userData.prompts,
    categories: localData.userData.categories,
    timestamp: Date.now()
  }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/sync/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || 'SYNC_FAILED'
      }
    }

    const result = await response.json()
    return {
      success: true,
      promptsCount: result.promptsCount,
      categoriesCount: result.categoriesCount,
      syncedAt: result.syncedAt
    }
  } catch (error) {
    console.error('[Oh My Prompt] Upload failed:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}

export async function downloadFromCloud(): Promise<SyncResult & { data?: { prompts: Prompt[], categories: Category[] } }> {
  const authState = await getAuthState()

  if (authState.status !== 'logged_in') {
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return { success: false, error: 'NOT_LOGGED_IN' }
  }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/sync/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || 'SYNC_FAILED'
      }
    }

    const result = await response.json()

    if (!result.success) {
      return { success: false, error: result.error || 'SYNC_FAILED' }
    }

    return {
      success: true,
      data: result.data,
      syncedAt: result.data.timestamp
    }
  } catch (error) {
    console.error('[Oh My Prompt] Download failed:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}

export async function applyDownloadedData(data: { prompts: Prompt[], categories: Category[] }): Promise<{ success: boolean }> {
  const storageData = await chrome.storage.local.get('prompt_script_data')
  const existingData: StorageSchema = storageData.prompt_script_data

  // Merge with existing settings and version
  const newData: StorageSchema = {
    ...existingData,
    userData: {
      prompts: data.prompts,
      categories: data.categories
    },
    settings: {
      ...existingData.settings,
      lastSyncTime: Date.now(),
      hasUnsyncedChanges: false
    }
  }

  await chrome.storage.local.set({ prompt_script_data: newData })

  return { success: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/lib/cloud-sync/cloud-sync-service.ts
git commit -m "feat(ext): add cloud sync service with upload/download"
```

---

### Task 11: Create Cloud Sync UI Components

**Files:**
- Create: `packages/extension/src/sidepanel/settings/components/AuthModal.tsx`
- Create: `packages/extension/src/sidepanel/settings/components/CloudSyncStatusCard.tsx`
- Create: `packages/extension/src/sidepanel/settings/CloudSyncSection.tsx`

- [ ] **Step 1: Create AuthModal component**

```typescript
// packages/extension/src/sidepanel/settings/components/AuthModal.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import { Button } from '@/popup/components/ui/button'
import { signInWithOAuth, waitForAuthCallback } from '@/lib/cloud-sync/auth-service'
import type { OAuthProvider } from '@oh-my-prompt/shared/types/auth'

const providers: OAuthProvider[] = [
  { name: 'google', label: 'Google 登录', icon: '🔵' },
  { name: 'github', label: 'GitHub 登录', icon: '⚫' }
]

interface AuthModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [loading, setLoading] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true)
    setError(null)

    const result = await signInWithOAuth(provider)

    if (!result.success) {
      setError(result.error || '登录失败')
      setLoading(false)
      return
    }

    // Wait for auth callback in new tab
    setWaiting(true)
    setLoading(false)

    const success = await waitForAuthCallback(60000)

    setWaiting(false)

    if (success) {
      onSuccess()
      onClose()
    } else {
      setError('登录超时，请重试')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>云端同步登录</DialogTitle>
          <DialogDescription>
            登录后可云端备份提示词，多设备同步
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 rounded text-sm text-red-600">
            {error}
          </div>
        )}

        {waiting && (
          <div className="p-3 bg-blue-50 rounded text-sm text-blue-600">
            等待登录完成...
          </div>
        )}

        <div className="space-y-3 py-4">
          {providers.map(p => (
            <Button
              key={p.name}
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => handleOAuth(p.name)}
              disabled={loading || waiting}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading || waiting}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create CloudSyncStatusCard component**

```typescript
// packages/extension/src/sidepanel/settings/components/CloudSyncStatusCard.tsx
import { Button } from '@/popup/components/ui/button'
import type { CloudAuthState } from '@oh-my-prompt/shared/types/auth'

interface CloudSyncStatusCardProps {
  authState: CloudAuthState | null
  loading: boolean
  syncing: boolean
  onLogin: () => void
  onUpload: () => void
  onDownload: () => void
  onLogout: () => void
}

function formatTimestamp(ts: number | undefined): string {
  if (!ts) return '从未同步'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function CloudSyncStatusCard({
  authState,
  loading,
  syncing,
  onLogin,
  onUpload,
  onDownload,
  onLogout
}: CloudSyncStatusCardProps) {
  if (loading) {
    return <div className="text-sm text-gray-500 py-2">检查登录状态...</div>
  }

  if (!authState || authState.status === 'not_logged_in') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          未登录，登录后可云端备份
        </p>
        <Button onClick={onLogin} className="w-full">
          登录
        </Button>
      </div>
    )
  }

  const planLabel = authState.subscription?.planType === 'pro'
    ? 'Pro 用户'
    : authState.subscription?.planType === 'team'
    ? 'Team 用户'
    : '免费用户'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <div className="font-medium text-gray-900">{authState.user?.email}</div>
          <div className="text-gray-500">{planLabel}</div>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          退出
        </button>
      </div>

      <div className="text-xs text-gray-500">
        上次同步：{formatTimestamp(authState.lastSyncAt)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onUpload}
          disabled={syncing}
          variant="outline"
        >
          {syncing ? '同步中...' : '上传到云端'}
        </Button>
        <Button
          onClick={onDownload}
          disabled={syncing}
          variant="outline"
        >
          {syncing ? '同步中...' : '下载到本地'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create CloudSyncSection component**

```typescript
// packages/extension/src/sidepanel/settings/CloudSyncSection.tsx
import { useState, useEffect } from 'react'
import { AuthModal } from './components/AuthModal'
import { CloudSyncStatusCard } from './components/CloudSyncStatusCard'
import { getAuthState, signOut } from '@/lib/cloud-sync/auth-service'
import { uploadToCloud, downloadFromCloud, applyDownloadedData } from '@/lib/cloud-sync/cloud-sync-service'
import type { CloudAuthState } from '@oh-my-prompt/shared/types/auth'
import { MessageType } from '@oh-my-prompt/shared/messages'

export function CloudSyncSection() {
  const [authState, setAuthState] = useState<CloudAuthState | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    loadAuthState()
  }, [])

  const loadAuthState = async () => {
    setLoading(true)
    const state = await getAuthState()
    setAuthState(state)
    setLoading(false)
  }

  const handleLogin = () => {
    setAuthModalOpen(true)
  }

  const handleAuthSuccess = async () => {
    await loadAuthState()
    setSuccess('登录成功')
  }

  const handleLogout = async () => {
    await signOut()
    setAuthState(null)
    setSuccess('已退出登录')
  }

  const handleUpload = async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)

    const result = await uploadToCloud()

    setSyncing(false)

    if (result.success) {
      setSuccess(`上传成功：${result.promptsCount} 个提示词`)
      await loadAuthState()
    } else {
      if (result.error === 'NOT_LOGGED_IN') {
        setAuthModalOpen(true)
      } else {
        setError(result.error || '上传失败')
      }
    }
  }

  const handleDownload = async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)

    const result = await downloadFromCloud()

    setSyncing(false)

    if (result.success && result.data) {
      const applyResult = await applyDownloadedData(result.data)

      if (applyResult.success) {
        setSuccess(`下载成功：${result.data.prompts.length} 个提示词`)
        await loadAuthState()

        // Notify content script to refresh
        try {
          await chrome.runtime.sendMessage({ type: MessageType.REFRESH_DATA })
        } catch (err) {
          console.warn('[Oh My Prompt] Failed to notify refresh:', err)
        }
      } else {
        setError('应用数据失败')
      }
    } else {
      if (result.error === 'NOT_LOGGED_IN') {
        setAuthModalOpen(true)
      } else {
        setError(result.error || '下载失败')
      }
    }
  }

  return (
    <div className="w-full space-y-4 p-4">
      {/* Status Card */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-4">云端同步</h3>

        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-600 mb-4">{success}</p>
        )}

        <CloudSyncStatusCard
          authState={authState}
          loading={loading}
          syncing={syncing}
          onLogin={handleLogin}
          onUpload={handleUpload}
          onDownload={handleDownload}
          onLogout={handleLogout}
        />

        {/* Tip */}
        <p className="text-xs text-gray-500 mt-4">
          提示：云端同步需订阅 Pro 或 Team 计划
        </p>
      </div>

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/sidepanel/settings/CloudSyncSection.tsx packages/extension/src/sidepanel/settings/components/AuthModal.tsx packages/extension/src/sidepanel/settings/components/CloudSyncStatusCard.tsx
git commit -m "feat(ext): add cloud sync UI with auth modal and status card"
```

---

### Task 12: Integrate Cloud Sync into Settings View

**Files:**
- Modify: `packages/extension/src/sidepanel/views/SettingsView.tsx`

- [ ] **Step 1: Add cloud-sync tab to SettingsView**

Edit `packages/extension/src/sidepanel/views/SettingsView.tsx`:

```typescript
// packages/extension/src/sidepanel/views/SettingsView.tsx
import { useState, lazy, Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import { BackupSection } from '../settings/BackupSection'
import { CloudSyncSection } from '../settings/CloudSyncSection'
import { LoadingSpinner } from '../components/LoadingSpinner'

const VisionSection = lazy(() =>
  import('../settings/VisionSection').then(m => ({ default: m.VisionSection }))
)
const ImportExportSection = lazy(() =>
  import('../settings/ImportExportSection').then(m => ({ default: m.ImportExportSection }))
)

interface SettingsViewProps {
  onBack: () => void
}

type SettingsTab = 'cloud-sync' | 'backup' | 'vision' | 'import-export'

const tabLabels: Record<SettingsTab, string> = {
  'cloud-sync': '云端同步',
  backup: '本地备份',
  vision: 'AI识图',
  'import-export': '导入导出'
}

export default function SettingsView({ onBack }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('cloud-sync')

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold truncate">设置</h1>
      </div>

      {/* Tab Bar - Adaptive layout */}
      <div className="flex px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50">
        {(Object.keys(tabLabels) as SettingsTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content - Scrollable with full width */}
      <div className="flex-1 w-full overflow-y-auto">
        {activeTab === 'cloud-sync' && <CloudSyncSection />}
        {activeTab === 'backup' && <BackupSection />}
        {activeTab === 'vision' && (
          <Suspense fallback={<LoadingSpinner className="py-8" />}>
            <VisionSection />
          </Suspense>
        )}
        {activeTab === 'import-export' && (
          <Suspense fallback={<LoadingSpinner className="py-8" />}>
            <ImportExportSection />
          </Suspense>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/views/SettingsView.tsx packages/extension/src/sidepanel/settings/CloudSyncSection.tsx
git commit -m "feat(ext): integrate cloud sync tab into settings view"
```

---

## Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 2 Task 1 | Apply Database Migration | 5 min |
| Phase 2 Task 2 | OAuth Callback Route | 10 min |
| Phase 2 Task 3 | Dashboard Layout | 15 min |
| Phase 2 Task 4 | Prompts CRUD API | 20 min |
| Phase 2 Task 5 | Dashboard Prompts View | 20 min |
| Phase 3 Task 6 | Supabase Dependency | 5 min |
| Phase 3 Task 7 | Shared Auth Types | 5 min |
| Phase 3 Task 8 | Supabase Client | 10 min |
| Phase 3 Task 9 | Auth Service | 15 min |
| Phase 3 Task 10 | Cloud Sync Service | 15 min |
| Phase 3 Task 11 | Cloud Sync UI | 25 min |
| Phase 3 Task 12 | Settings Integration | 10 min |

**Total Estimated Time:** ~2.5 hours

---

## Testing Checklist

After completing all tasks:

- [ ] Web-app OAuth flow works (login via Google/GitHub, redirect to dashboard)
- [ ] Dashboard shows user's prompts after sync
- [ ] Extension cloud sync tab shows login state correctly
- [ ] Extension upload works (prompts appear in web dashboard)
- [ ] Extension download works (prompts appear in extension)
- [ ] Logout clears session in both extension and web-app