# Design Specification: Oh My Prompt

## Overview

**Product Type:** Chrome Extension - Prompt Management Tool
**Primary User:** AI designers, creators, developers using AI platforms (Lovart, ChatGPT, Claude, Gemini, etc.)
**Core Value:** One-click prompt insertion for faster AI-powered content creation

---

## Design System

### Pattern: Minimal Single Column
- **Focus:** Single CTA focus, large typography, generous whitespace
- **CTA Placement:** Center-aligned, high-contrast buttons (7:1+)
- **Color Strategy:** Minimalist brand palette + white + accent
- **Sections:** Hero headline → Short description → Benefit bullets (≤3) → CTA → Footer

### Style: Micro-interactions
- **Keywords:** Small animations, gesture-based, tactile feedback, contextual interactions
- **Best For:** Mobile apps, touchscreen UIs, productivity tools, consumer apps
- **Performance:** Excellent (CSS-only animations)
- **Accessibility:** Good (with proper focus states)

---

## Color System

### Light Mode (Default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#A16207` | Primary brand color (amber), selected states, icons |
| `--accent-foreground` | `#FFFFFF` | Text on accent backgrounds |
| `--text-primary` | `#171717` | Headings, primary text, buttons |
| `--text-secondary` | `#64748B` | Secondary text, labels, placeholders |
| `--background` | `#FFFFFF` | Main background |
| `--card` | `#FFFFFF` | Card backgrounds |
| `--border` | `#E5E5E5` | Borders, dividers, separators |
| `--success` | `#16A34A` | Connected status, positive feedback |
| `--warning` | `#D97706` | Update alerts, backup warnings |
| `--error` | `#DC2626` | Delete actions, error states |

### Semantic Colors

| Category | Color | Application |
|----------|-------|-------------|
| **Connected** | `#F0FDF4` bg + `#16A34A` text | Input availability banner (success) |
| **Checking** | `#F3F4F6` bg + `#6B7280` text | Loading/pending states |
| **Unavailable** | `#FFF7ED` bg + `#EA580C` border | No input detected (warning) |
| **Backup Reminder** | `#EFF6FF` bg + `#2563EB` link | Unsynced changes (info) |
| **First Backup Warning** | `#FEF3C7` bg + `#F59E0B` border | Data safety alert (critical) |
| **Update Available** | `#FFF3CD` bg + `#856404` text | New version notification |

---

## Typography

### Font Stack
- **Primary:** Inter (Google Fonts) - Clean, professional, developer-friendly
- **Fallback:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **CSS Import:** `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`

### Type Scale

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Title | `16px` | `600` | Modal headers, settings title |
| Heading | `14px` | `500` | Section labels, card titles |
| Body | `14px` | `400` | Primary content, descriptions |
| Small | `12px` | `500` | Category names, prompt names |
| Tiny | `10px` | `500` | Version badge, secondary info |
| Label | `11px` | `500` | Banner text, status messages |

### Line Height
- **Body:** `1.4` - `1.5` (comfortable reading in compact UI)
- **Headers:** `1.2` (tighter for visual hierarchy)

---

## Spacing System

### Base Unit: 4px / 8dp

| Token | Value | Usage |
|-------|-------|-------|
| `spacing-xs` | `4px` | Icon gaps, tight button spacing |
| `spacing-sm` | `8px` | Header padding, banner padding |
| `spacing-md` | `12px` | Sidebar padding, card padding |
| `spacing-lg` | `16px` | Content padding, section margins |
| `spacing-xl` | `24px` | Empty state padding |

### Component Padding

| Component | Padding |
|-----------|---------|
| Header | `8px 12px` |
| Sidebar Item | `8px 12px` |
| Prompt Item | `12px 8px` |
| Card | `12px` (network card) |
| Banner | `8px 12px` |
| FAB Button | `40px` diameter |

---

## Layout Architecture

### Sidepanel Structure (Main UI)

