# FREE Official API Trial Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give logged-in FREE users a one-time 50-call official API trial quota while keeping cloud sync paid-only and moving Pro/Team official API usage to 200/1000 monthly calls.

**Architecture:** Add a backend-owned `officialApiQuota` contract that is computed by one helper and shared by `/api/vision/generate`, `/api/billing/status`, and `/api/sync/status`. Store FREE trial quota in a dedicated `official_api_quotas` table keyed by `user_id`; continue using `user_subscriptions.optimization_quota_used/reset_at` as the paid monthly pool. Extension and web UI render backend quota status instead of hardcoded plan limits.

**Tech Stack:** Next.js route handlers, Supabase Postgres/RLS/RPC, TypeScript, Vitest, Chrome Extension MV3, shared workspace package sync.

---

## File Structure

- Create `packages/web-app/supabase/migrations/020_official_api_trial_quota.sql`: trial quota table, RLS, and pool-aware quota RPCs.
- Create `packages/web-app/lib/official-api-quota.ts`: constants, effective-plan helper, lazy trial initialization, monthly reset, status calculation, increment/rollback wrappers.
- Create `packages/web-app/lib/official-api-quota.test.ts`: unit tests for effective plan, FREE lazy init, expired fallback, monthly reset, increment and rollback calls.
- Modify `packages/web-app/app/api/billing/status/route.ts`: return `officialApiQuota`, keep `optimizationQuota`/`visionQuota` compatibility aliases.
- Create `packages/web-app/app/api/billing/status/route.test.ts`: route tests for FREE, active paid, expired paid.
- Modify `packages/web-app/app/api/sync/status/route.ts`: return `officialApiQuota` without changing cloud sync authorization.
- Create `packages/web-app/app/api/sync/status/route.test.ts`: route tests for FREE trial plus paid cloud sync behavior.
- Modify `packages/web-app/app/api/vision/generate/route.ts`: allow FREE trial quota, pool-aware increment/rollback, return updated `officialApiQuota`.
- Create `packages/web-app/app/api/vision/generate/route.test.ts`: route tests for FREE success/exhausted, paid success, inactive fallback, rollback.
- Modify `packages/shared/types/auth.ts`: add `OfficialApiQuota` and attach it to `CloudAuthState.subscription`.
- Modify generated mirror `packages/web-app/src/shared/types/auth.ts` by running `npm run sync-shared`.
- Modify `packages/extension/src/lib/cloud-sync/auth-service.ts`: cache and expose `officialApiQuota`.
- Modify `packages/extension/src/lib/cloud-sync/subscription-service.ts`: official API eligibility uses `officialApiQuota`.
- Modify `packages/extension/src/lib/agent-config-availability.ts`: accept optional quota availability for official configs.
- Modify official API UI components:
  - `packages/extension/src/popup/components/OfficialVisionCard.tsx`
  - `packages/extension/src/popup/components/SavedConfigsList.tsx`
- Modify consumers of `isAgentConfigUsable`:
  - `packages/extension/src/sidepanel/views/AgentView.tsx`
  - `packages/extension/src/sidepanel/views/EcommerceView.tsx`
  - `packages/extension/src/content/components/AgentPanel.tsx`
  - `packages/extension/src/content/components/EcommercePanel.tsx`
- Modify tests:
  - `packages/extension/src/lib/__tests__/agent-config-availability.test.ts`
  - add `packages/extension/src/lib/cloud-sync/__tests__/subscription-service.test.ts`

## Task 1: Database Migration And Pool-Aware RPCs

**Files:**
- Create: `packages/web-app/supabase/migrations/020_official_api_trial_quota.sql`

- [ ] **Step 1: Create the migration file**

Add this exact SQL:

```sql
-- Official API trial quota for logged-in FREE users.
-- FREE trial usage is separate from paid monthly usage.

CREATE TABLE IF NOT EXISTS official_api_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_quota_limit INTEGER NOT NULL DEFAULT 50 CHECK (trial_quota_limit >= 0),
  trial_quota_used INTEGER NOT NULL DEFAULT 0 CHECK (trial_quota_used >= 0),
  trial_quota_granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (trial_quota_used <= trial_quota_limit)
);

ALTER TABLE official_api_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own official API quota"
  ON official_api_quotas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own official API quota"
  ON official_api_quotas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own official API quota"
  ON official_api_quotas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_official_api_quotas_updated_at
  ON official_api_quotas(updated_at);

ALTER TABLE user_subscriptions
  ALTER COLUMN optimization_quota_used SET DEFAULT 0;

UPDATE user_subscriptions
SET optimization_quota_used = 0
WHERE optimization_quota_used IS NULL;

CREATE OR REPLACE FUNCTION increment_official_api_quota(
  p_user_id UUID,
  p_pool TEXT,
  p_limit INTEGER,
  p_next_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_new_used INTEGER;
  v_reset_at TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_pool = 'trial' THEN
    INSERT INTO official_api_quotas (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE official_api_quotas
    SET trial_quota_used = trial_quota_used + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND trial_quota_used < p_limit
    RETURNING trial_quota_used INTO v_new_used;

    IF v_new_used IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'QUOTA_EXCEEDED');
    END IF;

    RETURN json_build_object(
      'success', true,
      'pool', 'trial',
      'new_used', v_new_used,
      'reset_at', NULL
    );
  END IF;

  IF p_pool = 'monthly' THEN
    UPDATE user_subscriptions
    SET optimization_quota_used = CASE
          WHEN optimization_quota_reset_at IS NOT NULL
           AND optimization_quota_reset_at <= NOW()
          THEN 1
          ELSE COALESCE(optimization_quota_used, 0) + 1
        END,
        optimization_quota_reset_at = COALESCE(p_next_reset_at, optimization_quota_reset_at)
    WHERE user_id = p_user_id
      AND status = 'active'
      AND plan_type IN ('pro', 'team')
      AND (
        CASE
          WHEN optimization_quota_reset_at IS NOT NULL
           AND optimization_quota_reset_at <= NOW()
          THEN 0
          ELSE COALESCE(optimization_quota_used, 0)
        END
      ) < p_limit
    RETURNING optimization_quota_used, optimization_quota_reset_at
      INTO v_new_used, v_reset_at;

    IF v_new_used IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'QUOTA_EXCEEDED');
    END IF;

    RETURN json_build_object(
      'success', true,
      'pool', 'monthly',
      'new_used', v_new_used,
      'reset_at', v_reset_at
    );
  END IF;

  RETURN json_build_object('success', false, 'error', 'INVALID_POOL');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_official_api_quota(
  p_user_id UUID,
  p_pool TEXT
)
RETURNS VOID AS $$
BEGIN
  IF p_pool = 'trial' THEN
    UPDATE official_api_quotas
    SET trial_quota_used = GREATEST(trial_quota_used - 1, 0),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN;
  END IF;

  IF p_pool = 'monthly' THEN
    UPDATE user_subscriptions
    SET optimization_quota_used = GREATEST(COALESCE(optimization_quota_used, 0) - 1, 0)
    WHERE user_id = p_user_id;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Verify migration syntax locally**

Run:

```bash
npm run web:build
```

Expected: build may fail for unrelated pre-existing web issues, but TypeScript should not read the SQL file. If Supabase CLI is available, also run:

```bash
npx supabase db lint --workdir packages/web-app/supabase
```

Expected: no SQL syntax errors for `020_official_api_trial_quota.sql`.

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/supabase/migrations/020_official_api_trial_quota.sql
git commit -m "feat: add official api quota storage"
```

