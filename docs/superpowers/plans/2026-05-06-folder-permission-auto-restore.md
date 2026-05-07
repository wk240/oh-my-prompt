# Folder Permission Auto-Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-restore folder permission in Sidepanel context when opening, so user doesn't need to manually restore permission after Sidepanel closes and reopens.

**Architecture:** Add auto-permission-restore logic in SidePanelApp.tsx useEffect that runs when Sidepanel opens. The user clicking the extension icon to open Sidepanel is a valid user gesture, allowing `handle.requestPermission()` to silently authorize if the user previously granted permission.

**Tech Stack:** React 19.x, TypeScript 5.x, Chrome Extension File System Access API

---

## File Structure

| File | Change | Purpose |
|-----|--------|---------|
| `src/sidepanel/SidePanelApp.tsx` | Modify | Add permission restore logic, state, and warning banner UI |
| `src/sidepanel/index.css` | Modify | Add warning banner styles |

---

### Task 1: Add Permission Restore State and Imports

**Files:**
- Modify: `src/sidepanel/SidePanelApp.tsx:1-30` (imports section)
- Modify: `src/sidepanel/SidePanelApp.tsx:563-575` (state declarations)

- [ ] **Step 1: Add imports for permission restore functions**

Add imports after line 20 (after `queueImageLoad` import):

```typescript
import { getFolderHandle, requestFolderPermission } from '../lib/sync/indexeddb'
import { manualSync } from '../lib/sync/sync-manager'
```

- [ ] **Step 2: Add permission restore status state**

Add state after line 571 (after `visionEnabled` state):

```typescript
// Permission restore status for auto-restore on Sidepanel open
const [permissionRestoreStatus, setPermissionRestoreStatus] = useState<'idle' | 'restoring' | 'restored' | 'failed'>('idle')
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (imports and state type are valid)

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/SidePanelApp.tsx
git commit -m "feat(sidepanel): add permission restore state and imports

- Add imports for getFolderHandle, requestFolderPermission, manualSync
- Add permissionRestoreStatus state for tracking restore progress"
```

---

### Task 2: Add Auto-Restore Permission useEffect

**Files:**
- Modify: `src/sidepanel/SidePanelApp.tsx:982-1017` (after sync status check useEffect)

- [ ] **Step 1: Write the auto-restore permission useEffect**

Add new useEffect after the sync status check useEffect (around line 1000):

```typescript
// Auto-restore folder permission on Sidepanel open
// This runs when user clicks extension icon - valid user gesture for requestPermission()
useEffect(() => {
  const restorePermission = async () => {
    // Only restore if folder exists and permission is 'prompt' (not yet authorized in this context)
    if (!status?.hasFolder || status?.permissionStatus !== 'prompt') {
      return
    }

    console.log('[Oh My Prompt] SidePanel: Permission auto-restore triggered')
    setPermissionRestoreStatus('restoring')

    const handle = await getFolderHandle()
    if (!handle) {
      console.warn('[Oh My Prompt] SidePanel: No folder handle found')
      setPermissionRestoreStatus('failed')
      return
    }

    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' })

      if (permission === 'granted') {
        console.log('[Oh My Prompt] SidePanel: Permission restored successfully')
        setPermissionRestoreStatus('restored')
        // Trigger sync after permission restored
        manualSync().catch(err => console.warn('[Oh My Prompt] Auto-sync after permission restore failed:', err))
      } else {
        console.warn('[Oh My Prompt] SidePanel: Permission restore failed:', permission)
        setPermissionRestoreStatus('failed')
      }
    } catch (error) {
      console.warn('[Oh My Prompt] SidePanel: Permission request threw error:', error)
      setPermissionRestoreStatus('failed')
    }
  }

  restorePermission()
}, [status?.hasFolder, status?.permissionStatus])
```

**Note:** This useEffect depends on `status` from the sync status check. We need to capture the status from that useEffect.

- [ ] **Step 2: Capture sync status in a state variable**

Modify the sync status check useEffect (around line 982-1000) to store the status in a state variable instead of just using it for modal states:

