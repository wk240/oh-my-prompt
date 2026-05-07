# Stack Research: Web App + Team Collaboration

**Milestone:** v2.0 网络版 + 团队协作
**Domain:** Chrome Extension + Web App + Backend Services
**Researched:** 2026-05-07
**Confidence:** HIGH (well-established stack), MEDIUM (Chinese payment integration)

---

## 1. Recommended Stack Overview

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                               │
├─────────────────────────┬───────────────────────────────────────────┤
│   Chrome Extension      │           Web App (Next.js)               │
│   (Existing)            │           (New)                           │
│   - Content Script      │           - Dashboard                     │
│   - Service Worker      │           - Team Management               │
│   - Popup UI            │           - Subscription Management       │
│   - Zustand Store       │           - React Query + Zustand         │
└─────────────────────────┴───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND LAYER (Supabase)                      │
├─────────────────────────────────────────────────────────────────────┤
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│   │   Auth      │  │  Database   │  │   Storage   │                │
│   │  (GoTrue)   │  │ (PostgreSQL)│  │   (S3-like) │                │
│   └─────────────┘  └─────────────┘  └─────────────┘                │
│                                                                      │
│   ┌─────────────┐  ┌─────────────┐                                 │
│   │  Realtime   │  │  Edge       │                                 │
│   │  (WebSocket)│  │  Functions  │                                 │
│   └─────────────┘  └─────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PAYMENT LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│   ┌─────────────────────┐     ┌─────────────────────┐              │
│   │   Stripe            │     │   WeChat/Alipay     │              │
│   │   (International)   │     │   (via Stripe or   │              │
│   │   - Subscriptions   │     │    aggregator)     │              │
│   │   - Webhooks        │     │                     │              │
│   └─────────────────────┘     └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Technologies

### 2.1 Web Application

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.x | Full-stack web framework | App Router for SSR/SSG, built-in API routes, excellent DX, Vercel deployment, TypeScript-first |
| React | 19.x | UI library | Consistent with existing Extension stack, Server Components for performance |
| TypeScript | 5.x | Type safety | Consistent with existing codebase, end-to-end type safety |
| Tailwind CSS | 3.x | Styling | Consistent with existing Extension popup, rapid UI development |
| Zustand | 5.x | Client state | Consistent with Extension, lightweight, simple API |
| TanStack Query | 5.x | Server state | Caching, synchronization, optimistic updates for team collaboration |

**Why Next.js over alternatives:**
- Vite SPA: No SSR, worse SEO for public landing pages, no API routes
- Remix: Smaller ecosystem, less familiar
- Nuxt (Vue): Inconsistent with existing React Extension codebase

### 2.2 Backend Platform

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Supabase | 2.105.x | Backend-as-a-Service | All-in-one: Auth, Database, Storage, Realtime, Edge Functions |
| PostgreSQL | 15.x | Primary database | Via Supabase, excellent for relational data (teams, permissions) |
| Prisma | 7.8.x | ORM (optional) | Type-safe queries, migrations; can also use Supabase client directly |

**Why Supabase over alternatives:**
- Firebase: NoSQL limits team/permission queries, vendor lock-in, expensive at scale
- AWS Amplify: Complex setup, steeper learning curve
- Custom Node.js backend: More code to maintain, need separate auth, storage, realtime services
- Convex: Newer, smaller ecosystem

### 2.3 Authentication

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Supabase Auth | (via SDK) | Authentication | Built into Supabase, supports Google OAuth, email/password, magic links |
| @supabase/ssr | 0.10.x | SSR auth helpers | Cookie-based auth for Next.js App Router |

**Extension Auth Flow:**
1. User initiates login in Extension → Opens Web App in new tab
2. Web App handles OAuth (Google) or email/password
3. On success, store session token in `chrome.storage.local`
4. Extension uses stored token for API calls

### 2.4 Payment Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Stripe | 22.x | International payments | Industry standard, excellent subscription support, webhooks |
| Stripe Checkout | (via API) | Hosted payment page | PCI compliance, supports WeChat Pay & Alipay for international |