```
┌─────────────────────────────────────────────────────────────┐
│  Top Header (flex-shrink: 0)                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Version │ [Sparkles] [Update] [中/EN] [Settings] [Link] ││
│  └─────────────────────────────────────────────────────────┘│
├───────────────┬─────────────────────────────────────────────┤
│ Sidebar       │ Main Content                                │
│ (120px fixed) │ (flex: 1)                                   │
│               │                                             │
│ ┌───────────┐ │ ┌─────────────────────────────────────────┐│
│ │ Category  │ │ │ Input Status Banner (checking/available/││
│ │ List      │ │ │ unavailable)                            ││
│ │           │ │ ├─────────────────────────────────────────┤│
│ │ • All     │ │ │ Update Banner (if hasUpdate)            ││
│ │ • Library │ │ ├─────────────────────────────────────────┤│
│ │ • Temp    │ │ │ Backup Warning Banner (if needed)       ││
│ │ • Custom  │ │ ├─────────────────────────────────────────┤│
│ │           │ │ │                                         ││
│ │ [+ Add]   │ │ │ ┌─────────────────────────────────────┐││
│ └───────────┘ │ │ │ Prompt List (scrollable)            │││
│               │ │ │                                     │││
│               │ │ │ Prompt Item                         │││
│               │ │ │ ┌────┬────────────────────┬───────┐ │││
│               │ │ │ │Icon│ Name + Preview      │[Actions]│││
│               │ │ │ └────┴────────────────────┴───────┘ │││
│               │ │ │                                     │││
│               │ │ │ [FAB Add Button]                    │││
│               │ │ └─────────────────────────────────────┘││
│               │ └─────────────────────────────────────────┘│
└───────────────┴─────────────────────────────────────────────┘
```

### Breakpoints

| Breakpoint | Width | Context |
|------------|-------|---------|
| Sidepanel | `~360px` | Default Chrome sidepanel width |
| Popup | `320px` | Extension popup width |
| Mobile | `375px` | Minimum responsive design |
| Tablet | `768px` | Not applicable (extension only) |

---

## Component Specifications

### 1. Top Header

**Purpose:** Navigation, status indicators, version display

| Element | Spec |
|---------|------|
| Height | `auto` (flex-shrink: 0) |
| Padding | `8px 12px` |
| Border | `1px solid #E5E5E5` (bottom) |
| Version | `10px`, `weight: 500`, `color: #64748B` |
| Action Button | `28px × 28px`, `radius: 4px`, transparent bg |
| Hover | `bg: #F8F8F8` |
| Language Button | `36px × auto`, `padding: 4px 8px`, font-size `11px` |

### 2. Sidebar Categories

**Purpose:** Category navigation, drag reorder, CRUD actions

| Element | Spec |
|---------|------|
| Width | `120px` (fixed) |
| Background | `#F8F8F8` |
| Border | `1px solid #E5E5E5` (right) |
| Item Height | `auto` |
| Item Padding | `8px 12px` |
| Selected State | `bg: #FFF`, `border-left: 2px solid #A16207`, `color: #A16207` |
| Icon Size | `14px` |
| Drag Handle | `opacity: 0 → 1` on hover, `cursor: grab` |
| Action Buttons | `20px × 20px`, `opacity: 0 → 1` on hover |

### 3. Prompt Item

**Purpose:** Prompt display, selection, drag reorder, quick actions

| Element | Spec |
|---------|------|
| Padding | `12px 8px` |
| Border | `1px solid #E5E5E5` (bottom) |
| Hover | `bg: #F8F8F8` |
| Selected | `bg: #FEF3E2` (amber tint) |
| Thumbnail | `60px × 40px`, `radius: 4px`, `object-fit: cover` |
| Icon | `16px`, `color: #171717` |
| Name | `12px`, `weight: 500`, `color: #171717` |
| Preview | `10px`, `color: #64748B` |
| Arrow (inject) | `12px`, `color: #171717` |
| Action Buttons | `20px × 20px`, appear on hover, `bg: #FFF`, `shadow: 0 1px 3px rgba(0,0,0,0.1)` |

### 4. Input Status Banner

**Purpose:** Real-time connection status indicator

| State | Background | Border | Icon Color | Text Color |
|-------|------------|--------|------------|------------|
| Checking | `#F3F4F6` | `#D1D5DB` | `#6B7280` (spin) | `#6B7280` |
| Available | `#F0FDF4` | `#86EFAC` | `#16A34A` | `#16A34A` |
| Unavailable | `#FFF7ED` | `#EA580C` (2px) | `#EA580C` | `#9A3412` |

