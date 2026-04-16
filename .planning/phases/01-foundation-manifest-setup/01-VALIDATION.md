---
phase: 01
slug: foundation-manifest-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (Phase 4 setup) |
| **Config file** | vitest.config.ts — Wave 0 installs |
| **Quick run command** | `npm run test` (Phase 4) |
| **Full suite command** | `npm run test:coverage` (Phase 4) |
| **Estimated runtime** | Phase 1 uses manual verification |

**Phase 1 Note:** Foundation phase relies on manual Chrome verification. Automated tests deferred to Phase 4 (Polish & Testing).

---

## Sampling Rate

Phase 1 verification is **manual**:
- **After manifest setup:** Load extension in Chrome, verify no errors
- **After Service Worker:** Ping test via DevTools console
- **After Content Script:** Visit lovart.ai, verify console log
- **After Popup:** Click extension icon, verify popup opens

**Automated sampling begins Phase 4.**

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | EXT-01 | — | N/A | manual | Load in chrome://extensions | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | EXT-04 | — | N/A | manual | Click toolbar icon | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | — | — | N/A | manual | DevTools ping test | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 1 | — | — | N/A | manual | Visit lovart.ai, check console | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 1 | — | — | N/A | manual | Open popup, verify render | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 1 uses manual verification. Wave 0 test infrastructure deferred to Phase 4.

- [ ] `vitest.config.ts` — test runner config (Phase 4)
- [ ] `src/__tests__/` — test directory structure (Phase 4)
- [ ] `vitest` — framework install (Phase 4)

**Phase 1 Wave 0:** No automated tests required. Manual verification checklist below.

---

## Manual Verification Checklist

**Load Extension:**
1. Run `npm run dev`
2. Open chrome://extensions
3. Enable Developer Mode
4. Click "Load unpacked"
5. Select `dist/` folder
6. ✓ Verify: No errors displayed, extension name correct

**Verify Manifest V3:**
1. Click extension details
2. ✓ Verify: Manifest version shows 3
3. ✓ Verify: Service Worker listed (not background page)

**Verify Icon (EXT-04):**
1. ✓ Verify: Icon appears in Chrome toolbar
2. Click icon
3. ✓ Verify: Popup opens (even if empty)

**Verify Content Script (EXT-01):**
1. Navigate to lovart.ai
2. Open DevTools Console
3. ✓ Verify: `[Lovart Injector] Content script loaded` log appears

**Verify Message Routing:**
1. In DevTools Console on lovart.ai:
2. Run: `chrome.runtime.sendMessage({type: 'PING'}, console.log)`
3. ✓ Verify: Response `{success: true, data: 'pong'}`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension loads without errors | EXT-01 | Chrome load verification | Load unpacked, check chrome://extensions |
| Content script activates on Lovart | EXT-01 | Requires Lovart page access | Navigate to lovart.ai, check console |
| Icon appears in toolbar | EXT-04 | Chrome toolbar verification | Check toolbar, click icon |
| Popup opens | EXT-04 | Chrome UI verification | Click extension icon |
| Service Worker responds | — | Chrome DevTools verification | Send PING message from console |

---

## Validation Sign-Off

- [x] All tasks have manual verification defined
- [x] Wave 0 dependencies documented (Phase 4)
- [x] No watch-mode flags (manual verification)
- [x] Feedback latency: immediate manual feedback

**Approval:** pending (manual verification after execution)

---

*Phase 01 validation strategy created: 2026-04-16*
*Automated testing infrastructure: Phase 04*