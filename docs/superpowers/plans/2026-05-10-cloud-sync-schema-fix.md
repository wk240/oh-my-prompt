# Cloud Sync Database Schema Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Supabase database schema to match Extension API expectations, enabling cloud sync to work correctly.

**Architecture:** Add missing columns to existing tables + create new `user_sync_status` table. Extension's upload/download APIs map Prompt/Category fields to database columns; current schema lacks bilingual fields and image fields, causing sync failures.

**Tech Stack:** Supabase PostgreSQL, MCP tool for migration, Extension TypeScript API

---

## Current State Analysis

**prompts table** (existing columns):
- id, user_id, category_id, title, content, platform, is_public, sort_order, created_at, updated_at

**Missing prompts columns** (required by API):
- `title_en` → maps from `prompt.nameEn`
- `content_en` → maps from `prompt.contentEn`
- `description` → maps from `prompt.description`
- `description_en` → maps from `prompt.descriptionEn`
- `local_image` → maps from `prompt.localImage`
- `remote_image_url` → maps from `prompt.remoteImageUrl`

**categories table** (existing columns):
- id, user_id, name, sort_order, created_at

**Missing categories columns** (required by API):
- `name_en` → maps from `category.nameEn`

**user_sync_status table** (NOT EXISTS):
- Required by `/api/sync/status/route.ts` line 14
- Needs: user_id, last_synced_at, has_unsynced_changes

---

## File Structure

| File | Purpose |
|------|---------|
| `Supabase Database` | Schema migration (add columns, create table) |
| `packages/web-app/app/api/sync/upload/route.ts` | Uses prompts/categories columns |
| `packages/web-app/app/api/sync/download/route.ts` | Uses prompts/categories columns |
| `packages/web-app/app/api/sync/status/route.ts` | Uses user_sync_status table |

---

## Phase 1: Database Schema Migration

### Task 1: Add Missing Columns to prompts Table

**Files:**
- Modify: Supabase `public.prompts` table

- [ ] **Step 1: Apply migration to add bilingual and image columns**

Call `mcp__plugin_supabase_supabase__apply_migration` with:
- project_id: `futfxudabvjfldlismun`
- name: `add_prompts_bilingual_image_columns`
- query:
```sql
ALTER TABLE public.prompts
ADD COLUMN IF NOT EXISTS title_en TEXT,
ADD COLUMN IF NOT EXISTS content_en TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS description_en TEXT,
ADD COLUMN IF NOT EXISTS local_image TEXT,
ADD COLUMN IF NOT EXISTS remote_image_url TEXT;
```

- [ ] **Step 2: Verify columns added**

Call `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'prompts'
AND column_name IN ('title_en', 'content_en', 'description', 'description_en', 'local_image', 'remote_image_url');
```

Expected: 6 rows returned with all new columns.

---

### Task 2: Add Missing Column to categories Table

**Files:**
- Modify: Supabase `public.categories` table

- [ ] **Step 1: Apply migration to add bilingual name column**

Call `mcp__plugin_supabase_supabase__apply_migration` with:
- project_id: `futfxudabvjfldlismun`
- name: `add_categories_name_en_column`
- query:
```sql
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS name_en TEXT;
```

- [ ] **Step 2: Verify column added**

Call `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'categories'
AND column_name = 'name_en';
```

Expected: 1 row returned.

---

### Task 3: Create user_sync_status Table

**Files:**
- Create: Supabase `public.user_sync_status` table

- [ ] **Step 1: Apply migration to create table**