**Text Format:**
- Checking: `"正在连接 {siteName}..."`
- Available: `"已连接 {siteName}"`
- Unavailable: `"当前页面不支持一键插入，切换到支持的平台或刷新"`

### 5. FAB Add Button

**Purpose:** Primary action - add new prompt

| Spec | Value |
|------|-------|
| Position | `absolute`, `bottom: 16px`, `right: 16px` |
| Size | `40px × 40px` |
| Shape | `border-radius: 50%` |
| Background | `#171717` |
| Color | `#FFFFFF` |
| Shadow | `0 4px 12px rgba(0,0,0,0.2)` |
| Hover | `bg: #404040`, `scale: 1.05` |
| Icon | Plus, `18px` |

### 6. Network Card (Resource Library)

**Purpose:** Resource prompt display in grid layout

| Spec | Value |
|------|-------|
| Grid | `repeat(auto-fill, minmax(140px, 1fr))` |
| Gap | `12px` |
| Card Padding | `12px` |
| Border | `1px solid #E5E5E5`, `radius: 8px` |
| Thumbnail | `100% width`, `80px height`, `radius: 6px` |
| Hover | `bg: #F8F8F8`, `shadow: 0 4px 12px rgba(0,0,0,0.08)` |
| Actions | `absolute`, `bottom: 8px`, `right: 8px` |

---

## Interaction Patterns

### Animations

| Type | Duration | Easing | Properties |
|------|----------|--------|------------|
| Hover | `150ms` | `ease` | `background` |
| State change | `150ms` | `ease` | `opacity, visibility` |
| Press feedback | `0ms` (instant) | - | Immediate visual response |
| Spin (loading) | `1s` | `linear infinite` | `transform: rotate` |

### Hover Patterns

| Element | Hover Behavior |
|---------|----------------|
| Sidebar Item | `bg: #F0F0F0` → Show drag handle (icon fades) → Show action buttons |
| Prompt Item | `bg: #F8F8F8` → Icon fades → Drag handle appears → Action buttons slide in |
| Network Card | `bg: #F8F8F8` + `shadow` lift |
| Button | `bg: darker/lighter variant` |
| Link | `text-decoration: underline` + `color: darker` |

### Touch Targets

| Element | Visual Size | Hit Area | Requirement |
|---------|-------------|----------|-------------|
| Sidebar Item | `auto` | `full-width` | Pass |
| Prompt Item | `auto` | `full-width` | Pass |
| Action Button | `20px` | `20px` | Min 44×44? Extend via padding |
| FAB Button | `40px` | `40px` | Pass |
| Header Button | `28px` | `28px` | Close to minimum, acceptable |

---

## Accessibility Requirements

### Critical (WCAG AA)

| Rule | Implementation |
|------|----------------|
| **Color Contrast** | Text: 4.5:1 minimum. Primary `#171717` on `#FFF` = 16:1 ✓ |
| **Focus States** | Visible focus ring on all interactive elements. Tailwind: `focus-visible:ring-2` |
| **Keyboard Navigation** | Tab order matches visual order. All items have `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space |
| **Form Labels** | All inputs have visible labels (not placeholder-only) |
| **Alt Text** | Thumbnails have `alt={prompt.name}` |
| **Aria Labels** | Icon-only buttons have `aria-label` (e.g., "编辑分类", "删除提示词") |
| **No Color-Only** | Status banners use icon + color + text (not color alone) |
| **Escape Routes** | Modals have close buttons. Settings has back button |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Dark Mode (Future)

### Token Mapping

| Light | Dark | Notes |
|-------|------|-------|
| `#FFFFFF` bg | `#0F172A` bg | Deep navy background |
| `#171717` text | `#F8FAFC` text | High contrast inverse |
| `#F8F8F8` sidebar | `#1E293B` sidebar | Elevated surface |
| `#E5E5E5` border | `#334155` border | Muted separator |
| `#A16207` accent | `#F59E0B` accent | Lighter amber for dark bg |
| `#64748B` secondary | `#94A3B8` secondary | Lighter gray |

### Status Colors (Dark)

