# Pitfalls Research

**Domain:** Chrome Extension + Backend Services + Team Collaboration + Subscription Payments
**Project:** Oh My Prompt v2.0 (Network Version + Team Collaboration)
**Researched:** 2026-05-07
**Confidence:** MEDIUM (Training knowledge + project context, external docs unavailable)

---

## Critical Pitfalls

### Pitfall 1: Authentication Token Storage in chrome.storage.local

**What goes wrong:**
Storing OAuth tokens or session JWTs directly in `chrome.storage.local` without encryption exposes them to any extension context (content script, popup, background). If a malicious page exploits Shadow DOM bypass or the user has other extensions that can read storage, tokens are compromised.

**Why it happens:**
`chrome.storage.local` is shared across all extension contexts. Developers assume "Chrome is secure" without considering that any code running in the extension context can read the entire storage. Content scripts on compromised pages could leak tokens.

**Consequences:**
- User accounts hijacked
- Session tokens stolen via XSS on content script injection pages
- API keys extracted by malicious extensions
- Full account takeover

**How to avoid:**
1. Use `chrome.storage.session` for ephemeral tokens (cleared on browser restart) — only available in service worker
2. Never expose auth tokens to content scripts — service worker holds them exclusively
3. Encrypt sensitive tokens before storage using Web Crypto API
4. Use short-lived tokens with refresh flow — minimize exposure window
5. Store only refresh tokens encrypted, access tokens in memory only

**Warning signs:**
- Token visible in `chrome.storage.local.get()` from content script
- Auth state persists indefinitely without refresh mechanism
- No encryption layer for sensitive credentials
- Token logged to console during debugging

**Phase to address:**
Phase 2 (Authentication Backend + Extension Integration)

---

### Pitfall 2: OAuth Token Refresh in Service Worker Lifecycle

**What goes wrong:**
Chrome Service Workers terminate after ~30 seconds of inactivity. When the user returns after hours/days, the service worker restarts but the access token is expired. The refresh token may exist in storage, but the refresh mechanism doesn't run because no scheduled timer survived the termination.

**Why it happens:**
Manifest V3 service workers are event-driven, not persistent. Developers implement token refresh with `setTimeout` or `setInterval`, which are cleared when the worker terminates. On restart, the code doesn't know when to refresh next.

**Consequences:**
- Users forced to re-login frequently
- Silent failures when background sync should happen
- API calls fail with 401 after service worker restarts
- Frustrating UX: "Why did my session expire again?"

**How to avoid:**
1. Use `chrome.alarms` API for scheduled token refresh — survives service worker termination
2. On service worker startup (`chrome.runtime.onStartup`), check token expiry and refresh if needed
3. Store token expiry timestamp in `chrome.storage.local` — compare on each service worker activation
4. Implement proactive refresh: refresh token when < 5 minutes remaining, not when expired
5. Use `chrome.storage.session` for access tokens (cleared on restart forces re-validation)

**Warning signs:**
- Token refresh implemented with `setTimeout`
- No `chrome.alarms` for scheduled refresh
- Service worker startup doesn't check token state
- Users report random "not logged in" errors after idle periods

**Phase to address:**
Phase 2 (Authentication Backend + Extension Integration)

---

### Pitfall 3: Content Script Cannot Authenticate Directly

**What goes wrong:**
Attempting OAuth flow directly in content script (window.location redirect, popup OAuth) fails because:
1. Content scripts can open popup windows but can't receive callback URLs
2. The OAuth redirect URL (`chrome-extension://...`) is blocked in content script context
3. `chrome.identity.launchWebAuthFlow` only works in background/popup context

**Why it happens:**
Content scripts run in the context of the host page, not the extension. They don't have access to `chrome.identity` API and can't handle `chrome-extension://` URLs. Developers try to implement OAuth like a web app, but the extension architecture is fundamentally different.

**Consequences:**
- OAuth flow hangs — popup opens but never closes
- Callback URL is `chrome-extension://...` which content script can't handle
- User stuck in infinite auth loop
- Security risk: passing tokens through URL parameters visible to host page

