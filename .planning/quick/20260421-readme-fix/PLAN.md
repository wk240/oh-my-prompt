---
type: quick
date: 2026-04-21
status: in-progress
---

# Fix README User Experience Issues

## Problem

From user reading perspective, README has several issues that hurt installation success and comprehension.

## Fixes

### Critical (Must Fix)

1. **Installation flow incomplete**
   - Add prerequisites: Node.js required for build
   - Add complete build steps: `npm install && npm run build`
   - Add Release download section for users who don't want to compile

2. **Feature inconsistency**
   - FAQ mentions "网络提示词库" but main content never introduces it
   - Either remove FAQ item or add feature description

### Minor (Should Fix)

3. **Update instructions vague**
   - Clarify update process: download new Release vs git pull + rebuild

4. **Error FAQ image position**
   - Move image after the question text, not before

5. **Tone improvement**
   - Change "注意不要选择错了" to specific guidance

6. **Logo width**
   - Change fixed 750px to responsive max-width

## Execution

Direct edit to README.md with atomic commit.