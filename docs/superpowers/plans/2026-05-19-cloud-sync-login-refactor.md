# Cloud Sync Login Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Extension login by redirecting to Web App, enabling session sharing and removing AuthModal complexity.

**Architecture:** Extension login buttons open Web App `/auth/extension/sync` directly. If user not logged in, Web App redirects to `/auth/login?redirect=/auth/extension/sync&source=extension`. After OAuth, user returns to sync page where tokens are set in URL hash for Extension content script to extract.

**Tech Stack:** Chrome Extension (Manifest V3), Next.js 16 App Router, Supabase Auth

---

## File Structure

**Extension (packages/extension/src/):**
- `sidepanel/components/CloudSync/AuthModal.tsx` — DELETE (no longer needed)
- `sidepanel/components/CloudSync/SyncStatusCard.tsx` — MODIFY (login button opens Web URL)
- `sidepanel/settings/BackupSection.tsx` — MODIFY (remove AuthModal import/state)
- `lib/cloud-sync/auth-service.ts` — OPTIONAL cleanup (keep `syncFromWebApp`, `signInWithOAuth` unused but harmless)

**Web App (packages/web-app/app/auth/):**
- `extension/sync/route.ts` — DELETE
- `extension/sync/page.tsx` — CREATE (client-side redirect logic)
- `login/page.tsx` — MODIFY (support redirect param, source indicator)
- `callback/route.ts` — MODIFY (pass redirect through OAuth flow)

---

## Task 1: Create Web App Sync Page (client-side)

**Files:**
- Create: `packages/web-app/app/auth/extension/sync/page.tsx`
- Delete: `packages/web-app/app/auth/extension/sync/route.ts` (after Task 1 complete)

- [ ] **Step 1: Create the sync page component**

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Extension Logo SVG
const ExtensionLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-16 h-16 opacity-80">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M9 12l2 2 4-4" stroke="#81ecff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

// Spinner component
const Spinner = () => (
  <svg className="w-8 h-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2"/>
    <path d="M12 2a10 10 0 0 1 10 10" stroke="#81ecff" strokeWidth="3" strokeLinecap="round"/>
  </svg>
)

// Check icon
const CheckIcon = () => (
  <svg className="w-12 h-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
)

// Alert icon
const AlertIcon = () => (
  <svg className="w-12 h-12 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v4M12 16h.01"/>
  </svg>
)

export default function ExtensionSyncPage() {
  const supabase = createClient()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        // 未登录 → 重定向到login
        const currentPath = window.location.pathname
        router.push(`/auth/login?redirect=${encodeURIComponent(currentPath)}&source=extension`)
        return
      }

      // 已登录 → 设置tokens in hash
      const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in
      const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&expires_at=${expiresAt}&token_type=bearer`

      window.location.hash = hash
      setStatus('success')

      console.log('[Extension Sync] Tokens set in hash')
    } catch (err) {
      console.error('[Extension Sync] Session check failed:', err)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e10] flex flex-col justify-center items-center p-8">
      {/* Page identifier */}
      <ExtensionLogo />

      {/* Loading state */}
      {status === 'loading' && (
        <div className="text-center mt-6">
          <Spinner />
          <h1 className="text-xl font-medium text-white mt-4 mb-2">
            正在同步云端账户
          </h1>
          <p className="text-gray-400 text-sm">
            请稍候，完成后请返回扩展侧边栏
          </p>
        </div>
      )}

      {/* Success state */}
      {status === 'success' && (
        <div className="text-center mt-6">
          <CheckIcon />
          <h1 className="text-xl font-medium text-white mt-4 mb-2">
            同步成功
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            您的账户已同步到Chrome扩展，请返回侧边栏开始使用云端同步功能
          </p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            关闭此页面
          </button>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="text-center mt-6">
          <AlertIcon />
          <h1 className="text-xl font-medium text-white mt-4 mb-2">
            同步失败
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            请返回扩展侧边栏重新尝试，或检查网络连接
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            重新尝试
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Delete the old route.ts file**

```bash
rm packages/web-app/app/auth/extension/sync/route.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/auth/extension/sync/page.tsx
git add packages/web-app/app/auth/extension/sync/route.ts
git commit -m "refactor(auth): replace sync route with client-side page for redirect logic"
```

---

## Task 2: Modify Login Page (redirect support)

**Files:**
- Modify: `packages/web-app/app/auth/login/page.tsx:68-71`

- [ ] **Step 1: Add redirect parameter handling**

Replace the redirect logic in `handlePasswordLogin` (line 68-71):

```tsx
// Original:
if (data.user) {
  router.push('/dashboard')
}

// New:
if (data.user) {
  const redirect = searchParams.get('redirect')
  router.push(redirect || '/dashboard')
}
```

- [ ] **Step 2: Add redirect parameter to OAuth login**

Replace the `handleOAuthLogin` function (line 80-88):

```tsx
const handleOAuthLogin = async (provider: 'github') => {
  setLoading(provider)
  const redirect = searchParams.get('redirect')
  const source = searchParams.get('source')

  // Build callback URL with redirect parameter
  const callbackUrl = redirect
    ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}&source=${source || ''}`
    : `${window.location.origin}/auth/callback`

  await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl,
    },
  })
}
```

