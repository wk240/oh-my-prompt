---
phase: 02
phase_slug: lovart-integration-content-script
status: approved
created: 2026-04-16
reviewed_at: 2026-04-16
design_system: manual-shadow-dom
---

# Phase 02: Lovart Integration - UI Design Contract

## 1. Spacing

### Icon Button (Trigger)
| Property | Value | Rationale |
|----------|-------|-----------|
| Button size | `44px x 44px` | WCAG touch target minimum |
| Padding | `12px` | Icon breathing room (4px multiple) |
| Margin from input | `8px` left | Clear separation from Lovart input box |

### Dropdown Container
| Property | Value | Rationale |
|----------|-------|-----------|
| Max height | `320px` | Fits ~8 items before scroll, mobile-friendly |
| Padding | `12px` inner | Lovart card-style consistency |
| Border radius | `8px` | Lovart-native rounded corners |
| Shadow | `0 4px 12px rgba(0,0,0,0.15)` | Lovart-native depth style |
| Position offset | `4px` below trigger button | Visual separation from trigger |

### Dropdown Item
| Property | Value | Rationale |
|----------|-------|-----------|
| Padding | `12px 12px` | Comfortable click target (4px multiples) |
| Gap (name to preview) | `8px` | Clear visual hierarchy (4px multiple) |
| Border radius | `8px` | Lovart-native micro rounding (4px multiple) |

### Category Header
| Property | Value | Rationale |
|----------|-------|-----------|
| Padding | `8px 12px` | Less than item, header role |
| Margin above | `12px` (first: 0) | Category separation |

## 2. Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```
**Rationale:** System font stack matches Lovart's likely UI font, ensures cross-platform consistency.

### Prompt Name
| Property | Value |
|----------|-------|
| Font size | `14px` |
| Font weight | `500` (medium) |
| Line height | `1.4` |
| Color | `#333` (primary text) |

### Preview Text
| Property | Value |
|----------|-------|
| Font size | `12px` |
| Font weight | `400` (normal) |
| Line height | `1.3` |
| Color | `#666` (secondary text) |
| Max length | `50 characters` |
| Overflow | `ellipsis` (`text-overflow: ellipsis`) |

### Category Header
| Property | Value |
|----------|-------|
| Font size | `12px` |
| Font weight | `500` (medium) |
| Color | `#999` (muted label) |
| Transform | `uppercase` (optional, subtle category marker) |

## 3. Color

### Lovart CSS Extraction Strategy
Since Shadow DOM isolates styles, replicate Lovart visual language by:
1. **Runtime inspection:** Inspect Lovart buttons/cards on actual page with DevTools
2. **CSS property capture:** Extract `background-color`, `border-radius`, `box-shadow`, `border-color`
3. **Hardcoded fallback:** Use Lovart-common patterns if runtime extraction fails

### Color Values (Lovart-native approximation)
| Element | Property | Value | Source |
|---------|----------|-------|--------|
| Trigger button (default) | background | `#f5f5f5` (light gray) | Lovart button typical |
| Trigger button (hover) | background | `#e8e8e8` | Lovart hover state |
| Trigger button (active) | background | `#dcdcdc` | Lovart pressed state |
| Trigger icon | color | Lovart button icon color | Runtime extraction |
| Dropdown container | background | `#ffffff` | Lovart card surface |
| Dropdown container | border | `1px solid #e0e0e0` | Lovart card border |
| Dropdown item (default) | background | `transparent` |
| Dropdown item (hover) | background | `#f8f8f8` (light hover) |
| Dropdown item (selected) | background | `#e6f4ff` (subtle accent) + left border `2px solid #1890ff` |
| Accent color | primary | `#1890ff` (blue) | Lovart likely accent |

### Icon Color Alignment
- Lightning bolt icon color extracted from Lovart button icons at runtime
- Fallback: `#666` (Lovart-gray icon approximation)

## 4. Copywriting

### Text Strings
| Context | Text | Locale |
|---------|------|--------|
| Trigger button aria-label | `"插入预设提示词"` | zh-CN |
| Trigger button title (tooltip) | `"Lovart Prompt Injector"` | zh-CN |
| Empty dropdown state | `"暂无提示词"` | zh-CN |
| Empty subtext | `"请先添加提示词"` | zh-CN |
| Category header format | `"{分类名称}"` | zh-CN |
| Loading state | `"加载中..."` | zh-CN (if async fetch) |

### Microcopy Guidelines
- All UI text in Simplified Chinese (Lovart user base)
- Concise, action-oriented labels
- Empty states provide actionable guidance ("请先添加提示词" points to Phase 3)

## 5. Component Inventory