| Status | Dark Background | Dark Text |
|--------|-----------------|-----------|
| Connected | `#064E3B` | `#34D399` |
| Checking | `#1E293B` | `#94A3B8` |
| Unavailable | `#7C2D12` | `#FB923C` |
| Warning | `#78350F` | `#FCD34D` |

---

## Icons

### Icon Set: Lucide React

**Why:** SVG-based, consistent stroke width, React integration, Tailwind-compatible

### Usage Rules

| Context | Size | Color | Notes |
|---------|------|-------|-------|
| Sidebar Icon | `14px` | `#64748B` → `#A16207` (selected) | Category icons |
| Prompt Icon | `16px` | `#171717` | Type indicator |
| Action Button | `12px` (category) / `14px` (prompt) | `#64748B` → `#171717` (hover) | Edit/delete/copy |
| Header Action | `14px` | `#171717` | Settings, update, link |
| Banner Icon | `14px` | Semantic color | Status indicator |
| FAB Icon | `18px` | `#FFFFFF` | Primary action |

### Category Icon Map

```typescript
const CATEGORY_ICON_MAP = {
  'cat-quality': Sparkles,
  'cat-style': Palette,
  'cat-lighting': Sun,
  'cat-composition': Frame,
  'cat-color': Paintbrush,
  'cat-theme': Image,
  'cat-medium': Layers,
  'all': FolderOpen,
  'design': Sparkle,
  'style': Brush,
  'other': Layers,
  'temporary': Clock,
  'resource-library': Database,
}
```

---

## Anti-Patterns (Avoid)

### Icons & Visual

| Anti-Pattern | Why |
|--------------|-----|
| **Emoji as Icons** | Font-dependent, inconsistent cross-platform, no design token control |
| **PNG Icons** | Blur/pixelate on resize, no dark mode support |
| **Mixed Stroke Widths** | Inconsistent visual polish |
| **Filled + Outline Mix** | Semantic confusion at same hierarchy level |
| **Layout-Shifting Hover** | Triggers visual jitter on mobile |

### Interaction

| Anti-Pattern | Why |
|--------------|-----|
| **Instant State (0ms)** | Feels unresponsive. Use 150ms minimum |
| **Hover-Only Actions** | Mobile doesn't have hover. Provide tap alternative |
| **No Loading Feedback** | Users think UI froze. Show spinner or skeleton |
| **Blocking Animation** | UI must stay interactive during transitions |

### Color & Contrast

| Anti-Pattern | Why |
|--------------|-----|
| **Gray-on-Gray** | Low contrast (e.g., `#64748B` on `#E5E5E5` = 2.5:1 ✗) |
| **Light Mode Tokens in Dark** | Inverted colors fail contrast. Use desaturated variants |
| **Color-Only Meaning** | Colorblind users miss info. Add icon or text |
| **Weak Modal Scrim** | Background competes with foreground. Use 40-60% opacity |

---

## Performance Guidelines

### React Optimization

| Pattern | Implementation |
|---------|----------------|
| **Memoized Components** | `memo()` for SortableItem, NetworkCard |
| **Derived State** | `isMobile = useMediaQuery()` not `width < 768` |
| **Primitive Dependencies** | `useEffect(() => {}, [user.id])` not `[user]` |
| **Lazy Loading** | `lazy(() => import(...))` for modals |
| **Suspense** | `<Suspense fallback={<LoadingSpinner />}>` |

### CSS Performance

| Pattern | Implementation |
|---------|----------------|
| **Transform Animations** | `transform`, `opacity` only (no width/height/top/left) |
| **Will-Change** | Only when necessary (avoid overuse) |
| **Contain** | `contain: content` for isolated components |

### Loading Strategy

| Threshold | Feedback |
|-----------|----------|
| `< 300ms` | No indicator needed |
| `300ms - 1s` | Skeleton/shimmer |
| `> 1s` | Skeleton + progress |

---

## Shadow DOM Isolation (Content Script)

### Why Shadow DOM?
Content script UI must be isolated from host page CSS to prevent conflicts.

### Implementation

```typescript
const container = document.createElement('div')
container.id = 'oh-my-prompt-dropdown-portal'
const shadowRoot = container.attachShadow({ mode: 'open' })

// Styles injected inline (not external CSS file)
const styleElement = document.createElement('style')
styleElement.textContent = `
  /* All styles here */
