# Roadmap: Lovart Prompt Injector

**Created:** 2026-04-16
**Granularity:** Standard

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-04-16)
- ✅ **v1.1.0 网络提示词数据源接入** — Phases 5-7 (shipped 2026-04-19)
- ⏸️ **v1.2.0 在线搜索功能** — Phase 8 (deferred)
- ✅ **v1.2.x 双语支持与图片功能** — Integrated into v1.2.1/v1.2.0 releases (shipped 2026-04-27)
- ✅ **v1.3.0 Image to Prompt** — Phases 9-12 (shipped 2026-04-28)
- ✅ **v1.3.1** — Stability & Polish (shipped 2026-04-29)
- ✅ **v1.3.2** — Permission Auto-Restore (shipped 2026-05-01)
- ✅ **v1.3.3** — Gesture-Preserving Permission (shipped 2026-05-06)
- 🚧 **v2.0 Web + Team** — Phases 13-18 (in progress)

---

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Foundation & Manifest Setup (8/8 plans) — completed 2026-04-16
- [x] Phase 2: Lovart Integration & Content Script (4/4 plans) — completed 2026-04-16
- [x] Phase 3: Data Management & Popup UI (9/9 plans) — completed 2026-04-16
- [x] Phase 4: Polish & End-to-End Testing (6/6 plans) — completed 2026-04-16

**Total:** 4 phases, 27 plans, 54 tasks — 100% complete

</details>

<details>
<summary>✅ v1.1.0 网络提示词数据源接入 (Phases 5-7) — SHIPPED 2026-04-19</summary>

- [x] Phase 5: Provider Foundation (4/4 plans) — completed 2026-04-19
- [x] Phase 6: Network Cache Layer (4/4 plans) — completed 2026-04-19
- [x] Phase 7: Dropdown Online Library UI (5/5 plans) — completed 2026-04-19

**Total:** 3 phases, 13 plans — 100% complete

</details>

### ⏸️ v1.2.0 在线搜索功能 (Deferred)

**Milestone Goal:** 集成 prompts.chat API，用户可在线搜索、浏览、收藏网络提示词

**Status:** Deferred at milestone planning. Focus shifted to v1.3.0 Image to Prompt feature.

#### Phase 8: Search & Collect Features
**Goal**: 用户可搜索并收藏网络提示词到本地
**Depends on**: Phase 7
**Requirements**: NET-01, NET-03
**Success Criteria** (what must be TRUE):
  1. User can type search query and see matching network prompts in real-time
  2. Search matches both prompt title and content (substring match)
  3. User can click "收藏" button on any network prompt
  4. User can select target category when collecting (or create new category)
  5. Collected prompts appear in selected local category immediately
**UI hint**: yes
**Plans:** 5 plans

Plans:
- [ ] 08-01-PLAN.md — Implement search input with debounce (D-01-D-04) (Wave 1)
- [ ] 08-02-PLAN.md — Add search filter logic (title + content, D-05-D-08) (Wave 1)
- [ ] 08-03-PLAN.md — Activate "收藏" button in PromptPreviewModal (D-09) (Wave 2)
- [ ] 08-04-PLAN.md — Implement CategorySelectDialog for collect (D-11-D-15) (Wave 2)
- [ ] 08-05-PLAN.md — Integrate collect with store + Toast feedback (D-16-D-19) (Wave 2)

---

<details>
<summary>✅ v1.3.0 Image to Prompt (Phases 9-12) — SHIPPED 2026-04-28</summary>

- [x] Phase 9: Context Menu Foundation (2/2 plans) — completed 2026-04-28
- [x] Phase 10: API Key Management (3/3 plans) — completed 2026-04-28
- [x] Phase 11: Vision API Integration (4/4 plans) — completed 2026-04-28
- [x] Phase 12: Prompt Insertion (3/3 plans) — completed 2026-04-28

**Total:** 4 phases, 12 plans — 100% complete

</details>

### 🚧 v2.0 Web + Team (In Progress)

**Milestone Goal:** 将Oh My Prompt从单一Chrome Extension扩展为Extension + Web App混合架构，提供团队共享提示词库、云端同步、订阅付费功能。

- [ ] **Phase 13: Authentication Foundation** — Email/password and Google OAuth login with unified Extension-Web App identity
- [ ] **Phase 14: Cloud Sync** — Automatic personal prompt library synchronization across devices
- [ ] **Phase 15: Team Creation & Management** — Team creation, member invitations, and role-based management
- [ ] **Phase 16: Team Shared Library** — Shared prompt library with role-based permissions (Admin/Editor/Member)
- [ ] **Phase 17: Subscription & Payments** — Multi-payment provider billing (WeChat/Alipay/Stripe) with subscription lifecycle
- [ ] **Phase 18: Web App Management** — Responsive web interface for team, account, and subscription management

## Phase Details

