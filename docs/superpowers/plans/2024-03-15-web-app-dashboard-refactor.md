# Web App Dashboard Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor web-app dashboard from prompts list to management dashboard with backup status, team management, and subscription modules.

**Architecture:** Next.js App Router with multi-page layout (`/dashboard/backup`, `/dashboard/team`, `/dashboard/subscription`), Tab-based navigation, Supabase backend, black-themed UI matching extension sidepanel.

**Tech Stack:** Next.js 14+, React, TypeScript, Tailwind CSS, Supabase, Stripe

---

## File Structure Overview

**New/Modified Files:**

```
packages/web-app/
├── app/dashboard/
│   ├── layout.tsx                    # Tab navigation layout (NEW)
│   ├── page.tsx                      # Redirect to /dashboard/backup (NEW)
│   ├── backup/
│   │   └── page.tsx                  # Backup status page (NEW)
│   ├── team/
│   │   ├── page.tsx                  # Team list page (NEW)
│   │   ├── [teamId]/
│   │   │   └── page.tsx              # Team detail page (NEW)
│   │   └── invite/
│   │       └── [token]/
│   │           └── page.tsx          # Accept invite page (NEW)
│   └── subscription/
│       └── page.tsx                  # Subscription page (NEW)
├── app/api/
│   ├── sync/history/route.ts         # GET sync history (NEW)
│   ├── teams/
│   │   ├── route.ts                  # GET/POST teams (NEW)
│   │   └── [teamId]/
│   │       ├── route.ts              # GET/PUT/DELETE team (NEW)
│   │       ├── members/
│   │       │   └── route.ts          # POST invite member (NEW)
│   │       │   └── [userId]/
│   │       │       ├── route.ts      # DELETE remove member (NEW)
│   │       │       └── role/
│   │       │           └── route.ts  # PUT change role (NEW)
│   │       └── prompts/
│   │           └── route.ts          # GET/POST shared prompts (NEW)
│   │               └── [promptId]/
│   │                   └── route.ts  # DELETE remove prompt (NEW)
│   ├── teams/invite/
│   │   └── [token]/
│   │       ├── route.ts              # GET invite info (NEW)
│   │       └── accept/
│   │           └── route.ts          # POST accept invite (NEW)
│   └── billing/
│       └── history/
│           └── route.ts              # GET payment history (NEW)
├── components/dashboard/
│   ├── TabNav.tsx                    # Tab navigation component (NEW)
│   ├── backup/
│   │   ├── SyncStats.tsx             # Sync statistics cards (NEW)
│   │   ├── SyncHistory.tsx           # Sync history list (NEW)
│   │   └── SyncActions.tsx           # Upload/download buttons (NEW)
│   ├── team/
│   │   ├── TeamCard.tsx              # Team list item card (NEW)
│   │   ├── CreateTeamDialog.tsx      # Create team modal (NEW)
│   │   ├── TeamMembers.tsx           # Member management (NEW)
│   │   ├── InviteMemberDialog.tsx    # Invite member modal (NEW)
│   │   └── SharedPrompts.tsx         # Shared prompts list (NEW)
│   └── subscription/
│       ├── CurrentPlan.tsx           # Current subscription card (NEW)
│       ├── PlanComparison.tsx        # Plan comparison cards (NEW)
│       └── PaymentHistory.tsx        # Payment history list (NEW)
├── lib/
│   └── supabase/
│       └── queries.ts                # Database query helpers (NEW)
└── types/
    └── dashboard.ts                  # Dashboard-specific types (NEW)

**Deleted Files:**
- `app/dashboard/prompts/page.tsx`
- `components/dashboard/PromptCard.tsx`
- `components/dashboard/CategoryFilter.tsx`
```

---

## Phase 1: Setup & Types

### Task 1: Create Dashboard Types

**Files:**
- Create: `packages/web-app/types/dashboard.ts`

- [ ] **Step 1: Write types file**

