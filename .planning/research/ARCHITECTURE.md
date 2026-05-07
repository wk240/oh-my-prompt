# Architecture Research

**Domain:** Chrome Extension + Web App + Backend Integration (v2.0 Network + Team Collaboration)
**Researched:** 2026-05-07
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │ Chrome Extension │  │    Web App       │  │  Mobile (Future) │           │
│  │   (Existing)     │  │   (New)          │  │                  │           │
│  │                  │  │                  │  │                  │           │
│  │ Content Script   │  │ Next.js/React    │  │                  │           │
│  │ Service Worker   │  │ Dashboard UI     │  │                  │           │
│  │ Popup/SidePanel  │  │ Team Management  │  │                  │           │
│  └───────┬──────────┘  └───────┬──────────┘  └───────┬──────────┘           │
│          │                     │                     │                       │
├──────────┴─────────────────────┴─────────────────────┴───────────────────────┤
│                        API LAYER (Supabase / Custom)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Supabase Backend                              │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │   │
│  │  │   Auth     │  │  Database  │  │   Storage  │  │  Realtime  │      │   │
│  │  │ (OAuth)    │  │ (Postgres) │  │  (S3-like) │  │  (Sync)    │      │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Edge Functions (Payment)                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │ Stripe/LemonSqueezy webhook handling, subscription management    │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Users   │  │  Teams   │  │ Prompts  │  │ Categories│  │Subscriptions│   │
│  │ (Auth)   │  │          │  │          │  │           │  │             │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Recommended Project Structure

```
oh-my-prompt/
├── extension/                     # Existing Chrome Extension (reorganized)
│   ├── src/
│   │   ├── content/               # Content scripts (unchanged)
│   │   ├── background/            # Service worker + Supabase integration
│   │   │   ├── service-worker.ts  # Existing + new auth/cloud handlers
│   │   │   ├── auth-handler.ts    # NEW: OAuth flow management
│   │   │   ├── cloud-sync.ts      # NEW: Cloud storage sync logic
│   │   │   └── api-proxy.ts       # NEW: Backend API proxy
│   │   ├── popup/                 # Popup UI (unchanged + login state)
│   │   ├── lib/                   # Shared utilities
│   │   │   ├── store.ts           # Zustand store + cloud sync hooks
│   │   │   ├── storage.ts         # Local storage manager (unchanged)
│   │   │   ├── supabase-client.ts # NEW: Supabase client for extension
│   │   │   ├── auth-context.ts    # NEW: Auth state management
│   │   │   └── sync/
│   │   │       ├── local-sync.ts  # Existing local folder sync
│   │   │       └── cloud-sync.ts  # NEW: Cloud sync coordination
│   │   └── shared/                # Shared types (unchanged + new)
│   │       ├── types.ts           # Add cloud types
│   │       ├── messages.ts        # Add cloud/auth message types
│   │       └── cloud-types.ts     # NEW: API response types
│   ├── manifest.json              # Add identity API permissions
│   └── package.json               # Add @supabase/supabase-js
│
├── web-app/                       # NEW: Web management dashboard
│   ├── src/
│   │   ├── app/                   # Next.js App Router
│   │   │   ├── (auth)/            # Auth routes
│   │   │   │   ├── login/
│   │   │   │   └── callback/
│   │   │   ├── (dashboard)/       # Protected dashboard
│   │   │   │   ├── prompts/       # Prompt management
│   │   │   │   ├── teams/         # Team management
│   │   │   │   ├── settings/      # Account settings
│   │   │   │   └── subscription/  # Subscription management
│   │   ├── components/            # React components
│   │   │   ├── ui/                # Shared UI (shadcn/ui)
│   │   │   ├── prompts/           # Prompt editor/list
│   │   │   ├── teams/             # Team management UI
│   │   │   └── subscription/      # Payment UI
│   │   ├── lib/                   # Web-specific utilities
│   │   │   ├── supabase/          # Browser Supabase client
│   │   │   ├── auth/              # Auth utilities
│   │   │   └── api/               # API client wrappers
│   │   └── hooks/                 # React hooks
│   ├── public/
│   ├── next.config.js
│   └── package.json
│
├── packages/                      # NEW: Shared packages (monorepo)
│   ├── database/                  # Database schema & types
│   │   ├── src/
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   ├── client.browser.ts  # Browser Supabase client
│   │   │   ├── client.server.ts   # Server Supabase client
│   │   │   └── index.ts           # Type exports
│   │   └── package.json
│   ├── api/                       # tRPC API definitions
│   │   ├── src/
│   │   │   ├── router.ts          # Root router
│   │   │   ├── routers/
│   │   │   │   ├── prompt.ts      # Prompt CRUD + sharing
│   │   │   │   ├── team.ts        # Team management
│   │   │   │   ├── subscription.ts # Subscription status
│   │   │   │   └── sync.ts        # Sync coordination
│   │   │   ├── context.ts         # Request context (auth)
│   │   │   └── trpc.ts            # tRPC setup
│   │   └── package.json
│   ├── types/                     # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── prompt.ts          # Prompt types (extended)
│   │   │   ├── team.ts            # Team types
│   │   │   ├── subscription.ts    # Subscription types
│   │   │   └── sync.ts            # Sync state types
│   │   └── package.json
│   └── config/                    # Shared configuration
│       ├── src/
│       │   ├── supabase.ts        # Supabase config
│       │   └── constants.ts       # Shared constants
│       └── package.json
│
├── supabase/                      # Supabase configuration
│   ├── config.toml                # Supabase project config
│   ├── migrations/                # Database migrations
│   │   ├── 001_profiles.sql       # User profiles
│   │   ├── 002_teams.sql          # Teams & memberships
│   │   ├── 003_prompts.sql        # Prompts with ownership
│   │   ├── 004_categories.sql     # Categories with ownership
│   │   ├── 005_subscriptions.sql  # Subscription tracking
│   │   └── 006_rls_policies.sql   # Row-level security
│   └── functions/                 # Edge functions
│       ├── payment-webhook/       # Payment processing
│       ├── sync-coordinator/      # Sync conflict resolution
│       └── team-invite/           # Team invitation handling
│
├── pnpm-workspace.yaml            # Monorepo workspace config
├── turbo.json                     # Turborepo build config
└── package.json                   # Root package
```

