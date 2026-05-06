# Folder Permission Auto-Restore Design

## Problem

`FileSystemDirectoryHandle` permissions are bound to the JavaScript context that called `showDirectoryPicker()`, not globally. When the Sidepanel closes and reopens:

1. Offscreen document may be closed by Chrome (idle timeout)
2. Offscreen recreated → new JavaScript context
3. IndexedDB restores handle object ✓
4. `handle.queryPermission()` → `'prompt'` (new context never authorized)
5. `handle.requestPermission()` requires user gesture, but Offscreen is a background document with no user interaction

This causes permission to fail even without extension updates, just by reopening the Sidepanel.

## Solution

Auto-restore folder permission silently in Sidepanel context when opening. The user clicking the extension icon to open Sidepanel itself is a valid user gesture, which Chrome will use to silently authorize `requestPermission()`.

## Architecture

**Core change:** Add auto-permission-restore logic in SidePanelApp.tsx.

**Data flow:**
```
Sidepanel opens
    ↓
useEffect checks sync status
    ↓
if hasFolder && permission === 'prompt'
    ↓
getFolderHandle() → IndexedDB
    ↓
handle.requestPermission({ mode: 'readwrite' })
    ↓
Chrome silent authorization → 'granted'
    ↓
Trigger manualSync() (sync unsynced data)
    ↓
Update status display
```

## Implementation

### Files Changed

| File | Change |
|-----|-----|
| `src/sidepanel/SidePanelApp.tsx` | Add permission restore logic + state + warning banner UI |
| `src/sidepanel/index.css` | Add warning banner styles |

### SidePanelApp.tsx Changes

1. **New imports:**
```typescript
import { getFolderHandle, requestFolderPermission } from '../lib/sync/indexeddb'
import { manualSync } from '../lib/sync/sync-manager'
```

2. **New state:**
```typescript
const [permissionRestoreStatus, setPermissionRestoreStatus] = useState<'idle' | 'restoring' | 'restored' | 'failed'>('idle')
```

3. **New useEffect:**
```typescript
// Auto-restore folder permission on Sidepanel open
useEffect(() => {
  const restorePermission = async () => {
    if (!status?.hasFolder || status?.permissionStatus !== 'prompt') {
      return
    }
    
    setPermissionRestoreStatus('restoring')
    
    const handle = await getFolderHandle()
    if (!handle) {
      setPermissionRestoreStatus('failed')
      return
    }
    
    const permission = await handle.requestPermission({ mode: 'readwrite' })
    
    if (permission === 'granted') {
      setPermissionRestoreStatus('restored')
      manualSync().catch(err => console.warn('[Oh My Prompt] Auto-sync after permission restore failed:', err))
    } else {
      setPermissionRestoreStatus('failed')
    }
  }
  
  restorePermission()
}, [status?.hasFolder, status?.permissionStatus])
```

4. **New warning banner (near input-status-banner):**
```typescript
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

### index.css Changes

```css
.permission-denied-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
}
```

## UI Behavior

| Restore Status | UI |
|---------|--------|
| `idle` | No indication |
| `restoring` | No indication (background restore, usually fast) |
| `restored` | No indication, sync proceeds normally |
| `failed` (denied) | Warning banner + "更换文件夹" button |

## Edge Cases

| Scenario | Handling |
|-----|---------|
| No handle in IndexedDB | Don't trigger restore |
| `queryPermission()` returns `'granted'` | Don't trigger restore |
| `queryPermission()` returns `'denied'` | Set `failed` directly |
| `requestPermission()` throws exception | Catch and set `failed` |
| User changed folder | Re-check on next Sidepanel open |
| Sidepanel quickly closed/reopened | Re-run restore (harmless) |
| Offscreen syncing | No interference |

## Integration Notes

- Restore logic runs after `loadFromStorage()` (status must be loaded first)
- Does not interfere with `backup-reminder-banner` or `first-backup-warning-banner`
- When `permissionRestoreStatus === 'failed'`, backup reminder banner does not show (permission issue is higher priority)

## Logging

```typescript
console.log('[Oh My Prompt] SidePanel: Permission auto-restore triggered')
console.log('[Oh My Prompt] SidePanel: Permission restored successfully')
console.warn('[Oh My Prompt] SidePanel: Permission restore failed:', permission)
```