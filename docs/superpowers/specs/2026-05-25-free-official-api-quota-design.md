# FREE Official API Trial Quota Design

## Summary

Logged-in FREE users receive a one-time official API trial quota. They do not receive cloud sync. The goal is to let users experience the official API without turning FREE into a recurring cost center or weakening the Pro upgrade path.

Final product rule:

> 首次注册即赠送 50 次官方 API 体验额度，用完即止。

## Goals

- Let newly registered FREE users try the official Oh My Prompt API without configuring an API key.
- Keep cloud sync as a Pro/Team feature.
- Use one consistent quota model across extension popup, sidepanel, web dashboard, and API routes.
- Remove hardcoded frontend quota assumptions where backend status can provide the value.
- Preserve existing third-party API configuration behavior.

## Non-Goals

- Do not add new pricing sections or extra promotional blocks.
- Do not make FREE official API quota renew monthly.
- Do not grant cloud sync to FREE users.
- Do not merge leftover FREE trial quota into Pro/Team monthly quota after upgrade.

## Product Rules

### Anonymous User

- Can use local prompt management, resource library, import/export, and third-party API configuration.
- Cannot use official API.
- Cannot use cloud sync.

### Logged-In FREE User

- Receives 50 official API trial calls on first registration.
- Trial quota is one-time and does not renew.
- Trial quota is shared by official image-to-prompt and Prompt Agent features.
- Cloud sync remains unavailable.

### Pro User

- Receives monthly official API quota.
- Recommended quota: 200 calls per month.
- Supports cloud sync.
- Official image-to-prompt and Prompt Agent share the same monthly quota pool.

### Team User

- Receives monthly official API quota.
- Recommended quota: 1000 calls per month.
- Supports cloud sync and team features.
- Official image-to-prompt and Prompt Agent share the same monthly quota pool.

### Upgrade And Expiration

- When a FREE user upgrades, the UI switches to the paid monthly quota pool.
- Remaining FREE trial quota is not displayed or added on top of Pro/Team quota.
- When Pro/Team expires, the user falls back to FREE behavior:
  - Cloud sync is disabled.
  - Official API access depends only on remaining one-time trial quota.

### Effective Plan Rules

Quota access must be derived from an effective plan, not only the stored
`plan_type`.

- `effectivePlan = 'pro' | 'team'` only when the user's own subscription is
  active.
- Inherited Team access may enable cloud sync and team features, but does not
  give the member an additional personal official API quota unless team-level
  quota pooling is explicitly implemented later.
- Any inactive, expired, canceled, missing, or FREE subscription record resolves
  to `effectivePlan = 'free'` for official API quota.
- `/api/vision/generate`, `/api/billing/status`, and `/api/sync/status` must use
  the same effective plan helper so exhausted/expired states cannot drift.

## UI Design

Scope is limited to the existing API configuration switching area. Do not add new pricing cards, comparison blocks, or standalone quota explanation sections.

### Official API Config Card States

#### Not Logged In

- Badge/status: `需要登录`
- Description: `专业视觉模型，无需配置 API Key`
- Primary action: `登录后使用`

#### FREE With Trial Quota Remaining

- Quota text: `剩余 37/50 次`
- Description: `首次注册体验额度，用完即止。`
- Primary action: `切换到此配置`

#### FREE Trial Quota Exhausted

- Quota text: `0/50 次`
- Description: `体验额度已用完，升级后获得每月额度。`
- Primary action: `升级 Pro`

#### Pro Or Team With Quota Remaining

- Quota text:
  - Pro: `剩余 128/200 次`
  - Team: `剩余 820/1000 次`
- Description: `专业视觉模型，无需配置 API Key`
- Primary action:
  - inactive config: `切换到此配置`
  - active config: `已激活`

#### Pro Or Team Quota Exhausted

- Quota text:
  - Pro: `0/200 次`
  - Team: `0/1000 次`
- Description: `本月额度已用完，下月自动恢复`
- Primary action: disabled `额度已耗尽`
- Secondary action may link to a higher plan when applicable.

## Backend Quota Model

Use one backend-owned official API quota model and return it from status endpoints. Frontends should render returned values instead of hardcoding plan limits.

```ts
officialApiQuota: {
  kind: 'trial' | 'monthly'
  used: number
  remaining: number
  limit: number
  resetsAt: string | null
}
```

The backend may also return legacy fields during migration, but UI rendering for
the official service should prefer `officialApiQuota`.

### Quota Semantics

- FREE:
  - `kind: 'trial'`
  - `limit: 50`
  - `resetsAt: null`
- Pro:
  - `kind: 'monthly'`
  - `limit: 200`
  - `resetsAt`: next monthly reset timestamp
- Team:
  - `kind: 'monthly'`
  - `limit: 1000`
  - `resetsAt`: next monthly reset timestamp

### Quota Pool Selection

- `effectivePlan = 'free'` uses the one-time trial pool.
- `effectivePlan = 'pro' | 'team'` uses the paid monthly pool.
- Paid monthly usage never consumes or displays remaining trial quota.
- Trial quota remains persisted while the user is paid, so an expired user can
  fall back to the remaining trial balance.

### Monthly Reset Semantics

Paid monthly quota must have an explicit reset mechanism.

- Store `monthly_quota_used` and `monthly_quota_reset_at` as separate fields, or
  continue using the existing paid quota field with an equivalent reset column.
- `monthly_quota_reset_at` should align with the current paid period end when a
  Stripe/WeChat subscription period is known.
- Status endpoints should lazily reset paid monthly usage when
  `monthly_quota_reset_at <= now()` before returning `officialApiQuota`.
- `/api/vision/generate` should also perform the same lazy reset before quota
  deduction to avoid charging against an expired period.