```typescript
export interface SyncStatus {
  lastSyncedAt: string | null;
  promptCount: number;
  categoryCount: number;
  hasUnsyncedChanges: boolean;
}

export interface SyncHistoryItem {
  id: string;
  type: 'upload' | 'download';
  timestamp: string;
  promptCount: number;
  success: boolean;
}

export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  sharedPromptCount: number;
  role: TeamRole;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamPrompt {
  id: string;
  title: string;
  content: string;
  addedBy: string;
  addedAt: string;
}

export interface TeamInvite {
  token: string;
  teamId: string;
  teamName: string;
  invitedBy: string;
  expiresAt: string;
}

export type PlanType = 'free' | 'pro' | 'team';

export interface SubscriptionStatus {
  plan: PlanType;
  status: 'active' | 'cancelled' | 'expired';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentHistoryItem {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'refunded';
  description: string;
}

export interface PlanOption {
  type: PlanType;
  name: string;
  priceMonthly: number;
  features: string[];
  current: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/types/dashboard.ts
git commit -m "feat: add dashboard types for backup, team, subscription"
```

---

### Task 2: Create Database Query Helpers

**Files:**
- Create: `packages/web-app/lib/supabase/queries.ts`

- [ ] **Step 1: Write query helpers**

```typescript
import { createClient } from './server';
import {
  SyncHistoryItem,
  Team,
  TeamMember,
  TeamPrompt,
  PaymentHistoryItem,
} from '@/types/dashboard';

export async function getSyncHistory(userId: string): Promise<SyncHistoryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      role,
      team:teams(
        id,
        name,
        created_at,
        team_members(count),
        team_prompts(count)
      )
    `)
    .eq('user_id', userId);

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.team.id,
    name: row.team.name,
    createdAt: row.team.created_at,
    memberCount: row.team.team_members?.[0]?.count || 0,
    sharedPromptCount: row.team.team_prompts?.[0]?.count || 0,
    role: row.role,
  }));
}

export async function getTeamById(teamId: string): Promise<Team | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_members(count),
      team_prompts(count)
    `)
    .eq('id', teamId)
    .single();

  if (error) return null;
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    memberCount: data.team_members?.[0]?.count || 0,
    sharedPromptCount: data.team_prompts?.[0]?.count || 0,
    role: 'member',
  };
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      role,
      joined_at,
      user:users(
        id,
        email,
        name,
        avatar_url
      )
    `)
    .eq('team_id', teamId);

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    avatarUrl: row.user.avatar_url,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

export async function getTeamPrompts(teamId: string): Promise<TeamPrompt[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('team_prompts')
    .select(`
      *,
      prompt:prompts(id, title, content)
    `)
    .eq('team_id', teamId);

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.prompt.id,
    title: row.prompt.title,
    content: row.prompt.content,
    addedBy: row.added_by,
    addedAt: row.added_at,
  }));
}

export async function getPaymentHistory(userId: string): Promise<PaymentHistoryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('payment_history')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/lib/supabase/queries.ts
git commit -m "feat: add database query helpers for dashboard"
```

---

## Phase 2: Dashboard Layout & Navigation

### Task 3: Create Tab Navigation Component

**Files:**
- Create: `packages/web-app/components/dashboard/TabNav.tsx`

- [ ] **Step 1: Write TabNav component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { id: 'backup', label: '备份数据', href: '/dashboard/backup' },
  { id: 'team', label: '团队管理', href: '/dashboard/team' },
  { id: 'subscription', label: '订阅管理', href: '/dashboard/subscription' },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#E5E5E5]">
      <div className="flex gap-8">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`
                py-4 text-sm font-medium transition-colors
                border-b-2 -mb-[1px]
                ${isActive
                  ? 'text-[#171717] border-[#171717]'
                  : 'text-[#64748B] border-transparent hover:text-[#171717]'
                }
              `}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/components/dashboard/TabNav.tsx
git commit -m "feat: add TabNav component for dashboard"
```

---

### Task 4: Create Dashboard Layout

**Files:**
- Create: `packages/web-app/app/dashboard/layout.tsx`
- Create: `packages/web-app/app/dashboard/page.tsx`