### Structure Rationale

- **extension/:** Existing extension code preserved, new auth/cloud modules added to background and lib folders
- **web-app/:** Next.js App Router for SEO-friendly public pages + protected dashboard
- **packages/:** Shared types and schema prevent duplication between extension and web app
- **supabase/:** Database migrations and edge functions alongside code for version control

## Architectural Patterns

### Pattern 1: Authenticated Extension

**What:** Extension authenticates via OAuth, stores session in service worker, proxies API calls through background script.

**When:** Required for any Chrome Extension needing user-specific backend data.

**Trade-offs:** Service worker may terminate, session persisted in chrome.storage.local; PKCE flow recommended for security.

**Example:**
```typescript
// extension/src/lib/supabase-client.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: async (key: string) => {
        const result = await chrome.storage.local.get(key)
        return result[key] || null
      },
      setItem: async (key: string, value: string) => {
        await chrome.storage.local.set({ [key]: value })
      },
      removeItem: async (key: string) => {
        await chrome.storage.local.remove(key)
      }
    },
    autoRefreshToken: true,
    persistSession: true
  }
})

// extension/src/background/auth-handler.ts
async function handleOAuthLogin(): Promise<void> {
  // Use chrome.identity.launchWebAuthFlow for OAuth
  const authUrl = await supabase.auth.getOAuthUrl('google', {
    redirectTo: chrome.identity.getRedirectURL()
  })
  
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  })
  
  // Parse tokens from responseUrl and set session
  const tokens = parseTokensFromUrl(responseUrl)
  await supabase.auth.setSession(tokens)
}
```

### Pattern 2: Hybrid Local + Cloud Sync

**What:** Primary data lives locally (chrome.storage.local), cloud is sync target and backup. Sync triggered on local changes, conflicts resolved via timestamps.

**When:** Essential for Chrome Extensions where offline-first UX is expected, cloud provides team sharing.

**Trade-offs:** Adds complexity for conflict resolution; benefit is seamless offline experience.

