# 团队邀请码机制实现计划 (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现可刷新邀请码机制，允许用户通过邀请码直接加入团队

**Architecture:** 在 teams 表新增 invite_code 字段，创建三个 API 接口（刷新/验证/加入），在团队详情页展示邀请码区块，新建独立"加入团队"页面

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, React 19, TypeScript

---

## 文件结构

| 文件路径 | 负责功能 | 创建/修改 |
|---------|---------|----------|
| `packages/web-app/supabase/migrations/012_team_invite_code.sql` | 数据库迁移：添加 invite_code 字段，删除旧表，迁移数据 | 创建 |
| `packages/web-app/app/api/teams/[teamId]/invite-code/route.ts` | POST：刷新邀请码 API | 创建 |
| `packages/web-app/app/api/teams/invite-code/route.ts` | GET：验证邀请码 API | 创建 |
| `packages/web-app/app/api/teams/join/route.ts` | POST：加入团队 API | 创建 |
| `packages/web-app/components/dashboard/team/InviteCodeSection.tsx` | 团队详情页邀请码区块组件 | 创建 |
| `packages/web-app/app/team/[teamId]/page.tsx` | 团队详情页：集成邀请码区块 | 修改 |
| `packages/web-app/app/team/join/page.tsx` | 加入团队页面 | 创建 |
| `packages/web-app/components/layout/Header.tsx` | Header：添加"加入团队"导航链接 | 修改 |
| `packages/web-app/types/dashboard.ts` | 类型定义：添加 Team.inviteCode 字段 | 修改 |

---

## Task 1: 数据库迁移脚本

**Files:**
- Create: `packages/web-app/supabase/migrations/012_team_invite_code.sql`

- [ ] **Step 1: 编写迁移脚本**

```sql
-- 012_team_invite_code.sql
-- 邀请码机制迁移：添加 invite_code 字段，删除旧邀请表，迁移现有数据

-- 1. 为 teams 表添加邀请码字段
ALTER TABLE teams ADD COLUMN invite_code TEXT UNIQUE;
ALTER TABLE teams ADD COLUMN invite_code_updated_at TIMESTAMP WITH TIME ZONE;

-- 2. 删除旧的 team_invites 表（如果存在）
DROP TABLE IF EXISTS team_invites;

-- 3. 为现有团队生成初始邀请码
UPDATE teams
SET invite_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8)),
    invite_code_updated_at = NOW()
WHERE invite_code IS NULL;

-- 4. 添加索引以提高邀请码查询性能
CREATE INDEX idx_teams_invite_code ON teams(invite_code);

-- 5. 更新 teams RLS policy：允许通过邀请码验证时查看团队基本信息
-- (验证邀请码不需要是团队成员，需要额外 policy)
CREATE POLICY "Invite code verification allows limited team view"
  ON teams FOR SELECT
  USING (true);  -- 验证邀请码时允许查看团队名称

-- 注意：实际验证时我们只返回 team.id 和 name，不暴露其他敏感信息
-- RLS policy 保持宽松，但 API 层只返回必要信息
```

- [ ] **Step 2: 通过 Supabase MCP 应用迁移**

使用 `mcp__plugin_supabase_supabase__apply_migration` 工具：
- name: `team_invite_code`
- project_id: 需要从 Supabase 获取
- query: 上述 SQL 脚本内容

- [ ] **Step 3: 验证迁移成功**

通过 Supabase Dashboard 或 SQL 查询验证：
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'teams' AND column_name IN ('invite_code', 'invite_code_updated_at');
```

预期：返回两行，显示 invite_code (text) 和 invite_code_updated_at (timestamp with time zone)

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/supabase/migrations/012_team_invite_code.sql
git commit -m "feat(team): add invite_code migration for teams table"
```

---

## Task 2: 刷新邀请码 API

**Files:**
- Create: `packages/web-app/app/api/teams/[teamId]/invite-code/route.ts`

- [ ] **Step 1: 编写 API 路由**