```typescript
// Sync status for permission restore and UI
const [status, setStatus] = useState<{ hasFolder: boolean; permissionStatus?: 'granted' | 'prompt' | 'denied'; hasUnsyncedChanges?: boolean; dismissedBackupWarning?: boolean } | null>(null)

// Check for unsynced changes to show backup reminder and get permission status
useEffect(() => {
  chrome.runtime.sendMessage({ type: MessageType.GET_SYNC_STATUS }, (response) => {
    if (response?.success && response.data) {
      const syncStatus = response.data
      setStatus(syncStatus)
      if (syncStatus.hasUnsyncedChanges) {
        setModalStates(prev => ({ ...prev, showBackupReminder: true }))
      }
      // Check for first-time backup warning
      if (!syncStatus.hasFolder && !syncStatus.dismissedBackupWarning) {
        const promptCount = prompts.length
        if (promptCount > 0) {
          setBackupWarningPromptCount(promptCount)
          setModalStates(prev => ({ ...prev, showFirstBackupWarning: true }))
        }
      }
    }
  })
}, [prompts.length])
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/SidePanelApp.tsx
git commit -m "feat(sidepanel): add auto-restore permission useEffect

- Capture sync status in state variable for dependency
- Add useEffect that auto-restores folder permission when Sidepanel opens
- Trigger manualSync after permission restored successfully"
```

---

### Task 3: Add Permission Denied Warning Banner UI

**Files:**
- Modify: `src/sidepanel/SidePanelApp.tsx:1703-1722` (input status banner section)

- [ ] **Step 1: Add permission denied banner**

Add the warning banner after the input status banners (around line 1722, after the `unavailable` input status banner):

```typescript
{/* Permission denied banner - shows when auto-restore failed */}
{permissionRestoreStatus === 'failed' && status?.hasFolder && (
  <div className="permission-denied-banner">
    <AlertTriangle style={{ width: 14, height: 14, color: '#dc2626' }} />
    <span className="banner-text">文件夹权限被拒绝，数据无法同步</span>
    <span
      className="banner-link"
      onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })}
    >
      更换文件夹
    </span>
  </div>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/SidePanelApp.tsx
git commit -m "feat(sidepanel): add permission denied warning banner

- Show warning banner when permission restore fails
- Provide '更换文件夹' link to backup page"
```

---

### Task 4: Add CSS Styles for Warning Banner

**Files:**
- Modify: `src/sidepanel/index.css:440-475` (after backup-reminder-banner styles)

- [ ] **Step 1: Add permission denied banner CSS**

Add CSS styles after the `.backup-reminder-banner` section (around line 464):

```css
/* Permission denied banner - red warning style */
.permission-denied-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #FEF2F2;
  border-bottom: 1px solid #FECACA;
  flex-shrink: 0;
}

.permission-denied-banner .banner-text {
  color: #DC2626;
}
```

- [ ] **Step 2: Verify styles work**

Run: `npm run dev`
Expected: Dev server starts successfully

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/index.css
git commit -m "style(sidepanel): add permission denied banner CSS

- Red background (#FEF2F2) with red border (#FECACA)
- Red text color (#DC2626) for error indication"
```

---

### Task 5: Build and Verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No TypeScript errors

- [ ] **Step 2: Build for production**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Manual testing checklist**

1. Open extension in Chrome with folder backup configured
2. Close Sidepanel
3. Open Sidepanel again (permission should auto-restore silently)
4. Verify: No warning banner appears if permission restored
5. Test edge case: Deny permission in browser dialog → should show warning banner
6. Click "更换文件夹" link → should open backup page

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: folder permission auto-restore on Sidepanel open

- Auto-restore folder permission when user opens Sidepanel
- User clicking extension icon is valid user gesture for silent authorization
- Show warning banner if permission restore fails
- Trigger sync after successful permission restore

Implements: docs/superpowers/specs/2026-05-06-folder-permission-auto-restore-design.md"
```

---

## Edge Cases Handling (Implemented in Task 2)

| Scenario | Handling |
|-----|---------|
| No handle in IndexedDB | Don't trigger restore (status?.hasFolder is false) |
| `queryPermission()` returns `'granted'` | Don't trigger restore (status?.permissionStatus !== 'prompt') |
| `queryPermission()` returns `'denied'` | Don't trigger restore (handled by existing logic) |
| `requestPermission()` throws exception | Catch and set `failed` status |
| User changed folder | Re-check on next Sidepanel open |
| Sidepanel quickly closed/reopened | Re-run restore (harmless) |

---

## UI Behavior Summary

| Restore Status | UI |
|---------|--------|
| `idle` | No indication |
| `restoring` | No indication (background restore, usually fast) |
| `restored` | No indication, sync proceeds normally |
| `failed` (denied) | Warning banner + "更换文件夹" button |