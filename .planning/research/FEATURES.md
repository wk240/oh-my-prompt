# Feature Research: v2.0 网络版 + 团队协作

**Domain:** SaaS Backend Services + Chrome Extension Integration
**Milestone:** v2.0 网络版 + 团队协作
**Researched:** 2026-05-07
**Confidence:** MEDIUM (network restrictions prevented direct documentation lookup; based on domain knowledge and common patterns)

---

## Feature Landscape

### 1. Authentication Domain

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email/password signup | Standard SaaS entry point | LOW | Every service offers this |
| Email/password login | Basic authentication | LOW | Required for users without OAuth |
| Google OAuth | Most common OAuth provider | MEDIUM | ~40% of SaaS users prefer Google |
| Password reset | Self-service recovery | LOW | Email-based reset flow expected |
| Session persistence | Stay logged in across visits | LOW | JWT tokens in localStorage/cookies |
| Logout | Basic security hygiene | LOW | Clear session state |
| Account deletion | GDPR compliance + user control | MEDIUM | Must cascade delete all data |
| Extension-to-Web linking | User expects unified identity | MEDIUM | Chrome identity API + web session sync |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Magic link (passwordless) | Frictionless onboarding | MEDIUM | Email-only login, no password |
| Multiple OAuth providers | Reduce signup friction | MEDIUM | GitHub, Apple, WeChat (China) |
| Device trust | Stay logged in longer | MEDIUM | Remember device for 30 days |
| Account switching | Team/personal separation | LOW | Switch between accounts in extension |
| Email verification enforcement | Trustworthy user base | LOW | Verify before cloud features enabled |

#### Anti-Features (Do NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| SMS verification | Security marketing | Costly (¥0.05/msg), unreliable in China | Email-only verification |
| Two-factor auth (2FA) | Enterprise requirement | Overkill for ¥9/month consumer product | Defer to v2.x for enterprise tier |
| CAPTCHA on every login | Bot prevention | Frustrates legitimate users | Rate limiting + invisible CAPTCHA on signup |
| Password complexity rules | Security theater | Reduces signup conversion | Minimum 8 chars, no complexity rules |
| Remember-me forever | Convenience | Security risk if device compromised | 30-day max session with re-auth prompt |

---

### 2. Cloud Storage & Sync Domain

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Personal library sync | Cross-device access | HIGH | Core value proposition for paid tier |
| Auto-sync on change | No manual intervention | MEDIUM | Sync after every CRUD operation |
| Offline mode | Use without network | MEDIUM | Local-first, sync when connected |
| Conflict resolution | Handle simultaneous edits | HIGH | Last-write-wins or user prompt |
| Sync status indicator | Know if data is synced | LOW | Badge/icon showing sync state |
| Manual sync trigger | User control | LOW | Button to force sync |
| Version history | Undo accidental changes | MEDIUM | Keep last 10 versions |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real-time sync (multi-device) | Instant propagation | HIGH | WebSocket or polling-based |
| Selective sync | Control what syncs | MEDIUM | Personal vs team library separation |
| Large file sync | Attach images to prompts | HIGH | Storage quota + CDN for images |
| Export to other formats | Backup flexibility | LOW | Markdown, CSV export options |
| Import from competitors | Migration from AIPRM, etc. | MEDIUM | Parse common formats |

#### Anti-Features (Do NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full history sync | Never lose data | Storage explosion (10GB/user) | Keep 30 days rolling |
| Real-time collaboration on prompts | Google Docs-like editing | Overkill for text snippets | Lock-based editing |
| Block-level sync | Efficiency | Complex implementation, marginal benefit | Full prompt sync |
| Peer-to-peer sync | Privacy marketing | Unreliable, no central backup | Centralized cloud sync |

---

### 3. Team Collaboration Domain

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Team creation | Form a group | LOW | Team name, optional description |
| Team invitation | Add members | MEDIUM | Email invite + link invite |
| Member list | See who's in team | LOW | Basic roster view |
| Shared library | Team prompts accessible to all | HIGH | Core team value proposition |
| Role assignment | Different permissions | MEDIUM | Admin/Editor/Member hierarchy |
| Leave team | User autonomy | LOW | Self-service exit |
| Team deletion | Admin control | MEDIUM | Cascade delete team data |

#### Role Permission Matrix

| Permission | Admin | Editor | Member |
|------------|-------|--------|--------|
| Create/edit/delete team prompts | Yes | Yes | No |
| Invite members | Yes | No | No |
| Remove members | Yes | No | No |
| Delete team | Yes | No | No |
| View team library | Yes | Yes | Yes |
| Use team prompts (insert) | Yes | Yes | Yes |
| Copy team prompt to personal | Yes | Yes | Yes |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unlimited team size | No per-seat pricing | LOW | ¥9/month covers any team size |
| Team prompt categories | Organized shared library | MEDIUM | Team-specific categorization |
| Activity log | Audit trail | MEDIUM | Who edited what prompt |
| Prompt ownership attribution | Credit contributors | LOW | Show author on shared prompts |
| Team usage stats | Understand adoption | MEDIUM | Most-used prompts, member activity |

