# Requirements: Oh My Prompt v2.0

**Defined:** 2026-05-07
**Core Value:** 一键插入预设提示词，提升AI平台创作效率 + 团队共享提示词库

## v2.0 Requirements

Requirements for v2.0 milestone. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can log in with email and password
- [ ] **AUTH-03**: User can sign up/log in with Google OAuth
- [ ] **AUTH-04**: User can reset password via email link
- [ ] **AUTH-05**: User can log out from Extension and Web App
- [ ] **AUTH-06**: User session persists for 30 days across browser refresh
- [ ] **AUTH-07**: Extension login links to Web App identity (unified account)

### Cloud Sync

- [ ] **SYNC-01**: User's personal prompts sync to cloud automatically
- [ ] **SYNC-02**: User's prompts sync across devices after login
- [ ] **SYNC-03**: Sync happens automatically after every CRUD operation
- [ ] **SYNC-04**: User can see sync status indicator (syncing/synced/error)
- [ ] **SYNC-05**: User can manually trigger sync via button
- [ ] **SYNC-06**: User can view and restore previous prompt versions (last 10)

### Team Collaboration

- [ ] **TEAM-01**: User can create a team with name and optional description
- [ ] **TEAM-02**: User can invite members via email or invite link
- [ ] **TEAM-03**: User can view team member list
- [ ] **TEAM-04**: Team has shared prompt library accessible to all members
- [ ] **TEAM-05**: Team roles: Admin, Editor, Member with distinct permissions
- [ ] **TEAM-06**: Admin can create/edit/delete team prompts
- [ ] **TEAM-07**: Editor can create/edit/delete team prompts
- [ ] **TEAM-08**: Member can view and use team prompts (read-only)
- [ ] **TEAM-09**: Admin can invite and remove members
- [ ] **TEAM-10**: User can leave a team voluntarily

### Subscription Payments

- [ ] **PAY-01**: User can view pricing page (¥9/month, ¥99/year, free tier)
- [ ] **PAY-02**: User can pay via WeChat Pay (China domestic)
- [ ] **PAY-03**: User can pay via Alipay (China domestic)
- [ ] **PAY-04**: User can pay via Stripe (international)
- [ ] **PAY-05**: User can view billing history (past payments)
- [ ] **PAY-06**: User receives renewal reminder email 7 days before renewal
- [ ] **PAY-07**: User can cancel subscription self-service
- [ ] **PAY-08**: Subscription features activate immediately after payment

### Web App Management

- [ ] **WEB-01**: User can view and manage team members (add/remove roles)
- [ ] **WEB-02**: User can manage team settings (name, description)
- [ ] **WEB-03**: Web App is responsive (works on mobile/tablet)
- [ ] **WEB-04**: User can manage account settings (email, password)
- [ ] **WEB-05**: User can view and manage subscription status

## v2.1 Requirements

Deferred to subsequent release. Tracked but not in current roadmap.

### Authentication (Future)

- **AUTH-08**: Magic link (passwordless email login)
- **AUTH-09**: Multiple OAuth providers (GitHub, Apple)

### Cloud Sync (Future)

- **SYNC-07**: Offline mode (use without network, sync when connected)
- **SYNC-08**: Conflict resolution UI (when simultaneous edits occur)
- **SYNC-09**: Large file sync (prompt images to cloud)

### Team Collaboration (Future)

- **TEAM-11**: Activity log (audit trail of who edited what)
- **TEAM-12**: Team prompt categories (organized shared library)
- **TEAM-13**: Team usage stats (most-used prompts, member activity)
- **TEAM-14**: Prompt ownership attribution (show author)

### Subscription Payments (Future)

- **PAY-09**: Annual billing option (¥99/year)
- **PAY-10**: Grace period (7 days to fix payment before downgrade)
- **PAY-11**: Refund handling (7-day refund window)

### Web App (Future)

- **WEB-06**: Prompt library CRUD interface
- **WEB-07**: Category management interface
- **WEB-08**: Dark mode toggle
- **WEB-09**: Bulk operations (bulk edit, delete, move)
- **WEB-10**: Usage analytics dashboard

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Prompt CRUD in Web App | Extension popup sufficient for prompt management, Web App focuses on team/account |
| Offline mode (v2.0) | Complex conflict handling, defer to v2.1 |
| Real-time co-editing | Overkill for text snippets, lock-based editing sufficient |
| WeChat OAuth login | Removed per user request |
| SMS verification | Costly, unreliable in China, email sufficient |
| 2FA/MFA | Overkill for ¥9/month consumer product |
| Nested teams | Complex permissions, single-level teams only |
| Team chat/messaging | Scope creep, external Slack/Discord sufficient |
| Per-seat pricing | Conflicts with flat-rate team value proposition |
| Crypto payment | Regulatory risk, traditional payment sufficient |
| AI chat integration | Scope creep, focus on prompt management |
| Community/social features | Requires moderation, dilutes focus |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| AUTH-04 | TBD | Pending |
| AUTH-05 | TBD | Pending |
| AUTH-06 | TBD | Pending |
| AUTH-07 | TBD | Pending |
| SYNC-01 | TBD | Pending |
| SYNC-02 | TBD | Pending |
| SYNC-03 | TBD | Pending |
| SYNC-04 | TBD | Pending |
| SYNC-05 | TBD | Pending |
| SYNC-06 | TBD | Pending |
| TEAM-01 | TBD | Pending |
| TEAM-02 | TBD | Pending |
| TEAM-03 | TBD | Pending |
| TEAM-04 | TBD | Pending |
| TEAM-05 | TBD | Pending |
| TEAM-06 | TBD | Pending |
| TEAM-07 | TBD | Pending |
| TEAM-08 | TBD | Pending |
| TEAM-09 | TBD | Pending |
| TEAM-10 | TBD | Pending |
| PAY-01 | TBD | Pending |
| PAY-02 | TBD | Pending |
| PAY-03 | TBD | Pending |
| PAY-04 | TBD | Pending |
| PAY-05 | TBD | Pending |
| PAY-06 | TBD | Pending |
| PAY-07 | TBD | Pending |
| PAY-08 | TBD | Pending |
| WEB-01 | TBD | Pending |
| WEB-02 | TBD | Pending |
| WEB-03 | TBD | Pending |
| WEB-04 | TBD | Pending |
| WEB-05 | TBD | Pending |

**Coverage:**
- v2.0 requirements: 35 total
- Mapped to phases: 0
- Unmapped: 35 ⚠️

---
*Requirements defined: 2026-05-07*
*Last updated: 2026-05-07 after milestone scoping*