- [ ] **Step 3: Add source indicator UI**

Add before the GitHub OAuth button (around line 127), after the error message block:

```tsx
{/* Extension source indicator */}
{searchParams.get('source') === 'extension' && (
  <div className="mb-4 p-3 bg-primary-container/30 rounded-md border border-primary/20">
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-primary">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <span className="text-sm text-primary font-medium">
        为Chrome扩展登录以启用云端同步
      </span>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify the page compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/auth/login/page.tsx
git commit -m "feat(auth): support redirect param and extension source indicator in login"
```

---

## Task 3: Modify OAuth Callback (pass redirect)

**Files:**
- Modify: `packages/web-app/app/auth/callback/route.ts:24-27, 86-87`

- [ ] **Step 1: Extract redirect and source params at the top**

Add after line 9 (after `const isExtensionAuth = ...`):

```tsx
const redirectParam = searchParams.get('redirect')
const sourceParam = searchParams.get('source')
```

- [ ] **Step 2: Modify error redirect to preserve params**

Replace line 24-27 (error redirect):

```tsx
// Original:
if (error) {
  console.error('[OAuth Callback] OAuth error:', error, errorDescription)
  return NextResponse.redirect(
    new URL(`/?auth_error=${error}&error_description=${errorDescription}`, request.url)
  )
}

// New:
if (error) {
  console.error('[OAuth Callback] OAuth error:', error, errorDescription)
  const errorUrl = new URL('/', request.url)
  errorUrl.searchParams.set('auth_error', error)
  if (errorDescription) errorUrl.searchParams.set('error_description', errorDescription)
  return NextResponse.redirect(errorUrl)
}
```

- [ ] **Step 3: Modify success redirect for regular auth**

Replace line 86-87 (regular web-app auth redirect):

```tsx
// Original:
console.log('[OAuth Callback] Regular web-app auth, redirecting to dashboard')
return response

// New:
console.log('[OAuth Callback] Regular web-app auth, redirecting to:', redirectParam || '/dashboard')
if (redirectParam) {
  const redirectUrl = new URL(redirectParam, request.url)
  if (sourceParam) redirectUrl.searchParams.set('source', sourceParam)
  return NextResponse.redirect(redirectUrl)
}
return response
```

- [ ] **Step 4: Verify the route compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/auth/callback/route.ts
git commit -m "feat(auth): pass redirect and source params through OAuth callback"
```

---

## Task 4: Modify Extension SyncStatusCard (open Web URL)

**Files:**
- Modify: `packages/extension/src/sidepanel/components/CloudSync/SyncStatusCard.tsx:43-45`

- [ ] **Step 1: Import WEB_APP_URL**

Add at the top of the file (line 2):

```tsx
import { WEB_APP_URL } from '@/lib/config'
```

- [ ] **Step 2: Modify login button to open Web URL**

Replace the login button (line 43-45):

```tsx
// Original:
<Button onClick={onLogin} className="w-full">
  登录
</Button>

// New:
<Button
  onClick={() => chrome.tabs.create({ url: `${WEB_APP_URL}/auth/extension/sync` })}
  className="w-full"
>
  登录以启用云端同步
</Button>
```

- [ ] **Step 3: Remove unused onLogin prop from interface**

Remove `onLogin` from `SyncStatusCardProps` interface (line 9):

```tsx
// Remove this line:
onLogin: () => void
```

- [ ] **Step 4: Update function signature**

Remove `onLogin` from function parameters (line 29):

```tsx
// Original:
export function SyncStatusCard({
  authState,
  loading,
  syncing,
  onLogin,
  onUpload,
  onDownload,
  onLogout
}: SyncStatusCardProps)

// New:
export function SyncStatusCard({
  authState,
  loading,
  syncing,
  onUpload,
  onDownload,
  onLogout
}: SyncStatusCardProps)
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors related to SyncStatusCard

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/sidepanel/components/CloudSync/SyncStatusCard.tsx
git commit -m "refactor(extension): login button opens Web App sync URL directly"
```

---

## Task 5: Modify Extension BackupSection (remove AuthModal)

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/BackupSection.tsx:7, 66, 140-142, 605-610`

- [ ] **Step 1: Remove AuthModal import**

Delete line 7:

```tsx
// Remove:
import { AuthModal } from '@/sidepanel/components/CloudSync/AuthModal'
```

- [ ] **Step 2: Remove authModalOpen state**

Delete line 66:

```tsx
// Remove:
const [authModalOpen, setAuthModalOpen] = useState(false)
```

- [ ] **Step 3: Modify handleLogin to open Web URL directly**

Replace lines 140-142:

```tsx
// Original:
const handleLogin = () => {
  setAuthModalOpen(true)
}

// New:
const handleLogin = () => {
  const WEB_APP_URL = 'http://localhost:3000'
  chrome.tabs.create({ url: `${WEB_APP_URL}/auth/extension/sync` })
}
```

Note: Import WEB_APP_URL at the top instead of inline (see Step 6).