## Task 2: Shared Backend Quota Helper

**Files:**
- Create: `packages/web-app/lib/official-api-quota.ts`
- Create: `packages/web-app/lib/official-api-quota.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `packages/web-app/lib/official-api-quota.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  OFFICIAL_API_QUOTA_LIMITS,
  getEffectiveOfficialApiPlan,
  getOfficialApiQuotaStatus,
  incrementOfficialApiQuota,
  rollbackOfficialApiQuota
} from './official-api-quota'

const userId = '00000000-0000-4000-8000-000000000001'

function createSupabaseMock(options: {
  subscription?: Record<string, unknown> | null
  trial?: Record<string, unknown> | null
  rpcResult?: Record<string, unknown>
}) {
  const inserts: Array<{ table: string; value: unknown }> = []
  const updates: Array<{ table: string; value: unknown }> = []
  const rpcs: Array<{ name: string; args: unknown }> = []

  const supabase = {
    from(table: string) {
      const builder = {
        select() { return builder },
        eq() { return builder },
        single: vi.fn(async () => {
          if (table === 'user_subscriptions') {
            return { data: options.subscription ?? null, error: options.subscription ? null : { code: 'PGRST116' } }
          }
          if (table === 'official_api_quotas') {
            return { data: options.trial ?? null, error: options.trial ? null : { code: 'PGRST116' } }
          }
          return { data: null, error: { code: 'PGRST116' } }
        }),
        insert: vi.fn((value: unknown) => {
          inserts.push({ table, value })
          return { select: () => ({ single: async () => ({ data: { user_id: userId, trial_quota_limit: 50, trial_quota_used: 0 }, error: null }) }) }
        }),
        update: vi.fn((value: unknown) => {
          updates.push({ table, value })
          return { eq: () => ({ select: () => ({ single: async () => ({ data: { ...options.subscription, ...value }, error: null }) }) }) }
        })
      }
      return builder
    },
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcs.push({ name, args })
      return { data: options.rpcResult ?? { success: true, pool: 'trial', new_used: 1, reset_at: null }, error: null }
    })
  }

  return { supabase, inserts, updates, rpcs }
}

