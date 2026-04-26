---
name: translate
description: Translate text using Google Translate via browser automation. Use when user asks to translate text, open translation tool, or needs multilingual conversion. Supports any language pair with auto-detection. Opens Chrome DevTools MCP to interact with translate.google.com.
---

# Translate

Translate text using Google Translate browser automation.

## Workflow

1. Open Google Translate page (default: auto-detect → Chinese simplified)
2. Input text into source field
3. Retrieve translation result

## Implementation

### Step 1: Open Google Translate

```
mcp__chrome-devtools__new_page
url: https://translate.google.com/?hl=zh-cn&sl=auto&tl=zh-CN&op=translate
```

### Step 2: Input Text

Take snapshot to find input field uid, then fill:

```
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__fill
uid: [input combobox uid]
value: [text to translate]
```

### Step 3: Get Result

Take snapshot to read translation:

```
mcp__chrome-devtools__take_snapshot
```

Translation appears in region "翻译结果" - extract StaticText elements.

## Language Options

Modify URL params for different target languages:
- `tl=zh-CN` → Chinese (Simplified)
- `tl=en` → English
- `tl=ja` → Japanese
- `tl=ko` → Korean
- `tl=de` → German
- `tl=fr` → French

Source language `sl=auto` enables auto-detection.

## Example Usage

User: "Translate this to Chinese: Hello world"
→ Open translate.google.com
→ Fill input with "Hello world"
→ Return: "你好世界"
