---
status: partial
phase: 09-context-menu-foundation
source: [09-VERIFICATION.md]
started: 2026-04-28T07:15:00Z
updated: 2026-04-28T07:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Context Menu Appearance Test

**Test:** Load unpacked extension from `dist/` folder in Chrome. Right-click on any http/https image on any website.

**Expected:** "转提示词" menu item is visible in the context menu.

**result:** [pending]

### 2. Image-Only Targeting Test

**Test:** Right-click on:
- A text paragraph (not an image)
- A hyperlink
- A data: URL or blob: URL image

**Expected:** "转提示词" menu item does NOT appear for any of these.

**result:** [pending]

### 3. URL Capture Test

**Test:** Click "转提示词" menu item on an http/https image. Check Chrome DevTools:
- Service Worker console: Should show `[Oh My Prompt] Captured image URL: <url> from tab: <tabId>`
- Application → Storage → Local: Should contain `_capturedImageUrl` with `{ url, capturedAt, tabId }`

**Expected:** URL is correctly captured and stored.

**result:** [pending]

### 4. Immediate Appearance Test

**Test:** After loading extension, immediately right-click an image without reloading any pages.

**Expected:** Menu item appears immediately.

**result:** [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps