# Team Prompt Sharing API Design

**日期:** 2026-05-24
**模块:** 团队提示词共享 API
**目标:** 实现 Extension 直接上传提示词到团队库的完整功能

---

## Overview

Add POST `/api/teams/[teamId]/prompts` API endpoint for sharing prompts directly from Extension to team library. Supports full prompt content upload without requiring pre-sync to personal library.

---

## Database Migration

Modify `team_prompts` table to support direct upload mode (prompt_id optional).

### Schema Changes

```sql
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

### Field Mapping

| Prompt Type Field | team_prompts Column |
|------------------|---------------------|
| name | title |
| nameEn | title_en |
| content | content |
| contentEn | content_en |
| categoryId | category |
| description | description |
| descriptionEn | description_en |
| order | sort_order |
| updatedAt | updated_at |
| localImage | local_image |
| remoteImageUrl | remote_image_url |

### Data Compatibility

- Existing records: `prompt_id` has value (reference mode)
- New records (direct upload): `prompt_id` is NULL, content fields have values
- Both modes coexist, query merges for display

---

## API Endpoint

### POST /api/teams/[teamId]/prompts

**Purpose:** Share prompt directly to team library

**Permission:** All team members (owner/admin/member)

**Request Body:**
```typescript
{
  // Required
  name: string,           // Prompt title
  content: string,        // Prompt content

  // Optional
  nameEn?: string,
  contentEn?: string,
  categoryId?: string,    // Free text category
  description?: string,
  descriptionEn?: string,
  order?: number,
  localImage?: string,
  remoteImageUrl?: string,
  platform?: string
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    id: string,           // team_prompts.id
    teamId: string,
    sharedBy: string,     // user.id
    sharedAt: number
  }
}
```

**Flow:**
```
1. Validate Authorization Bearer Token → get user
2. Query team_members to verify user is team member
3. Check duplicate by title (same team, same title = duplicate)
4. INSERT INTO team_prompts (prompt_id = NULL, direct upload mode)
5. Return new record info
```

---

## Duplicate Detection

**Rule:** By title matching within same team

**Query:**
```sql
SELECT id FROM team_prompts
WHERE team_id = $teamId AND title = $title AND prompt_id IS NULL;
```

If exists → return 400 ALREADY_SHARED

---

## Error Handling

| Error Case | HTTP Status | Error Code | UI Message |
|-----------|-------------|------------|------------|
| Not logged in | 401 | NOT_LOGGED_IN | 请先登录 |
| Not team member | 403 | NOT_TEAM_MEMBER | 您不是该团队成员 |
| Team not found | 404 | TEAM_NOT_FOUND | 团队不存在 |
| Duplicate title | 400 | ALREADY_SHARED | 该提示词已在团队库中 |
| Missing content | 400 | MISSING_CONTENT | 提示词标题和内容不能为空 |

---

## Extension Integration

### sharePromptToTeam Function Update

Change from `{ promptId, category }` to full Prompt object:

```typescript
// packages/extension/src/lib/team-sync.ts

export async function sharePromptToTeam(
  prompt: Prompt,        // Full Prompt object
  teamId: string
): Promise<{ success: boolean; error?: string }> {
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

  // Handle response...
}
```

---

## UI Entry Point

### Extension Sidepanel

**Location:** `PromptListView.tsx` prompt detail panel

**Flow:**
```
User clicks prompt → detail panel shows
→ click "Share to Team" button
→ team selection dialog (user's teams list)
→ select team → call sharePromptToTeam()
→ Toast shows success/failure
```

### Team Selection Dialog

```
┌─────────────────────────────────────┐
│ 选择目标团队                         │
│                                     │
│  ○ 产品设计团队 (3 成员)             │
│  ○ UI 设计组 (5 成员)                │
│                                     │
│  [取消]           [确认共享]         │
└─────────────────────────────────────┘
```

### Edge Cases

- No teams: "您还未加入任何团队，请先创建或加入团队"
- Not logged in: "请先登录后共享"

---

## Testing

### API Tests

| Test Case | Validation |
|-----------|------------|
| Normal share | Prompt written to team_prompts, correct response |
| Not logged in | 401, NOT_LOGGED_IN |
| Not team member | 403, NOT_TEAM_MEMBER |
| Duplicate title | 400, ALREADY_SHARED |
| Missing content | 400, MISSING_CONTENT |
| Team not found | 404, TEAM_NOT_FOUND |

### Extension Tests

| Test Case | Validation |
|-----------|------------|
| Logged in share | Bearer Token correct, success response |
| Not logged in | Toast "请先登录" |
| Team selection dialog | Shows user's teams correctly |
| Success Toast | Shows "已共享到 XX 团队" |
| Failure Toast | Shows corresponding error |

### E2E Test Flow

```
1. Login user → create team
2. Create prompt in Extension sidepanel
3. Click "Share to Team" → select team → confirm
4. Verify Toast success message
5. Call GET /api/teams/prompts to verify prompt synced
6. Other team member syncs → verify can see shared prompt
```

---

## Implementation Order

1. Database migration (team_prompts table modification)
2. API endpoint (POST /api/teams/[teamId]/prompts)
3. Extension sharePromptToTeam function update
4. UI team selection dialog in PromptListView
5. E2E test implementation