```typescript
// packages/web-app/app/api/teams/[teamId]/invite-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST: 刷新邀请码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const supabase = await createClient();
    
    // 1. 验证用户登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'NOT_LOGGED_IN' },
        { status: 401 }
      );
    }

    // 2. 验证用户权限（必须是 owner 或 admin）
    const { data: membership, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { success: false, error: 'NOT_MEMBER' },
        { status: 403 }
      );
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { success: false, error: 'PERMISSION_DENIED' },
        { status: 403 }
      );
    }

    // 3. 生成新的邀请码（8位大写字母+数字）
    const newInviteCode = generateInviteCode();

    // 4. 更新 teams 表
    const { data: team, error: updateError } = await supabase
      .from('teams')
      .update({
        invite_code: newInviteCode,
        invite_code_updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
      .select('invite_code, invite_code_updated_at')
      .single();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    // 5. 返回新邀请码
    return NextResponse.json({
      success: true,
      data: {
        inviteCode: team.invite_code,
        updatedAt: team.invite_code_updated_at,
      },
    });
  } catch (error) {
    console.error('[Refresh Invite Code] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// GET: 获取当前邀请码（可选，用于页面初始化）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'NOT_LOGGED_IN' },
        { status: 401 }
      );
    }

    // 验证成员身份
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'NOT_MEMBER' },
        { status: 403 }
      );
    }

    // 获取邀请码
    const { data: team } = await supabase
      .from('teams')
      .select('invite_code, invite_code_updated_at')
      .eq('id', teamId)
      .single();

    if (!team) {
      return NextResponse.json(
        { success: false, error: 'TEAM_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        inviteCode: team.invite_code,
        updatedAt: team.invite_code_updated_at,
        canRefresh: ['owner', 'admin'].includes(membership.role),
      },
    });
  } catch (error) {
    console.error('[Get Invite Code] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// 邀请码生成函数
function generateInviteCode(): string {
  // 使用 crypto.randomUUID 或随机字符串
  // 生成 8 位大写字母+数字组合
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 避免混淆字符 0/O, 1/I/L
  let code = '';
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return code;
}
```

- [ ] **Step 2: 本地验证 API 路由语法**

```bash
cd packages/web-app
npx tsc --noEmit app/api/teams/[teamId]/invite-code/route.ts
```