- [ ] **Step 4: Remove AuthModal JSX**

Delete lines 605-610:

```tsx
// Remove:
<AuthModal
  open={authModalOpen}
  onClose={() => setAuthModalOpen(false)}
  onSuccess={handleAuthSuccess}
/>
```

- [ ] **Step 5: Remove handleAuthSuccess function**

Delete lines 147-150:

```tsx
// Remove:
const handleAuthSuccess = async () => {
  setSuccess('登录成功')
  await loadBackupStatus()
}
```

- [ ] **Step 6: Add WEB_APP_URL import**

Add after the other imports (around line 18):

```tsx
import { WEB_APP_URL } from '@/lib/config'
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors related to BackupSection

- [ ] **Step 8: Commit**

```bash
git add packages/extension/src/sidepanel/settings/BackupSection.tsx
git commit -m "refactor(extension): remove AuthModal, login opens Web App URL"
```

---

## Task 6: Delete Extension AuthModal component

**Files:**
- Delete: `packages/extension/src/sidepanel/components/CloudSync/AuthModal.tsx`

- [ ] **Step 1: Delete the AuthModal file**

```bash
rm packages/extension/src/sidepanel/components/CloudSync/AuthModal.tsx
```

- [ ] **Step 2: Verify no remaining imports**

Run: `cd packages/extension && grep -r "AuthModal" src/`
Expected: No results (except potentially in git history)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/sidepanel/components/CloudSync/AuthModal.tsx
git commit -m "refactor(extension): delete AuthModal component, login via Web App"
```

---

## Task 7: Optional cleanup in auth-service.ts

**Files:**
- Modify: `packages/extension/src/lib/cloud-sync/auth-service.ts:160-188`

This task is optional - `signInWithOAuth` is no longer used but harmless to keep.

- [ ] **Step 1: Add deprecation comment to signInWithOAuth**

Add comment above line 160:

```tsx
/**
 * @deprecated Not used in new login flow. Extension now opens Web App directly.
 * Kept for backward compatibility and potential future use.
 */
export async function signInWithOAuth(...)
```

- [ ] **Step 2: Commit (optional)**

```bash
git add packages/extension/src/lib/cloud-sync/auth-service.ts
git commit -m "docs(auth): mark signInWithOAuth as deprecated"
```

---

## Task 8: Manual Testing

- [ ] **Step 1: Test unauthenticated user first login**

1. Run `npm run dev` (Extension dev server)
2. Run `npm run web:dev` (Web App dev server)
3. Load extension in Chrome from `packages/extension/dist/`
4. Open extension sidepanel → Settings → Sync & Backup
5. Click "登录以启用云端同步"
6. Verify: Opens new tab with Web App sync page
7. Verify: Redirects to login page with extension source indicator
8. Complete GitHub OAuth
9. Verify: Returns to sync page with "同步成功"
10. Close tab, return to extension
11. Verify: Extension shows logged-in state

- [ ] **Step 2: Test authenticated user sync**

1. Ensure logged in via previous test
2. Click login button again in extension
3. Verify: Opens sync page, shows "同步成功" immediately (no OAuth)
4. Verify: Extension maintains logged-in state

- [ ] **Step 3: Test session expiry scenario**

1. Manually clear extension storage or wait for token expiry
2. Click login button
3. Verify: Web sync page redirects to login
4. Complete OAuth again
5. Verify: Returns to sync success

- [ ] **Step 4: Test user closes login tab mid-flow**

1. Click login button in extension
2. Close the Web App tab before completing OAuth
3. Verify: Extension remains in "not logged in" state (no error)

- [ ] **Step 5: Test OAuth failure**

1. Simulate OAuth failure (reject authorization on GitHub)
2. Verify: Shows error page on Web App
3. Verify: Extension remains not logged in

---

## Self-Review Checklist

**1. Spec coverage:**

| Requirement | Task |
|-------------|------|
| Remove AuthModal.tsx | Task 6 |
| SyncStatusCard opens Web URL | Task 4 |
| BackupSection removes AuthModal | Task 5 |
| Create sync/page.tsx | Task 1 |
| Login page supports redirect | Task 2 |
| Login page shows source indicator | Task 2 |
| Callback passes redirect through | Task 3 |
| UX: Extension logo on sync page | Task 1 |
| UX: Success/close button | Task 1 |
| UX: Loading spinner | Task 1 |
| UX: Error/retry button | Task 1 |

All requirements covered.

**2. Placeholder scan:**

- No "TBD", "TODO", "implement later"
- No "Add appropriate error handling"
- No "Write tests for the above"
- All code shown inline

**3. Type consistency:**

- `WEB_APP_URL` imported from `@/lib/config` consistently
- `SyncStatusCardProps.onLogin` removed from interface and function
- Redirect param type: string (URLSearchParams.get returns string|null)

---

## Notes

- `signInWithOAuth` in auth-service.ts is deprecated but kept for backward compatibility
- The content script hash extraction mechanism remains unchanged
- Extension callback route (`/auth/extension/callback/route.ts`) is no longer the primary path but kept for legacy OAuth flows
- Manual testing is essential - OAuth flows are hard to unit test