# Requirements — v1.3.0 Image to Prompt

**Milestone:** v1.3.0
**Created:** 2026-04-28
**Status:** Shipped (2026-04-28)

---

## Context Menu Integration (MENU)

- [x] **MENU-01**: User sees "转提示词" option when right-clicking any image on any website ✓ Phase 9
- [x] **MENU-02**: Menu item only appears on image elements (not text, links, other elements) ✓ Phase 9
- [x] **MENU-03**: Click captures image URL (`srcUrl`) for processing ✓ Phase 9

---

## API Key Management (AUTH)

- [x] **AUTH-01**: User can configure API key in popup settings page ✓ Phase 10
- [x] **AUTH-02**: API key stored securely in chrome.storage.local (not sync, not exposed in logs) ✓ Phase 10
- [x] **AUTH-03**: First-time use of "转提示词" triggers onboarding dialog to configure API key ✓ Phase 10
- [x] **AUTH-04**: User can select Vision AI provider (Claude Vision or OpenAI GPT-4V) ✓ Phase 10

---

## Vision API Integration (VISION)

- [x] **VISION-01**: Service worker calls Vision API with captured image URL ✓ Phase 11
- [x] **VISION-02**: API returns prompt text suitable for Lovart image generation ✓ Phase 11
- [x] **VISION-03**: Loading indicator shown during API call (visual feedback for 2-10 sec latency) ✓ Phase 11
- [x] **VISION-04**: Clear error messages shown for API failures (rate limit, invalid key, network error, unsupported image) ✓ Phase 11

---

## Prompt Insertion (INSERT)

- [x] **INSERT-01**: Generated prompt inserted into Lovart input field when user is on Lovart page ✓ Phase 12
- [x] **INSERT-02**: When not on Lovart page, prompt copied to clipboard with notification toast ✓ Phase 12
- [x] **INSERT-03**: User sees prompt preview before insertion (preview dialog with confirm/cancel) ✓ Phase 12

---

## Traceability

| REQ-ID | Phase | Plan |
|--------|-------|------|
| MENU-01 | Phase 9 | 09-01-PLAN.md, 09-02-PLAN.md |
| MENU-02 | Phase 9 | 09-02-PLAN.md |
| MENU-03 | Phase 9 | 09-02-PLAN.md |
| AUTH-01 | Phase 10 | 10-02-PLAN.md |
| AUTH-02 | Phase 10 | 10-01-PLAN.md, 10-02-PLAN.md |
| AUTH-03 | Phase 10 | 10-03-PLAN.md |
| AUTH-04 | Phase 10 | 10-02-PLAN.md |
| VISION-01 | Phase 11 | 11-03-PLAN.md |
| VISION-02 | Phase 11 | 11-02-PLAN.md |
| VISION-03 | Phase 11 | 11-04-PLAN.md |
| VISION-04 | Phase 11 | 11-04-PLAN.md |
| INSERT-01 | Phase 12 | 12-02-PLAN.md, 12-03-PLAN.md |
| INSERT-02 | Phase 12 | 12-03-PLAN.md |
| INSERT-03 | Phase 12 | 12-01-PLAN.md, 12-03-PLAN.md |

*Traceability updated: 2026-04-28 — Milestone shipped*

---

*Requirements defined: 2026-04-28 · Shipped: 2026-04-28*