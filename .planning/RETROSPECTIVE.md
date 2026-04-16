# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-16
**Phases:** 4 | **Plans:** 27 | **Tasks:** 54

### What Was Built
- Chrome Extension Manifest V3 with Lovart.ai domain matching
- Shadow DOM isolated dropdown UI with lightning bolt trigger button
- Zustand state management with chrome.storage.local persistence
- Full CRUD for prompts and categories with import/export JSON
- Toast notifications and error handling across all operations
- SPA navigation persistence via History API interception

### What Worked
- GSD workflow enforced systematic planning before coding
- Shadow DOM completely prevented CSS conflicts with Lovart host page
- Phase ordering (Foundation → Integration → Data → Polish) proved logical
- UI-SPEC.md contracts before implementation reduced iteration

### What Was Inefficient
- Lovart platform requires live page testing (no mock environment)
- Content script injection timing needed multiple MutationObserver iterations
- TypeScript build errors resolved after initial setup (could be caught earlier)

### Patterns Established
- Content script components use Shadow DOM for isolation
- Service Worker handles message routing, delegates to storage module
- Toast notifications on all user-facing operations for feedback

### Key Lessons
1. SPA platforms need History API interception, not just DOM observation
2. Build extension skeleton first, verify Chrome load before adding features
3. Import/export JSON format must include version for future compatibility

### Cost Observations
- Model mix: ~80% sonnet, ~20% opus (for architecture decisions)
- Sessions: 4 (one per phase)
- Notable: Planning phases took ~20% of time, execution ~80%

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 4 | 4 | GSD workflow from start |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | Manual checklist | E2E verified | 0 (all requirements shipped) |

### Top Lessons (Verified Across Milestones)

1. Plan before code — planning artifacts prevent rework
2. Platform-specific testing requires live environment access
3. Shadow DOM is essential for content script UI isolation