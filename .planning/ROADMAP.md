# Roadmap: Lovart Prompt Injector

**Created:** 2026-04-16
**Granularity:** Standard

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-04-16)
- ✅ **v1.1.0 网络提示词数据源接入** — Phases 5-7 (shipped 2026-04-19)
- 🚧 **v1.2.0 在线搜索功能** — Phase 8 (in progress)
- 📋 **v1.3.0 Image to Prompt** — Phases 9-12 (planned)

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

### 🚧 v1.2.0 在线搜索功能 (In Progress)

**Milestone Goal:** 集成 prompts.chat API，用户可在线搜索、浏览、收藏网络提示词

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

### 📋 v1.3.0 Image to Prompt (Planned)

**Milestone Goal:** 用户右键点击任意网站图片，AI分析生成提示词并直接插入Lovart输入框

- [x] **Phase 9: Context Menu Foundation** - Add right-click menu integration for image-to-prompt (plans created)
- [ ] **Phase 10: API Key Management** - Secure API key storage and provider selection
- [ ] **Phase 11: Vision API Integration** - Connect to Claude/OpenAI Vision APIs
- [ ] **Phase 12: Prompt Insertion** - Deliver generated prompt to user

## Phase Details

### Phase 9: Context Menu Foundation
**Goal**: 用户右键点击任意网站图片时看到"转提示词"菜单项
**Depends on**: Phase 8
**Requirements**: MENU-01, MENU-02, MENU-03
**Success Criteria** (what must be TRUE):
  1. User sees "转提示词" option when right-clicking any image on any website
  2. Menu item only appears on image elements (not on text, links, or other elements)
  3. Clicking the menu item captures the image URL for processing
  4. Menu item appears immediately after extension install without page reload
**Plans:** 2 plans

Plans:
- [x] 09-01-PLAN.md — Add contextMenus permission + storage key constant (Wave 1)
- [x] 09-02-PLAN.md — Implement context menu creation + URL capture handler (Wave 2)

### Phase 10: API Key Management
**Goal**: 用户可安全配置和管理Vision AI API密钥
**Depends on**: Phase 9
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can configure API key in popup settings page
  2. API key is stored securely in chrome.storage.local (not sync, not exposed in logs)
  3. First-time use of "转提示词" triggers onboarding dialog to configure API key
  4. User can select Vision AI provider (Claude Vision or OpenAI GPT-4V)
  5. User can update or delete API key at any time
**UI hint**: yes
**Plans**: TBD

### Phase 11: Vision API Integration
**Goal**: 扩展能够调用Vision AI分析图片并生成提示词
**Depends on**: Phase 10
**Requirements**: VISION-01, VISION-02, VISION-03, VISION-04
**Success Criteria** (what must be TRUE):
  1. Service worker successfully calls Vision API with captured image URL
  2. API returns prompt text suitable for Lovart image generation
  3. Loading indicator is shown during API call (visual feedback for 2-10 sec latency)
  4. Clear error messages shown for API failures (rate limit, invalid key, network error, unsupported image)
  5. User sees generated prompt content before insertion
**Plans**: TBD

### Phase 12: Prompt Insertion
**Goal**: 生成的提示词能够正确送达用户
**Depends on**: Phase 11
**Requirements**: INSERT-01, INSERT-02, INSERT-03
**Success Criteria** (what must be TRUE):
  1. User sees prompt preview in dialog before insertion (with confirm/cancel options)
  2. When user confirms on Lovart page, prompt is inserted into Lovart input field
  3. When user confirms on non-Lovart page, prompt is copied to clipboard with notification toast
  4. User can cancel the preview dialog to discard the generated prompt
**UI hint**: yes
**Plans**: TBD

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
| 8. Search & Collect Features | v1.2.0 | 0/5 | Ready for execution | - |
| 9. Context Menu Foundation | v1.3.0 | 0/2 | Ready for execution | - |
| 10. API Key Management | v1.3.0 | 0/4 | Not started | - |
| 11. Vision API Integration | v1.3.0 | 0/4 | Not started | - |
| 12. Prompt Insertion | v1.3.0 | 0/3 | Not started | - |

---

*Roadmap updated: 2026-04-28 — Phase 9 plans created (09-01, 09-02)*