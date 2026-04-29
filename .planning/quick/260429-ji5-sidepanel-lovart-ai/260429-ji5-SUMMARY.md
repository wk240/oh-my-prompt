---
status: complete
quick_id: 260429-ji5
date: 2026-04-29
commit: 90da4ce
---

# Quick Task Summary: Sidepanel Universal Input Detection

## Task Description

增强 sidepanel 功能：让提示词插入功能在任意页面可用（只要检测到输入框），不再限制只在 lovart.ai

## Implementation

### Changes Made

1. **src/shared/messages.ts**
   - Added `CHECK_INPUT_AVAILABILITY` message type
   - Added `INPUT_AVAILABILITY_RESPONSE` message type

2. **src/content/vision-only-script.ts**
   - Added universal input selectors for detecting any editable element
   - Added `findInputElement()` function to search for inputs
   - Added periodic input detection (2 second interval)
   - Added MutationObserver for DOM change detection
   - Implemented `insertPrompt()` function supporting form controls and contenteditable
   - Added message handlers for `CHECK_INPUT_AVAILABILITY` and `INSERT_PROMPT_TO_CS`

3. **src/sidepanel/SidePanelApp.tsx**
   - Modified input availability check to query content script instead of URL check
   - Lovart pages still use URL-based detection (has dedicated content script)
   - Non-Lovart pages query `CHECK_INPUT_AVAILABILITY` to content script
   - Updated banner text: "当前页面未检测到输入框" (more accurate)

## Universal Input Selectors

```typescript
const UNIVERSAL_INPUT_SELECTORS = [
  '[data-testid="agent-message-input"]',  // Lovart Lexical (highest priority)
  '[data-lexical-editor="true"]',
  'textarea:not([readonly])',
  'input[type="text"]:not([readonly])',
  'input[type="search"]:not([readonly])',
  'input:not([type]):not([readonly])',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]',
]
```

## Testing Notes

- TypeScript check: passed
- Build: successful
- Manual testing needed: verify on non-Lovart pages with input elements (Google search, ChatGPT, etc.)

## Commit

`90da4ce` feat(sidepanel): enable prompt insertion on any page with input element