- Payment webhooks may eagerly set the next reset timestamp, but API correctness
  must not depend only on webhook delivery.

## API Behavior

### `/api/vision/generate`

- Requires login.
- Allows FREE users when one-time trial quota remains.
- Deducts FREE trial quota for FREE users.
- Deducts monthly official API quota for Pro/Team users.
- Rolls back quota if the downstream model request fails.
- Returns `QUOTA_EXCEEDED` when the relevant quota pool is exhausted.
- Uses a pool-aware atomic quota RPC or equivalent transaction so concurrent
  requests cannot overspend either trial or monthly quota.
- Returns the updated `officialApiQuota` on success and on `QUOTA_EXCEEDED`
  where possible.

### `/api/billing/status`

- Returns subscription status and `officialApiQuota`.
- Uses the same quota limit constants as `/api/vision/generate`.
- Calculates `officialApiQuota` from the same effective plan helper used by
  `/api/vision/generate`.

### `/api/sync/status`

- Continues to return `cloudSyncEnabled: false` for FREE users.
- Returns `officialApiQuota` for display consistency.
- Does not use API quota availability to imply cloud sync access.

### Cloud Sync APIs

- Continue requiring active Pro/Team or inherited Team access.
- FREE login status alone is not enough for upload/download cloud sync.

## Data Model

Avoid using a single `optimization_quota_used` field to represent both one-time FREE trial quota and paid monthly quota.

Recommended persisted fields or equivalent table columns:

- `trial_quota_limit`: default `50`
- `trial_quota_used`: default `0`
- `trial_quota_granted_at`: timestamp set on registration or first quota record creation
- Existing paid monthly quota field can continue to track Pro/Team monthly usage.
- `monthly_quota_used`: default `0`, or the existing paid-only quota usage
  field after it no longer represents FREE trial usage.
- `monthly_quota_reset_at`: timestamp for the next paid quota reset.

### Trial Quota Initialization And Migration

Registration should create or initialize the user's FREE trial quota record so
the extension can show `50/50` immediately after login. Existing users need the
same guarantee.

- New registrations: create the quota record during registration or on first
  status/API request.
- Existing logged-in FREE users without a quota record: lazily upsert
  `trial_quota_limit = 50`, `trial_quota_used = 0`, and
  `trial_quota_granted_at = now()` on `/api/billing/status`, `/api/sync/status`,
  or `/api/vision/generate`.
- Existing paid users without a trial record: create the trial record with
  `trial_quota_used = 0`; it stays hidden while paid and becomes available only
  if they later fall back to FREE.
- Missing `user_subscriptions` rows must not block FREE trial access. Treat them
  as FREE for official API quota and initialize the trial record.

### Atomic Quota Operations

The quota mutation layer should expose one pool-aware operation, either as a
Supabase RPC or a transaction in server code:

```ts
incrementOfficialApiQuota(userId, {
  pool: 'trial' | 'monthly',
  limit: number,
  resetAt?: string | null
})
```

Required behavior:

- Increment exactly one quota pool and return the new `used` value.
- Refuse increment when `used >= limit` and return `QUOTA_EXCEEDED`.
- For `monthly`, lazily reset usage first when `resetAt <= now()`.
- Rollback must decrement the same pool that was incremented for the downstream
  request.
- Concurrent requests must be serialized by the database update condition or
  transaction, not by frontend checks.

## Frontend And Type Migration

- Add `officialApiQuota` to shared auth/status types used by extension and
  web-app.
- Keep `optimizationQuota` and/or `visionQuota` as compatibility aliases only
  during migration if existing UI still reads them.
- Official API config cards should render `officialApiQuota.remaining`,
  `officialApiQuota.limit`, and `officialApiQuota.kind`.
- Extension feature gates must stop treating all FREE users as ineligible for
  official API. Logged-in FREE users are eligible when
  `officialApiQuota.remaining > 0`.
- Third-party API config availability remains unchanged and must not depend on
  official quota.

## Existing Consistency Issues To Fix During Implementation

- Some extension code currently treats FREE quota as `0`.
- Some API/status routes use `Pro: 50, Team: 200`.
- Some subscription UI copy uses `Pro: 200, Team: 1000`.

Implementation should converge on:

- FREE trial: 50 one-time calls
- Pro monthly: 200 calls/month
- Team monthly: 1000 calls/month

## Testing

- FREE user with no usage can activate official config and sees `50/50`.
- FREE user after one official API call sees `49/50`.
- FREE user at `50/50` used receives `QUOTA_EXCEEDED` and sees upgrade CTA.
- FREE user cannot cloud sync even with remaining API trial quota.
- Pro user sees monthly quota and cloud sync enabled.
- Team user sees monthly quota and cloud sync enabled.
- Expired Pro user falls back to FREE trial quota behavior and cloud sync disabled.
- Backend rollback restores quota when downstream official API call fails.
- Existing FREE user without `user_subscriptions` or trial quota rows receives a
  lazily initialized `50/50` trial quota.
- Existing paid user without a trial row gets a hidden trial row and still sees
  only the paid monthly quota while active.
- Inactive/canceled/expired paid subscription with stored `plan_type = 'pro'` or
  `team` returns `kind: 'trial'`, not monthly quota.
- Paid monthly quota resets when `monthly_quota_reset_at <= now()` before status
  display and before `/api/vision/generate` deduction.
- Concurrent FREE trial requests at 49/50 allow only one successful increment.
- Concurrent paid monthly requests at `limit - 1` allow only one successful
  increment.
- Rollback after a failed Agent request decrements the same quota pool as a
  failed Vision request would.
- Extension official config eligibility uses `officialApiQuota`, while
  third-party config behavior stays unchanged.
