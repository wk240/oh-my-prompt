# Pitfalls Research

**Domain:** Chrome Extension (Manifest V3)
**Researched:** 2026-04-16
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Manifest V2 Patterns in V3 Context

**What goes wrong:**
Using deprecated V2 APIs like background pages, chrome.runtime.onInstalled for persistent state, or remote code loading.

**Why it happens:**
Developers copy from old tutorials/examples that haven been updated for V3 requirements.

**How to avoid:**
- Use service worker (not background page)
- Bundle all code locally (no remote scripts)
- Check Chrome Extension docs for V3-specific patterns

**Warning signs:**
- `background: { scripts: [...] }` in manifest (V2 syntax)
- Any `eval()` or `new Function()` calls
- External script URLs in manifest

**Phase to address:**
Phase 1 — Project setup and manifest configuration

---

### Pitfall 2: Content Script Storage Access

**What goes wrong:**
Content script attempts direct `chrome.storage` calls but fails because storage API is restricted in content scripts.

**Why it happens:**
Assumption that all chrome.* APIs are available everywhere.

**How to avoid:**
- Content script sends message to service worker
- Service worker handles storage operations
- Service worker responds with data

**Warning signs:**
- `chrome.storage.local.get` in content script files
- Uncaught TypeError in content script console

**Phase to address:**
Phase 1 — Architecture and messaging setup

---

### Pitfall 3: DOM Injection Timing

**What goes wrong:**
Content script runs before Lovart's input element exists, causing selector to fail and dropdown not to appear.

**Why it happens:**
Modern SPA frameworks render dynamically, elements may not exist at document_idle.

**How to avoid:**
- Use MutationObserver to watch for element creation
- Implement retry logic with exponential backoff
- Check for element before injection attempt

**Warning signs:**
- Dropdown appears inconsistently
- "Element not found" errors
- Works after page refresh but not initial load

**Phase to address:**
Phase 2 — Content script and Lovart detection

---

### Pitfall 4: CSS Conflicts with Host Page

**What goes wrong:**
Injected UI styles conflict with Lovart's styles, causing visual glitches or broken layout.

**Why it happens:**
Global CSS selectors match both extension UI and host page elements.

**How to avoid:**
- Use Shadow DOM for complete isolation
- Prefix all class names with extension-specific identifier
- Avoid generic selectors like `.button`, `.input`

**Warning signs:**
- Lovart page styling breaks after extension loads
- Dropdown looks different in different pages
- Style inheritance issues

**Phase to address:**
Phase 2 — Content script UI implementation

---

### Pitfall 5: Storage Quota Exhaustion

**What goes wrong:**
Extension stores too much data, hitting chrome.storage.local 10MB limit, causing writes to fail.

**Why it happens:**
Prompt data grows over time, users import large libraries.

**How to avoid:**
- Implement data size monitoring
- Warn user when approaching quota
- Consider IndexedDB for large datasets

**Warning signs:**
- "QUOTA_BYTES_EXCEEDED" error
- Prompts not saving after import
- Settings reset unexpectedly

**Phase to address:**
Phase 3 — Storage and data management

---

### Pitfall 6: Event Dispatch Not Triggering Lovart

**What goes wrong:**
Prompt inserted into input.value but Lovart doesn't recognize the change, submit button remains disabled.

**Why it happens:**
React/framework apps listen for specific events, not just value changes.

**How to avoid:**
- Dispatch appropriate events after insertion:
  - `input` event for React apps
  - `change` event for form validation
  - `blur` event for some frameworks
- Simulate user interaction sequence

**Warning signs:**
- Text appears but submit doesn't enable
- Lovart says "empty input" despite text visible
- Works manually but not via extension

**Phase to address:**
Phase 2 — Insert handler implementation

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip Shadow DOM | Faster initial dev | CSS conflicts forever | Never for production |
| Direct localStorage | Easier storage access | Not available in extension context | Never |
| Skip MutationObserver | Simpler timing logic | Inconsistent detection | Prototype only |
| Hard-code selectors | Quick implementation | Breaks on Lovart updates | Short-term only |
| No error handling | Faster initial code | Silent failures, confusing UX | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Lovart input | Hard-coded selector | Dynamic detection + MutationObserver |
| Lovart events | Only setting value | Dispatch input/change/blur events |
| chrome.storage | Direct access in content script | Message service worker |
| Popup ↔ Content | Direct function calls | chrome.tabs.sendMessage |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Excessive MutationObserver | Page slowdown | Scope observation to relevant area | Large pages |
| Large prompt lists | Dropdown lag | Virtualized rendering | 500+ prompts |
| Frequent storage reads | UI delays | Cache data, update on change | Real-time sync needs |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Inline event handlers | CSP violation | Use addEventListener only |
| eval() for templates | CSP blocked | Pre-parse templates or use regex |
| External script loading | Blocked in V3 | Bundle everything locally |
| Unvalidated import data | XSS/malicious prompts | Validate JSON structure, sanitize |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dropdown covers input | Can't see what typing | Position relative to input, not fixed |
| No feedback on insert | User uncertain if worked | Brief success animation/indicator |
| No empty state | Confusing blank UI | Show "No prompts yet" with add button |
| Category required | Friction to add prompts | Allow uncategorized prompts |

## "Looks Done But Isn't" Checklist

- [ ] **Dropdown:** Often missing Shadow DOM — verify styles isolated
- [ ] **Insert:** Often missing event dispatch — verify Lovart recognizes input
- [ ] **Storage:** Often missing message routing — verify content script can access data
- [ ] **Import:** Often missing validation — verify malformed JSON handled
- [ ] **Export:** Often missing download trigger — verify file actually downloads

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| V2 patterns in manifest | LOW | Rewrite manifest, update service worker |
| CSS conflicts | MEDIUM | Add Shadow DOM wrapper |
| Storage in content script | LOW | Add message handlers in service worker |
| Timing issues | MEDIUM | Add MutationObserver |
| Quota exceeded | LOW | Clear old data or migrate to IndexedDB |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Manifest V2 patterns | Phase 1 | Manifest validates in Chrome |
| Content script storage | Phase 1 | Message routing tests pass |
| DOM injection timing | Phase 2 | Dropdown appears on SPA loads |
| CSS conflicts | Phase 2 | Lovart styling unchanged |
| Storage quota | Phase 3 | Import large dataset test |
| Event dispatch | Phase 2 | Lovart submit enables after insert |

## Sources

- Chrome Extension Manifest V3 migration guide
- Chrome Web Store rejection common reasons
- Extension developer community forums
- Previous extension development experience

---
*Pitfalls research for: Chrome Extension (Manifest V3)*
*Researched: 2026-04-16*