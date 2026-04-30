---
name: Bilingual Prompt Editing
description: Add Chinese/English tab-based editing support for prompt name, description, and content in PromptEditModal
type: project
---

# Bilingual Prompt Editing Design

## Overview

Add bilingual (Chinese/English) editing support to the prompt edit modal, allowing users to input and save both language versions for prompt name, description, and content.

## Scope

### In Scope
- `PromptEditModal.tsx` - Add 中/EN tab toggle for bilingual input
- Manual prompt create/edit workflow
- Verify resource library save flow preserves bilingual data
- Verify Vision save flow (already bilingual, no change needed)

### Out of Scope
- `CategoryEditModal.tsx` - No bilingual support needed
- Category dropdown selector - stays single-language
- DropdownApp display - uses existing `resourceLanguage` setting

## Data Model

Existing `Prompt` interface already supports bilingual fields (no changes needed):

```typescript
interface Prompt {
  id: string
  name: string           // Chinese name (required)
  nameEn?: string        // English name (optional)
  content: string        // Chinese content (required)
  contentEn?: string     // English content (optional)
  description?: string   // Chinese description (optional)
  descriptionEn?: string // English description (optional)
  categoryId: string
  order: number
  localImage?: string
  remoteImageUrl?: string
}
```

## UI Design

### PromptEditModal Layout

```
┌─────────────────────────────────────┐
│ 编辑提示词                    [×]  │
├─────────────────────────────────────┤
│ ┌─────┐ ┌─────┐                     │
│ │ 中  │ │ EN  │  ← Tab buttons      │
│ └─────┘ └─────┘                     │
│                                     │
│ 名称: [________________]            │
│ 描述（选填）: [____________]        │
│ 内容: [________________]            │
│         (textarea, 8 rows)          │
│                                     │
│ 示例图片（选填）:                    │
│   [上传] 或拖拽/URL输入             │
│                                     │
│ 所属分类: [下拉选择___]             │
├─────────────────────────────────────┤
│ [取消]  [保存]                      │
└─────────────────────────────────────┘
```

### Tab Behavior

| Tab | Fields Shown |
|-----|--------------|
| 中 | name, description, content |
| EN | nameEn, descriptionEn, contentEn |

- Common fields (image upload, category selector) visible on both tabs
- Default tab: 中
- Tab style: reuse VisionModal `.tab-buttons` CSS

### Validation

- Chinese `name` and `content` are required (primary language)
- English fields are optional
- Only save English fields if they contain non-empty content

## Implementation

### PromptEditModal Changes

1. Add state variables:
   - `activeTab: 'zh' | 'en'`
   - `nameEn, descriptionEn, contentEn` (string)

2. Initialize English fields in useEffect from existing prompt data

3. Add tab buttons above form fields (same style as VisionModal)

4. Conditionally render language-specific input fields based on `activeTab`

5. Update `onConfirm` callback interface to include English fields

6. Pass English fields to parent component on save

### Parent Component Changes

Update `DropdownApp.tsx` (or wherever PromptEditModal is used):
- Update `onConfirm` handler to accept and save English fields
- Call `updatePrompt()` or `addPrompt()` with bilingual data

### Resource Library Flow Verification

Verify `NetworkPromptCard` "保存" action correctly passes bilingual fields:
- Resource prompts have `nameEn`, `contentEn`, `descriptionEn`
- CategorySelectDialog selection + save should preserve these fields
- Check `SAVE_TEMPORARY_PROMPT` handler in service-worker.ts

## Affected Files

| File | Change Type |
|------|-------------|
| `src/content/components/PromptEditModal.tsx` | Modify - add tabs + bilingual fields |
| `src/content/components/DropdownApp.tsx` | Modify - update onConfirm handler |
| `src/shared/types.ts` | No change - interface already supports bilingual |

## Success Criteria

1. User can switch between 中/EN tabs in PromptEditModal
2. Chinese fields (name, description, content) work as before
3. English fields (nameEn, descriptionEn, contentEn) can be entered and saved
4. Editing existing bilingual prompts shows both language versions correctly
5. Vision-saved prompts continue to work with bilingual data
6. Resource library saves preserve bilingual data

## Why

**Why:** Users want bilingual prompts for international AI platforms or personal organization. Vision modal already generates bilingual output, so manual editing should match that capability.

**How to apply:** When editing prompts, toggle between tabs to fill both language versions. Display respects `resourceLanguage` setting in dropdown list.