**Example:**
```typescript
// extension/src/lib/sync/cloud-sync.ts
interface SyncState {
  lastSyncTime: number
  pendingChanges: ChangeRecord[]
  conflictStrategy: 'local-wins' | 'cloud-wins' | 'merge'
}

async function triggerCloudSync(
  localData: StorageSchema,
  userId: string
): Promise<SyncResult> {
  const syncState = await getSyncState()
  const cloudData = await fetchCloudData(userId)
  
  // Detect conflicts: same promptId modified in both local and cloud
  const conflicts = detectConflicts(localData, cloudData, syncState.lastSyncTime)
  
  for (const conflict of conflicts) {
    const resolved = await resolveConflict(conflict, syncState.conflictStrategy)
    // Apply resolution to local or queue for cloud push
  }
  
  // Push local changes to cloud
  await pushLocalChanges(localData, syncState.pendingChanges)
  
  // Pull cloud changes to local
  const mergedData = mergeData(localData, cloudData)
  await chrome.storage.local.set({ prompt_script_data: mergedData })
  
  return { success: true, syncedAt: Date.now() }
}
```

### Pattern 3: Team Ownership Model

**What:** Prompts and categories have ownerId (user or team). Team members get access via membership table. Row-level security (RLS) enforces permissions.

**When:** Required for collaborative features where shared resources need controlled access.

**Trade-offs:** RLS adds query complexity; benefit is data security enforced at database level.

**Example:**
```sql
-- supabase/migrations/003_prompts.sql
CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  owner_id UUID NOT NULL,           -- user_id or team_id
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'team')),
  order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- RLS: User can read own prompts + team prompts (if member)
CREATE POLICY "prompts_select_policy" ON prompts FOR SELECT
  USING (
    owner_type = 'user' AND owner_id = auth.uid()
    OR
    owner_type = 'team' AND EXISTS (
      SELECT 1 FROM team_memberships 
      WHERE team_id = prompts.owner_id 
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor', 'member')
    )
  );

-- RLS: Only owner/admin/editor can update
CREATE POLICY "prompts_update_policy" ON prompts FOR UPDATE
  USING (
    owner_type = 'user' AND owner_id = auth.uid()
    OR
    owner_type = 'team' AND EXISTS (
      SELECT 1 FROM team_memberships 
      WHERE team_id = prompts.owner_id 
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
    )
  );
```

### Pattern 4: Type-Safe API Layer (tRPC)

**What:** Define API procedures in shared package, generate types for both extension and web app. Single source of truth for API contracts.

**When:** Recommended for monorepo projects where multiple clients share same backend.

**Trade-offs:** Requires initial setup; benefit is end-to-end type safety without manual API client generation.

**Example:**
```typescript
// packages/api/src/routers/prompt.ts
import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '../trpc'

export const promptRouter = router({
  list: protectedProcedure
    .input(z.object({ teamId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // RLS handles access control automatically
      return ctx.db.select().from(prompts)
        .where(input.teamId ? eq(prompts.owner_id, input.teamId) : undefined)
    }),
  
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      content: z.string(),
      categoryId: z.string(),
      ownerType: z.enum(['user', 'team']),
      ownerId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.insert(prompts).values({
        ...input,
        created_by: ctx.user.id
      })
    }),
  
  sync: protectedProcedure
    .input(z.object({
      localData: z.any(), // Validate with full schema
      lastSyncTime: z.number()
    }))
    .mutation(async ({ ctx, input }) => {
      // Handle sync logic
      return { mergedData: await handleSync(ctx, input) }
    })
})
```

## Data Flow

### Request Flow (Extension to Backend)

```
[User creates prompt in Extension dropdown]
    │
    ▼
[DropdownApp.tsx] → [store.ts addPrompt()]
    │                    │
    ├────────────────────┤
    │                    │
    ▼                    ▼
[Local save]    [Message: TRIGGER_CLOUD_SYNC]
    │                    │
    ▼                    ▼
[chrome.storage] ← [service-worker.ts]
                         │
                         ▼
                    [cloud-sync.ts] → [Supabase API]
                         │                    │
                         ▼                    ▼
                    [Sync result] ← [Database insert]
                         │
                         ▼
                    [Broadcast REFRESH_DATA]
                         │
                         ▼
                    [Content scripts update]
```

