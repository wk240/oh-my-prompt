---
phase: 12-prompt-insertion
plan: 01
status: complete
completed_at: 2026-04-28T14:30:00.000Z
requirements: [INSERT-01, INSERT-02]
---

# Plan 12-01: Message Routing Infrastructure

## Summary

Added message routing infrastructure for prompt insertion and temporary category saving. This enables LoadingApp to request prompt insertion into Lovart input field and save generated prompts to '临时' category.

## Changes

### MessageType Entries (src/shared/messages.ts)
- Added `INSERT_PROMPT_TO_CS` — forwarded to content script for Lovart insertion
- Added `SAVE_TEMPORARY_PROMPT` — saves prompt to temporary category

### Payload Interfaces (src/shared/types.ts)
- `InsertPromptPayload` — prompt text + tabId for targeted routing
- `InsertResultPayload` — success/failure response from content script
- `SaveTemporaryPromptPayload` — name, content, optional imageUrl

### Service Worker Handlers (src/background/service-worker.ts)
- `INSERT_PROMPT`: Forwards to content script via `chrome.tabs.sendMessage`
- `SAVE_TEMPORARY_PROMPT`: Creates '临时' category if missing, saves prompt with proper order

## Key Files

| File | Change |
|------|--------|
| src/shared/messages.ts | Added 2 MessageType entries |
| src/shared/types.ts | Added 3 payload interfaces |
| src/background/service-worker.ts | Added INSERT forwarding + SAVE handler |

## Verification

- TypeScript compiles: `npx tsc --noEmit` — PASS (no output)
- grep verification: All MessageType entries and handlers present — PASS

## Self-Check

- [x] INSERT_PROMPT_TO_CS and SAVE_TEMPORARY_PROMPT MessageType entries exist
- [x] InsertPromptPayload, InsertResultPayload, SaveTemporaryPromptPayload interfaces exist
- [x] INSERT_PROMPT handler forwards to content script via chrome.tabs.sendMessage
- [x] SAVE_TEMPORARY_PROMPT handler creates '临时' category if missing and saves prompt