`
shadowRoot.appendChild(styleElement)
```

### Style Scope

| Property | Value | Notes |
|----------|-------|-------|
| `font-family` | `Inter, -apple-system, sans-serif` | Override host font |
| `z-index` | `2147483647` | Maximum z-index to overlay everything |
| `position` | `fixed` | Escape scroll container |
| `pointer-events` | `auto` | Enable interaction |

---

## Component Library

### Base Components (Radix UI Primitives)

| Component | Usage |
|-----------|-------|
| `@radix-ui/react-slot` | Button `asChild` pattern |
| `@radix-ui/react-tabs` | Settings tab navigation |
| `@radix-ui/react-dialog` | Modal dialogs |

### Custom Components

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `popup/components/ui/button.tsx` | CVA variants (default, destructive, outline, ghost, cta) |
| `Toast` | `popup/components/ui/toast.tsx` | Feedback notifications |
| `Tooltip` | `content/components/Tooltip.tsx` | Hover info display |
| `BaseModal` | `content/components/BaseModal.tsx` | Modal foundation |
| `DeleteConfirmModal` | `content/components/DeleteConfirmModal.tsx` | Destructive action confirmation |
| `PromptEditModal` | `content/components/PromptEditModal.tsx` | Prompt CRUD form |
| `CategoryEditModal` | `content/components/CategoryEditModal.tsx` | Category CRUD form |

---

## CSS Utility Classes

### Scrollbar

```css
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: #D4D4D4 transparent;
}
```

### Animations

```css
.spin-animation {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

---

## Pre-Delivery Checklist

Before shipping UI changes, verify:

### Visual Quality
- [ ] No emojis as icons (SVG: Lucide only)
- [ ] Consistent icon stroke width (1.5px or 2px)
- [ ] One icon style per hierarchy level
- [ ] Hover states don't shift layout bounds
- [ ] Semantic theme tokens used (no ad-hoc hex)

### Interaction
- [ ] All tappable elements have hover feedback (150ms)
- [ ] Touch targets ≥ 44×44px (or hitSlop extension)
- [ ] Instant feedback on press (< 100ms)
- [ ] Disabled states visually clear (opacity 0.38-0.5)
- [ ] Screen reader focus matches visual order
- [ ] No gesture conflicts (nested tap/drag)

### Accessibility
- [ ] Text contrast ≥ 4.5:1 (both modes)
- [ ] Focus rings visible (2-4px)
- [ ] All icons/buttons have aria-label
- [ ] Color not sole indicator (icon/text paired)
- [ ] Reduced motion respected
- [ ] Escape routes in modals/flows

### Light/Dark Mode
- [ ] Primary text contrast ≥ 4.5:1 in both
- [ ] Borders visible in both themes
- [ ] Interaction states distinguishable in both
- [ ] Modal scrim opacity sufficient (40-60%)
- [ ] Both themes tested independently

---

## Future Enhancements

### 1. Theme Customization
- Allow users to choose accent color (amber, teal, purple)
- Persist preference in `chrome.storage.local`

### 2. Responsive Sidepanel
- Detect sidepanel width via `chrome.sidePanel.setOptions`
- Adjust sidebar width (120px → 80px on narrow)

### 3. Advanced Animations
- Staggered list item entrance (30ms per item)
- Spring physics for modal transitions
- Shared element transitions between views

### 4. Density Options
- Compact mode (smaller padding, fonts)
- Comfortable mode (current defaults)
- Spacious mode (larger padding, fonts)

---

## References

### Design Inspiration
- **Apple HIG:** Touch targets, safe areas, system controls
- **Material Design:** Color system, type scale, elevation
- **Swiss Modernism:** Grid layout, mathematical spacing, clean hierarchy

### Tool Documentation
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Lucide Icons:** https://lucide.dev/icons
- **Radix UI:** https://radix-ui.com/primitives
- **dnd-kit:** https://docs.dndkit.com

### Accessibility
- **WCAG 2.1 AA:** https://www.w3.org/WAI/WCAG21/quickref
- **Color Contrast Checker:** https://webaim.org/resources/contrastchecker

---

*Generated by UI/UX Pro Max skill. Last updated: 2026-05-10*