**How to avoid:**
1. All OAuth flows must originate from popup or service worker
2. Use `chrome.identity.launchWebAuthFlow` for OAuth (background/popup only)
3. Content script requests auth state via message to service worker
4. Service worker holds all auth-related logic — content script is just UI
5. If user triggers auth from content script, message service worker to open auth popup

**Warning signs:**
- OAuth logic in content script files
- `window.open()` for OAuth popup in content script
- Trying to read `chrome-extension://` URLs from content script
- Auth tokens passed through `window.location.hash`

**Phase to address:**
Phase 2 (Authentication Backend + Extension Integration)

---

### Pitfall 4: Dual Payment Track Complexity (国内 + 国际)

**What goes wrong:**
Implementing both WeChat/Alipay (国内) and Stripe/Paddle (国际) creates massive complexity:
- Two different billing systems with different UX, refund policies, subscription models
- Currency conversion and pricing parity issues (¥9/月 vs $2/月)
- Tax compliance for Chinese users vs international users
- Webhook handling from two different payment providers
- User confusion: "Why can I pay with Alipay but not get the same features?"

**Why it happens:**
Chinese payment ecosystem is entirely different from international:
- WeChat/Alipay don't have subscription APIs like Stripe — need manual billing
- ICP备案要求 for payment integration in China
- Stripe doesn't support Chinese users directly (need international cards)
- Exchange rates fluctuate, creating pricing inconsistency

**Consequences:**
- Double billing system maintenance cost
- Users in one region can pay but get worse features
- Refund handling complexity (Stripe vs WeChat policies differ)
- Accounting nightmare: two different revenue streams
- Legal compliance issues (中国外汇管制, VAT requirements)

**How to avoid:**
1. Start with ONE payment track — prioritize target market first
2. If China is primary: Use aggregators like Ping++ or BeeCloud that support both WeChat/Alipay with subscription APIs
3. If international is primary: Stripe + manual handling for Chinese users (or proxy service)
4. Use a billing abstraction layer: `PaymentProvider` interface with unified API
5. Store payment metadata in unified format: `Subscription { provider, status, planId, currency }`
6. Never duplicate feature sets by payment method — same features for same price tier

**Warning signs:**
- Two completely separate billing code paths
- Feature flags tied to payment provider instead of plan level
- Currency hardcoding (¥ vs $) without conversion layer
- No unified subscription schema across providers

**Phase to address:**
Phase 3 (Subscription Backend + Payment Integration)

---

### Pitfall 5: WeChat/Alipay Lack True Subscription APIs

**What goes wrong:**
WeChat Pay and Alipay don't have native recurring subscription APIs like Stripe. Developers implement subscriptions manually with:
- Stored payment tokens that expire
- Manual monthly billing attempts
- No automatic retry on payment failure
- User must re-authorize each month

**Why it happens:**
Chinese payment providers operate differently:
- WeChat Pay "委托代扣" (auto-debit) requires merchant qualification + contract
- Alipay "周期扣款" has strict approval requirements
- Most indie developers don't qualify for auto-debit APIs
- Manual approach seems "simpler" but creates maintenance burden

**Consequences:**
- Subscriptions silently fail when payment token expires
- No automatic retry → users lose access without warning
- Massive support burden: "Why did my subscription stop?"
- Billing reconciliation nightmare
- Revenue leakage: failed payments not recovered

**How to avoid:**
1. Research aggregator services: Ping++, BeeCloud, PaymentWall — they abstract subscription handling
2. If direct integration: Implement billing reminder system (notify users before renewal)
3. Store `lastPaymentAttempt` and `nextBillingDate` — track manually
4. Build retry logic: 3 attempts with exponential backoff
5. Grace period after failed payment: 7 days before revoking access
6. Consider annual-only plans for WeChat/Alipay (one-time payment, less maintenance)

**Warning signs:**
- Subscription code assumes auto-recurring behavior
- No billing date tracking in database
- No payment failure notification system
- Users surprised when subscription silently ends

**Phase to address:**
Phase 3 (Subscription Backend + Payment Integration)

---

### Pitfall 6: Team Collaboration Race Conditions

**What goes wrong:**
When multiple team members edit the same prompt simultaneously:
1. User A edits prompt X on Web App → saves → syncs to cloud
2. User B edits prompt X in Extension → saves → syncs to cloud
3. Cloud receives both updates — last write wins, User A changes lost
4. Both users think they saved successfully, but data is inconsistent

