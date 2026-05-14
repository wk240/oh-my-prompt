# Auto Sync Web Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically sync web app session to extension when sidepanel opens, eliminating manual sync button click.

**Architecture:** When sidepanel opens and detects web app login (but extension not logged in), auto-open background sync tab, extract tokens via content script, auto-close tab, refresh sidepanel status via message listener.

**Tech Stack:** Chrome Extension (Manifest V3), React, TypeScript, chrome.tabs API, chrome.runtime messaging

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `packages/extension/src/lib/cloud-sync/auth-service.ts:49-58` | Modify | Add background parameter to syncFromWebApp |
| `packages/extension/src/content/auth-callback.ts:195-200` | Modify | Auto-close window for sync route after token save |
| `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx` | Modify | Add auto-sync logic, message listener, remove manual UI |

---

### Task 1: Modify syncFromWebApp to Support Background Tab

**Files:**
- Modify: `packages/extension/src/lib/cloud-sync/auth-service.ts:49-58`

- [ ] **Step 1: Add background parameter to syncFromWebApp function**

Replace the function signature and implementation at lines 49-58:

```typescript
/**
 * Open Web App sync page to transfer session to Extension.
 *
 * Flow:
 * 1. Extension opens this URL in new tab (foreground or background)
 * 2. Web App detects existing session, returns tokens in hash
 * 3. Extension content script extracts tokens and saves to chrome.storage
 * 4. For sync route: tab auto-closes after success
 *
 * @param options.background - If true, open tab in background (active: false)
 * @returns Success status
 */
export async function syncFromWebApp(options?: { background?: boolean }): Promise<{ success: boolean }> {
  try {
    // Open sync page in new tab (background if specified)
    chrome.tabs.create({
      url: `${WEB_APP_URL}/auth/extension/sync`,
      active: !options?.background
    })
    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] syncFromWebApp failed:', error)
    return { success: false }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/lib/cloud-sync/auth-service.ts
git commit -m "feat: add background option to syncFromWebApp function"
```

---

### Task 2: Auto-close Sync Tab After Token Save

**Files:**
- Modify: `packages/extension/src/content/auth-callback.ts:180-204`

- [ ] **Step 1: Add route detection and conditional auto-close in extractAndSaveTokens callback**

Modify the `chrome.storage.local.set` callback around lines 183-201. Replace the `createStyledPage` call with route detection:

```typescript
chrome.storage.local.set({
  [storageKey]: sessionData
}, () => {
  console.log('[Oh My Prompt] Session saved to storage with key:', storageKey)

  // Notify background script that auth completed
  chrome.runtime.sendMessage({
    type: 'AUTH_CALLBACK_COMPLETE',
    payload: { success: true }
  }).catch(err => {
    console.warn('[Oh My Prompt] Failed to notify background:', err)
  })

  // Check route type - auto-close for sync route, show UI for callback route
  const isSyncRoute = window.location.pathname.includes('/auth/extension/sync')

  if (isSyncRoute) {
    // Auto-close after 500ms delay (allow message to send)
    setTimeout(() => {
      console.log('[Oh My Prompt] Auto-closing sync tab')
      window.close()
    }, 500)
  } else {
    // OAuth callback - show success page with manual close button
    createStyledPage({
      iconStroke: '#81ecff',
      title: '登录成功',
      description: '云端同步已激活',
      iconType: 'success'
    })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/content/auth-callback.ts
git commit -m "feat: auto-close sync tab after successful token extraction"
```

---

