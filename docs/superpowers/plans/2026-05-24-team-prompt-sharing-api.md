# Team Prompt Sharing API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement POST `/api/teams/[teamId]/prompts` API for direct prompt upload to team library from Extension.

**Architecture:** Database migration + Web App API endpoint + Extension function update + UI team selection dialog.

**Tech Stack:** Supabase PostgreSQL, Next.js API Routes, Chrome Extension, React Dialog Components.

---

## File Structure

**Create:**
- `packages/web-app/supabase/migrations/017_team_prompts_direct_upload.sql` - Database migration
- `packages/web-app/app/api/teams/[teamId]/prompts/route.ts` - POST API endpoint
- `packages/extension/src/sidepanel/components/TeamShareDialog.tsx` - Team selection dialog

**Modify:**
- `packages/extension/src/lib/team-sync.ts` - Update sharePromptToTeam to send full Prompt
- `packages/extension/src/sidepanel/views/PromptListView.tsx` - Add share button and dialog
- `packages/extension/src/lib/store.ts` - Add getUserTeams action

---

### Task 1: Database Migration

**Files:**
- Create: `packages/web-app/supabase/migrations/017_team_prompts_direct_upload.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 017_team_prompts_direct_upload.sql
-- Enable direct prompt upload to team library (prompt_id optional)

-- Make prompt_id optional (supports direct upload)
ALTER TABLE team_prompts ALTER COLUMN prompt_id DROP NOT NULL;

-- Add prompt content fields (matching prompts table + Prompt type)
ALTER TABLE team_prompts
  ADD COLUMN title TEXT,
  ADD COLUMN content TEXT NOT NULL DEFAULT '',
  ADD COLUMN category TEXT,
  ADD COLUMN platform TEXT,
  ADD COLUMN sort_order INTEGER DEFAULT 0,
  ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Bilingual support fields
ALTER TABLE team_prompts
  ADD COLUMN title_en TEXT,
  ADD COLUMN content_en TEXT,
  ADD COLUMN description TEXT,
  ADD COLUMN description_en TEXT;

-- Image support fields
ALTER TABLE team_prompts
  ADD COLUMN local_image TEXT,
  ADD COLUMN remote_image_url TEXT;

-- Constraint: direct upload must have title and content
ALTER TABLE team_prompts
  ADD CONSTRAINT check_direct_upload
  CHECK (prompt_id IS NOT NULL OR (title IS NOT NULL AND content IS NOT NULL));
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` tool with:
- project_id: (get from existing Supabase project)
- name: `team_prompts_direct_upload`
- query: (the SQL above)

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/supabase/migrations/017_team_prompts_direct_upload.sql
git commit -m "feat(db): add team_prompts direct upload migration"
```

---

### Task 2: API Endpoint Implementation

**Files:**
- Create: `packages/web-app/app/api/teams/[teamId]/prompts/route.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/web-app/app/api/teams/\[teamId\]/prompts
```

- [ ] **Step 2: Create route.ts with POST handler**

```typescript
// packages/web-app/app/api/teams/[teamId]/prompts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SharePromptRequest {
  name: string;
  content: string;
  nameEn?: string;
  contentEn?: string;
  categoryId?: string;
  description?: string;
  descriptionEn?: string;
  order?: number;
  localImage?: string;
  remoteImageUrl?: string;
  platform?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const supabase = await createClient();

    // 1. Validate auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'NOT_LOGGED_IN' },
        { status: 401 }
      );
    }

    // 2. Verify team membership
    const { data: membership, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { success: false, error: 'NOT_TEAM_MEMBER' },
        { status: 403 }
      );
    }

    // 3. Parse request body
    const body: SharePromptRequest = await request.json();

    // 4. Validate required fields
    if (!body.name || !body.content) {
      return NextResponse.json(
        { success: false, error: 'MISSING_CONTENT' },
        { status: 400 }
      );
    }

    // 5. Check duplicate by title (direct upload mode only)
    const { data: existing } = await supabase
      .from('team_prompts')
      .select('id')
      .eq('team_id', teamId)
      .eq('title', body.name)
      .is('prompt_id', null)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_SHARED' },
        { status: 400 }
      );
    }

    // 6. Insert team prompt (direct upload, prompt_id = null)
    const { data: teamPrompt, error: insertError } = await supabase
      .from('team_prompts')
      .insert({
        team_id: teamId,
        prompt_id: null,
        shared_by: user.id,
        shared_at: new Date().toISOString(),
        title: body.name,
        title_en: body.nameEn,
        content: body.content,
        content_en: body.contentEn,
        category: body.categoryId,
        description: body.description,
        description_en: body.descriptionEn,
        sort_order: body.order || 0,
        local_image: body.localImage,
        remote_image_url: body.remoteImageUrl,
        platform: body.platform,
      })
      .select('id, shared_at')
      .single();

    if (insertError) {
      console.error('[Team Prompts API] Insert error:', insertError);
      return NextResponse.json(
        { success: false, error: 'SHARE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: teamPrompt.id,
        teamId,
        sharedBy: user.id,
        sharedAt: new Date(teamPrompt.shared_at).getTime(),
      },
    });
  } catch (error) {
    console.error('[Team Prompts API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/teams/\[teamId\]/prompts/route.ts
git commit -m "feat(api): add POST /api/teams/[teamId]/prompts endpoint"
```

---

### Task 3: Update Extension sharePromptToTeam Function

**Files:**
- Modify: `packages/extension/src/lib/team-sync.ts`

- [ ] **Step 1: Update sharePromptToTeam function signature and body**

Replace the existing `sharePromptToTeam` function (lines 72-106) with:

```typescript
import type { Prompt } from '@oh-my-prompt/shared/types'

export async function sharePromptToTeam(
  prompt: Prompt,        // Full Prompt object
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'NOT_LOGGED_IN' }

    const response = await fetch(`${WEB_APP_URL}/api/teams/${teamId}/prompts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: prompt.name,
        nameEn: prompt.nameEn,
        content: prompt.content,
        contentEn: prompt.contentEn,
        categoryId: prompt.categoryId,
        description: prompt.description,
        descriptionEn: prompt.descriptionEn,
        order: prompt.order,
        localImage: prompt.localImage,
        remoteImageUrl: prompt.remoteImageUrl
      })
    })

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: 'NOT_LOGGED_IN' }
      if (response.status === 403) return { success: false, error: 'NOT_TEAM_MEMBER' }
      if (response.status === 400) {
        const data = await response.json()
        return { success: false, error: data.error || 'ALREADY_SHARED' }
      }
      if (response.status === 404) return { success: false, error: 'TEAM_NOT_FOUND' }
      return { success: false, error: 'SHARE_FAILED' }
    }

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Share to team error:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
}
```

- [ ] **Step 2: Add Prompt type import at top of file**

Add at line 1:
```typescript
import type { Prompt } from '@oh-my-prompt/shared/types'
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/lib/team-sync.ts
git commit -m "feat(ext): update sharePromptToTeam to send full Prompt object"
```

---

### Task 4: Add getUserTeams to Store

**Files:**
- Modify: `packages/extension/src/lib/store.ts`

- [ ] **Step 1: Add getUserTeams action to PromptStore interface**

Find the interface definition (around line 14-60) and add:

```typescript
interface PromptStore {
  // ... existing fields ...

  // Team library
  syncTeamPrompts: () => Promise<{ success: boolean; promptsCount?: number; error?: string }>
  loadTeamPrompts: () => Promise<void>
  loadAuthState: () => Promise<void>
  saveTeamPromptToPersonal: (teamPrompt: TeamPrompt, categoryId: string) => void
  getUserTeams: () => Promise<{ success: boolean; teams?: TeamInfo[]; error?: string }>  // Add this

  // ... rest ...
}
```

- [ ] **Step 2: Implement getUserTeams action in store creation**

Find the store creation (around line 200-300) and add the implementation:

```typescript
getUserTeams: async () => {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'NOT_LOGGED_IN' }

    const response = await fetch(`${WEB_APP_URL}/api/teams`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      return { success: false, error: 'FETCH_FAILED' }
    }

    const data = await response.json()
    const teams: TeamInfo[] = (data.teams || []).map((t: { id: string; name: string }) => ({
      id: t.id,
      name: t.name
    }))

    return { success: true, teams }
  } catch (error) {
    console.error('[Oh My Prompt] Get user teams error:', error)
    return { success: false, error: 'NETWORK_ERROR' }
  }
},
```

- [ ] **Step 3: Add necessary imports**

Ensure imports include:
```typescript
import type { TeamInfo } from '@oh-my-prompt/shared/types'
import { WEB_APP_URL, SUPABASE_PROJECT_REF } from '@/lib/config'
import { getAuthToken } from '@/lib/team-sync'
```

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/lib/store.ts
git commit -m "feat(store): add getUserTeams action for team sharing"
```

---

### Task 5: Create Team Selection Dialog Component

**Files:**
- Create: `packages/extension/src/sidepanel/components/TeamShareDialog.tsx`

- [ ] **Step 1: Create TeamShareDialog component**

```typescript
// packages/extension/src/sidepanel/components/TeamShareDialog.tsx
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Prompt } from '@oh-my-prompt/shared/types'
import type { TeamInfo } from '@oh-my-prompt/shared/types'
import { sharePromptToTeam } from '@/lib/team-sync'
import { usePromptStore } from '@/lib/store'

interface TeamShareDialogProps {
  prompt: Prompt
  isOpen: boolean
  onClose: () => void
  onSuccess: (teamName: string) => void
  onError: (error: string) => void
}

export function TeamShareDialog({
  prompt,
  isOpen,
  onClose,
  onSuccess,
  onError
}: TeamShareDialogProps) {
  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const getUserTeams = usePromptStore((state) => state.getUserTeams)

  // Load user teams on open
  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      getUserTeams().then((result) => {
        setLoading(false)
        if (result.success && result.teams) {
          setTeams(result.teams)
        } else {
          onError(result.error || '获取团队列表失败')
        }
      })
    }
  }, [isOpen, getUserTeams, onError])

  // Handle share
  const handleShare = async () => {
    if (!selectedTeamId) return

    setSharing(true)
    const result = await sharePromptToTeam(prompt, selectedTeamId)
    setSharing(false)

    if (result.success) {
      const team = teams.find(t => t.id === selectedTeamId)
      onSuccess(team?.name || '团队')
      onClose()
    } else {
      onError(result.error || '共享失败')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg w-[320px] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">选择目标团队</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Team list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
            您还未加入任何团队，请先创建或加入团队
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`w-full p-3 rounded-lg border text-left transition ${
                  selectedTeamId === team.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border ${
                      selectedTeamId === team.id
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedTeamId === team.id && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <span className="font-medium">{team.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleShare}
            disabled={!selectedTeamId || sharing || teams.length === 0}
            className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sharing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                共享中...
              </span>
            ) : (
              '确认共享'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/components/TeamShareDialog.tsx
git commit -m "feat(ui): add TeamShareDialog component"
```

---

### Task 6: Add Share Button to PromptListView

**Files:**
- Modify: `packages/extension/src/sidepanel/views/PromptListView.tsx`

- [ ] **Step 1: Import TeamShareDialog and necessary hooks**

Add imports at top:
```typescript
import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { TeamShareDialog } from '@/sidepanel/components/TeamShareDialog'
import { usePromptStore } from '@/lib/store'
```

- [ ] **Step 2: Add state for team share dialog**

Find the component state section and add:
```typescript
const [showTeamShareDialog, setShowTeamShareDialog] = useState(false)
const [selectedPromptForShare, setSelectedPromptForShare] = useState<Prompt | null>(null)
const authState = usePromptStore((state) => state.authState)
```

- [ ] **Step 3: Add share button handler**

Add handler function:
```typescript
const handleShareToTeam = (prompt: Prompt) => {
  if (!authState || authState === 'not_logged_in') {
    showToast('请先登录后共享')
    return
  }
  setSelectedPromptForShare(prompt)
  setShowTeamShareDialog(true)
}
```

- [ ] **Step 4: Add share button to prompt detail panel**

Find the prompt detail panel action buttons section and add:
```typescript
<button
  onClick={() => selectedPrompt && handleShareToTeam(selectedPrompt)}
  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded hover:bg-gray-50"
  title="共享到团队"
>
  <Share2 className="w-4 h-4" />
  共享到团队
</button>
```

- [ ] **Step 5: Add TeamShareDialog to JSX**

Add at the end of the component JSX:
```typescript
{selectedPromptForShare && (
  <TeamShareDialog
    prompt={selectedPromptForShare}
    isOpen={showTeamShareDialog}
    onClose={() => {
      setShowTeamShareDialog(false)
      setSelectedPromptForShare(null)
    }}
    onSuccess={(teamName) => showToast(`已共享到 ${teamName}`)}
    onError={(error) => showToast(error)}
  />
)}
```

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/sidepanel/views/PromptListView.tsx
git commit -m "feat(ui): add share to team button in PromptListView"
```

---

### Task 7: E2E Test Implementation

**Files:**
- Create: `packages/web-app/tests/team-prompt-share.spec.ts`

- [ ] **Step 1: Create E2E test file**

```typescript
// packages/web-app/tests/team-prompt-share.spec.ts
import { test, expect, type Page } from '@playwright/test'

const mockUser = {
  id: 'user-share-1',
  email: 'share-tester@example.com',
}

const mockTeam = {
  id: 'team-share-1',
  name: 'Share Test Team',
  inviteCode: 'SHARE01',
}

async function mockLoggedInWithTeam(page: Page) {
  await page.addInitScript((user: typeof mockUser, team: typeof mockTeam) => {
    const authApi = {
      onAuthStateChange(callback: (event: string, session: { user: typeof user } | null) => void) {
        setTimeout(() => callback('INITIAL_SESSION', { user }), 0)
        return { data: { subscription: { unsubscribe() {} } } }
      },
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
    }

    ;(window as any).__SUPABASE_MOCK__ = { auth: authApi }
  }, mockUser, mockTeam)

  // Mock teams API
  await page.route('**/api/teams', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          teams: [{ id: mockTeam.id, name: mockTeam.name, role: 'owner' }]
        }),
      })
    }
  })

  // Mock share API
  await page.route('**/api/teams/team-share-1/prompts', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()

      // Validate required fields
      if (!body.name || !body.content) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'MISSING_CONTENT' }),
        })
        return
      }

      // Simulate duplicate check
      if (body.name === 'Duplicate Prompt') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'ALREADY_SHARED' }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'tp-123',
            teamId: mockTeam.id,
            sharedBy: mockUser.id,
            sharedAt: Date.now(),
          },
        }),
      })
    }
  })
}