### Authentication Flow

```
[User clicks "Login" in Extension]
    │
    ▼
[Popup/SidePanel] → [Message: START_OAUTH]
    │                    │
    ▼                    ▼
[service-worker.ts] → [chrome.identity.launchWebAuthFlow()]
    │                              │
    ▼                              ▼
[Google OAuth page] ← [User authenticates]
    │                              │
    ▼                              ▼
[Callback URL] → [Parse tokens]
    │                │
    ▼                ▼
[Set Supabase session] → [Store in chrome.storage]
    │                         │
    ▼                         ▼
[Broadcast AUTH_STATE_CHANGED]
    │
    ▼
[All contexts update auth state]
```

### Team Sync Flow

```
[Team member updates shared prompt]
    │
    ▼
[Web App] → [tRPC prompt.update()]
    │              │
    ▼              ▼
[Supabase Database] → [RLS validates permission]
    │              │
    ├──────────────┤
    │              │
    ▼              ▼
[Realtime channel] → [Broadcast to subscribers]
    │                    │
    ▼                    ▼
[Extension service worker] ← [Receive realtime event]
    │
    ▼
[Pull updated prompt] → [Merge into local storage]
    │
    ▼
[Refresh dropdown UI]
```

### Key Data Flows

1. **Local-first with cloud backup:** All prompt CRUD happens locally first, sync triggered asynchronously. Extension remains functional offline.

2. **OAuth via chrome.identity:** Extension uses Chrome's built-in identity API for OAuth, avoiding popup window issues. Tokens stored in chrome.storage.local.

3. **Realtime team sync:** Team prompts subscribed via Supabase Realtime. Changes broadcast to all connected clients (Extension + Web App).

4. **Payment webhook handling:** Payment events (Stripe/LemonSqueezy) processed in Supabase Edge Function, subscription status updated in database, broadcast to clients.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single Supabase project, no edge function scaling needed. Local-first sync handles most load. |
| 1k-100k users | Add sync queue (background job) to batch cloud sync operations. Consider Supabase connection pooling. Add CDN for Web App static assets. |
| 100k+ users | Migrate sync to dedicated worker service (not Edge Function). Add Redis for realtime subscription management. Consider database read replicas for heavy query loads. |

### Scaling Priorities

1. **First bottleneck:** Sync operations in service worker. Service worker may terminate during long sync. Solution: Use offscreen document for sync operations (already implemented for local folder sync), or migrate sync to Edge Function.

2. **Second bottleneck:** Realtime subscriptions per team. Supabase limits realtime connections per project. Solution: Batch realtime updates, or implement custom websocket server for high-volume teams.

## Anti-Patterns

### Anti-Pattern 1: Direct API Calls from Content Script

**What people do:** Make Supabase API calls directly from content script.

**Why it's wrong:** Content scripts run in untrusted page context, API keys exposed, CSP restrictions may apply.

**Do this instead:** Route all API calls through service worker via chrome.runtime.sendMessage. Service worker handles authentication and API calls in isolated context.

### Anti-Pattern 2: Storing API Keys in Extension Code

**What people do:** Hardcode Supabase anon key in background.ts.

**Why it's wrong:** Keys visible in extension source, can be extracted. anon key is safe to expose but service_role key must never be in extension.

**Do this instead:** Use Supabase anon key (safe for client-side). For privileged operations, use Edge Functions with service_role key (server-side only).

### Anti-Pattern 3: Sync on Every Local Change

**What people do:** Trigger cloud sync immediately after every addPrompt/updatePrompt.

**Why it's wrong:** Excessive API calls, service worker may terminate before sync completes, poor offline experience.

**Do this instead:** Debounce sync (current pattern for local folder sync), batch changes, trigger sync on explicit action or periodic interval. Use existing sync-manager.ts patterns.

### Anti-Pattern 4: Separate Data Models for Extension vs Cloud

**What people do:** Define Prompt type differently in extension and web app.

**Why it's wrong:** Type mismatches cause sync failures, duplicate code, inconsistent validation.

**Do this instead:** Use shared packages/database for schema, packages/types for TypeScript definitions. Single source of truth.

## Integration Points

### Existing Extension Modifications

