---
phase: 12
slug: prompt-insertion
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-04-28"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.59.1 |
| **Config file** | playwright.config.ts |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test` (quick)
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | INSERT-01 | - | N/A | unit | `npx tsc --noEmit` | ✅ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | INSERT-01 | - | N/A | unit | `npx tsc --noEmit` | ✅ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | INSERT-01 | - | N/A | unit | `npx tsc --noEmit` | ✅ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | INSERT-01, INSERT-02 | - | N/A | unit | `npx tsc --noEmit` | ✅ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | INSERT-01 | - | N/A | unit | `npx tsc --noEmit` | ✅ W0 | ⬜ pending |
| 12-03-01 | 03 | 2 | INSERT-02 | - | N/A | unit | `npx tsc --noEmit` | ✅ W0 | ⬜ pending |
| 12-03-02 | 03 | 2 | INSERT-01, INSERT-02 | - | N/A | e2e | `npm run test` | ❌ W0 | ⬜ pending |
| 12-03-03 | 03 | 2 | INSERT-03 | - | N/A | e2e | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per RESEARCH.md validation architecture:

- [x] `tests/e2e/lovart-insert.spec.ts` — e2e stubs for INSERT-01 (prompt insertion)
- [x] `tests/e2e/clipboard-copy.spec.ts` — e2e stubs for INSERT-02 (clipboard fallback)
- [x] `tests/e2e/loading-preview.spec.ts` — e2e stubs for INSERT-03 (preview dialog)

**Note:** TypeScript compilation (`npx tsc --noEmit`) covers all unit-level type checks. Playwright e2e tests needed for cross-context behavior verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lovart page detection regex | INSERT-02 | Requires live Lovart session | 1. Load Lovart.ai, 2. Trigger context menu on image, 3. Verify "转提示词" appears, 4. Confirm loading page opens |
| Clipboard write in extension page | INSERT-02 | Clipboard API requires user gesture | 1. Trigger flow on non-Lovart page, 2. Click confirm, 3. Verify clipboard contains prompt text |
| Auto-close timing (1s delay) | INSERT-03 | Timing verification | 1. Complete successful insertion, 2. Verify page closes after ~1 second |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending