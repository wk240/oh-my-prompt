# Architecture Research

**Domain:** Chrome Extension (Manifest V3)
**Researched:** 2026-04-16
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Lovart Web Page                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Content Script (isolated)               │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │    │
│  │  │ Input      │  │ Dropdown   │  │ Insert     │    │    │
│  │  │ Detector   │  │ UI         │  │ Handler    │    │    │
│  │  └────┬───────┘  └────┬───────┘  └────┬───────┘    │    │
│  │       │              │              │              │    │
│  │       └──────────────┴──────────────┘              │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
├──────────────────────────────┼──────────────────────────────┤
│                    Service Worker                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Message Coordinator                      │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │    │
│  │  │ Storage    │  │ Import/    │  │ Message    │    │    │
│  │  │ Manager    │  │ Export     │  │ Router     │    │    │
│  │  └────┬───────┘  └────┬───────┘  └────┬───────┘    │    │
│  │       │              │              │              │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
├──────────────────────────────┼──────────────────────────────┤
│                     Popup (Options)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Prompt Management UI                    │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │    │
│  │  │ Category   │  │ Prompt     │  │ Import/    │    │    │
│  │  │ List       │  │ Editor     │  │ Export     │    │    │
│  │  └────┬───────┘  └────┬───────┘  └────┬───────┘    │    │
│  │       │              │              │              │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
├──────────────────────────────┴──────────────────────────────┤
│                    chrome.storage.local                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Prompts  │  │ Categories│  │ Settings │                   │
│  │ Store    │  │ Store     │  │ Store    │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Content Script | DOM interaction, UI injection | TypeScript + React in Shadow DOM |
| Input Detector | Find Lovart input element | MutationObserver + selectors |
| Dropdown UI | Prompt selection interface | React components, Shadow DOM |
| Insert Handler | Text insertion to input | DOM manipulation, event dispatch |
| Service Worker | Coordination, storage access | chrome.runtime.onMessage handlers |
| Storage Manager | CRUD operations on prompts | chrome.storage.local API |
| Popup UI | Prompt management interface | React + Zustand state |
| Message Router | Component communication | chrome.runtime.sendMessage |

## Recommended Project Structure

```
src/
├── content/              # Content script (runs on Lovart page)
│   ├── index.tsx         # Content script entry
│   ├── InputDetector.ts  # Find and monitor input element
│   ├── Dropdown.tsx      # Dropdown prompt selector
│   └── InsertHandler.ts  # Insert prompt to input
│
├── background/           # Service worker
│   ├── index.ts          # Service worker entry
│   ├── storage.ts        # Storage operations
│   ├── messaging.ts      # Message routing
│   └── importExport.ts   # Import/export handlers
│
├── popup/                # Extension popup/options
│   ├── index.tsx         # Popup entry
│   ├── App.tsx           # Main popup component
│   ├── components/       # UI components
│   │   ├── CategoryList.tsx
│   │   ├── PromptEditor.tsx
│   │   ├── ImportExport.tsx
│   │   └── SearchBar.tsx
│   └── store/            # Zustand stores
│   │   ├── promptStore.ts
│   │   └── categoryStore.ts
│
├── shared/               # Shared utilities
│   ├── types.ts          # TypeScript types
│   ├── constants.ts      # Constants
│   ├── messaging.ts      # Message types
│   └── utils.ts          # Helpers
│
├── manifest.json         # Extension manifest
└── vite.config.ts        # Build configuration
```

### Structure Rationale

- **content/:** Isolated from extension, runs in page context
- **background/:** Service worker, no DOM access
- **popup/:** React-based management UI
- **shared/:** Types and utilities used across components

## Architectural Patterns

### Pattern 1: Shadow DOM Isolation

**What:** Content script UI wrapped in Shadow DOM
**When to use:** When injecting UI into third-party pages
**Trade-offs:** Styles isolated (good) but harder to debug (bad)

**Example:**
```typescript
// Create shadow root for dropdown
const container = document.createElement('div');
container.id = 'lovart-prompt-injector';
const shadow = container.attachShadow({ mode: 'open' });

// Render React into shadow root
const root = createRoot(shadow);
root.render(<DropdownApp />);
```

### Pattern 2: Message-Based Communication

**What:** Components communicate via chrome.runtime.sendMessage
**When to use:** Content script ↔ Service Worker ↔ Popup
**Trade-offs:** Async overhead but clean separation

**Example:**
```typescript
// Content script requests prompts
chrome.runtime.sendMessage({ type: 'GET_PROMPTS' }, (response) => {
  setPrompts(response.prompts);
});

// Service worker handles
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PROMPTS') {
    chrome.storage.local.get('prompts', (data) => {
      sendResponse({ prompts: data.prompts });
    });
    return true; // Keep channel open for async response
  }
});
```

### Pattern 3: Storage-First Architecture

**What:** All state derives from chrome.storage.local
**When to use:** Extensions without backend
**Trade-offs:** No real-time sync but simple and reliable

## Data Flow

### Request Flow

```
[User Click Dropdown]
    ↓
[Content Script] → [Service Worker] → [chrome.storage.local]
    ↓              ↓           ↓
[Render Prompts] ← [Response] ← [Data]
```

### Insert Flow

```
[User Select Prompt]
    ↓
[Content Script: InsertHandler]
    ↓
[Find Input Element] → [Set Value] → [Dispatch Input Event]
    ↓
[Prompt inserted in Lovart input]
```

### Key Data Flows

1. **Prompt Selection:** Popup → Storage → Content Script (via message)
2. **Prompt Insert:** Content Script → Lovart Input (direct DOM)
3. **Prompt CRUD:** Popup → Storage (direct API)

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 prompts | Current architecture sufficient |
| 100-1000 prompts | Add search/filter, lazy loading |
| 1000+ prompts | Consider IndexedDB instead of storage.local |

### Scaling Priorities

1. **First bottleneck:** Storage quota (10MB default) — switch to IndexedDB
2. **Second bottleneck:** UI performance — virtualized lists

## Anti-Patterns

### Anti-Pattern 1: Direct Storage in Content Script

**What people do:** Content script directly reads chrome.storage
**Why it's wrong:** Storage API unavailable in content script context
**Do this instead:** Message service worker for storage access

### Anti-Pattern 2: Polling for Input Element

**What people do:** setInterval to check if input exists
**Why it's wrong:** Performance impact, unreliable timing
**Do this instead:** MutationObserver for dynamic content

### Anti-Pattern 3: Global CSS Injection

**What people do:** Inject styles into host page head
**Why it's wrong:** Styles bleed/conflict with host page
**Do this instead:** Shadow DOM with scoped styles

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Lovart Platform | DOM observation | Monitor input element presence |
| Chrome Storage | Direct API | chrome.storage.local |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Content ↔ Background | chrome.runtime.sendMessage | Async, request-response |
| Popup ↔ Storage | chrome.storage.local | Direct API access |
| Popup ↔ Content | chrome.tabs.sendMessage | Target specific tab |

## Sources

- Chrome Extension Architecture docs
- Manifest V3 migration guide
- @crxjs/vite-plugin patterns
- Shadow DOM best practices

---
*Architecture research for: Chrome Extension (Manifest V3)*
*Researched: 2026-04-16*