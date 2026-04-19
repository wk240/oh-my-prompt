# Roadmap: Lovart Prompt Injector

**Created:** 2026-04-16
**Granularity:** Standard

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-04-16)
- 🚧 **v1.1.0 网络提示词数据源接入** — Phases 5-8 (in progress)

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

### 🚧 v1.1.0 网络提示词数据源接入 (In Progress)

**Milestone Goal:** 实时接入GitHub开源Prompt数据源，用户可在线浏览、搜索、收藏网络提示词

#### Phase 5: Provider Foundation
**Goal**: Extension可获取并解析网络提示词数据源
**Depends on**: Phase 4
**Requirements**: NET-05, NET-06
**Success Criteria** (what must be TRUE):
  1. DataSourceProvider interface is defined with fetch/parse/getCategories methods
  2. NanoBananaProvider implements interface and parses 900+ prompts from GitHub
  3. Service worker responds to FETCH_NETWORK_PROMPTS message with parsed prompt data
  4. Network request to Nano Banana data source succeeds and returns valid data
**Plans:** 4 plans

Plans:
- [x] 05-01-PLAN.md — Define DataSourceProvider interface, NetworkPrompt/ProviderCategory types (completed 2026-04-19)
- [x] 05-02-PLAN.md — Implement NanoBananaProvider with Markdown parser (~900 prompts) (completed 2026-04-19)
- [x] 05-03-PLAN.md — Add network fetch handlers to service worker + manifest host_permissions (completed 2026-04-19)
- [x] 05-04-PLAN.md — Test end-to-end data flow (completed 2026-04-19)

#### Phase 6: Network Cache Layer
**Goal**: 网络提示词自动缓存，离线可用
**Depends on**: Phase 5
**Requirements**: NET-04
**Success Criteria** (what must be TRUE):
  1. Network prompts are automatically cached in chrome.storage.local after fetch
  2. Cached prompts include timestamp and expire after 24 hours
  3. When offline, previously cached prompts are still accessible via GET_NETWORK_CACHE message
  4. Cache shows timestamp of last successful fetch
**Plans:** 4 plans

Plans:
- [ ] 06-01-PLAN.md — Implement NetworkCacheManager singleton with TTL support (Wave 1)
- [ ] 06-02-PLAN.md — Add GET_NETWORK_CACHE message type and handler (Wave 2)
- [ ] 06-03-PLAN.md — Extend NetworkDataResponse with cache metadata flags (Wave 2)
- [ ] 06-04-PLAN.md — Implement network-first with cache fallback strategy (Wave 3)

#### Phase 7: Dropdown Online Library UI
**Goal**: 用户可浏览和预览网络提示词
**Depends on**: Phase 6
**Requirements**: NET-02
**Success Criteria** (what must be TRUE):
  1. Dropdown shows "在线库" tab alongside local prompts
  2. User can browse network prompts organized by source categories
  3. User can see prompt title and truncated preview in card view
  4. User can click to expand and see full prompt content
  5. Pagination shows 50 prompts per page for large datasets
**UI hint**: yes
**Plans:** 5 plans

Plans:
- [ ] 07-01: Add OnlineLibraryTab component to dropdown
- [ ] 07-02: Create NetworkPromptCard component
- [ ] 07-03: Implement category filter dropdown
- [ ] 07-04: Implement pagination (50 per page)
- [ ] 07-05: Add full preview modal/expand functionality

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
- [ ] 08-01: Implement search input with debounce
- [ ] 08-02: Add search filter logic (title + content)
- [ ] 08-03: Add "收藏" button to NetworkPromptCard
- [ ] 08-04: Implement category selector dialog for collect
- [ ] 08-05: Integrate collect with local storage

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Manifest Setup | v1.0 | 8/8 | Complete | 2026-04-16 |
| 2. Lovart Integration & Content Script | v1.0 | 4/4 | Complete | 2026-04-16 |
| 3. Data Management & Popup UI | v1.0 | 9/9 | Complete | 2026-04-16 |
| 4. Polish & End-to-End Testing | v1.0 | 6/6 | Complete | 2026-04-16 |
| 5. Provider Foundation | v1.1.0 | 4/4 | Complete | 2026-04-19 |
| 6. Network Cache Layer | v1.1.0 | 0/4 | Not started | - |
| 7. Dropdown Online Library UI | v1.1.0 | 0/5 | Not started | - |
| 8. Search & Collect Features | v1.1.0 | 0/5 | Not started | - |

---

*Roadmap updated: 2026-04-19 — Phase 6 plans created*