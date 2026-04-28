---
phase: 09-context-menu-foundation
plan: 02
status: complete
wave: 2
completed_at: 2026-04-28T07:05:00Z
depends_on: [09-01]
---

# Summary: Context Menu Implementation — Creation & Click Handler

## What Was Built

Implemented Chrome context menu for image-to-prompt capture:
- **Context menu creation**: Registered in `chrome.runtime.onInstalled` listener with Chinese title "转提示词"
- **Image-only targeting**: Menu appears only when right-clicking image elements (`contexts: ['image']`)
- **URL filtering**: Restricted to http/https URLs via `targetUrlPatterns` (Vision API requirement)
- **Brand icon**: Lightning bolt icon (D-04) matching extension visual identity
- **Click handler**: Captures image URL and stores to `chrome.storage.local` for Phase 11 processing

## Key Files

| File | Change | Purpose |
|------|--------|---------|
| src/background/service-worker.ts | Added context menu creation in onInstalled | Register menu on extension install |
| src/background/service-worker.ts | Added onClicked listener | Capture image URL on menu click |
| src/shared/constants.ts | Imported CAPTURED_IMAGE_STORAGE_KEY | Storage key for captured URLs |

## Decisions Applied

- **D-01**: Menu title "转提示词" (Chinese, matches existing UI language)
- **D-02, MENU-02**: `contexts: ['image']` restricts to img elements only
- **D-03, D-07**: `targetUrlPatterns` prevents data:, blob:, file: URLs
- **D-04**: Lightning bolt icon matching extension brand identity
- **D-05, D-08**: Underscore prefix storage key prevents collision with StorageSchema

## Menu Configuration

```typescript
chrome.contextMenus.create({
  id: 'convert-to-prompt',
  title: '转提示词',
  icons: { '16': 'assets/icon-16.png' },
  contexts: ['image'],
  targetUrlPatterns: ['http://*/*', 'https://*/*']
})
```

## Click Handler Logic

1. Check `menuItemId` matches 'convert-to-prompt'
2. Validate `srcUrl` exists (OnClickData property)
3. Double-check URL is http/https (defensive validation)
4. Store URL + metadata (`url`, `capturedAt`, `tabId`) in chrome.storage.local
5. Log capture for debugging

## Verification

- TypeScript compilation: `npx tsc --noEmit` — PASSED (no errors)
- service-worker.ts contains `chrome.runtime.onInstalled.addListener` — VERIFIED
- service-worker.ts contains `chrome.contextMenus.create` — VERIFIED
- service-worker.ts contains `'转提示词'` as menu title — VERIFIED
- service-worker.ts contains `contexts: ['image']` — VERIFIED
- service-worker.ts contains `targetUrlPatterns` for http/https — VERIFIED
- service-worker.ts contains `icons` property with icon-16.png — VERIFIED
- service-worker.ts contains `chrome.contextMenus.onClicked.addListener` — VERIFIED
- service-worker.ts contains `CAPTURED_IMAGE_STORAGE_KEY` usage — VERIFIED

## Self-Check: PASSED

All acceptance criteria met:
- Context menu created on extension install (onInstalled listener)
- Menu item "转提示词" appears on image right-click (contexts: ['image'])
- Menu only appears on http/https images (targetUrlPatterns filter)
- Menu displays lightning bolt icon (D-04)
- Click captures srcUrl and stores to chrome.storage.local
- TypeScript compilation succeeds

## Notes

- Added type assertion for `icons` property (supported in Chrome 88+, not yet in @types/chrome definitions)
- Stored metadata includes `tabId` for Phase 12 (insert vs clipboard decision)