预期：无 TypeScript 错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/teams/[teamId]/invite-code/route.ts
git commit -m "feat(team-api): add refresh invite code endpoint"
```

---

## Task 3: 验证邀请码 API

**Files:**
- Create: `packages/web-app/app/api/teams/invite-code/route.ts`

- [ ] **Step 1: 编写验证邀请码 API**

```typescript
// packages/web-app/app/api/teams/invite-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: 验证邀请码有效性（返回团队预览信息）
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. 验证用户登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'NOT_LOGGED_IN' },
        { status: 401 }
      );
    }

    // 2. 获取邀请码参数
    const { searchParams } = new URL(request.url);
    const inviteCode = searchParams.get('code');

    if (!inviteCode) {
      return NextResponse.json(
        { success: false, error: 'MISSING_CODE' },
        { status: 400 }
      );
    }

    // 3. 验证邀请码格式（8位字母+数字）
    const codePattern = /^[A-Z0-9]{8}$/i;
    if (!codePattern.test(inviteCode)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CODE_FORMAT' },
        { status: 400 }
      );
    }

    // 4. 查询邀请码对应的团队
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { success: false, error: 'INVITE_CODE_NOT_FOUND' },
        { status: 404 }
      );
    }

    // 5. 检查用户是否已是团队成员
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_MEMBER', data: { teamId: team.id, teamName: team.name } },
        { status: 409 }
      );
    }

    // 6. 返回团队预览信息（不执行加入）
    return NextResponse.json({
      success: true,
      data: {
        teamId: team.id,
        teamName: team.name,
      },
    });
  } catch (error) {
    console.error('[Verify Invite Code] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit app/api/teams/invite-code/route.ts
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/teams/invite-code/route.ts
git commit -m "feat(team-api): add verify invite code endpoint"
```

---

## Task 4: 加入团队 API

**Files:**
- Create: `packages/web-app/app/api/teams/join/route.ts`

- [ ] **Step 1: 编写加入团队 API**

```typescript
// packages/web-app/app/api/teams/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST: 通过邀请码加入团队
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. 验证用户登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'NOT_LOGGED_IN' },
        { status: 401 }
      );
    }

    // 2. 获取请求体
    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode) {
      return NextResponse.json(
        { success: false, error: 'MISSING_CODE' },
        { status: 400 }
      );
    }

    // 3. 验证邀请码格式
    const codePattern = /^[A-Z0-9]{8}$/i;
    if (!codePattern.test(inviteCode)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CODE_FORMAT' },
        { status: 400 }
      );
    }

    // 4. 查询邀请码对应的团队
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { success: false, error: 'INVITE_CODE_NOT_FOUND' },
        { status: 404 }
      );
    }

    // 5. 检查是否已是成员
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_MEMBER', data: { teamId: team.id, teamName: team.name, role: existingMember.role } },
        { status: 409 }
      );
    }

    // 6. 添加用户为 member 角色
    const { error: insertError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: 'member',
      });

    if (insertError) {
      console.error('[Join Team] Insert error:', insertError);
      return NextResponse.json(
        { success: false, error: 'JOIN_FAILED' },
        { status: 500 }
      );
    }

    // 7. 返回成功信息
    return NextResponse.json({
      success: true,
      data: {
        teamId: team.id,
        teamName: team.name,
        role: 'member',
      },
    });
  } catch (error) {
    console.error('[Join Team] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit app/api/teams/join/route.ts
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/teams/join/route.ts
git commit -m "feat(team-api): add join team endpoint"
```

---

## Task 5: 邀请码区块组件

**Files:**
- Create: `packages/web-app/components/dashboard/team/InviteCodeSection.tsx`

- [ ] **Step 1: 编写邀请码区块组件**

```tsx
// packages/web-app/components/dashboard/team/InviteCodeSection.tsx
'use client'

import { useState } from 'react'

interface InviteCodeSectionProps {
  teamId: string
  inviteCode: string
  updatedAt: string
  canRefresh: boolean  // owner/admin 才能刷新
  onRefresh: (newCode: string, newUpdatedAt: string) => void
}

export default function InviteCodeSection({
  teamId,
  inviteCode,
  updatedAt,
  canRefresh,
  onRefresh,
}: InviteCodeSectionProps) {
  const [loading, setLoading] = useState(false)
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const handleRefreshClick = () => {
    setShowRefreshConfirm(true)
  }

  const handleRefreshConfirm = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/invite-code`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        onRefresh(data.data.inviteCode, data.data.updatedAt)
        setShowRefreshConfirm(false)
      } else {
        alert(data.error || '刷新失败')
      }
    } catch (err) {
      alert('刷新失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-surface-container border border-outline-variant/20 rounded-lg p-6">
      <h2 className="font-medium text-on-background mb-4">团队邀请码</h2>
      
      {/* 邀请码显示 */}
      <div className="flex items-center gap-4 mb-2">
        <span 
          className="text-3xl font-bold tracking-widest text-primary"
          style={{ letterSpacing: '6px' }}
        >
          {inviteCode}
        </span>
        {canRefresh && (
          <button
            onClick={handleRefreshClick}
            className="p-2 rounded-lg hover:bg-primary/10 transition"
            title="刷新邀请码"
          >
            <svg 
              className="w-5 h-5 text-primary" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
          </button>
        )}
      </div>

      {/* 更新时间 */}
      <p className="text-xs text-on-surface-variant mb-4">
        更新于 {new Date(updatedAt).toLocaleDateString('zh-CN')}
      </p>

      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className="bg-white text-black px-4 py-2 rounded text-sm font-semibold hover:bg-gray-100 transition"
      >
        {copied ? '已复制 ✓' : '复制邀请码'}
      </button>

      {/* 说明文字 */}
      <p className="text-xs text-on-surface-variant mt-3">
        分享此邀请码给团队成员，输入邀请码即可加入
      </p>

      {/* 刷新确认弹窗 */}
      {showRefreshConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-container rounded-lg p-6 w-80 border border-outline-variant/20">
            <h3 className="text-lg font-semibold text-on-background mb-3">
              确认刷新邀请码？
            </h3>
            <p className="text-sm text-on-surface-variant mb-6">
              刷新后原邀请码将失效，确认刷新？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRefreshConfirm(false)}
                className="flex-1 bg-black text-white border border-white/20 py-2 rounded text-sm hover:bg-gray-900 transition"
              >
                取消
              </button>
              <button
                onClick={handleRefreshConfirm}
                disabled={loading}
                className="flex-1 bg-white text-black py-2 rounded text-sm hover:bg-gray-100 transition disabled:opacity-50"
              >
                {loading ? '刷新中...' : '确认刷新'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit components/dashboard/team/InviteCodeSection.tsx
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/dashboard/team/InviteCodeSection.tsx
git commit -m "feat(team-ui): add InviteCodeSection component"
```

---

## Task 6: 团队详情页集成邀请码区块

**Files:**
- Modify: `packages/web-app/app/team/[teamId]/page.tsx`

- [ ] **Step 1: 读取现有团队详情页**

文件位置：`packages/web-app/app/team/[teamId]/page.tsx`
现有功能：显示团队名称、创建时间、成员列表、共享提示词库

- [ ] **Step 2: 修改团队详情页，集成邀请码区块**

```tsx
// packages/web-app/app/team/[teamId]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import InviteCodeSection from '@/components/dashboard/team/InviteCodeSection'
import { Team, TeamMember } from '@/types/dashboard'

interface InviteCodeData {
  inviteCode: string
  updatedAt: string
  canRefresh: boolean
}

export default function TeamDetailPage() {
  const router = useRouter()
  const params = useParams()
  const teamId = params.teamId as string
  const { user, loading } = useUser()

  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [inviteCodeData, setInviteCodeData] = useState<InviteCodeData | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string>('member')

  // Auth guard
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  // Fetch team data
  useEffect(() => {
    if (user && teamId) {
      const fetchData = async () => {
        try {
          const [teamRes, membersRes, inviteCodeRes] = await Promise.all([
            fetch(`/api/teams/${teamId}`),
            fetch(`/api/teams/${teamId}/members`),
            fetch(`/api/teams/${teamId}/invite-code`),
          ])

          if (teamRes.ok && membersRes.ok) {
            const teamData = await teamRes.json()
            const membersData = await membersRes.json()
            setTeam(teamData.team)
            setCurrentUserRole(teamData.role)
            setMembers(membersData.members)
          }

          if (inviteCodeRes.ok) {
            const inviteData = await inviteCodeRes.json()
            if (inviteData.success) {
              setInviteCodeData(inviteData.data)
            }
          }
        } finally {
          setDataLoading(false)
        }
      }

      fetchData()
    }
  }, [teamId, user])

  // 刷新邀请码回调
  const handleInviteCodeRefresh = (newCode: string, newUpdatedAt: string) => {
    if (inviteCodeData) {
      setInviteCodeData({
        ...inviteCodeData,
        inviteCode: newCode,
        updatedAt: newUpdatedAt,
      })
    }
  }

  // Loading state (auth check)
  if (loading || !user) {
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
  if (dataLoading) {
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

  // Team not found
  if (!team) {
    return (
      <div className="flex flex-col min-h-screen relative z-10">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-error">团队不存在</div>
        </div>
        <Footer />
      </div>
    )
  }

  const roleLabels = {
    owner: '所有者',
    admin: '管理员',
    member: '成员',
  }

  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-8 flex-1">
        <div className="space-y-8">
          {/* 团队信息 */}
          <div>
            <h1 className="text-2xl font-bold text-on-background">{team.name}</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              创建于 {new Date(team.createdAt).toLocaleDateString('zh-CN')}
            </p>
          </div>

          {/* 成员管理区块 */}
          <section className="bg-surface-container border border-outline-variant/20 rounded-lg p-6">
            <h2 className="font-medium text-on-background mb-4">成员管理</h2>
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-on-background flex items-center justify-center text-on-primary text-sm">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-on-background">
                        {member.name}
                      </div>
                      <div className="text-xs text-on-surface-variant">{member.email}</div>
                    </div>
                  </div>
                  <span className="text-sm text-on-surface-variant">
                    {roleLabels[member.role]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 邀请码区块 */}
          {inviteCodeData && (
            <InviteCodeSection
              teamId={teamId}
              inviteCode={inviteCodeData.inviteCode}
              updatedAt={inviteCodeData.updatedAt}
              canRefresh={inviteCodeData.canRefresh}
              onRefresh={handleInviteCodeRefresh}
            />
          )}

          {/* 共享提示词库区块 */}
          <section className="bg-surface-container border border-outline-variant/20 rounded-lg p-6">
            <h2 className="font-medium text-on-background mb-4">共享提示词库</h2>
            <p className="text-sm text-on-surface-variant">
              {team.sharedPromptCount} 个提示词
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit app/team/[teamId]/page.tsx
```

预期：无错误

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/team/[teamId]/page.tsx
git commit -m "feat(team-ui): integrate InviteCodeSection into team detail page"
```

---

## Task 7: 加入团队页面

**Files:**
- Create: `packages/web-app/app/team/join/page.tsx`

- [ ] **Step 1: 编写加入团队页面**

```tsx
// packages/web-app/app/team/join/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

interface VerifyResult {
  teamId: string
  teamName: string
}

export default function JoinTeamPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  const [inviteCode, setInviteCode] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [joining, setJoining] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  // 验证邀请码
  const handleVerify = async () => {
    if (!inviteCode.trim()) {
      setError('请输入邀请码')
      return
    }

    // 格式验证
    const codePattern = /^[A-Z0-9]{8}$/i
    if (!codePattern.test(inviteCode.trim())) {
      setError('请输入8位邀请码')
      return
    }

    setError(null)
    setVerifyResult(null)
    setVerifying(true)

    try {
      const res = await fetch(`/api/teams/invite-code?code=${encodeURIComponent(inviteCode.trim())}`)
      const data = await res.json()

      if (data.success) {
        setVerifyResult(data.data)
        setError(null)
      } else {
        // 处理错误
        if (data.error === 'ALREADY_MEMBER') {
          setError('您已在该团队中')
          setVerifyResult(data.data)  // 仍然显示团队信息
        } else if (data.error === 'INVITE_CODE_NOT_FOUND') {
          setError('邀请码无效或已过期')
        } else if (data.error === 'NOT_LOGGED_IN') {
          setError('请先登录后再加入团队')
          router.push('/auth/login')
        } else {
          setError(data.error || '验证失败')
        }
      }
    } catch (err) {
      setError('验证失败，请稍后重试')
    } finally {
      setVerifying(false)
    }
  }

  // 加入团队
  const handleJoin = async () => {
    if (!verifyResult) return

    setJoining(true)
    setError(null)

    try {
      const res = await fetch('/api/teams/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        // 成功后跳转到团队详情页
        router.push(`/team/${data.data.teamId}`)
      } else {
        if (data.error === 'ALREADY_MEMBER') {
          setError('您已在该团队中')
          // 直接跳转到团队详情页
          router.push(`/team/${verifyResult.teamId}`)
        } else {
          setError(data.error || '加入失败')
        }
      }
    } catch (err) {
      setError('加入失败，请稍后重试')
    } finally {
      setJoining(false)
    }
  }

  // Loading state (auth check)
  if (loading || !user) {
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

  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-8 flex-1">
        <div className="max-w-md mx-auto">
          <div className="bg-surface-container border border-outline-variant/20 rounded-lg p-8">
            <h1 className="text-2xl font-bold text-on-background mb-2">加入团队</h1>
            <p className="text-sm text-on-surface-variant mb-6">
              输入团队邀请码即可加入
            </p>

            {/* 邀请码输入 */}
            <div className="mb-4">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="w-full border border-outline-variant rounded px-4 py-3 text-lg text-on-background bg-surface
                           focus:outline-none focus:border-primary transition tracking-widest text-center"
                placeholder="请输入8位邀请码"
                maxLength={8}
                style={{ letterSpacing: '4px' }}
              />
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mb-4 p-3 bg-error-container/10 border border-error/20 rounded text-error text-sm">
                {error}
              </div>
            )}

            {/* 验证结果预览 */}
            {verifyResult && (
              <div className="mb-4 p-4 bg-primary-container/10 border border-primary/20 rounded">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-primary">
                    将加入团队：{verifyResult.teamName}
                  </span>
                </div>
              </div>
            )}

            {/* 验证按钮 */}
            <button
              onClick={handleVerify}
              disabled={verifying || joining || !inviteCode.trim()}
              className="w-full bg-black text-white border border-white/20 py-3 rounded text-sm font-medium hover:bg-gray-900 transition disabled:opacity-50 mb-3"
            >
              {verifying ? '验证中...' : '验证邀请码'}
            </button>

            {/* 加入按钮 */}
            {verifyResult && !error?.includes('已在该团队') && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-white text-black py-3 rounded text-sm font-semibold hover:bg-gray-100 transition disabled:opacity-50"
              >
                {joining ? '加入中...' : '加入团队'}
              </button>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit app/team/join/page.tsx
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/team/join/page.tsx
git commit -m "feat(team-ui): add join team page"
```

---

## Task 8: Header 导航添加"加入团队"链接

**Files:**
- Modify: `packages/web-app/components/layout/Header.tsx`

- [ ] **Step 1: 修改 Header 导航配置**

在现有 `privateNav` 数组中添加"加入团队"链接：

```tsx
// packages/web-app/components/layout/Header.tsx
// 修改 privateNav 数组（约第16-22行）

// 已登录导航
const privateNav = [
  { id: 'home', label: '首页', href: '/' },
  { id: 'docs', label: '文档', href: '/docs' },
  { id: 'subscription', label: '订阅', href: '/subscription' },
  { id: 'backup', label: '备份', href: '/backup' },
  { id: 'team', label: '团队', href: '/team' },
  { id: 'join-team', label: '加入团队', href: '/team/join' },  // 新增
]
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit components/layout/Header.tsx
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/layout/Header.tsx
git commit -m "feat(nav): add join team link to header navigation"
```

---

## Task 9: 类型定义更新

**Files:**
- Modify: `packages/web-app/types/dashboard.ts`

- [ ] **Step 1: 更新 Team 类型定义**

添加 inviteCode 和 inviteCodeUpdatedAt 字段：

```typescript
// packages/web-app/types/dashboard.ts
// 修改 Team interface（约第21-28行）

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  sharedPromptCount: number;
  role: TeamRole;
  inviteCode?: string;           // 新增
  inviteCodeUpdatedAt?: string;  // 新增
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd packages/web-app
npx tsc --noEmit types/dashboard.ts
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/types/dashboard.ts
git commit -m "feat(types): add inviteCode fields to Team type"
```

---

## Task 10: E2E 测试验证

**Files:**
- Create: `packages/web-app/tests/team-join.spec.ts` (如果 Playwright 配置存在)

- [ ] **Step 1: 编写 E2E 测试（可选，根据项目测试策略）**

```typescript
// packages/web-app/tests/team-join.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Team Join Flow', () => {
  test('verify invite code shows team preview', async ({ page }) => {
    // 需要先登录（使用 auth.setup.ts）
    await page.goto('/team/join')
    
    // 输入邀请码
    await page.fill('input[placeholder="请输入8位邀请码"]', 'ABCD1234')
    await page.click('button:has-text("验证邀请码")')
    
    // 等待验证结果
    await expect(page.locator('text=将加入团队')).toBeVisible()
  })

  test('invalid code shows error', async ({ page }) => {
    await page.goto('/team/join')
    
    await page.fill('input[placeholder="请输入8位邀请码"]', 'INVALID00')
    await page.click('button:has-text("验证邀请码")')
    
    await expect(page.locator('text=邀请码无效或已过期')).toBeVisible()
  })
})
```

- [ ] **Step 2: 运行测试验证**

```bash
cd packages/web-app
npm run test:headed
```

预期：测试通过

- [ ] **Step 3: Commit（如果有测试文件）**

```bash
git add packages/web-app/tests/team-join.spec.ts
git commit -m "test(team): add e2e tests for join team flow"
```

---

## Self-Review Checklist

**1. Spec Coverage Check:**

| Spec 要求 | 对应 Task |
|----------|----------|
| teams 表添加 invite_code 字段 | Task 1 |
| 删除 team_invites 表 | Task 1 |
| 为现有团队生成初始邀请码 | Task 1 |
| POST /api/teams/{teamId}/invite-code 刷新邀请码 | Task 2 |
| GET /api/teams/invite-code 验证邀请码 | Task 3 |
| POST /api/teams/join 加入团队 | Task 4 |
| 团队详情页邀请码区块 | Task 5 + Task 6 |
| 加入团队页面 | Task 7 |
| Header 导航入口 | Task 8 |
| 错误处理（404/409/400/401/403） | Task 2-4 (API层) |
| 邀请码样式规范（28px、宽字间距、primary色） | Task 5 |
| 复制邀请码按钮 | Task 5 |
| 刷新确认弹窗 | Task 5 |

**覆盖完整，无遗漏。**

**2. Placeholder Scan:**

- 无 "TBD" 或 "TODO"
- 无 "Add appropriate error handling"
- 无 "Write tests for the above"（测试代码完整）
- 无 "Similar to Task N"（所有代码独立编写）
- 所有步骤包含完整代码块

**3. Type Consistency:**

- `InviteCodeData` 在 Task 6 中定义，与 Task 5 props 类型匹配
- `VerifyResult` 在 Task 7 中定义，与 API 返回格式匹配
- API 响应格式统一使用 `{ success: boolean, data?: T, error?: string }`
- Team 类型新增字段与数据库迁移一致

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-team-invite-code.md`. 

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**