describe('official API quota helper', () => {
  it('exports final quota limits', () => {
    expect(OFFICIAL_API_QUOTA_LIMITS).toEqual({ freeTrial: 50, pro: 200, team: 1000 })
  })

  it('uses paid monthly only for active Pro/Team subscriptions', () => {
    expect(getEffectiveOfficialApiPlan({ plan_type: 'pro', status: 'active' })).toBe('pro')
    expect(getEffectiveOfficialApiPlan({ plan_type: 'team', status: 'active' })).toBe('team')
    expect(getEffectiveOfficialApiPlan({ plan_type: 'pro', status: 'expired' })).toBe('free')
    expect(getEffectiveOfficialApiPlan(null)).toBe('free')
  })

  it('lazily creates FREE trial quota when no row exists', async () => {
    const { supabase, inserts } = createSupabaseMock({ subscription: null, trial: null })
    const quota = await getOfficialApiQuotaStatus(supabase as any, userId)

    expect(quota).toEqual({ kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null })
    expect(inserts).toEqual([{ table: 'official_api_quotas', value: { user_id: userId } }])
  })

  it('returns monthly quota for active Pro users', async () => {
    const resetAt = new Date(Date.now() + 3600_000).toISOString()
    const { supabase } = createSupabaseMock({
      subscription: {
        plan_type: 'pro',
        status: 'active',
        optimization_quota_used: 12,
        optimization_quota_reset_at: resetAt,
        current_period_end: resetAt
      },
      trial: { user_id: userId, trial_quota_limit: 50, trial_quota_used: 3 }
    })

    await expect(getOfficialApiQuotaStatus(supabase as any, userId)).resolves.toEqual({
      kind: 'monthly',
      used: 12,
      remaining: 188,
      limit: 200,
      resetsAt: resetAt
    })
  })

  it('falls back to trial for expired paid subscriptions', async () => {
    const { supabase } = createSupabaseMock({
      subscription: { plan_type: 'team', status: 'expired', optimization_quota_used: 999 },
      trial: { user_id: userId, trial_quota_limit: 50, trial_quota_used: 7 }
    })

    await expect(getOfficialApiQuotaStatus(supabase as any, userId)).resolves.toEqual({
      kind: 'trial',
      used: 7,
      remaining: 43,
      limit: 50,
      resetsAt: null
    })
  })

  it('increments and rolls back the same selected pool', async () => {
    const { supabase, rpcs } = createSupabaseMock({
      rpcResult: { success: true, pool: 'monthly', new_used: 13, reset_at: '2026-06-25T00:00:00.000Z' }
    })

    await expect(incrementOfficialApiQuota(supabase as any, userId, {
      pool: 'monthly',
      limit: 200,
      resetsAt: '2026-06-25T00:00:00.000Z'
    })).resolves.toEqual({
      success: true,
      pool: 'monthly',
      used: 13,
      remaining: 187,
      limit: 200,
      resetsAt: '2026-06-25T00:00:00.000Z'
    })

    await rollbackOfficialApiQuota(supabase as any, userId, 'monthly')

    expect(rpcs).toEqual([
      {
        name: 'increment_official_api_quota',
        args: {
          p_user_id: userId,
          p_pool: 'monthly',
          p_limit: 200,
          p_next_reset_at: '2026-06-25T00:00:00.000Z'
        }
      },
      {
        name: 'decrement_official_api_quota',
        args: { p_user_id: userId, p_pool: 'monthly' }
      }
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run lib/official-api-quota.test.ts
```

Expected: FAIL because `packages/web-app/lib/official-api-quota.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `packages/web-app/lib/official-api-quota.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type OfficialApiQuotaKind = 'trial' | 'monthly'
export type OfficialApiQuotaPool = OfficialApiQuotaKind
export type EffectiveOfficialApiPlan = 'free' | 'pro' | 'team'

export interface OfficialApiQuota {
  kind: OfficialApiQuotaKind
  used: number
  remaining: number
  limit: number
  resetsAt: string | null
}

export interface OfficialApiQuotaIncrementInput {
  pool: OfficialApiQuotaPool
  limit: number
  resetsAt: string | null
}

export type OfficialApiQuotaIncrementResult =
  | (OfficialApiQuota & { success: true; pool: OfficialApiQuotaPool; used: number })
  | { success: false; error: 'QUOTA_EXCEEDED' | 'INVALID_POOL' | 'RPC_ERROR'; pool: OfficialApiQuotaPool; quota: OfficialApiQuota }

interface SubscriptionRow {
  plan_type?: string | null
  status?: string | null
  current_period_end?: string | null
  optimization_quota_used?: number | null
  optimization_quota_reset_at?: string | null
}

interface TrialQuotaRow {
  user_id: string
  trial_quota_limit?: number | null
  trial_quota_used?: number | null
  trial_quota_granted_at?: string | null
}

export const OFFICIAL_API_QUOTA_LIMITS = {
  freeTrial: 50,
  pro: 200,
  team: 1000
} as const

export function getEffectiveOfficialApiPlan(subscription: SubscriptionRow | null | undefined): EffectiveOfficialApiPlan {
  const plan = String(subscription?.plan_type || 'free')
  const status = String(subscription?.status || 'inactive')

  if ((plan === 'pro' || plan === 'team') && status === 'active') {
    return plan
  }

  return 'free'
}

function clampUsed(used: number, limit: number): number {
  return Math.min(Math.max(used, 0), limit)
}

function buildQuota(kind: OfficialApiQuotaKind, used: number, limit: number, resetsAt: string | null): OfficialApiQuota {
  const normalizedUsed = clampUsed(used, limit)
  return {
    kind,
    used: normalizedUsed,
    remaining: Math.max(0, limit - normalizedUsed),
    limit,
    resetsAt
  }
}

function addOneMonth(date: Date): Date {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

export function resolveNextMonthlyResetAt(subscription: SubscriptionRow | null | undefined, now = new Date()): string | null {
  const currentPeriodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null
  if (currentPeriodEnd && Number.isFinite(currentPeriodEnd.getTime()) && currentPeriodEnd > now) {
    return currentPeriodEnd.toISOString()
  }

  const storedReset = subscription?.optimization_quota_reset_at ? new Date(subscription.optimization_quota_reset_at) : null
  if (storedReset && Number.isFinite(storedReset.getTime()) && storedReset > now) {
    return storedReset.toISOString()
  }

  if (subscription && getEffectiveOfficialApiPlan(subscription) !== 'free') {
    return addOneMonth(now).toISOString()
  }

  return null
}

async function getSubscription(supabase: SupabaseClient, userId: string): Promise<SubscriptionRow | null> {
  const { data } = await supabase
    .from('user_subscriptions')
    .select('plan_type, status, current_period_end, optimization_quota_used, optimization_quota_reset_at')
    .eq('user_id', userId)
    .single()

  return data as SubscriptionRow | null
}

async function ensureTrialQuota(supabase: SupabaseClient, userId: string): Promise<TrialQuotaRow> {
  const { data } = await supabase
    .from('official_api_quotas')
    .select('user_id, trial_quota_limit, trial_quota_used, trial_quota_granted_at')
    .eq('user_id', userId)
    .single()

  if (data) {
    return data as TrialQuotaRow
  }

  const inserted = await supabase
    .from('official_api_quotas')
    .insert({ user_id: userId })
    .select('user_id, trial_quota_limit, trial_quota_used, trial_quota_granted_at')
    .single()

  return (inserted.data || {
    user_id: userId,
    trial_quota_limit: OFFICIAL_API_QUOTA_LIMITS.freeTrial,
    trial_quota_used: 0
  }) as TrialQuotaRow
}

async function resetMonthlyUsageIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  subscription: SubscriptionRow,
  now = new Date()
): Promise<SubscriptionRow> {
  const resetAt = subscription.optimization_quota_reset_at ? new Date(subscription.optimization_quota_reset_at) : null
  if (!resetAt || resetAt > now) {
    return subscription
  }

  const nextResetAt = resolveNextMonthlyResetAt({ ...subscription, optimization_quota_reset_at: null }, now)
  const { data } = await supabase
    .from('user_subscriptions')
    .update({
      optimization_quota_used: 0,
      optimization_quota_reset_at: nextResetAt
    })
    .eq('user_id', userId)
    .select('plan_type, status, current_period_end, optimization_quota_used, optimization_quota_reset_at')
    .single()

  return (data || {
    ...subscription,
    optimization_quota_used: 0,
    optimization_quota_reset_at: nextResetAt
  }) as SubscriptionRow
}

export async function getOfficialApiQuotaStatus(supabase: SupabaseClient, userId: string): Promise<OfficialApiQuota> {
  const [subscription, trialQuota] = await Promise.all([
    getSubscription(supabase, userId),
    ensureTrialQuota(supabase, userId)
  ])

  const effectivePlan = getEffectiveOfficialApiPlan(subscription)
  if (effectivePlan === 'free') {
    return buildQuota(
      'trial',
      Number(trialQuota.trial_quota_used || 0),
      Number(trialQuota.trial_quota_limit || OFFICIAL_API_QUOTA_LIMITS.freeTrial),
      null
    )
  }

  const resetSubscription = await resetMonthlyUsageIfNeeded(supabase, userId, subscription!)
  const limit = OFFICIAL_API_QUOTA_LIMITS[effectivePlan]
  return buildQuota(
    'monthly',
    Number(resetSubscription.optimization_quota_used || 0),
    limit,
    resolveNextMonthlyResetAt(resetSubscription)
  )
}

export async function getOfficialApiQuotaSelection(
  supabase: SupabaseClient,
  userId: string
): Promise<OfficialApiQuotaIncrementInput & { quota: OfficialApiQuota }> {
  const quota = await getOfficialApiQuotaStatus(supabase, userId)
  return {
    quota,
    pool: quota.kind,
    limit: quota.limit,
    resetsAt: quota.resetsAt
  }
}

export async function incrementOfficialApiQuota(
  supabase: SupabaseClient,
  userId: string,
  input: OfficialApiQuotaIncrementInput
): Promise<OfficialApiQuotaIncrementResult> {
  const { data, error } = await supabase.rpc('increment_official_api_quota', {
    p_user_id: userId,
    p_pool: input.pool,
    p_limit: input.limit,
    p_next_reset_at: input.resetsAt
  })

  const fallbackQuota = buildQuota(input.pool, input.limit, input.limit, input.pool === 'monthly' ? input.resetsAt : null)
  if (error) {
    return { success: false, error: 'RPC_ERROR', pool: input.pool, quota: fallbackQuota }
  }

  if (!data?.success) {
    return {
      success: false,
      error: data?.error === 'INVALID_POOL' ? 'INVALID_POOL' : 'QUOTA_EXCEEDED',
      pool: input.pool,
      quota: fallbackQuota
    }
  }

  const used = Number(data.new_used || 0)
  const resetsAt = input.pool === 'monthly'
    ? String(data.reset_at || input.resetsAt || '')
    : null

  return {
    success: true,
    pool: input.pool,
    ...buildQuota(input.pool, used, input.limit, resetsAt || null)
  }
}

export async function rollbackOfficialApiQuota(
  supabase: SupabaseClient,
  userId: string,
  pool: OfficialApiQuotaPool
): Promise<void> {
  await supabase.rpc('decrement_official_api_quota', {
    p_user_id: userId,
    p_pool: pool
  })
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run lib/official-api-quota.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/lib/official-api-quota.ts packages/web-app/lib/official-api-quota.test.ts
git commit -m "feat: add official api quota helper"
```

## Task 3: Billing And Sync Status Endpoints

**Files:**
- Modify: `packages/web-app/app/api/billing/status/route.ts`
- Create: `packages/web-app/app/api/billing/status/route.test.ts`
- Modify: `packages/web-app/app/api/sync/status/route.ts`
- Create: `packages/web-app/app/api/sync/status/route.test.ts`

- [ ] **Step 1: Write billing route tests**

Create `packages/web-app/app/api/billing/status/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()
const getOfficialApiQuotaStatusMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock
  }))
}))

vi.mock('@/lib/official-api-quota', () => ({
  getOfficialApiQuotaStatus: getOfficialApiQuotaStatusMock
}))

const userId = '00000000-0000-4000-8000-000000000001'

describe('/api/billing/status', () => {
  beforeEach(() => {
    vi.resetModules()
    getUserMock.mockResolvedValue({ data: { user: { id: userId } }, error: null })
    getOfficialApiQuotaStatusMock.mockResolvedValue({ kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null })
  })

  it('returns backend-owned officialApiQuota for FREE users', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: 'PGRST116' } })
        })
      })
    })

    const { GET } = await import('./route')
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.plan).toBe('free')
    expect(payload.status).toBe('inactive')
    expect(payload.officialApiQuota).toEqual({ kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null })
    expect(payload.visionQuota).toEqual({ available: true, used: 0, remaining: 50, limit: 50 })
    expect(getOfficialApiQuotaStatusMock).toHaveBeenCalledWith(expect.anything(), userId)
  })

  it('returns monthly quota for active paid users', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { plan_type: 'pro', status: 'active', current_period_end: '2026-06-25T00:00:00.000Z' },
            error: null
          })
        })
      })
    })
    getOfficialApiQuotaStatusMock.mockResolvedValue({ kind: 'monthly', used: 12, remaining: 188, limit: 200, resetsAt: '2026-06-25T00:00:00.000Z' })

    const { GET } = await import('./route')
    const response = await GET()
    const payload = await response.json()

    expect(payload.plan).toBe('pro')
    expect(payload.status).toBe('active')
    expect(payload.officialApiQuota.kind).toBe('monthly')
    expect(payload.optimizationQuota).toEqual({ used: 12, remaining: 188, limit: 200 })
  })
})
```

- [ ] **Step 2: Write sync route tests**

Create `packages/web-app/app/api/sync/status/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieGetUserMock = vi.fn()
const authHeaderGetUserMock = vi.fn()
const createAuthHeaderClientMock = vi.fn()
const cookieFromMock = vi.fn()
const getCloudSyncSubscriptionStatusMock = vi.fn()
const getOfficialApiQuotaStatusMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: cookieGetUserMock },
    from: cookieFromMock
  }))
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => createAuthHeaderClientMock())
}))

vi.mock('@/lib/sync-subscription', () => ({
  getCloudSyncSubscriptionStatus: getCloudSyncSubscriptionStatusMock
}))

vi.mock('@/lib/official-api-quota', () => ({
  getOfficialApiQuotaStatus: getOfficialApiQuotaStatusMock
}))

const userId = '00000000-0000-4000-8000-000000000001'

function createCountClient() {
  return {
    from(table: string) {
      if (table === 'user_sync_status') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { code: 'PGRST116' } })
            })
          }),
          insert: async () => ({ error: null })
        }
      }

      return {
        select: () => ({
          eq: async () => ({ count: 0, error: null })
        })
      }
    }
  }
}

describe('/api/sync/status', () => {
  beforeEach(() => {
    vi.resetModules()
    const client = createCountClient()
    cookieFromMock.mockImplementation(client.from)
    cookieGetUserMock.mockResolvedValue({ data: { user: { id: userId, email: 'free@example.com' } }, error: null })
    getCloudSyncSubscriptionStatusMock.mockResolvedValue({
      allowed: false,
      subscription: { planType: 'free', status: 'inactive' },
      optimizationQuotaUsed: 0,
      inheritedFromTeam: false
    })
    getOfficialApiQuotaStatusMock.mockResolvedValue({ kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null })
  })

  it('returns FREE official API quota without enabling cloud sync', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('https://example.com/api/sync/status') as any)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.cloudSyncEnabled).toBe(false)
    expect(payload.officialApiQuota).toEqual({ kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null })
    expect(payload.optimizationQuota).toEqual({ used: 0, remaining: 50, limit: 50 })
  })

  it('keeps cloud sync enabled for active Pro while returning monthly official quota', async () => {
    getCloudSyncSubscriptionStatusMock.mockResolvedValue({
      allowed: true,
      subscription: { planType: 'pro', status: 'active' },
      optimizationQuotaUsed: 12,
      inheritedFromTeam: false
    })
    getOfficialApiQuotaStatusMock.mockResolvedValue({ kind: 'monthly', used: 12, remaining: 188, limit: 200, resetsAt: '2026-06-25T00:00:00.000Z' })

    const { GET } = await import('./route')
    const response = await GET(new Request('https://example.com/api/sync/status') as any)
    const payload = await response.json()

    expect(payload.cloudSyncEnabled).toBe(true)
    expect(payload.officialApiQuota.kind).toBe('monthly')
    expect(payload.officialApiQuota.limit).toBe(200)
  })
})
```

- [ ] **Step 3: Run route tests to verify failure**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run app/api/billing/status/route.test.ts app/api/sync/status/route.test.ts
```

Expected: FAIL because routes do not return `officialApiQuota` yet.

- [ ] **Step 4: Update billing status route**

Replace the quota calculation in `packages/web-app/app/api/billing/status/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfficialApiQuotaStatus } from '@/lib/official-api-quota'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'NOT_LOGGED_IN' }, { status: 401 })
  }

  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('plan_type, status, current_period_end')
    .eq('user_id', user.id)
    .single()

  const officialApiQuota = await getOfficialApiQuotaStatus(supabase, user.id)
  const planType = String(subscription?.plan_type || 'free')
  const quotaAlias = {
    used: officialApiQuota.used,
    remaining: officialApiQuota.remaining,
    limit: officialApiQuota.limit
  }

  return NextResponse.json({
    plan: planType,
    status: subscription?.status || 'inactive',
    currentPeriodEnd: subscription?.current_period_end,
    officialApiQuota,
    optimizationQuota: quotaAlias,
    visionQuota: {
      available: officialApiQuota.remaining > 0,
      ...quotaAlias
    }
  })
}
```

- [ ] **Step 5: Update sync status route**

In `packages/web-app/app/api/sync/status/route.ts`:

1. Add import:

```ts
import { getOfficialApiQuotaStatus, type OfficialApiQuota } from '@/lib/official-api-quota'
```

2. Add `officialApiQuota: OfficialApiQuota` to `SyncStatusResponse`.

3. Replace `OPTIMIZATION_QUOTA_LIMITS` usage by fetching `officialApiQuota` in the existing `Promise.all`:

```ts
const [promptsResult, categoriesResult, temporaryPromptsResult, cloudSyncSubscription, officialApiQuota] = await Promise.all([
  supabase
    .from('prompts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId),
  supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId),
  supabase
    .from('temporary_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId),
  getCloudSyncSubscriptionStatus(supabase, userId),
  getOfficialApiQuotaStatus(supabase, userId)
])
```

4. Set response quota fields:

```ts
officialApiQuota,
optimizationQuota: {
  used: officialApiQuota.used,
  remaining: officialApiQuota.remaining,
  limit: officialApiQuota.limit
}
```

- [ ] **Step 6: Run route tests**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run app/api/billing/status/route.test.ts app/api/sync/status/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web-app/app/api/billing/status/route.ts packages/web-app/app/api/billing/status/route.test.ts packages/web-app/app/api/sync/status/route.ts packages/web-app/app/api/sync/status/route.test.ts
git commit -m "feat: return official api quota from status routes"
```

## Task 4: Vision Generate Quota Enforcement

**Files:**
- Modify: `packages/web-app/app/api/vision/generate/route.ts`
- Create: `packages/web-app/app/api/vision/generate/route.test.ts`

- [ ] **Step 1: Write route tests**

Create `packages/web-app/app/api/vision/generate/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthFromRequestMock = vi.fn()
const getOfficialApiQuotaSelectionMock = vi.fn()
const incrementOfficialApiQuotaMock = vi.fn()
const rollbackOfficialApiQuotaMock = vi.fn()
const callThirdPartyVisionApiMock = vi.fn()
const callThirdPartyAgentApiMock = vi.fn()
const isVisionApiConfiguredMock = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthFromRequest: getAuthFromRequestMock
}))

vi.mock('@/lib/official-api-quota', () => ({
  getOfficialApiQuotaSelection: getOfficialApiQuotaSelectionMock,
  incrementOfficialApiQuota: incrementOfficialApiQuotaMock,
  rollbackOfficialApiQuota: rollbackOfficialApiQuotaMock
}))

vi.mock('@/lib/vision-proxy', () => ({
  callThirdPartyVisionApi: callThirdPartyVisionApiMock,
  callThirdPartyAgentApi: callThirdPartyAgentApiMock,
  isVisionApiConfigured: isVisionApiConfiguredMock
}))

const userId = '00000000-0000-4000-8000-000000000001'
const supabase = { rpc: vi.fn() }

function request(body: unknown) {
  return new Request('https://example.com/api/vision/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('/api/vision/generate', () => {
  beforeEach(() => {
    vi.resetModules()
    getAuthFromRequestMock.mockResolvedValue({ userId, supabase })
    getOfficialApiQuotaSelectionMock.mockResolvedValue({
      pool: 'trial',
      limit: 50,
      resetsAt: null,
      quota: { kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null }
    })
    incrementOfficialApiQuotaMock.mockResolvedValue({
      success: true,
      pool: 'trial',
      kind: 'trial',
      used: 1,
      remaining: 49,
      limit: 50,
      resetsAt: null
    })
    rollbackOfficialApiQuotaMock.mockResolvedValue(undefined)
    callThirdPartyVisionApiMock.mockResolvedValue({ zh: { title: '标题', prompt: '提示词' }, en: { title: 'Title', prompt: 'Prompt' }, json_prompt: {}, confidence: 1 })
    callThirdPartyAgentApiMock.mockResolvedValue('agent prompt')
    isVisionApiConfiguredMock.mockReturnValue(true)
  })

  it('allows FREE trial quota for vision mode', async () => {
    const { POST } = await import('./route')
    const response = await POST(request({ image: 'data:image/png;base64,aaa' }) as any)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.officialApiQuota).toEqual({ kind: 'trial', used: 1, remaining: 49, limit: 50, resetsAt: null })
    expect(incrementOfficialApiQuotaMock).toHaveBeenCalledWith(supabase, userId, {
      pool: 'trial',
      limit: 50,
      resetsAt: null
    })
  })

  it('returns QUOTA_EXCEEDED when selected pool is exhausted', async () => {
    getOfficialApiQuotaSelectionMock.mockResolvedValue({
      pool: 'trial',
      limit: 50,
      resetsAt: null,
      quota: { kind: 'trial', used: 50, remaining: 0, limit: 50, resetsAt: null }
    })

    const { POST } = await import('./route')
    const response = await POST(request({ image: 'data:image/png;base64,aaa' }) as any)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(payload.error).toBe('QUOTA_EXCEEDED')
    expect(incrementOfficialApiQuotaMock).not.toHaveBeenCalled()
  })

  it('rolls back the same pool when downstream vision API fails', async () => {
    callThirdPartyVisionApiMock.mockRejectedValue(new Error('downstream failed'))

    const { POST } = await import('./route')
    const response = await POST(request({ image: 'data:image/png;base64,aaa' }) as any)

    expect(response.status).toBe(500)
    expect(rollbackOfficialApiQuotaMock).toHaveBeenCalledWith(supabase, userId, 'trial')
  })

  it('uses monthly quota for paid agent mode', async () => {
    getOfficialApiQuotaSelectionMock.mockResolvedValue({
      pool: 'monthly',
      limit: 200,
      resetsAt: '2026-06-25T00:00:00.000Z',
      quota: { kind: 'monthly', used: 12, remaining: 188, limit: 200, resetsAt: '2026-06-25T00:00:00.000Z' }
    })
    incrementOfficialApiQuotaMock.mockResolvedValue({
      success: true,
      pool: 'monthly',
      kind: 'monthly',
      used: 13,
      remaining: 187,
      limit: 200,
      resetsAt: '2026-06-25T00:00:00.000Z'
    })

    const { POST } = await import('./route')
    const response = await POST(request({ mode: 'agent', inputText: 'input', systemPrompt: 'system' }) as any)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.officialApiQuota.kind).toBe('monthly')
    expect(payload.quota).toEqual({ used: 13, remaining: 187, limit: 200 })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run app/api/vision/generate/route.test.ts
```

Expected: FAIL because current route rejects FREE users and uses old RPCs.

- [ ] **Step 3: Replace subscription gating with official quota helper**

In `packages/web-app/app/api/vision/generate/route.ts`:

1. Remove `QUOTA_CONFIG` import.
2. Add:

```ts
import {
  getOfficialApiQuotaSelection,
  incrementOfficialApiQuota,
  rollbackOfficialApiQuota
} from '@/lib/official-api-quota'
```

3. Remove the direct `user_subscriptions` query and `NOT_MEMBER`/`SUBSCRIPTION_INACTIVE` checks.
4. After request validation and `isVisionApiConfigured()`, add:

```ts
const quotaSelection = await getOfficialApiQuotaSelection(auth.supabase, auth.userId)

if (quotaSelection.quota.remaining <= 0) {
  return NextResponse.json({
    success: false,
    error: 'QUOTA_EXCEEDED',
    officialApiQuota: quotaSelection.quota,
    quota: {
      used: quotaSelection.quota.used,
      remaining: quotaSelection.quota.remaining,
      limit: quotaSelection.quota.limit
    }
  }, { status: 429 })
}

const quotaResult = await incrementOfficialApiQuota(auth.supabase, auth.userId, {
  pool: quotaSelection.pool,
  limit: quotaSelection.limit,
  resetsAt: quotaSelection.resetsAt
})

if (!quotaResult.success) {
  return NextResponse.json({
    success: false,
    error: quotaResult.error,
    officialApiQuota: quotaResult.quota,
    quota: {
      used: quotaResult.quota.used,
      remaining: quotaResult.quota.remaining,
      limit: quotaResult.quota.limit
    }
  }, { status: 429 })
}

const chargedPool = quotaResult.pool
const responseQuota = {
  used: quotaResult.used,
  remaining: quotaResult.remaining,
  limit: quotaResult.limit
}
```

5. In both success responses, include:

```ts
quota: responseQuota,
officialApiQuota: {
  kind: quotaResult.kind,
  used: quotaResult.used,
  remaining: quotaResult.remaining,
  limit: quotaResult.limit,
  resetsAt: quotaResult.resetsAt
}
```

6. In the `catch`, replace old rollback RPC with:

```ts
await rollbackOfficialApiQuota(auth.supabase, auth.userId, chargedPool)
```

- [ ] **Step 4: Run vision route tests**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run app/api/vision/generate/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/api/vision/generate/route.ts packages/web-app/app/api/vision/generate/route.test.ts
git commit -m "feat: enforce official api trial quota"
```

## Task 5: Shared Types And Extension Auth Cache

**Files:**
- Modify: `packages/shared/types/auth.ts`
- Modify: `packages/web-app/src/shared/types/auth.ts`
- Modify: `packages/extension/src/lib/cloud-sync/auth-service.ts`

- [ ] **Step 1: Update shared auth types**

In `packages/shared/types/auth.ts`, add before `CloudAuthState`:

```ts
export interface OfficialApiQuota {
  kind: 'trial' | 'monthly'
  used: number
  remaining: number
  limit: number
  resetsAt: string | null
}
```

Then add `officialApiQuota?: OfficialApiQuota` inside `subscription`.

- [ ] **Step 2: Sync shared package mirrors**

Run:

```bash
npm run sync-shared
```

Expected: `packages/web-app/src/shared/types/auth.ts` receives the generated copy with `OfficialApiQuota`.

- [ ] **Step 3: Update auth-service cache shape**

In `packages/extension/src/lib/cloud-sync/auth-service.ts`, add `officialApiQuota` to the cached subscription type:

```ts
officialApiQuota?: {
  kind: 'trial' | 'monthly'
  used: number
  remaining: number
  limit: number
  resetsAt: string | null
}
```

In the `statusData` type for `/api/sync/status`, add:

```ts
officialApiQuota?: {
  kind: 'trial' | 'monthly'
  used: number
  remaining: number
  limit: number
  resetsAt: string | null
}
```

When setting `cachedSyncStatus.subscription`, include:

```ts
officialApiQuota: statusData.officialApiQuota
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/types/auth.ts packages/web-app/src/shared/types/auth.ts packages/extension/src/lib/cloud-sync/auth-service.ts
git commit -m "feat: expose official api quota in auth state"
```

## Task 6: Extension Eligibility And UI

**Files:**
- Modify: `packages/extension/src/lib/cloud-sync/subscription-service.ts`
- Modify: `packages/extension/src/lib/agent-config-availability.ts`
- Modify: `packages/extension/src/lib/__tests__/agent-config-availability.test.ts`
- Create: `packages/extension/src/lib/cloud-sync/__tests__/subscription-service.test.ts`
- Modify: `packages/extension/src/popup/components/OfficialVisionCard.tsx`
- Modify: `packages/extension/src/popup/components/SavedConfigsList.tsx`
- Modify: `packages/extension/src/sidepanel/views/AgentView.tsx`
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`
- Modify: `packages/extension/src/content/components/AgentPanel.tsx`
- Modify: `packages/extension/src/content/components/EcommercePanel.tsx`

- [ ] **Step 1: Update eligibility tests**

Replace `packages/extension/src/lib/__tests__/agent-config-availability.test.ts` assertions with quota-aware cases:

```ts
import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from '@oh-my-prompt/shared/types'
import { isAgentConfigUsable } from '../agent-config-availability'

const officialConfig: ProviderConfig = {
  id: 'omp-official-default',
  providerId: 'omp_official',
  providerName: 'Oh My Prompt 官方服务',
  apiKey: '',
  apiEndpoint: '',
  apiFormat: 'omp_official',
  selectedModel: 'auto',
  configuredAt: 1,
  isCustom: false,
}

const thirdPartyConfig: ProviderConfig = {
  id: 'third-party',
  providerId: 'custom',
  providerName: 'Custom',
  apiKey: 'sk-test',
  apiEndpoint: 'https://api.example.com',
  apiFormat: 'chat_completions',
  selectedModel: 'test-model',
  configuredAt: 1,
  isCustom: true,
}

describe('isAgentConfigUsable', () => {
  it('treats official API as unavailable when login has expired', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', false, 50)).toBe(false)
  })

  it('treats official API as usable when logged in and quota remains', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', true, 1)).toBe(true)
  })

  it('treats official API as unavailable when logged in but quota is exhausted', () => {
    expect(isAgentConfigUsable([officialConfig], 'omp-official-default', true, 0)).toBe(false)
  })

  it('keeps active third-party API usable without login or quota', () => {
    expect(isAgentConfigUsable([thirdPartyConfig], 'third-party', false, 0)).toBe(true)
  })
})
```

Create `packages/extension/src/lib/cloud-sync/__tests__/subscription-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthStateMock = vi.fn()

vi.mock('../auth-service', () => ({
  getAuthState: getAuthStateMock
}))

describe('checkSubscriptionFeature', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows ai_optimization for logged-in FREE users with trial quota remaining', async () => {
    getAuthStateMock.mockResolvedValue({
      status: 'logged_in',
      subscription: {
        planType: 'free',
        status: 'inactive',
        officialApiQuota: { kind: 'trial', used: 1, remaining: 49, limit: 50, resetsAt: null }
      }
    })

    const { checkSubscriptionFeature } = await import('../subscription-service')
    await expect(checkSubscriptionFeature('ai_optimization')).resolves.toBe(true)
  })

  it('does not allow ai_optimization when official quota is exhausted', async () => {
    getAuthStateMock.mockResolvedValue({
      status: 'logged_in',
      subscription: {
        planType: 'free',
        status: 'inactive',
        officialApiQuota: { kind: 'trial', used: 50, remaining: 0, limit: 50, resetsAt: null }
      }
    })

    const { checkSubscriptionFeature } = await import('../subscription-service')
    await expect(checkSubscriptionFeature('ai_optimization')).resolves.toBe(false)
  })

  it('keeps cloud sync disabled for FREE users with trial quota', async () => {
    getAuthStateMock.mockResolvedValue({
      status: 'logged_in',
      cloudSyncEnabled: false,
      subscription: {
        planType: 'free',
        status: 'inactive',
        officialApiQuota: { kind: 'trial', used: 0, remaining: 50, limit: 50, resetsAt: null }
      }
    })

    const { checkSubscriptionFeature } = await import('../subscription-service')
    await expect(checkSubscriptionFeature('cloud_sync')).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/agent-config-availability.test.ts src/lib/cloud-sync/__tests__/subscription-service.test.ts
```

Expected: FAIL because implementation still treats FREE official API as unavailable.

- [ ] **Step 3: Update feature gate implementations**

In `packages/extension/src/lib/cloud-sync/subscription-service.ts`, replace `ai_optimization` block:

```ts
if (feature === 'ai_optimization') {
  const quota = authState.subscription?.officialApiQuota ?? authState.subscription?.optimizationQuota
  return quota ? quota.remaining > 0 : false
}
```

In `packages/extension/src/lib/agent-config-availability.ts`, change signature and official checks:

```ts
export function isAgentConfigUsable(
  configs: ProviderConfig[],
  activeConfigId: string | null,
  isLoggedIn: boolean,
  officialQuotaRemaining?: number
): boolean {
  const activeConfig = activeConfigId
    ? configs.find(config => config.id === activeConfigId)
    : null

  const hasOfficialQuota = officialQuotaRemaining === undefined || officialQuotaRemaining > 0

  if (activeConfig) {
    return activeConfig.apiFormat === 'omp_official' ? isLoggedIn && hasOfficialQuota : true
  }

  return configs.some(config => config.apiFormat === 'omp_official') && isLoggedIn && hasOfficialQuota
}
```

Update all call sites to pass:

```ts
authState.subscription?.officialApiQuota?.remaining
```

- [ ] **Step 4: Update official card rendering**

In `packages/extension/src/popup/components/OfficialVisionCard.tsx`, replace plan limit logic with:

```ts
const quota = subscription?.officialApiQuota ?? subscription?.optimizationQuota ?? { used: 0, remaining: 0, limit: 0, kind: 'trial' as const, resetsAt: null }
const isTrial = quota.kind === 'trial'
const plan = subscription?.planType || 'free'
const isTeam = plan === 'team'
const badgeText = status === 'logged_in' && isTrial ? 'FREE' : isTeam ? 'Team' : 'Pro'
```

Render FREE with remaining quota as:

```tsx
<span className="text-sm text-gray-500">
  剩余 <span className="text-cyan-500 font-medium">{quota.remaining}</span>/{quota.limit} 次
</span>
```

For exhausted trial quota, use copy:

```tsx
<p className="text-sm text-gray-600 mb-3">体验额度已用完，升级后获得每月额度。</p>
<button onClick={onUpgrade} className="w-full py-2.5 rounded-md font-medium text-sm bg-gray-900 text-white hover:bg-gray-800 transition">
  升级 Pro
</button>
```

In `packages/extension/src/popup/components/SavedConfigsList.tsx`, compute:

```ts
const officialQuota = authState?.subscription?.officialApiQuota
const officialQuotaRemaining = officialQuota?.remaining ?? 0
const canActivateOfficial = isLoggedIn && officialQuotaRemaining > 0
```

Use `canActivateOfficial` for the activation button and display:

```tsx
{officialQuota ? `剩余 ${officialQuota.remaining}/${officialQuota.limit} 次` : '专业视觉模型，无需配置 API Key'}
```

- [ ] **Step 5: Run extension tests and typecheck**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/agent-config-availability.test.ts src/lib/cloud-sync/__tests__/subscription-service.test.ts
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/lib/cloud-sync/subscription-service.ts packages/extension/src/lib/agent-config-availability.ts packages/extension/src/lib/__tests__/agent-config-availability.test.ts packages/extension/src/lib/cloud-sync/__tests__/subscription-service.test.ts packages/extension/src/popup/components/OfficialVisionCard.tsx packages/extension/src/popup/components/SavedConfigsList.tsx packages/extension/src/sidepanel/views/AgentView.tsx packages/extension/src/sidepanel/views/EcommerceView.tsx packages/extension/src/content/components/AgentPanel.tsx packages/extension/src/content/components/EcommercePanel.tsx
git commit -m "feat: show free official api trial quota"
```

## Task 7: Final Verification

**Files:**
- Check: `docs/superpowers/specs/2026-05-25-free-official-api-quota-design.md`
- Check: all files changed in Tasks 1-6

- [ ] **Step 1: Run focused web-app unit tests**

Run:

```bash
npm exec --workspace=@oh-my-prompt/web-app -- vitest run lib/official-api-quota.test.ts app/api/billing/status/route.test.ts app/api/sync/status/route.test.ts app/api/vision/generate/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused extension unit tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- src/lib/__tests__/agent-config-availability.test.ts src/lib/cloud-sync/__tests__/subscription-service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run shared sync check**

Run:

```bash
npm run check-shared
```

Expected: PASS.

- [ ] **Step 4: Run extension typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 5: Run production builds**

Run:

```bash
npm run build --workspace=@oh-my-prompt/extension
npm run web:build
```

Expected: PASS. If either build fails because of a pre-existing issue outside these files, capture the exact failure and run the focused tests from Steps 1-4 again before handing off.

- [ ] **Step 6: Manual behavior checks**

Use local web-app plus extension dev build:

```bash
npm run dev
npm run web:dev
```

Check:

- Logged-out official card shows `需要登录` and `登录后使用`.
- Logged-in FREE user shows `剩余 50/50 次`, can activate official config, and cloud sync remains disabled.
- FREE user after one official API call sees `剩余 49/50 次`.
- FREE exhausted user sees `0/50 次` and `升级 Pro`.
- Active Pro user sees `剩余 n/200 次` and cloud sync enabled.
- Active Team user sees `剩余 n/1000 次` and cloud sync enabled.
- Expired Pro/Team user sees trial quota and cloud sync disabled.
- Third-party API config can still be activated without official quota.

- [ ] **Step 7: Commit verification updates**

If verification required small fixes, commit them:

```bash
git add packages/web-app/supabase/migrations/020_official_api_trial_quota.sql \
  packages/web-app/lib/official-api-quota.ts \
  packages/web-app/lib/official-api-quota.test.ts \
  packages/web-app/app/api/billing/status/route.ts \
  packages/web-app/app/api/billing/status/route.test.ts \
  packages/web-app/app/api/sync/status/route.ts \
  packages/web-app/app/api/sync/status/route.test.ts \
  packages/web-app/app/api/vision/generate/route.ts \
  packages/web-app/app/api/vision/generate/route.test.ts \
  packages/shared/types/auth.ts \
  packages/web-app/src/shared/types/auth.ts \
  packages/extension/src/lib/cloud-sync/auth-service.ts \
  packages/extension/src/lib/cloud-sync/subscription-service.ts \
  packages/extension/src/lib/cloud-sync/__tests__/subscription-service.test.ts \
  packages/extension/src/lib/agent-config-availability.ts \
  packages/extension/src/lib/__tests__/agent-config-availability.test.ts \
  packages/extension/src/popup/components/OfficialVisionCard.tsx \
  packages/extension/src/popup/components/SavedConfigsList.tsx \
  packages/extension/src/sidepanel/views/AgentView.tsx \
  packages/extension/src/sidepanel/views/EcommerceView.tsx \
  packages/extension/src/content/components/AgentPanel.tsx \
  packages/extension/src/content/components/EcommercePanel.tsx
git commit -m "fix: polish official api quota rollout"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: FREE one-time quota, paid monthly limits, no cloud sync for FREE, expired fallback, lazy initialization, pool-aware rollback, status endpoint consistency, frontend type migration, and testing are each covered by a task.
- Placeholder scan: This plan contains concrete files, commands, expected outcomes, and implementation snippets for each task.
- Type consistency: The plan uses `officialApiQuota`, `OfficialApiQuota`, `kind: 'trial' | 'monthly'`, `remaining`, `limit`, `resetsAt`, and pool names consistently across backend, shared types, and extension consumers.