**Why it happens:**
Chrome Extensions sync asynchronously. The Extension doesn't know about Web App edits. Without conflict detection or versioning, the last sync wins.

**Consequences:**
- Silent data loss — users don't know their edits were overwritten
- Team trust erodes: "Why did my prompt disappear?"
- Support burden: restore lost data manually
- Database corruption from conflicting updates

**How to avoid:**
1. Implement version/timestamp on each prompt: `{ id, content, updatedAt, updatedBy }`
2. On sync, compare timestamps: if cloud version newer, prompt user to merge
3. Use optimistic locking: include version in update request, reject if mismatch
4. Implement conflict UI: "This prompt was edited by [user], your version vs their version"
5. For critical shared prompts, lock editing to one user at a time
6. Sync status indicator in UI: "Syncing..." vs "Synced" vs "Conflict detected"

**Warning signs:**
- No `updatedAt` timestamp on prompts
- Sync happens without conflict detection
- Users edit same prompt simultaneously without warning
- No "last write wins" acknowledgment in code

**Phase to address:**
Phase 4 (Team Collaboration + Conflict Resolution)

---

### Pitfall 7: Extension-Web App Data Consistency

**What goes wrong:**
User has Extension installed and Web App open in different tabs:
1. Extension modifies data → syncs to cloud → local state updated
2. Web App shows stale data — doesn't receive real-time update
3. User confused: "I just edited it in Extension, why doesn't Web App show it?"
4. Web App later syncs → overwrites Extension changes with older data

**Why it happens:**
Extension and Web App are separate contexts. Without real-time sync notification, they operate on stale snapshots. The `lastSyncTime` approach only works if both contexts check frequently.

**Consequences:**
- Data inconsistency across contexts
- User frustration: "Which version is correct?"
- Accidental data overwrite when stale context syncs
- Race conditions during rapid edits

**How to avoid:**
1. Implement real-time sync: WebSockets or Firebase Realtime Database for live updates
2. Or polling: Web App polls for changes every 30 seconds when active
3. Use `chrome.runtime.sendMessage` between contexts when possible
4. Timestamp-based sync: only accept updates newer than local `updatedAt`
5. Conflict resolution UI: when timestamps conflict, show both versions
6. "Sync on focus": force sync when tab/window gains focus

**Warning signs:**
- No real-time update mechanism
- Both contexts sync independently without coordination
- `lastSyncTime` not checked before syncing
- No conflict detection when syncing

**Phase to address:**
Phase 4 (Team Collaboration + Conflict Resolution)

---

### Pitfall 8: Cloud Storage Migration from Local-Only

**What goes wrong:**
Existing users have 100+ prompts stored in `chrome.storage.local`. When migrating to cloud:
1. Migration uploads all prompts to cloud
2. Cloud storage quota exceeded (if user has many prompts with images)
3. Some prompts fail to upload — partial migration
4. User has split state: some prompts local-only, some cloud-synced
5. Extension doesn't know which prompts are migrated vs local

**Why it happens:**
The current architecture stores everything locally. Cloud storage may have different limits (Supabase 1GB, AWS S3 costs). Image data stored as `remoteImageUrl` may not transfer correctly.

**Consequences:**
- Partial migration leaves inconsistent state
- User loses access to prompts that failed migration
- Storage costs balloon unexpectedly
- Migration UI shows "complete" but data is incomplete

**How to avoid:**
1. Assess storage size BEFORE migration: show user their data size vs cloud quota
2. Implement incremental migration: prompts → categories → images → settings
3. Migration progress UI: "50/100 prompts migrated" with progress bar
4. Retry failed items: log failures, retry 3 times, manual resolution UI
5. Keep local backup during migration: don't delete local until cloud verified
6. Post-migration verification: compare local vs cloud counts, alert on mismatch

**Warning signs:**
- Migration assumes all items succeed
- No progress indicator during upload
- Local data deleted before cloud verification
- No retry mechanism for failed uploads

**Phase to address:**
Phase 1 (Cloud Backend Foundation + Data Migration)

---

### Pitfall 9: Team Role Permission Enforcement