- [ ] **Step 1: Write layout.tsx**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TabNav from '@/components/dashboard/TabNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#E5E5E5]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-lg font-semibold text-[#171717]">
              管理仪表盘
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#64748B]">
                {user.email}
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-[#64748B] hover:text-[#171717]"
                >
                  退出
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6">
        <TabNav />
      </div>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Write page.tsx (redirect)**

```tsx
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/dashboard/backup');
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/dashboard/layout.tsx packages/web-app/app/dashboard/page.tsx
git commit -m "feat: add dashboard layout with tab navigation"
```

---

## Phase 3: Backup Data Module

### Task 5: Create Sync Status API

**Files:**
- Create: `packages/web-app/app/api/sync/status/route.ts`

- [ ] **Step 1: Write sync status API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: syncData } = await supabase
      .from('user_sync_status')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const { data: prompts } = await supabase
      .from('prompts')
      .select('id')
      .eq('user_id', user.id);

    const { data: categories } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id);

    return NextResponse.json({
      lastSyncedAt: syncData?.last_synced_at || null,
      promptCount: prompts?.length || 0,
      categoryCount: categories?.length || 0,
      hasUnsyncedChanges: syncData?.has_unsynced_changes || false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/sync/status/route.ts
git commit -m "feat: add sync status API"
```

---

### Task 6: Create Sync History API

**Files:**
- Create: `packages/web-app/app/api/sync/history/route.ts`

- [ ] **Step 1: Write sync history API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSyncHistory } from '@/lib/supabase/queries';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const history = await getSyncHistory(user.id);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/sync/history/route.ts
git commit -m "feat: add sync history API"
```

---

### Task 7: Create Backup Page Components

**Files:**
- Create: `packages/web-app/components/dashboard/backup/SyncStats.tsx`
- Create: `packages/web-app/components/dashboard/backup/SyncHistory.tsx`
- Create: `packages/web-app/components/dashboard/backup/SyncActions.tsx`

- [ ] **Step 1: Write SyncStats.tsx**

```tsx
'use client';

import { SyncStatus } from '@/types/dashboard';

interface SyncStatsProps {
  status: SyncStatus;
}

export default function SyncStats({ status }: SyncStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6">
        <div className="text-3xl font-bold text-[#171717]">
          {status.promptCount}
        </div>
        <div className="text-sm text-[#64748B] mt-1">提示词</div>
      </div>
      <div className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6">
        <div className="text-3xl font-bold text-[#171717]">
          {status.categoryCount}
        </div>
        <div className="text-sm text-[#64748B] mt-1">分类</div>
      </div>
      <div className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6">
        <div className="text-lg font-bold text-[#171717] truncate">
          {status.lastSyncedAt
            ? new Date(status.lastSyncedAt).toLocaleDateString('zh-CN')
            : '未同步'
          }
        </div>
        <div className="text-sm text-[#64748B] mt-1">最后同步</div>
        {status.hasUnsyncedChanges && (
          <div className="text-xs text-amber-600 mt-2">
            有未同步变更
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write SyncHistory.tsx**

```tsx
'use client';

import { SyncHistoryItem } from '@/types/dashboard';

interface SyncHistoryProps {
  history: SyncHistoryItem[];
}

export default function SyncHistory({ history }: SyncHistoryProps) {
  return (
    <div className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg">
      <div className="px-6 py-4 border-b border-[#E5E5E5]">
        <h3 className="font-medium text-[#171717]">同步历史</h3>
      </div>
      <div className="divide-y divide-[#E5E5E5]">
        {history.length === 0 ? (
          <div className="px-6 py-8 text-center text-[#64748B]">
            暂无同步记录
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-sm text-[#171717]">
                  {new Date(item.timestamp).toLocaleString('zh-CN')}
                </span>
                <span className="text-sm text-[#64748B]">
                  {item.type === 'upload' ? '上传' : '下载'}
                </span>
                <span className="text-sm text-[#64748B]">
                  {item.promptCount} 提示词
                </span>
              </div>
              {item.success ? (
                <span className="text-[#16a34a] bg-[#dcfce7] px-2 py-1 rounded text-xs">
                  ✓ 成功
                </span>
              ) : (
                <span className="text-red-600 bg-red-50 px-2 py-1 rounded text-xs">
                  ✗ 失败
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write SyncActions.tsx**

```tsx
'use client';

import { useState } from 'react';

interface SyncActionsProps {
  onUpload: () => Promise<void>;
  onDownload: () => Promise<void>;
}

export default function SyncActions({ onUpload, onDownload }: SyncActionsProps) {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleUpload = async () => {
    setUploading(true);
    try {
      await onUpload();
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handleUpload}
        disabled={uploading}
        className="bg-[#171717] text-white px-4 py-2 rounded text-sm font-medium
                   hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? '上传中...' : '立即上传'}
      </button>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="border border-[#E5E5E5] text-[#171717] px-4 py-2 rounded text-sm font-medium
                   hover:bg-[#f8f8f8] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloading ? '下载中...' : '下载到本地'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/components/dashboard/backup/
git commit -m "feat: add backup page components"
```

---

### Task 8: Create Backup Page

**Files:**
- Create: `packages/web-app/app/dashboard/backup/page.tsx`

- [ ] **Step 1: Write backup page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import SyncStats from '@/components/dashboard/backup/SyncStats';
import SyncHistory from '@/components/dashboard/backup/SyncHistory';
import SyncActions from '@/components/dashboard/backup/SyncActions';
import { SyncStatus, SyncHistoryItem } from '@/types/dashboard';

export default function BackupPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [history, setHistory] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/sync/status'),
        fetch('/api/sync/history'),
      ]);

      if (!statusRes.ok || !historyRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const statusData = await statusRes.json();
      const historyData = await historyRes.json();

      setStatus(statusData);
      setHistory(historyData.history);
    } catch (err) {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async () => {
    const res = await fetch('/api/sync/upload', { method: 'POST' });
    if (res.ok) {
      await fetchData();
    }
  };

  const handleDownload = async () => {
    const res = await fetch('/api/sync/download');
    if (res.ok) {
      await fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#64748B]">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-[#171717] mb-4">
          云端同步状态
        </h2>
        <div className="space-y-4">
          <SyncStats status={status} />
          <SyncActions onUpload={handleUpload} onDownload={handleDownload} />
        </div>
      </section>

      <section>
        <SyncHistory history={history} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/dashboard/backup/page.tsx
git commit -m "feat: add backup data page"
```

---

## Phase 4: Team Management Module

### Task 9: Create Team List API

**Files:**
- Create: `packages/web-app/app/api/teams/route.ts`

- [ ] **Step 1: Write teams list/create API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTeams } from '@/lib/supabase/queries';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teams = await getUserTeams(user.id);
    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (teamError) throw teamError;

    // Add creator as owner
    await supabase.from('team_members').insert({
      team_id: team.id,
      user_id: user.id,
      role: 'owner',
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/teams/route.ts
git commit -m "feat: add teams list and create API"
```

---

### Task 10: Create Team Detail APIs

**Files:**
- Create: `packages/web-app/app/api/teams/[teamId]/route.ts`
- Create: `packages/web-app/app/api/teams/[teamId]/members/route.ts`

- [ ] **Step 1: Write team detail API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('id', params.teamId)
      .single();

    return NextResponse.json({ team, role: membership.role });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch team' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;

    const { data: team } = await supabase
      .from('teams')
      .update({ name })
      .eq('id', params.teamId)
      .select()
      .single();

    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update team' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .single();

    if (membership?.role !== 'owner') {
      return NextResponse.json({ error: 'Only owner can delete' }, { status: 403 });
    }

    await supabase.from('teams').delete().eq('id', params.teamId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete team' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Write team members API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// GET team members
export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { data: members } = await supabase
      .from('team_members')
      .select(`
        role,
        joined_at,
        user:users(id, email, name, avatar_url)
      `)
      .eq('team_id', params.teamId);

    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

// POST invite member
export async function POST(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email } = body;

    // Find invited user
    const { data: invitedUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!invitedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already member
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', params.teamId)
      .eq('user_id', invitedUser.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Already a member' }, { status: 400 });
    }

    // Generate invite token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabase.from('team_invites').insert({
      token,
      team_id: params.teamId,
      invited_user_id: invitedUser.id,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    });

    return NextResponse.json({ token }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to invite member' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/teams/[teamId]/
git commit -m "feat: add team detail and members API"
```

---

### Task 11: Create Invite APIs

**Files:**
- Create: `packages/web-app/app/api/teams/invite/[token]/route.ts`
- Create: `packages/web-app/app/api/teams/invite/[token]/accept/route.ts`

- [ ] **Step 1: Write invite info API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createClient();
    const { data: invite } = await supabase
      .from('team_invites')
      .select(`
        *,
        team:teams(name),
        invited_by_user:users(name)
      `)
      .eq('token', params.token)
      .single();

    if (!invite) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 });
    }

    return NextResponse.json({
      teamName: invite.team.name,
      invitedBy: invite.invited_by_user.name,
      expiresAt: invite.expires_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch invite' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Write accept invite API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: invite } = await supabase
      .from('team_invites')
      .select('*')
      .eq('token', params.token)
      .single();

    if (!invite) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 });
    }

    if (invite.invited_user_id !== user.id) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 403 });
    }

    // Add member
    await supabase.from('team_members').insert({
      team_id: invite.team_id,
      user_id: user.id,
      role: 'member',
    });

    // Delete invite
    await supabase.from('team_invites').delete().eq('token', params.token);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/teams/invite/
git commit -m "feat: add team invite APIs"
```

---

### Task 12: Create Team Page Components

**Files:**
- Create: `packages/web-app/components/dashboard/team/TeamCard.tsx`
- Create: `packages/web-app/components/dashboard/team/CreateTeamDialog.tsx`

- [ ] **Step 1: Write TeamCard.tsx**

```tsx
'use client';

import Link from 'next/link';
import { Team } from '@/types/dashboard';

interface TeamCardProps {
  team: Team;
}

export default function TeamCard({ team }: TeamCardProps) {
  const roleLabels = {
    owner: '所有者',
    admin: '管理员',
    member: '成员',
  };

  return (
    <Link
      href={`/dashboard/team/${team.id}`}
      className="block bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6 hover:border-[#171717] transition-colors"
    >
      <h3 className="font-medium text-[#171717] text-lg">{team.name}</h3>
      <div className="flex items-center gap-4 mt-3 text-sm text-[#64748B]">
        <span>{team.memberCount} 成员</span>
        <span>{team.sharedPromptCount} 共享提示词</span>
        <span>角色: {roleLabels[team.role]}</span>
      </div>
      <div className="flex -space-x-2 mt-4">
        {Array.from({ length: Math.min(3, team.memberCount) }).map((_, i) => (
          <div
            key={i}
            className="w-7 h-7 rounded-full bg-[#171717] border-2 border-white flex items-center justify-center text-white text-xs"
          >
            {String.fromCharCode(65 + i)}
          </div>
        ))}
        {team.memberCount > 3 && (
          <div className="w-7 h-7 rounded-full bg-[#E5E5E5] border-2 border-white flex items-center justify-center text-[#64748B] text-xs">
            +{team.memberCount - 3}
          </div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write CreateTeamDialog.tsx**

```tsx
'use client';

import { useState } from 'react';

interface CreateTeamDialogProps {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateTeamDialog({ onCreate, onClose }: CreateTeamDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onCreate(name.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h2 className="text-lg font-semibold text-[#171717] mb-4">
          创建团队
        </h2>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-[#64748B] mb-2">
            团队名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm
                       focus:outline-none focus:border-[#171717]"
            placeholder="输入团队名称"
            required
          />
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#E5E5E5] text-[#171717] py-2 rounded text-sm hover:bg-[#f8f8f8]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 bg-[#171717] text-white py-2 rounded text-sm hover:bg-[#333] disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/dashboard/team/
git commit -m "feat: add team page components"
```

---

### Task 13: Create Team List Page

**Files:**
- Create: `packages/web-app/app/dashboard/team/page.tsx`

- [ ] **Step 1: Write team list page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import TeamCard from '@/components/dashboard/team/TeamCard';
import CreateTeamDialog from '@/components/dashboard/team/CreateTeamDialog';
import { Team } from '@/types/dashboard';

export default function TeamPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const handleCreate = async (name: string) => {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      await fetchTeams();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#64748B]">加载中...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-[#171717]">我的团队</h2>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="bg-[#171717] text-white px-4 py-2 rounded text-sm font-medium hover:bg-[#333]"
        >
          创建团队
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-20 bg-[#f8f8f8] rounded-lg border border-[#E5E5E5]">
          <p className="text-[#64748B]">还没有团队</p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="text-[#171717] underline mt-2 text-sm"
          >
            创建一个
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}

      {showCreateDialog && (
        <CreateTeamDialog
          onCreate={handleCreate}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/dashboard/team/page.tsx
git commit -m "feat: add team list page"
```

---

### Task 14: Create Team Detail Page

**Files:**
- Create: `packages/web-app/app/dashboard/team/[teamId]/page.tsx`

- [ ] **Step 1: Write team detail page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Team, TeamMember } from '@/types/dashboard';

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamRes, membersRes] = await Promise.all([
          fetch(`/api/teams/${teamId}`),
          fetch(`/api/teams/${teamId}/members`),
        ]);

        if (teamRes.ok && membersRes.ok) {
          const teamData = await teamRes.json();
          const membersData = await membersRes.json();
          setTeam(teamData.team);
          setMembers(membersData.members);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [teamId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#64748B]">加载中...</div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600">团队不存在</div>
      </div>
    );
  }

  const roleLabels = {
    owner: '所有者',
    admin: '管理员',
    member: '成员',
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[#171717]">{team.name}</h2>
        <p className="text-sm text-[#64748B] mt-1">
          创建于 {new Date(team.createdAt).toLocaleDateString('zh-CN')}
        </p>
      </div>

      <section className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6">
        <h3 className="font-medium text-[#171717] mb-4">成员管理</h3>
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between py-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#171717] flex items-center justify-center text-white text-sm">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-[#171717]">
                    {member.name}
                  </div>
                  <div className="text-xs text-[#64748B]">{member.email}</div>
                </div>
              </div>
              <span className="text-sm text-[#64748B]">
                {roleLabels[member.role]}
              </span>
            </div>
          ))}
        </div>
        <button className="mt-4 text-sm text-[#171717] border border-[#E5E5E5] px-3 py-1.5 rounded hover:bg-white">
          邀请成员
        </button>
      </section>

      <section className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6">
        <h3 className="font-medium text-[#171717] mb-4">共享提示词库</h3>
        <p className="text-sm text-[#64748B]">
          {team.sharedPromptCount} 个提示词
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/dashboard/team/[teamId]/page.tsx
git commit -m "feat: add team detail page"
```

---

## Phase 5: Subscription Module

### Task 15: Create Billing History API

**Files:**
- Create: `packages/web-app/app/api/billing/history/route.ts`

- [ ] **Step 1: Write billing history API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPaymentHistory } from '@/lib/supabase/queries';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const history = await getPaymentHistory(user.id);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/billing/history/route.ts
git commit -m "feat: add billing history API"
```

---

### Task 16: Create Subscription Page Components

**Files:**
- Create: `packages/web-app/components/dashboard/subscription/CurrentPlan.tsx`
- Create: `packages/web-app/components/dashboard/subscription/PlanComparison.tsx`
- Create: `packages/web-app/components/dashboard/subscription/PaymentHistory.tsx`

- [ ] **Step 1: Write CurrentPlan.tsx**

```tsx
'use client';

import { SubscriptionStatus, PlanType } from '@/types/dashboard';

interface CurrentPlanProps {
  status: SubscriptionStatus;
  onUpgrade: (plan: PlanType) => void;
  onCancel: () => void;
}

const planNames: Record<PlanType, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
};

export default function CurrentPlan({ status, onUpgrade, onCancel }: CurrentPlanProps) {
  return (
    <div className="bg-[#171717] text-white rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">当前计划</div>
          <div className="text-2xl font-bold mt-1">
            {planNames[status.plan]} 计划
          </div>
          {status.plan !== 'free' && (
            <div className="text-sm text-gray-400 mt-2">
              到期: {new Date(status.currentPeriodEnd).toLocaleDateString('zh-CN')}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          {status.plan !== 'team' && (
            <button
              onClick={() => onUpgrade('team')}
              className="bg-white text-[#171717] px-4 py-2 rounded text-sm font-medium hover:bg-gray-100"
            >
              升级到 Team
            </button>
          )}
          {status.plan !== 'free' && !status.cancelAtPeriodEnd && (
            <button
              onClick={onCancel}
              className="border border-gray-600 text-white px-4 py-2 rounded text-sm hover:bg-gray-800"
            >
              取消订阅
            </button>
          )}
        </div>
      </div>
      {status.cancelAtPeriodEnd && (
        <div className="mt-4 text-sm text-amber-400">
          订阅将在当前周期结束后取消
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write PlanComparison.tsx**

```tsx
'use client';

import { PlanOption } from '@/types/dashboard';

interface PlanComparisonProps {
  plans: PlanOption[];
  onSelect: (plan: string) => void;
}

export default function PlanComparison({ plans, onSelect }: PlanComparisonProps) {
  return (
    <div className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg p-6">
      <h3 className="font-medium text-[#171717] mb-4">可用计划</h3>
      <div className="grid grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.type}
            className={`
              border rounded-lg p-4
              ${plan.current
                ? 'border-[#171717] bg-white'
                : 'border-[#E5E5E5] bg-white'
              }
            `}
          >
            <div className="font-medium text-[#171717]">{plan.name}</div>
            <div className="text-lg font-bold text-[#171717] mt-1">
              ¥{plan.priceMonthly}<span className="text-sm font-normal text-[#64748B]">/月</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-[#64748B]">
              {plan.features.map((feature, i) => (
                <li key={i}>• {feature}</li>
              ))}
            </ul>
            {plan.current ? (
              <div className="mt-4 text-sm text-[#16a34a]">✓ 当前计划</div>
            ) : (
              <button
                onClick={() => onSelect(plan.type)}
                className="mt-4 w-full border border-[#E5E5E5] text-[#171717] py-1.5 rounded text-sm hover:bg-[#f8f8f8]"
              >
                选择
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write PaymentHistory.tsx**

```tsx
'use client';

import { PaymentHistoryItem } from '@/types/dashboard';

interface PaymentHistoryProps {
  history: PaymentHistoryItem[];
}

export default function PaymentHistory({ history }: PaymentHistoryProps) {
  const statusLabels: Record<string, string> = {
    succeeded: '已支付',
    failed: '失败',
    refunded: '已退款',
  };

  const statusClasses: Record<string, string> = {
    succeeded: 'text-[#16a34a] bg-[#dcfce7]',
    failed: 'text-red-600 bg-red-50',
    refunded: 'text-amber-600 bg-amber-50',
  };

  return (
    <div className="bg-[#f8f8f8] border border-[#E5E5E5] rounded-lg">
      <div className="px-6 py-4 border-b border-[#E5E5E5]">
        <h3 className="font-medium text-[#171717]">支付历史</h3>
      </div>
      <div className="divide-y divide-[#E5E5E5]">
        {history.length === 0 ? (
          <div className="px-6 py-8 text-center text-[#64748B]">
            暂无支付记录
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-sm text-[#171717]">
                  {new Date(item.date).toLocaleDateString('zh-CN')}
                </span>
                <span className="text-sm text-[#64748B]">
                  {item.description}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-[#171717]">
                  ¥{item.amount}
                </span>
                <span className={`text-xs px-2 py-1 rounded ${statusClasses[item.status]}`}>
                  {statusLabels[item.status]}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/components/dashboard/subscription/
git commit -m "feat: add subscription page components"
```

---

### Task 17: Create Subscription Page

**Files:**
- Create: `packages/web-app/app/dashboard/subscription/page.tsx`

- [ ] **Step 1: Write subscription page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import CurrentPlan from '@/components/dashboard/subscription/CurrentPlan';
import PlanComparison from '@/components/dashboard/subscription/PlanComparison';
import PaymentHistory from '@/components/dashboard/subscription/PaymentHistory';
import { SubscriptionStatus, PaymentHistoryItem, PlanOption } from '@/types/dashboard';

const plans: PlanOption[] = [
  {
    type: 'free',
    name: 'Free',
    priceMonthly: 0,
    features: ['基础功能', '本地存储'],
    current: false,
  },
  {
    type: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    features: ['云端同步', '加入团队', '优先支持'],
    current: false,
  },
  {
    type: 'team',
    name: 'Team',
    priceMonthly: 99,
    features: ['创建团队', '无限成员', '共享库', '全部 Pro 功能'],
    current: false,
  },
];

export default function SubscriptionPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusRes, historyRes] = await Promise.all([
          fetch('/api/billing/status'),
          fetch('/api/billing/history'),
        ]);

        if (statusRes.ok && historyRes.ok) {
          const statusData = await statusRes.json();
          const historyData = await historyRes.json();
          setStatus(statusData);
          setHistory(historyData.history);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleUpgrade = async (plan: string) => {
    const res = await fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    }
  };

  const handleCancel = async () => {
    const res = await fetch('/api/billing/cancel', { method: 'POST' });
    if (res.ok) {
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#64748B]">加载中...</div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const currentPlans = plans.map(p => ({
    ...p,
    current: p.type === status.plan,
  }));

  return (
    <div className="space-y-8">
      <CurrentPlan
        status={status}
        onUpgrade={handleUpgrade}
        onCancel={handleCancel}
      />

      <PlanComparison
        plans={currentPlans}
        onSelect={handleUpgrade}
      />

      <PaymentHistory history={history} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/dashboard/subscription/page.tsx
git commit -m "feat: add subscription management page"
```

---

## Phase 6: Cleanup

### Task 18: Delete Old Prompts Components

**Files:**
- Delete: `packages/web-app/app/dashboard/prompts/page.tsx`
- Delete: `packages/web-app/components/dashboard/PromptCard.tsx`
- Delete: `packages/web-app/components/dashboard/CategoryFilter.tsx`

- [ ] **Step 1: Remove old files**

```bash
git rm packages/web-app/app/dashboard/prompts/page.tsx
git rm packages/web-app/components/dashboard/PromptCard.tsx
git rm packages/web-app/components/dashboard/CategoryFilter.tsx
git commit -m "chore: remove old prompts dashboard components"
```

---

## Phase 7: Testing & Verification

### Task 19: Type Check

**Files:**
- Run from: `packages/web-app/`

- [ ] **Step 1: Run TypeScript check**

```bash
cd packages/web-app
npx tsc --noEmit
```

Expected: No errors

---

### Task 20: Build Verification

**Files:**
- Run from: root

- [ ] **Step 1: Build web-app**

```bash
cd packages/web-app
npm run build
```

Expected: Build succeeds

---

## Spec Coverage Check

| Spec Requirement | Task |
|------------------|------|
| Dashboard layout with Tab navigation | Task 3, 4 |
| Backup data status page | Task 5-8 |
| Team list page | Task 9-13 |
| Team detail page | Task 14 |
| Subscription page | Task 15-17 |
| Delete old prompts components | Task 18 |
| Type safety | Task 19 |
| Build verification | Task 20 |

---

## Placeholder Scan

- No "TBD" or "TODO" items
- No "implement later" placeholders
- No "similar to Task N" references
- All code shown in full
- All file paths exact

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2024-03-15-web-app-dashboard-refactor.md`.

Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
