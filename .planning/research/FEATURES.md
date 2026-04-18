# Features Research: Network Prompt Data Source Integration

**Milestone:** v1.1.0 网络提示词数据源接入
**Domain:** Chrome Extension / Online Prompt Library
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## 1. Nano Banana Prompts Data Structure Analysis

### 1.1 Data Location

**URL:** `https://raw.githubusercontent.com/devanshug2307/Awesome-Nano-Banana-Prompts/main/README.md`

**Format:** Markdown file with embedded prompts (not separate JSON)

**Size:** ~600KB markdown file with 900+ prompts

### 1.2 Prompt Structure

Each prompt in README.md contains:
```
### [Index]. [Title]

![Preview Image](image_url)

[Description text]

**Prompt:**

```
{Prompt text - can be plain text or JSON format}
```

**Source:** [Attribution link]
```

### 1.3 Categories (17 total)

| # | Category | Count | Lovart Relevance |
|---|----------|-------|------------------|
| 1 | 3D Miniatures & Dioramas | 40 | ✓ High (3D renders) |
| 2 | Product Photography | 25 | ✓ High |
| 3 | Character Design | 17 | ✓ High |
| 4 | Food & Culinary | 13 | Medium |
| 5 | Fantasy & Sci-Fi | 15 | ✓ High |
| 6 | Sports & Action | 15 | Medium |
| 7 | Urban Cityscapes | 12 | ✓ High |
| 8 | Architecture & Interiors | 14 | ✓ High |
| 9 | Nature & Landscapes | 12 | ✓ High |
| 10 | Logo & Branding | 11 | ✓ High |
| 11 | Vintage & Retro | 11 | Medium |
| 12 | Cinematic Posters | 12 | ✓ High |
| 13 | Anime & Manga | 9 | ✓ High |
| 14 | Minimalist Icons | 7 | Medium |
| 15 | Miscellaneous | 4 | Low |
| 16 | Portrait Photography | 50 | ✓ High |
| 17 | Fashion Photography | 50 | ✓ High |

**Lovart relevance:** ~80% of categories directly applicable to image generation

### 1.4 Prompt Text Formats

Nano Banana prompts use multiple formats:
- **Plain text** — Simple prompt string with parameters (`--ar 2:3`)
- **Structured JSON** — Complex prompts with multiple variations
- **Template format** — `{Brand Name}`, `{User input}` placeholders

---

## 2. prompts.chat Data Structure

### 2.1 Data Location

**URL:** `https://raw.githubusercontent.com/f/prompts.chat/main/prompts.csv`

**Format:** CSV file (157+ prompts)

### 2.2 Fields

| Field | Description | Example |
|-------|-------------|---------|
| `act` | Role/action name | "Ethereum Developer" |
| `prompt` | Full prompt text | "Imagine you are..." |
| `for_devs` | Developer-focused | TRUE/FALSE |
| `type` | Content type | TEXT |
| `contributor` | Author attribution | "f" |

### 2.3 Lovart Relevance

**Low relevance** — prompts.chat focuses on ChatGPT role-playing prompts, NOT image generation.
- Most prompts are text/conversation based
- No visual/art categories
- Not suitable for Lovart image generation context

**Recommendation:** DEFER prompts.chat integration. Focus exclusively on Nano Banana.

---

## 3. Online Library UX Patterns

### 3.1 Table Stakes Features

| Feature | Description | Complexity | Priority |
|---------|-------------|------------|----------|
| **Browse by category** | Show network prompts grouped by source categories | Medium | P1 |
| **Search/filter** | Text search across prompt content/title | Medium | P1 |
| **Preview prompt** | Show full prompt text before collecting | Low | P1 |
| **Collect/favorite** | Add network prompt to local storage | Low | P1 |
| **Offline access** | Cached prompts available without network | Low | P1 |
| **Refresh data** | Pull latest from source | Low | P2 |
| **Source indicator** | Show which provider the prompt comes from | Low | P2 |

### 3.2 Differentiators

| Feature | Description | Complexity | Priority |
|---------|-------------|------------|----------|
| **Multi-source browsing** | Browse from multiple providers in one UI | Medium | P2 |
| **Smart category mapping** | Auto-map source categories to local categories | High | P2 |
| **Preview images** | Show thumbnail from source (if available) | Medium | P3 |
| **One-click insert** | Insert network prompt directly without collecting | Low | P3 |
| **Sync status indicator** | Show last sync time, data freshness | Low | P2 |

### 3.3 Anti-Features (Do NOT Build)

| Anti-Feature | Reason |
|--------------|--------|
| Auto-sync background | User-triggered only (respect user control) |
| Account/authentication | No backend, purely client-side |
| Real-time streaming | GitHub static files, no streaming needed |
| Push notifications | Overkill for prompt library |
| Rating/voting system | Requires backend, social features out of scope |
| prompts.chat integration | ChatGPT prompts not relevant to Lovart image generation |

---

## 4. Complexity Assessment

| Feature | LOC Estimate | Dependencies | Risk |
|---------|--------------|--------------|------|
| Markdown parser | ~100 lines | None (regex) | Low |
| Provider registry | ~80 lines | None | Low |
| Network cache layer | ~150 lines | storage extension | Medium |
| Service Worker handlers | ~100 lines | existing handlers | Low |
| Dropdown "在线库" UI | ~300 lines | React, existing components | Medium |
| Search/filter UI | ~100 lines | React state | Low |
| Collect button | ~50 lines | Message to service worker | Low |
| Category mapping UI | ~150 lines | React, local storage | Medium |

**Total LOC Estimate:** ~1000-1200 lines

---

## 5. Dependencies on Existing Features

| Existing Feature | Integration Needed |
|------------------|-------------------|
| Dropdown UI | Add "在线库" section/tab |
| Service Worker | Add network fetch handlers |
| Message Protocol | Add new MessageType values |
| Storage Schema | Extend with network cache |
| Category system | Map source categories to local |
| Insert handler | Support inserting network prompts |
| Zustand store | Add network prompt state |

---

## 6. Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Browse by category | HIGH | MEDIUM | P1 |
| Search/filter | HIGH | MEDIUM | P1 |
| Preview prompt | HIGH | LOW | P1 |
| Collect to local | HIGH | LOW | P1 |
| Offline cache | MEDIUM | LOW | P1 |
| Refresh data | MEDIUM | LOW | P2 |
| Category mapping | MEDIUM | HIGH | P2 |
| Source indicator | LOW | LOW | P2 |
| Preview images | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.1.0
- P2: Should have, add if time permits
- P3: Nice to have, defer to future

---

## Sources

- Nano Banana Prompts README analysis (via curl)
- prompts.chat CSV structure analysis (via curl)
- AIPRM extension online library UX
- Chrome Extension network patterns research

---
*Features research for: Network Prompt Data Source Integration*
*Researched: 2026-04-19*