### Task 3: Add Auto-sync Logic in UnifiedSyncSection

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx`

- [ ] **Step 1: Add syncAttempted state after other state declarations**

Add after line 81 (after `authModalOpen` state):

```typescript
// Auto-sync state - prevent multiple sync attempts per sidepanel session
const [syncAttempted, setSyncAttempted] = useState(false)
```

- [ ] **Step 2: Add message listener for AUTH_CALLBACK_COMPLETE**

Add new useEffect after the existing `useEffect` for auto-dismiss messages (around line 132):

```typescript
// Listen for auth callback completion to refresh status after auto-sync
useEffect(() => {
  const handleMessage = (message: { type: string; payload?: { success: boolean } }) => {
    if (message.type === 'AUTH_CALLBACK_COMPLETE' && message.payload?.success) {
      console.log('[Oh My Prompt] Received AUTH_CALLBACK_COMPLETE, refreshing status')
      loadStatus()
      setSyncAttempted(false) // Reset for future sessions
    }
  }
  chrome.runtime.onMessage.addListener(handleMessage)
  return () => chrome.runtime.onMessage.removeListener(handleMessage)
}, [loadStatus])
```

- [ ] **Step 3: Add auto-sync trigger useEffect**

Add new useEffect after the message listener (around line 145):

```typescript
// Auto-sync: when web session detected but extension not logged in, trigger sync
useEffect(() => {
  if (webAppSession?.hasSession && !syncAttempted && !status?.cloudLoggedIn) {
    console.log('[Oh My Prompt] Auto-sync triggered: web logged in, extension not logged in')
    setSyncAttempted(true)
    syncFromWebApp({ background: true })
  }
}, [webAppSession, syncAttempted, status?.cloudLoggedIn])
```

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx
git commit -m "feat: add auto-sync logic when web session detected"
```

---

### Task 4: Remove Manual Sync Prompt UI

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx:377-404`

- [ ] **Step 1: Delete the manual sync prompt UI block**

Remove lines 377-404 (the entire `{/* Web App session detected - show sync prompt */}` block):

```typescript
// DELETE THIS BLOCK (lines 377-404):
            {/* Web App session detected - show sync prompt */}
            {webAppSession?.hasSession && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 mb-2">
                      检测到Web端已登录（{webAppSession.user?.email || '用户'}）
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        syncFromWebApp()
                        // Wait for sync callback, then refresh status
                        setTimeout(() => {
                          loadStatus()
                        }, 3000)
                      }}
                      className="h-8 border-blue-400 text-blue-700 hover:bg-blue-100"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      同步到扩展
                    </Button>
                  </div>
                </div>
              </div>
            )}
```

The auto-sync useEffect in Task 3 replaces this manual flow.

- [ ] **Step 2: Remove unused ArrowRightLeft import if no longer needed**

Check if `ArrowRightLeft` is still used elsewhere in the file. If not, remove from imports at line 18:

```typescript
// If ArrowRightLeft unused after removing manual sync UI, remove from imports:
import {
  Cloud,
  HardDrive,
  RefreshCw,
  Download,
  Upload,
  FolderOpen,
  AlertTriangle,
  Check,
  X,
  LogIn,
  LogOut,
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw
  // ArrowRightLeft - REMOVE if unused
} from 'lucide-react'
```

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx
git commit -m "refactor: remove manual sync prompt UI (replaced by auto-sync)"
```

---

### Task 5: Build and Manual Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Build extension**

```bash
npm run build
```

Expected: Build succeeds without TypeScript errors.

- [ ] **Step 2: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `packages/extension/dist/`
4. Or reload existing extension

- [ ] **Step 3: Test auto-sync flow**

Manual test steps:
1. Ensure web app is logged in (visit `http://localhost:3000` or `https://oh-my-prompt.com`)
2. Ensure extension is NOT logged in (clear storage or use fresh profile)
3. Open extension sidepanel
4. Expected: Background tab briefly opens to `/auth/extension/sync`, then auto-closes
5. Expected: Sidepanel shows logged-in state automatically

- [ ] **Step 4: Test edge case - already logged in**

1. Ensure extension IS logged in
2. Open sidepanel
3. Expected: No sync tab opens (auto-sync skipped)

- [ ] **Step 5: Final commit if verification passes**

```bash
git add -A
git commit -m "feat: auto-sync web session to extension on sidepanel open"
```

---

## Self-Review Checklist

- [x] Spec coverage: All 3 changes from spec covered (syncFromWebApp background, auth-callback auto-close, UnifiedSyncSection auto-sync)
- [x] No placeholders: All steps have exact code, exact commands
- [x] Type consistency: `syncFromWebApp({ background: true })` signature matches Task 1 definition
- [x] Edge cases: syncAttempted state prevents multiple opens; message listener refreshes status