### Shadow DOM Component Tree
```
<lovart-injector-root> (Shadow DOM host)
  ├── <TriggerButton>
  │     └── <svg> (lightning bolt icon)
  └── <DropdownContainer>
        ├── <CategoryHeader> (per category)
        ├── <PromptItem> (per prompt in category)
        │     ├── <PromptName>
        │     └── <PromptPreview>
        └── <EmptyState> (when no prompts)
```

### Component Specifications

#### TriggerButton
| Prop | Type | Description |
|------|------|-------------|
| isOpen | boolean | Controls dropdown visibility |
| onClick | () => void | Toggle dropdown |
| lovartIconColor | string | Runtime-extracted Lovart icon color |

#### DropdownContainer
| Prop | Type | Description |
|------|------|-------------|
| prompts | Prompt[] | Prompt data from storage |
| categories | Category[] | Category data |
| onSelect | (prompt: Prompt) => void | Insert prompt callback |
| isOpen | boolean | Visibility state |

#### PromptItem
| Prop | Type | Description |
|------|------|-------------|
| prompt | Prompt | Prompt object |
| isSelected | boolean | Last inserted prompt highlight |
| onClick | () => void | Select callback |

#### CategoryHeader
| Prop | Type | Description |
|------|------|-------------|
| category | Category | Category object |
| itemCount | number | Prompts in category |

#### EmptyState
| Prop | Type | Description |
|------|------|-------------|
| message | string | Empty message text |
| subtext | string | Guidance text |

## 6. Interaction States

### Trigger Button States
| State | Background | Icon Color | Cursor | Animation |
|-------|------------|------------|--------|-----------|
| Default | `#f5f5f5` | Lovart icon color | `pointer` | none |
| Hover | `#e8e8e8` | Lovart icon color | `pointer` | none |
| Active (pressed) | `#dcdcdc` | Lovart icon color | `pointer` | none |
| Disabled | `#f0f0f0` | `#999` (muted) | `not-allowed` | none |
| Open (dropdown visible) | `#e8e8e8` (hover-like) | Lovart icon color | `pointer` | none |

### Dropdown Item States
| State | Background | Border | Text Color | Animation |
|-------|------------|--------|------------|-----------|
| Default | `transparent` | none | `#333` name, `#666` preview | none |
| Hover | `#f8f8f8` | none | unchanged | none |
| Selected (recently inserted) | `#e6f4ff` | `2px solid #1890ff` left | unchanged | fade after 2s |
| Focused (keyboard) | `#f8f8f8` | `1px dashed #1890ff` | unchanged | none |

### Dropdown Open/Close Animation
| Property | Value |
|----------|-------|
| Open animation | `opacity: 0 → 1` over `150ms ease-out` + `translateY: -4px → 0` |
| Close animation | `opacity: 1 → 0` over `100ms ease-in` |
| Animation trigger | CSS transition on isOpen state |

### Dropdown Scroll Behavior
| Property | Value |
|----------|-------|
| Overflow | `overflow-y: auto` when content > max-height |
| Scrollbar style | Lovart-native (thin, subtle) |
| Scroll position | Reset to top on open |

## 7. Registry Safety Gate

**Status: NOT APPLICABLE**

This phase uses **Shadow DOM with manual CSS replication** — not a standard React app with shadcn registry.

**Rationale:**
- Content Script injects UI into third-party Lovart site
- Shadow DOM provides complete CSS isolation from Lovart styles
- Lovart-native visual style must be manually replicated (no component library access)
- All styles defined inline in Shadow DOM CSS

**Shadow DOM CSS Strategy:**
1. Create `<style>` tag inside Shadow DOM root
2. Hardcode Lovart-matching CSS values (Section 3)
3. Runtime extraction option for precise Lovart color matching
4. No external CSS files or component registry dependencies

## 8. Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Trigger button focusable | `tabindex="0"` + `role="button"` |
| Dropdown focus trap | `aria-expanded` on trigger, focus items on open |
| Keyboard navigation | Arrow keys for dropdown items, Enter to select |
| Screen reader | `aria-label="插入预设提示词"` on trigger, item names announced |
| High contrast | Ensure `4.5:1` contrast ratio for text |

## 9. MutationObserver Configuration (Non-UI, Implementation Note)

| Option | Value | Rationale |
|--------|-------|-----------|
| childList | `true` | Detect new DOM nodes |
| subtree | `true` | Deep observation for SPA |
| attributes | `false` | Focus on structure changes |
| debounce | `100ms` | Avoid excessive callback firing |

---

*UI-SPEC created: 2026-04-16*
*Checker will validate 6 dimensions: Spacing, Typography, Color, Copywriting, Components, Interactions*