**What goes wrong:**
Role-based permissions (Admin/Editor/Member) are implemented in UI but not enforced in API:
1. UI hides "Delete Team" button for non-admins
2. API endpoint `/team/delete` has no role check
3. Member discovers API via browser dev tools, calls endpoint directly
4. Team deleted by non-admin user

**Why it happens:**
Developers implement permissions in frontend for UX convenience, forgetting that APIs must validate every request. Content script or popup code can be inspected, API endpoints discovered.

**Consequences:**
- Unauthorized team deletion/modification
- Data exposure: members can access admin-only data
- Security breach: any user can escalate privileges via API
- Compliance violation (GDPR, SOC2)

**How to avoid:**
1. Every API endpoint MUST check user role before executing
2. Use middleware: `requireRole('admin')` before sensitive endpoints
3. Never trust frontend permission checks alone
4. Audit logging: track who did what, when, from where
5. Document permission matrix: { action, requiredRole }
6. Test with API client (Postman) — bypass UI, verify enforcement

**Warning signs:**
- API endpoints without role validation
- Permissions only in UI components
- No audit logging for sensitive actions
- Admin actions have no server-side validation

**Phase to address:**
Phase 4 (Team Collaboration + Role Enforcement)

---

### Pitfall 10: Payment Status Sync Between Backend and Extension

**What goes wrong:**
User subscribes on Web App:
1. Stripe processes payment → webhook received → subscription status: `active`
2. Extension checks subscription status → queries API → receives `active`
3. Extension stores status in `chrome.storage.local`
4. Payment fails next month → webhook received → subscription: `inactive`
5. Extension has cached `active` status — shows premium features incorrectly
6. User sees "premium" UI but backend denies API calls

**Why it happens:**
Extension caches subscription state for performance. Backend state changes (payment failure, cancellation) but Extension cache isn't refreshed until explicit check.

**Consequences:**
- Premium features shown to non-paying users
- API calls fail unexpectedly (402 Payment Required)
- User confusion: "I see the feature but it doesn't work"
- Revenue leakage: free users accessing premium features

**How to avoid:**
1. Subscription status must be checked before EVERY premium feature use
2. Don't cache subscription status — fetch from API on each premium action
3. Or cache with short TTL: 5 minutes, refresh on expiry
4. Webhook should notify Extension: push notification via WebSocket or poll trigger
5. Graceful degradation: if status check fails, show "checking..." not premium UI
6. Store `lastStatusCheck` timestamp — force refresh if > 5 minutes old

**Warning signs:**
- Subscription status cached indefinitely
- Premium feature UI doesn't check status before rendering
- No webhook notification to Extension on status change
- Backend denies API calls while UI shows premium features

**Phase to address:**
Phase 3 (Subscription Backend + Payment Integration)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store tokens unencrypted | Faster implementation | Security breach, data exposure | Never |
| Skip token refresh alarms | Simpler auth logic | Frequent re-login UX pain | Never |
| Duplicate billing logic per provider | Faster MVP launch | Double maintenance, bugs | Never |
| Permissions only in UI | Less backend code | Security holes, unauthorized actions | Never |
| Cache subscription indefinitely | Faster UI response | Revenue leakage, premium for free users | Never |
| No conflict detection on sync | Simpler sync logic | Data loss, team frustration | MVP only if single-user |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OAuth (Google/Email) | Implement in content script | Use `chrome.identity.launchWebAuthFlow` in service worker/popup only |
| Stripe Webhooks | Process in Extension | Process in backend only, notify Extension via API |
| WeChat/Alipay | Assume auto-recurring subscription | Implement manual billing with reminders, or use aggregators |
| Supabase Auth | Store session in content script | Service worker holds session, content script requests via message |
| Firebase Realtime | Listen in content script | Listen in service worker, broadcast to content script |
| Cloud Storage | Upload all local data at once | Incremental migration with progress tracking and retry |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Token refresh overhead | Latency on every API call | Proactive refresh (5 min before expiry) | 100+ concurrent users |
| Cloud sync latency | UI shows stale data for minutes | WebSocket real-time + polling fallback | 50+ team members editing |
| Storage quota exceeded | Upload failures, partial migration | Pre-migration size check + incremental upload | Users with 100+ prompts + images |
| Permission check latency | Slow API responses | Cache permissions with 5-min TTL + invalidate on role change | 1000+ requests/min |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Token in chrome.storage.local without encryption | XSS on host page extracts token | Encrypt with Web Crypto API, store in chrome.storage.session |
| OAuth callback URL in content script | Token leaked via URL hash | Callback must go to chrome-extension:// URL, handled in background |
| API key hardcoded in Extension | Key extraction via dev tools | API keys from backend only, rotateable |
| No role check on API endpoints | Unauthorized team deletion | Middleware validation on EVERY endpoint |
| Payment webhook in Extension | Webhook URL exposed to users | Webhooks only on backend, notify Extension via API |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent token expiry | "Not logged in" errors randomly | Proactive refresh + graceful re-login prompt |
| Partial migration failure | Some prompts lost without notice | Progress UI + failure resolution step |
| Premium features shown for free users | Feature available but doesn't work | Check subscription BEFORE showing feature |
| Conflict data loss | User edits overwritten silently | Conflict UI showing both versions |
| No sync indicator | User unsure if data saved | "Syncing..." → "Synced" → "Conflict" indicators |