#### Anti-Features (Do NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time co-editing | Collaboration marketing | Complex, overkill for prompts | Lock-based editing |
| Nested teams | Organization structure | Complex permissions, edge cases | Single-level teams only |
| Team chat/messaging | Communication hub | Scope creep, off-platform | External Slack/Discord |
| Granular per-prompt permissions | Fine control | Complexity explosion | Role-level permissions only |
| Team analytics dashboard | Productivity insights | Premature optimization | Usage stats only |

---

### 4. Subscription Payments Domain

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pricing page | Transparency | LOW | ¥9/month, ¥99/year, free tier |
| Payment method selection | User choice | MEDIUM | WeChat/Alipay (China), Stripe (International) |
| Checkout flow | Secure payment | HIGH | Redirect to payment provider |
| Subscription activation | Immediate access | MEDIUM | Unlock features after payment |
| Billing history | User awareness | LOW | List past payments |
| Renewal reminder | Avoid surprises | LOW | Email 7 days before renewal |
| Cancel subscription | User control | LOW | Self-service cancellation |
| Refund handling | Trust | MEDIUM | 7-day refund window |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Annual discount (¥99 vs ¥108) | Loyalty incentive | LOW | ~10% discount for annual |
| Free tier value | Freemium conversion | LOW | Personal sync, no team features |
| Team flat-rate | Simple pricing | LOW | ¥9/month covers entire team |
| Usage-based upgrade prompts | Nudge to paid | LOW | Show sync/team benefits at usage limits |
| Grace period | Payment failure handling | MEDIUM | 7 days to fix payment before downgrade |

#### Anti-Features (Do NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-seat pricing | Enterprise standard | Conflicts with flat-rate team value | Flat-rate only |
| Credit card direct integration | Smooth UX | PCI compliance burden, China users can't use | Use Stripe/WeChat/Alipay as payment processors |
| Crypto payment | Marketing gimmick | Unreliable, regulatory risk | Traditional payment only |
| Dynamic pricing | Optimization | User distrust, complexity | Fixed pricing tiers |
| Trial period | Conversion marketing | Abuse potential, low-margin product | Free tier instead of trial |

#### Payment Provider Comparison

| Provider | Market | Pros | Cons | Recommendation |
|----------|--------|------|------|----------------|
| WeChat Pay | China | 90%+ penetration, seamless | Requires merchant account, Chinese entity | Required for China users |
| Alipay | China | 90%+ penetration, trusted | Requires merchant account, Chinese entity | Required for China users |
| Stripe | International | Global coverage, excellent docs | Higher fees (~3.4%), no China | Required for international users |

---

### 5. Web App Management Interface Domain

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dashboard home | Landing page | LOW | Usage summary, quick actions |
| Prompt library view | CRUD interface | MEDIUM | List, search, edit prompts |
| Category management | Organization | LOW | Create, edit, delete categories |
| Team management | Team settings | MEDIUM | Members, roles, invitations |
| Account settings | User profile | LOW | Email, password, subscription |
| Logout | Basic hygiene | LOW | Clear session |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Responsive design | Mobile access | MEDIUM | Works on phone/tablet |
| Keyboard shortcuts | Power user efficiency | LOW | Quick navigation |
| Dark mode | User preference | LOW | Toggle theme |
| Bulk operations | Efficiency | MEDIUM | Bulk edit, delete, move |
| Export/backup | Data portability | LOW | JSON export |
| Usage analytics | Self-awareness | MEDIUM | Most-used prompts, sync stats |

#### Anti-Features (Do NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Prompt execution in Web App | Try prompts live | Web App is management, not execution | Link to Lovart to execute |
| AI chat integration | All-in-one platform | Scope creep, distracts from core value | Focus on prompt management |
| Community/social features | Engagement marketing | Requires moderation, dilutes focus | Private teams only |
| Notification center | Activity hub | Over-engineering for prompt tool | Email notifications only |

---

## Feature Dependencies

```
[Cloud Sync]
    └──requires──> [Authentication]
                       └──requires──> [Database Schema]

[Team Collaboration]
    └──requires──> [Authentication]
    └──requires──> [Cloud Sync]
                       └──requires──> [Database Schema]

[Subscription Payments]
    └──requires──> [Authentication]
    └──requires──> [Payment Provider Integration]

[Web App Management]
    └──requires──> [Authentication]
    └──enhances──> [Prompt CRUD]
    └──enhances──> [Team Management]
    └──enhances──> [Subscription Management]

[Extension-to-Cloud Sync]
    └──requires──> [Authentication]
    └──requires──> [Cloud Sync API]
                       └──requires──> [Backend API]
```

### Dependency Notes

- **Cloud Sync requires Authentication:** Sync needs user identity to associate data with account
- **Team Collaboration requires Cloud Sync:** Shared library must be stored in cloud accessible to all members
- **Subscription Payments requires Authentication:** Payment must be linked to user account
- **Web App enhances Prompt CRUD:** Web App provides richer management interface than Extension popup
- **Extension-to-Cloud Sync requires Backend API:** Extension needs REST API to sync data with cloud database

---

## MVP Definition

