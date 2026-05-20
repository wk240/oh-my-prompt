# Auto Sync Web Session to Extension

**Date:** 2026-05-14
**Status:** Approved

## Problem

When extension sidepanel opens and web app is logged in (but extension isn't), the current behavior shows a manual sync prompt: "检测到Web端已登录（{email}）同步到扩展". Users must click the sync button, then manually close the sync tab after completion.

This creates unnecessary friction for a common scenario: user logs in on web app, then opens extension sidepanel expecting seamless login state.

## Solution

Automatically sync web session to extension when:
- Sidepanel opens
- Extension is NOT logged in (`!cloudLoggedIn`)
- Web app IS logged in (`checkWebAppSession()` returns `hasSession: true`)

The sync happens in a background tab that auto-closes after completion. Sidepanel listens for completion message and refreshes status.

## Changes

### 1. UnifiedSyncSection.tsx — Auto-sync Logic

**File:** `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx`

- Remove the manual sync prompt UI block (lines 378-404)
- When `webAppSession?.hasSession` detected, automatically call `syncFromWebApp({ background: true })`
- Add `syncAttempted` state to prevent multiple tab opens during same sidepanel session
- Add `useEffect` listener for `AUTH_CALLBACK_COMPLETE` message to refresh status

```typescript
// New state
const [syncAttempted, setSyncAttempted] = useState(false)

// New message listener
useEffect(() => {
  const handleMessage = (message: { type: string; payload?: { success: boolean } }) => {
    if (message.type === 'AUTH_CALLBACK_COMPLETE' && message.payload?.success) {
      loadStatus()
      setSyncAttempted(false) // Reset for future sessions
    }
  }
  chrome.runtime.onMessage.addListener(handleMessage)
  return () => chrome.runtime.onMessage.removeListener(handleMessage)
}, [loadStatus])

// Auto-sync when web session detected (replace manual sync prompt)
useEffect(() => {
  if (webAppSession?.hasSession && !syncAttempted && !status?.cloudLoggedIn) {
    setSyncAttempted(true)
    syncFromWebApp({ background: true })
  }
}, [webAppSession, syncAttempted, status?.cloudLoggedIn])
```

### 2. auth-callback.ts — Auto-close for Sync Route

**File:** `packages/extension/src/content/auth-callback.ts`

- Detect route type by checking URL pathname
- For `/auth/extension/sync*`: auto-close window after successful token save
- For `/auth/extension/callback*`: keep existing success page with manual close button

```typescript
// After token save, check route and auto-close if sync route
const isSyncRoute = window.location.pathname.includes('/auth/extension/sync')

if (isSyncRoute) {
  // Auto-close after 500ms delay (allow message to send)
  setTimeout(() => window.close(), 500)
} else {
  // Show success page with close button (OAuth callback)
  createStyledPage({ ... })
}
```

### 3. syncFromWebApp() — Background Tab Option

**File:** `packages/extension/src/lib/cloud-sync/auth-service.ts`

- Add `background?: boolean` parameter to function signature
- When `background: true`, open tab with `active: false`

```typescript
export async function syncFromWebApp(options?: { background?: boolean }): Promise<{ success: boolean }> {
  try {
    chrome.tabs.create({
      url: `${WEB_APP_URL}/auth/extension/sync`,
      active: !options?.background // Background if specified
    })
    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] syncFromWebApp failed:', error)
    return { success: false }
  }
}
```

## Flow

```
Sidepanel opens
    ↓
loadStatus() → !cloudLoggedIn
    ↓
checkWebAppSession() → hasSession: true
    ↓
Auto-call syncFromWebApp({ background: true })
    ↓
Background tab opens to /auth/extension/sync
    ↓
auth-callback.ts extracts tokens, saves to storage
    ↓
Send AUTH_CALLBACK_COMPLETE message
    ↓
Sidepanel receives message, calls loadStatus()
    ↓
Status shows logged_in, sync tab auto-closes
```

## Edge Cases

1. **Sync already attempted:** `syncAttempted` state prevents re-opening tab on every status refresh
2. **Sync fails:** Sidepanel won't receive success message, status remains unchanged
3. **User closes sidepanel during sync:** Message listener cleaned up, sync tab remains open (user can close manually)
4. **Web session expires:** `checkWebAppSession()` returns `hasSession: false`, no auto-sync triggered

## Files Changed

- `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx`
- `packages/extension/src/content/auth-callback.ts`
- `packages/extension/src/lib/cloud-sync/auth-service.ts`