**Chinese Payment Strategy:**

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Stripe (WeChat/Alipay) | Unified system, no extra integration | Requires international business setup | **Primary** for MVP |
| Manual bank transfer | No fees, direct | Manual verification, poor UX | Fallback option |
| Chinese aggregator (Ping++) | Local expertise | Requires ICP license, extra cost | Future consideration |

**Important:** Direct WeChat Pay / Alipay integration requires:
- Chinese business license (营业执照)
- ICP filing
- Individual accounts not supported for SaaS

### 2.5 Real-time Collaboration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Supabase Realtime | (via SDK) | WebSocket subscriptions | Built into Supabase, PostgreSQL-based, automatic sync |

**Use Cases:**
- Team prompt library updates (real-time sync)
- Presence indicators (who's editing)
- Conflict resolution (optimistic updates + server merge)

### 2.6 Cloud Storage

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Supabase Storage | (via SDK) | File storage | Built into Supabase, S3-compatible API, CDN-backed |
| IndexedDB | (browser) | Extension local cache | Already used for folder handle persistence |

**Storage Schema:**
- `prompt-images/` - User uploaded images for vision API
- `team-avatars/` - Team profile images
- `exports/` - Generated export files (temporary)

---

## 3. Supporting Libraries

### 3.1 Web App Specific

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-* | ^1.x | UI primitives | Consistent with Extension popup |
| lucide-react | ^1.x | Icons | Consistent with Extension |
| react-hook-form | ^7.x | Form handling | Subscription forms, team settings |
| zod | ^4.x | Schema validation | API input validation, form validation |
| date-fns | ^4.x | Date handling | Subscription expiry, billing cycles |

### 3.2 API Layer

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | 2.105.x | Supabase client | All backend operations |
| @supabase/ssr | 0.10.x | SSR auth | Next.js server components |
| stripe | 22.x | Stripe Node SDK | Server-side payment processing |

### 3.3 Extension Integration

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| webextension-polyfill | ^0.12.x | Cross-browser API | Future Firefox support |
| (existing) | - | Chrome APIs | Manifest V3 compatible |

---

## 4. Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase CLI | Local development, migrations | `supabase init`, `supabase start` |
| Prisma Studio | Database GUI | Optional if using Prisma |
| Stripe CLI | Webhook testing | `stripe listen --forward-to` |

---

## 5. Installation

### 5.1 Web App (New)

```bash
# Create Next.js app in apps/web/
npx create-next-app@latest --typescript --tailwind --app

# Core dependencies
npm install @supabase/supabase-js @supabase/ssr stripe zod

# UI and utilities
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install lucide-react react-hook-form @hookform/resolvers
npm install date-fns

# State management
npm install zustand @tanstack/react-query
```

### 5.2 Shared Package (New)

```bash
# Create shared package for types
mkdir -p packages/shared
# Define shared types: Prompt, Category, Team, User, etc.
```

### 5.3 Extension Updates

```bash
# Add Supabase client for Extension
npm install @supabase/supabase-js
```

---

## 6. Alternatives Considered

### Backend Platform

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Supabase | Firebase | If team has Firebase expertise, prefer NoSQL for simple data |
| Supabase | Custom Node.js + PostgreSQL | If need full control, have DevOps resources, expect >100K users |
| Supabase | Convex | If want real-time-first, simpler API, smaller scale |

### ORM

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Prisma | Drizzle | If prefer SQL-like API, smaller bundle, edge runtime |
| Prisma | Supabase client only | If want simpler setup, fewer dependencies |
| Prisma | Kysely | If prefer raw SQL with type safety |

### Authentication

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Supabase Auth | Clerk | If want drop-in UI components, simpler integration |
| Supabase Auth | Auth.js (NextAuth) | If want self-hosted, more provider options |
| Supabase Auth | AWS Cognito | If already in AWS ecosystem |

### Payment

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Stripe | Paddle | If want to outsource tax compliance (Merchant of Record) |
| Stripe | Lemon Squeezy | If want simpler EU focus, Merchant of Record |
| Stripe | Polar | If want open-source alternative, EU-based |

---

## 7. What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Express.js backend | Supabase handles everything, reduces code | Supabase Edge Functions for custom logic |
| Socket.io | Supabase has built-in realtime | Supabase Realtime |
| Redux | Zustand already used, simpler for this scope | Zustand + TanStack Query |
| Firebase Realtime Database | NoSQL limits team permission queries | Supabase PostgreSQL |
| NextAuth/Auth.js | More setup, separate from Supabase | Supabase Auth |
| AWS services | Overkill complexity for this stage | Supabase (managed) |
| Chinese payment aggregators | Requires ICP license, business license | Stripe WeChat/Alipay support |

---

## 8. Stack Patterns by Variant

### Minimum Viable Product (MVP)

- Use Supabase only (no separate Next.js API routes)
- Stripe Checkout (hosted) instead of embedded
- Manual team invitation (no email service)
- Basic real-time (Supabase subscriptions only)

### Scale-Up (1000+ users)

- Add Next.js API routes for custom business logic
- Stripe Billing Portal for self-service
- Email service (Resend, SendGrid) for notifications
- Background jobs (Inngest, Trigger.dev) for sync tasks

### Enterprise (10000+ users)

- Add caching layer (Upstash Redis)
- CDN for static assets (Cloudflare)
- Rate limiting (Upstash)
- Monitoring (Sentry, LogSnag)

---

## 9. Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.x | React 19.x | App Router requires React 19 |
| Supabase JS 2.x | Next.js 13+ | Use @supabase/ssr for App Router |
| Stripe 22.x | Node.js 18+ | Server-side only |
| Prisma 7.x | Node.js 18+ | Use with PostgreSQL 15 |
| TanStack Query 5.x | React 18+ | Works with React 19 |

---

## 10. Integration with Existing Extension

### 10.1 Shared Types

Create `packages/shared` for type definitions used by both Extension and Web App:

```typescript
// packages/shared/src/types.ts
export interface Prompt { id: string; title: string; content: string; ... }
export interface Category { id: string; name: string; ... }
export interface Team { id: string; name: string; ownerId: string; ... }
export interface User { id: string; email: string; ... }
```

### 10.2 Authentication Bridge

```typescript
// Extension: background/service-worker.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Store session from Web App
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_SESSION') {
    chrome.storage.local.set({ session: msg.session })
  }
})

// Get session for API calls
async function getSession() {
  const { session } = await chrome.storage.local.get('session')
  return session
}
```

### 10.3 Data Synchronization

```typescript
// Sync local prompts to cloud on login
async function syncToCloud() {
  const localData = await chrome.storage.local.get('prompt_script_data')
  const session = await getSession()

  if (session) {
    await supabase.from('prompts').upsert(
      localData.prompts.map(p => ({ ...p, userId: session.user.id }))
    )
  }
}
```

---

## 11. Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Web App stack (Next.js + React) | HIGH | Well-established, team familiarity |
| Backend (Supabase) | HIGH | Proven for similar SaaS apps, excellent DX |
| Authentication | HIGH | Supabase Auth is mature, Google OAuth standard |
| Real-time sync | HIGH | Supabase Realtime is battle-tested |
| Stripe integration | HIGH | Industry standard, excellent docs |
| Chinese payments | MEDIUM | Stripe supports WeChat/Alipay, but verify business requirements |
| Extension integration | HIGH | Clear patterns for auth bridge and sync |

---

## 12. Sources

- npm registry (package versions) — Current versions verified 2026-05-07
- Supabase documentation — Auth, Storage, Realtime patterns
- Stripe documentation — Subscriptions, webhooks, payment methods
- Next.js App Router documentation — SSR, authentication patterns
- Chrome Extension Manifest V3 documentation — Service worker patterns

---

*Stack research for: Web App + Team Collaboration (v2.0)*
*Researched: 2026-05-07*