### Launch With (v2.0 MVP)

Minimum viable product — what's needed to validate the concept.

- [ ] Email/password signup + login — Essential entry point
- [ ] Google OAuth — Reduces signup friction, expected by most users
- [ ] Password reset — Self-service recovery expected
- [ ] Personal cloud sync — Core value for paid tier
- [ ] Team creation + invitation — Core team value
- [ ] Shared library (basic) — Team can access shared prompts
- [ ] Admin/Editor/Member roles — Minimum permission granularity
- [ ] WeChat Pay + Alipay — Required for China market
- [ ] Stripe integration — Required for international market
- [ ] ¥9/month subscription — Flat-rate pricing
- [ ] Web App prompt library — Basic CRUD interface
- [ ] Extension-to-Web identity linking — Unified user experience

### Add After Validation (v2.1+)

Features to add once core is working.

- [ ] Magic link (passwordless) — Conversion optimization after email signup working
- [ ] Version history — Users request undo after accidental edits
- [ ] Activity log — Teams request audit trail after using shared library
- [ ] Team usage stats — Admins request adoption metrics
- [ ] Bulk operations — Power users request efficiency
- [ ] Annual billing (¥99/year) — Loyalty incentive after monthly working
- [ ] Offline mode improvements — Mobile users request better offline experience

### Future Consideration (v3.0+)

Features to defer until product-market fit is established.

- [ ] Multiple OAuth providers (GitHub, Apple, WeChat OAuth) — Expand OAuth options
- [ ] Large file sync (images) — Storage-heavy feature
- [ ] Import from competitors — Migration tooling
- [ ] Team prompt categories — Organized shared library
- [ ] 2FA for enterprise tier — Security feature for higher-priced tier
- [ ] Usage-based prompts (Prompt marketplace) — Different business model

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Email/password auth | HIGH | LOW | P1 |
| Google OAuth | HIGH | MEDIUM | P1 |
| Personal cloud sync | HIGH | HIGH | P1 |
| Team creation | HIGH | LOW | P1 |
| Shared library | HIGH | HIGH | P1 |
| WeChat/Alipay payment | HIGH | MEDIUM | P1 |
| Stripe payment | HIGH | MEDIUM | P1 |
| Web App prompt CRUD | HIGH | MEDIUM | P1 |
| Password reset | MEDIUM | LOW | P1 |
| Role permissions | MEDIUM | MEDIUM | P1 |
| Sync status indicator | MEDIUM | LOW | P2 |
| Version history | MEDIUM | MEDIUM | P2 |
| Activity log | LOW | MEDIUM | P2 |
| Magic link | MEDIUM | MEDIUM | P2 |
| Annual billing | MEDIUM | LOW | P2 |
| Team usage stats | LOW | MEDIUM | P3 |
| Dark mode | LOW | LOW | P3 |
| Bulk operations | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Should have, add after P1 stable
- P3: Nice to have, future consideration

---

## Complexity by Domain

| Domain | Total LOC Estimate | Backend Effort | Frontend Effort | Integration Effort |
|--------|-------------------|----------------|-----------------|-------------------|
| Authentication | ~2000 | HIGH | MEDIUM | HIGH (Extension linking) |
| Cloud Sync | ~3000 | HIGH | MEDIUM | HIGH (Offline/conflict) |
| Team Collaboration | ~2500 | HIGH | MEDIUM | MEDIUM |
| Subscription Payments | ~1500 | MEDIUM | LOW | HIGH (Payment providers) |
| Web App | ~4000 | LOW | HIGH | MEDIUM |

**Total Backend:** ~7000-8000 LOC
**Total Frontend:** ~5000-6000 LOC
**Total Integration:** ~3000 LOC

---

## Competitor Feature Analysis

| Feature | Notion | AIPRM | Superhuman | Our Approach |
|---------|--------|-------|------------|--------------|
| Auth method | Email + Google OAuth | None (extension-only) | Email + Google OAuth | Email + Google OAuth + WeChat OAuth (China) |
| Sync | Real-time | None | Real-time | Auto-sync with offline support |
| Teams | Yes (paid) | None | Yes (paid) | Yes (flat-rate ¥9/month) |
| Pricing | $10/month | Free | $30/month | ¥9/month (~$1.3) |
| Payment | Stripe | None | Stripe | WeChat/Alipay + Stripe |
| Web App | Yes | No | Yes | Yes (React SPA) |

---

## Sources

- Domain knowledge of SaaS authentication patterns (LOW confidence - needs verification)
- Domain knowledge of team collaboration features (LOW confidence - needs verification)
- Domain knowledge of subscription payment patterns (LOW confidence - needs verification)
- Domain knowledge of Chrome Extension + Web App integration (MEDIUM confidence - based on existing code patterns)
- Project constraints from PROJECT.md (HIGH confidence - verified project context)

**Verification needed:**
- Firebase/Clerk/Supabase authentication API specifics
- Stripe subscription billing implementation details
- WeChat Pay/Alipay merchant integration requirements
- Chrome Extension identity API for web linking

---

*Feature research for: v2.0 网络版 + 团队协作*
*Researched: 2026-05-07*