Call `mcp__plugin_supabase_supabase__apply_migration` with:
- project_id: `futfxudabvjfldlismun`
- name: `create_user_sync_status_table`
- query:
```sql
CREATE TABLE IF NOT EXISTS public.user_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  has_unsynced_changes BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own sync status
CREATE POLICY "Users can view own sync status"
  ON public.user_sync_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync status"
  ON public.user_sync_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync status"
  ON public.user_sync_status FOR UPDATE
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Verify table created**

Call `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'user_sync_status';
```

Expected: 1 row returned.

---

## Phase 2: Update API to Match New Schema

### Task 4: Update upload API to Use New Columns

**Files:**
- Modify: `packages/web-app/app/api/sync/upload/route.ts`

- [ ] **Step 1: Read current upload API code**

Read `packages/web-app/app/api/sync/upload/route.ts` - already reviewed, needs update for:
- `title_en` from `prompt.nameEn`
- `content_en` from `prompt.contentEn`
- `description` from `prompt.description`
- `description_en` from `prompt.descriptionEn`
- `local_image` from `prompt.localImage`
- `remote_image_url` from `prompt.remoteImageUrl`
- `name_en` from `category.nameEn`

- [ ] **Step 2: Update promptsData mapping in upload API**

Edit `packages/web-app/app/api/sync/upload/route.ts` line 50-61:

Replace the promptsData mapping:
```typescript
const promptsData = body.prompts.map(prompt => ({
  id: prompt.id,
  user_id: user.id,
  category_id: prompt.categoryId,
  title: prompt.name,
  title_en: prompt.nameEn,
  content: prompt.content,
  content_en: prompt.contentEn,
  description: prompt.description,
  description_en: prompt.descriptionEn,
  local_image: prompt.localImage,
  remote_image_url: prompt.remoteImageUrl,
  platform: null,
  is_public: false,
  sort_order: prompt.order
}))
```

- [ ] **Step 3: Update categoriesData mapping in upload API**

Edit `packages/web-app/app/api/sync/upload/route.ts` line 29-35:

Replace the categoriesData mapping:
```typescript
const categoriesData = body.categories.map(cat => ({
  id: cat.id,
  user_id: user.id,
  name: cat.name,
  name_en: cat.nameEn,
  sort_order: cat.order
}))
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/api/sync/upload/route.ts
git commit -m "fix(web): update upload API to use new bilingual and image columns"
```

---

### Task 5: Update download API to Use New Columns

**Files:**
- Modify: `packages/web-app/app/api/sync/download/route.ts`

- [ ] **Step 1: Update transformedPrompts mapping in download API**

Edit `packages/web-app/app/api/sync/download/route.ts` line 55-67:

Replace the transformedPrompts mapping:
```typescript
const transformedPrompts = prompts?.map(prompt => ({
  id: prompt.id,
  name: prompt.title,
  nameEn: prompt.title_en,
  content: prompt.content,
  contentEn: prompt.content_en,
  categoryId: prompt.category_id,
  description: prompt.description,
  descriptionEn: prompt.description_en,
  order: prompt.sort_order,
  localImage: prompt.local_image,
  remoteImageUrl: prompt.remote_image_url
})) || []
```

- [ ] **Step 2: Update transformedCategories mapping in download API**

Edit `packages/web-app/app/api/sync/download/route.ts` line 48-53:

Replace the transformedCategories mapping:
```typescript
const transformedCategories = categories?.map(cat => ({
  id: cat.id,
  name: cat.name,
  nameEn: cat.name_en,
  order: cat.sort_order
})) || []
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/api/sync/download/route.ts
git commit -m "fix(web): update download API to return new bilingual and image columns"
```

---

## Phase 3: Fix status API to Use user_sync_status

### Task 6: Update status API Implementation

**Files:**
- Modify: `packages/web-app/app/api/sync/status/route.ts`

- [ ] **Step 1: Update status API to use correct table and columns**

Edit `packages/web-app/app/api/sync/status/route.ts`:

Replace the entire GET function:
```typescript
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get or create sync status record
    const { data: syncStatus, error: syncError } = await supabase
      .from('user_sync_status')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // If no record exists, create one
    if (syncError?.code === 'PGRST116') {
      const { data: newStatus, error: createError } = await supabase
        .from('user_sync_status')
        .insert({ user_id: user.id })
        .select()
        .single()

      if (createError) {
        console.error('Failed to create sync status:', createError)
        return NextResponse.json({ error: 'Failed to initialize sync status' }, { status: 500 })
      }

      return NextResponse.json({
        user: { id: user.id, email: user.email },
        subscription: { planType: 'free', status: 'active' },
        lastSyncAt: null,
        promptCount: 0,
        categoryCount: 0,
        hasUnsyncedChanges: false
      })
    }

    if (syncError) {
      console.error('Sync status fetch error:', syncError)
      return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 })
    }

    // Get counts
    const { data: prompts } = await supabase
      .from('prompts')
      .select('id')
      .eq('user_id', user.id)

    const { data: categories } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)

    // Get subscription status
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('plan_type, status')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      subscription: subscription ? { planType: subscription.plan_type, status: subscription.status } : { planType: 'free', status: 'active' },
      lastSyncAt: syncStatus?.last_synced_at ? new Date(syncStatus.last_synced_at).getTime() : null,
      promptCount: prompts?.length || 0,
      categoryCount: categories?.length || 0,
      hasUnsyncedChanges: syncStatus?.has_unsynced_changes || false
    })
  } catch (error) {
    console.error('Sync status error:', error)
    return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/sync/status/route.ts
git commit -m "fix(web): update status API to use user_sync_status table with proper error handling"
```

---

## Phase 4: Update sync_logs to track sync operations

### Task 7: Add sync_logs entry in upload API

**Files:**
- Modify: `packages/web-app/app/api/sync/upload/route.ts`

- [ ] **Step 1: Update sync_logs insert to use correct column names**

The current sync_logs insert uses `prompts_count` and `categories_count`. Verify these match the table schema:

Call `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'sync_logs';
```

Expected columns: id, user_id, sync_type, prompts_count, categories_count, timestamp

- [ ] **Step 2: Verify sync_logs insert in upload API is correct**

The upload API line 76-81 already uses correct column names. No changes needed if schema matches.

---

### Task 8: Add sync_logs entry in download API

**Files:**
- Modify: `packages/web-app/app/api/sync/download/route.ts`

- [ ] **Step 1: Add sync_logs insert after successful download**

Edit `packages/web-app/app/api/sync/download/route.ts`, add after line 75 (before return):

```typescript
// Log sync
await supabase.from('sync_logs').insert({
  user_id: user.id,
  sync_type: 'download',
  prompts_count: transformedPrompts.length,
  categories_count: transformedCategories.length
})

// Update user_sync_status
await supabase
  .from('user_sync_status')
  .upsert({
    user_id: user.id,
    last_synced_at: new Date().toISOString(),
    has_unsynced_changes: false,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' })
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/sync/download/route.ts
git commit -m "feat(web): add sync_logs and update user_sync_status in download API"
```

---

## Phase 5: Update upload API to update user_sync_status

### Task 9: Add user_sync_status update in upload API

**Files:**
- Modify: `packages/web-app/app/api/sync/upload/route.ts`

- [ ] **Step 1: Add user_sync_status update after successful upload**

Edit `packages/web-app/app/api/sync/upload/route.ts`, add after line 81 (after sync_logs insert):

```typescript
// Update user_sync_status
await supabase
  .from('user_sync_status')
  .upsert({
    user_id: user.id,
    last_synced_at: new Date().toISOString(),
    has_unsynced_changes: false,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' })
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/sync/upload/route.ts
git commit -m "feat(web): update user_sync_status after successful upload"
```

---

## Testing Checklist

After completing all tasks, verify:

- [ ] **Test 1: OAuth Login Flow**
  - Open Extension sidepanel → Settings → Cloud Sync
  - Click "登录" → Select GitHub
  - Complete OAuth in new tab
  - Verify sidepanel shows logged-in state with email

- [ ] **Test 2: Upload Sync**
  - Create a prompt in Extension with bilingual content (name, nameEn)
  - Click "上传到云端"
  - Check Supabase prompts table has title_en populated

- [ ] **Test 3: Download Sync**
  - Click "下载到本地"
  - Verify prompts appear in Extension with bilingual fields

- [ ] **Test 4: Status API**
  - After sync, verify status shows lastSyncAt timestamp
  - Verify promptCount and categoryCount are correct

---

## Summary

| Phase | Tasks | Time Estimate |
|-------|-------|---------------|
| Phase 1: Schema Migration | Task 1-3 | 10 min |
| Phase 2: API Column Mapping | Task 4-5 | 10 min |
| Phase 3: Status API Fix | Task 6 | 10 min |
| Phase 4: Sync Logging | Task 7-8 | 10 min |
| Phase 5: Status Update | Task 9 | 5 min |
| Testing | Manual Tests | 15 min |

**Total: ~60 minutes**