---

## "Looks Done But Isn't" Checklist

- [ ] **Authentication:** Often missing token refresh on service worker restart — verify `chrome.alarms` refresh mechanism
- [ ] **Authentication:** Often missing encryption for stored tokens — verify Web Crypto API usage
- [ ] **Payment:** Often missing webhook notification to Extension — verify push/poll mechanism for status updates
- [ ] **Payment:** Often missing role enforcement on API — verify middleware on sensitive endpoints
- [ ] **Team:** Often missing conflict detection — verify `updatedAt` comparison on sync
- [ ] **Migration:** Often missing partial failure handling — verify retry + progress UI
- [ ] **Sync:** Often missing real-time notification between contexts — verify WebSocket or polling

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Token exposure (unencrypted storage) | HIGH — Potential breach | 1. Force all users re-login, 2. Rotate all tokens, 3. Implement encryption |
| Subscription status cache mismatch | MEDIUM — Revenue impact | 1. Clear all Extension caches, 2. Force status refresh, 3. Audit premium feature access logs |
| Team conflict data loss | HIGH — Data loss | 1. Restore from last known good backup, 2. Implement conflict UI, 3. Notify affected users |
| Partial migration failure | MEDIUM — Incomplete data | 1. Identify failed items from logs, 2. Manual retry/resolution, 3. Compare local vs cloud counts |
| Unauthorized action (no role check) | HIGH — Security breach | 1. Audit logs for unauthorized actions, 2. Revert unauthorized changes, 3. Implement API role middleware |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Token storage security | Phase 2 (Auth) | Test token extraction from content script — should fail |
| Service worker token refresh | Phase 2 (Auth) | Test after 30+ min idle — user still logged in |
| OAuth in wrong context | Phase 2 (Auth) | Verify `chrome.identity.launchWebAuthFlow` usage |
| Dual payment complexity | Phase 3 (Payment) | Verify unified `Subscription` schema, one billing abstraction |
| WeChat subscription maintenance | Phase 3 (Payment) | Verify billing reminders + retry logic |
| Team race conditions | Phase 4 (Team) | Test simultaneous edits — conflict UI appears |
| Extension-Web App sync | Phase 4 (Team) | Test edit in one, update shows in other within 30s |
| Migration partial failure | Phase 1 (Cloud) | Test migration with quota limit — progress UI + retry |
| Role enforcement | Phase 4 (Team) | Test admin action via API as member — 403 response |
| Subscription status cache | Phase 3 (Payment) | Test payment failure — premium UI hides within 5 min |

---

## Sources

- Chrome Extension Manifest V3 documentation (training knowledge)
- Existing project architecture: `src/lib/storage.ts`, `src/background/service-worker.ts`
- Current authentication patterns from v1.3 Vision API integration
- Common pitfalls from Chrome Extension community discussions (training knowledge)
- Payment integration patterns for Chinese vs international markets (training knowledge)

---
*Pitfalls research for: Chrome Extension + Backend Services + Team Collaboration + Subscription Payments*
*Researched: 2026-05-07*
*Confidence: MEDIUM — External documentation lookup failed, relying on training knowledge + project context analysis*