| Component | Current | Modification |
|-----------|---------|--------------|
| service-worker.ts | Storage operations | Add auth handlers, cloud sync, realtime subscriptions |
| store.ts | Local-only CRUD | Add cloud sync trigger after saveToStorage |
| messages.ts | 25 message types | Add AUTH_START, AUTH_SUCCESS, AUTH_FAILED, CLOUD_SYNC, REALTIME_UPDATE |
| types.ts | Local StorageSchema | Add CloudPrompt, CloudCategory, Team types |
| manifest.json | Current permissions | Add "identity" permission for OAuth |

### New Extension Components

| Component | Purpose | Location |
|-----------|---------|----------|
| auth-handler.ts | OAuth flow management | background/ |
| cloud-sync.ts | Cloud sync coordination | background/ |
| supabase-client.ts | Supabase client for extension | lib/ |
| auth-context.ts | Auth state for UI | lib/ |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | chrome.identity.launchWebAuthFlow + PKCE | Redirect URL: chrome.identity.getRedirectURL() |
| Supabase Database | Drizzle ORM + RLS policies | Shared schema in packages/database |
| Supabase Realtime | Subscribe in service worker | Broadcast changes to content scripts |
| Supabase Storage | Image storage for shared prompts | Replace local folder storage for team prompts |
| Stripe/LemonSqueezy | Webhook to Edge Function | Subscription status stored in database |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Content Script ↔ Service Worker | chrome.runtime.sendMessage | Existing pattern, extend with auth/cloud messages |
| Popup ↔ Service Worker | chrome.runtime.sendMessage | Existing pattern, add auth state queries |
| Extension ↔ Web App | Shared packages + Supabase Realtime | Data synchronized via cloud, not direct messaging |
| Web App ↔ Backend | tRPC + Supabase client | Type-safe procedures, browser client |

## Migration Strategy

### Phase 1: Foundation (Authentication + Cloud Storage)

**Build Order:**
1. `packages/database` - Schema and types
2. `packages/types` - Shared TypeScript definitions
3. `extension/src/lib/supabase-client.ts` - Extension client
4. `extension/src/background/auth-handler.ts` - OAuth flow
5. `supabase/migrations/` - Database setup
6. `extension/src/background/cloud-sync.ts` - Sync logic

**Why this order:** Database schema defines data contracts. Types package enables shared validation. Extension client connects to backend. Auth enables user identity. Migrations create database structure. Sync brings data together.

### Phase 2: Team Features

**Build Order:**
1. `supabase/migrations/002_teams.sql` - Team schema
2. `packages/api/src/routers/team.ts` - Team API
3. `web-app/src/app/(dashboard)/teams/` - Team management UI
4. `extension/src/background/realtime-handler.ts` - Realtime subscriptions
5. `extension/src/lib/team-context.ts` - Team state for UI

**Why this order:** Schema first for RLS policies. API procedures define operations. Web UI for team creation/management. Realtime for live sync. Extension context for team prompt access.

### Phase 3: Payment Integration

**Build Order:**
1. `supabase/migrations/005_subscriptions.sql` - Subscription schema
2. `supabase/functions/payment-webhook/` - Webhook handler
3. `packages/api/src/routers/subscription.ts` - Subscription API
4. `web-app/src/app/(dashboard)/subscription/` - Subscription UI
5. `web-app/src/components/subscription/PayButton.tsx` - Payment trigger

**Why this order:** Schema tracks subscription state. Edge Function processes webhooks securely. API provides status queries. UI shows subscription management. PayButton integrates with payment provider.

## Sources

- Chrome Extension OAuth patterns: GitHub repos `akoskm/vite-react-tailwindcss-browser-extension-supabase`, `CedarCove/fullstack-monorepo-starter`
- Supabase Chrome Extension integration: Supabase client with chrome.storage.local as storage adapter
- tRPC + Supabase pattern: CedarCove/fullstack-monorepo-starter monorepo structure
- Drizzle ORM schema: packages/database/src/schema.ts pattern from CedarCove monorepo
- Row-level security: Supabase RLS patterns for team ownership model

---
*Architecture research for: Chrome Extension + Web App + Backend Integration (v2.0)*
*Researched: 2026-05-07*