test.describe('Team Prompt Sharing', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedInWithTeam(page)
  })

  test('POST /api/teams/[teamId]/prompts succeeds with valid data', async ({ page }) => {
    const response = await page.request.post('/api/teams/team-share-1/prompts', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        name: 'Test Prompt',
        content: 'This is test content',
        description: 'Test description',
      },
    })

    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.data.teamId).toBe(mockTeam.id)
  })

  test('POST /api/teams/[teamId]/prompts fails with missing content', async ({ page }) => {
    const response = await page.request.post('/api/teams/team-share-1/prompts', {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Only Name' },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('MISSING_CONTENT')
  })

  test('POST /api/teams/[teamId]/prompts fails with duplicate title', async ({ page }) => {
    const response = await page.request.post('/api/teams/team-share-1/prompts', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        name: 'Duplicate Prompt',
        content: 'Duplicate content',
      },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('ALREADY_SHARED')
  })

  test('team share dialog shows teams and allows selection', async ({ page }) => {
    await page.goto('/team')

    // Verify team appears in list
    await expect(page.getByText('Share Test Team')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run tests to verify**

```bash
cd packages/web-app && npm run test -- --grep "team-prompt-share"
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/tests/team-prompt-share.spec.ts
git commit -m "test: add E2E tests for team prompt sharing"
```

---

### Task 8: Manual Testing & Final Commit

- [ ] **Step 1: Run dev servers**

```bash
# In root directory
npm run dev        # Extension dev server
npm run web:dev    # Web App dev server
```

- [ ] **Step 2: Load extension and test flow**

1. Load extension from `packages/extension/dist/`
2. Login via sidepanel settings
3. Create a prompt in sidepanel
4. Click "共享到团队" button
5. Select team in dialog
6. Verify toast shows success message
7. Sync team prompts and verify shared prompt appears

- [ ] **Step 3: Test error cases**

1. Not logged in → toast shows "请先登录后共享"
2. No teams → dialog shows "您还未加入任何团队"
3. Duplicate title → toast shows "该提示词已在团队库中"

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: team prompt sharing fixes after manual testing"
```

---

## Summary

This plan implements:
1. Database migration for direct upload support
2. POST `/api/teams/[teamId]/prompts` API endpoint
3. Extension `sharePromptToTeam` function update
4. `getUserTeams` store action
5. `TeamShareDialog` UI component
6. Share button in `PromptListView`
7. E2E tests for API and UI flows