### Phase 13: Authentication Foundation
**Goal**: Users can create accounts, log in, and maintain sessions across Extension and Web App with unified identity.
**Depends on**: Phase 12 (v1.3 foundation)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. User can sign up with email and password from Web App
  2. User can log in with email and password from Web App
  3. User can sign up and log in using Google OAuth
  4. User can reset forgotten password via email link
  5. User session persists for 30 days across browser refreshes
  6. Extension login state is linked to Web App account (unified identity)
  7. User can log out from both Extension popup and Web App
**Plans**: TBD

### Phase 14: Cloud Sync
**Goal**: Users' personal prompt libraries automatically synchronize to cloud and across all logged-in devices.
**Depends on**: Phase 13 (authentication)
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06
**Success Criteria** (what must be TRUE):
  1. User's personal prompts automatically sync to cloud after login
  2. Prompts created on one device appear on another device after login
  3. Every CRUD operation (create/update/delete) triggers automatic cloud sync
  4. User sees sync status indicator (syncing/synced/error) in Extension popup
  5. User can manually trigger sync via button
  6. User can view and restore any of the last 10 prompt versions from sync history
**Plans**: TBD

### Phase 15: Team Creation & Management
**Goal**: Users can create teams, invite members via email or link, and manage team membership.
**Depends on**: Phase 13 (authentication)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-09, TEAM-10
**Success Criteria** (what must be TRUE):
  1. User can create a new team with name and optional description
  2. User can invite team members via email address
  3. User can invite team members via shareable invite link
  4. Team admin can view list of all team members
  5. Team admin can remove members from the team
  6. User can voluntarily leave a team they belong to
**Plans**: TBD

### Phase 16: Team Shared Library
**Goal**: Team members can access a shared prompt library with role-based CRUD permissions.
**Depends on**: Phase 14 (cloud sync), Phase 15 (team creation)
**Requirements**: TEAM-04, TEAM-05, TEAM-06, TEAM-07, TEAM-08
**Success Criteria** (what must be TRUE):
  1. All team members can view and use prompts in the team's shared library
  2. Team has three roles with distinct permissions: Admin, Editor, Member
  3. Admin can create, edit, and delete team prompts
  4. Editor can create, edit, and delete team prompts
  5. Member can view team prompts but cannot modify them (read-only)
**Plans**: TBD

### Phase 17: Subscription & Payments
**Goal**: Users can purchase subscriptions via multiple payment providers and manage their billing lifecycle.
**Depends on**: Phase 13 (authentication)
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08
**Success Criteria** (what must be TRUE):
  1. User can view pricing page with free tier, monthly (¥9), and annual (¥99) options
  2. User can pay for subscription via WeChat Pay
  3. User can pay for subscription via Alipay
  4. User can pay for subscription via Stripe (international)
  5. User can view billing history showing all past payments
  6. User receives renewal reminder email 7 days before subscription renews
  7. User can cancel subscription self-service without contacting support
  8. Subscription features activate immediately after successful payment
**Plans**: TBD
**UI hint**: yes

### Phase 18: Web App Management
**Goal**: Users can manage teams, account settings, and subscriptions through a responsive web interface.
**Depends on**: Phase 15 (teams), Phase 16 (shared library), Phase 17 (subscription)
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, WEB-05
**Success Criteria** (what must be TRUE):
  1. User can view team member list and add/remove members from Web App
  2. User can update team name and description from Web App
  3. Web App interface works correctly on mobile and tablet devices
  4. User can update account email and password from Web App
  5. User can view current subscription status and plan details from Web App
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Manifest Setup | v1.0 | 8/8 | Complete | 2026-04-16 |
| 2. Lovart Integration & Content Script | v1.0 | 4/4 | Complete | 2026-04-16 |
| 3. Data Management & Popup UI | v1.0 | 9/9 | Complete | 2026-04-16 |
| 4. Polish & End-to-End Testing | v1.0 | 6/6 | Complete | 2026-04-16 |
| 5. Provider Foundation | v1.1.0 | 4/4 | Complete | 2026-04-19 |
| 6. Network Cache Layer | v1.1.0 | 4/4 | Complete | 2026-04-19 |
| 7. Dropdown Online Library UI | v1.1.0 | 5/5 | Complete | 2026-04-19 |
| 8. Search & Collect Features | v1.2.0 | 0/5 | Deferred | - |
| 9. Context Menu Foundation | v1.3.0 | 2/2 | Complete | 2026-04-28 |
| 10. API Key Management | v1.3.0 | 3/3 | Complete | 2026-04-28 |
| 11. Vision API Integration | v1.3.0 | 4/4 | Complete | 2026-04-28 |
| 12. Prompt Insertion | v1.3.0 | 3/3 | Complete | 2026-04-28 |
| 13. Authentication Foundation | v2.0 | 0/TBD | Not started | - |
| 14. Cloud Sync | v2.0 | 0/TBD | Not started | - |
| 15. Team Creation & Management | v2.0 | 0/TBD | Not started | - |
| 16. Team Shared Library | v2.0 | 0/TBD | Not started | - |
| 17. Subscription & Payments | v2.0 | 0/TBD | Not started | - |
| 18. Web App Management | v2.0 | 0/TBD | Not started | - |

---

*Roadmap updated: 2026-05-07 — v2.0 roadmap created, ready to plan Phase 13*