---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "README shows visual example of image-to-prompt feature"
    - "eg2.gif is referenced with descriptive caption"
  artifacts:
    - path: "README.md"
      contains: "assets/eg2.gif"
  key_links:
    - from: "README.md section 3"
      to: "assets/eg2.gif"
      via: "markdown image reference"
---

<objective>
Add eg2.gif visual example to README to demonstrate the image-to-prompt feature.

Purpose: Show users how the Vision feature works visually, improving documentation clarity.
Output: Updated README.md with gif reference in the image-to-prompt section.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Current README.md structure:
- Section 1 "页面上一键插入" has eg1.gif at line 91
- Section 3 "图片转提示词" (lines 101-112) lacks visual example
- eg2.gif exists in assets/ directory (3.9MB)
</context>

<tasks>

<task type="auto">
  <name>Add eg2.gif visual example to image-to-prompt section</name>
  <files>README.md</files>
  <action>
After the image-to-prompt feature description (line 112), add a visual example using eg2.gif.

Placement: After line 112 (the numbered step 6), before the "---" separator.

Format:
```markdown
![示例：图片转提示词功能演示](assets/eg2.gif)
```

Context: This mirrors the format used for eg1.gif in section 1, providing visual demonstration of the feature workflow.
  </action>
  <verify>
    <automated>grep -n "assets/eg2.gif" README.md</automated>
  </verify>
  <done>README.md contains eg2.gif reference with descriptive caption in the image-to-prompt section</done>
</task>

</tasks>

<verification>
- eg2.gif referenced in README.md
- Image placed after feature description, before section separator
- Caption follows existing pattern from eg1.gif
</verification>

<success_criteria>
- README.md shows eg2.gif in the correct location
- Visual example demonstrates image-to-prompt workflow
- Documentation consistency maintained with eg1.gif style
</success_criteria>

<output>
After completion, create `.planning/quick/260508-rmx-readme-eg2-gif/260508-rmx-SUMMARY.md`
</output>