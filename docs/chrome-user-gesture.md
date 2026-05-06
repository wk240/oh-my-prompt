# Chrome Extension User Gesture Requirements

> Critical lesson learned from sidePanel.open() permission restore bug fix

## The Problem

Chrome requires certain APIs to be called **directly in response to a user gesture**. These APIs include:

- `chrome.sidePanel.open()`
- `chrome.permissions.request()`
- `chrome.fileSystem.requestPermission()` (File System Access API)

**User gesture** = click, keypress, or similar user-initiated action.

## The Trap: Async Functions Break Gesture Chain

**WRONG (gesture lost after await):**
```javascript
// ❌ User gesture is LOST after the first await
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true })  // ← await breaks gesture!
      await chrome.sidePanel.open({ tabId: tab.id })  // ← Error: "may only be called in response to a user gesture"
    })()
    return true
  }
})
```

Even though the message was triggered by a user click in content script, the `async/await` breaks the gesture propagation chain.

## The Solution: Synchronous Call Before Any Await

**CORRECT (gesture preserved):**
```javascript
// ✅ Call sidePanel.open() synchronously, BEFORE any await
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    // Get tab ID synchronously from sender (no await needed)
    const tabId = sender.tab?.id
    
    if (tabId && tabId >= 0) {
      // Call sidePanel.open() immediately - gesture preserved!
      chrome.sidePanel.open({ tabId: tabId })
        .then(() => {
          console.log('Sidepanel opened')
          // Now do async operations AFTER the API call
          restorePermission()
            .then(result => sendResponse({ success: result.success }))
            .catch(error => sendResponse({ success: false, error: String(error) }))
        })
        .catch(error => {
          console.error('sidePanel.open error:', error)
          sendResponse({ success: false, error: String(error) })
        })
    } else {
      sendResponse({ success: false, error: 'No sender tab' })
    }
    return true  // Required for async sendResponse
  }
})
```

## Key Principles

### 1. No Await Before Gesture-Required API Call

```javascript
// ❌ WRONG
async function handleClick() {
  await someAsyncOperation()  // Gesture lost here
  chrome.sidePanel.open(...)  // Fails!
}

// ✅ CORRECT
function handleClick() {
  chrome.sidePanel.open(...)  // Call first!
    .then(() => someAsyncOperation())  // Async after
}
```

### 2. Use Synchronous Data Sources

Instead of `await chrome.tabs.query()`, use:
- `sender.tab?.id` from message handler
- Event parameter (e.g., `info` from context menu click)
- Cached data from previous synchronous operations

### 3. Use `.then()` Chain, Not async/await

```javascript
// ❌ WRONG - await breaks gesture
async () => {
  await chrome.tabs.query(...)
  await chrome.sidePanel.open(...)
}

// ✅ CORRECT - promise chain preserves gesture context
chrome.tabs.query(...)
  .then(tabs => chrome.sidePanel.open({ tabId: tabs[0].id }))
  .then(() => doAsyncWork())
```

**Wait, this is still wrong!** The `.then()` callback is also async. The correct approach is:

```javascript
// ✅ REALLY CORRECT - no await before the API call
const tabId = sender.tab?.id  // Synchronous!
chrome.sidePanel.open({ tabId })  // Called immediately
  .then(() => doAsyncWork())  // Async after API call succeeds
```

### 4. Message Passing Gesture Propagation

When content script sends message after user click:

```javascript
// Content script (has user gesture from click)
button.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' })
})

// Service worker (receives gesture propagation via message)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Gesture is propagated here, but only in SYNC execution path
  // Must call gesture-required API BEFORE any await
})
```

## APIs That Require User Gesture

| API | Requirement |
|-----|-------------|
| `chrome.sidePanel.open()` | Must be in click handler or message handler (sync path) |
| `chrome.permissions.request()` | Must be in click handler |
| `chrome.fileSystem.requestPermission()` | Must be in click handler (File System Access API) |
| `window.open()` | Must be in click handler (popup blocker bypass) |

## Debugging Tips

1. **Check Service Worker logs** - Open `chrome://extensions` → click "service worker" link
2. **Look for the error** - `"may only be called in response to a user gesture"`
3. **Trace await calls** - Any `await` before the API call = gesture lost
4. **Use sender.tab** - Don't query tabs async when you have sender info

## Real-World Example: Oh My Prompt

### Bug Timeline

1. User clicks dropdown trigger button (user gesture)
2. Content script sends `OPEN_SIDEPANEL_FOR_PERMISSION` message
3. Service worker handler enters async function
4. **First await** `chrome.tabs.query()` breaks gesture chain
5. `chrome.sidePanel.open()` fails with gesture error

### Fix Applied

```diff
- (async () => {
-   const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
-   if (tab?.id && tab.id >= 0) {
-     await chrome.sidePanel.open({ tabId: tab.id })
-     ...
-   }
- })()

+ const senderTabId = sender.tab?.id  // Synchronous!
+ if (senderTabId && senderTabId >= 0) {
+   chrome.sidePanel.open({ tabId: senderTabId })  // No await before this!
+     .then(() => restorePermission())
+     .then(result => sendResponse({ success: result.success }))
+     .catch(error => sendResponse({ success: false, error: String(error) }))
+ }
+ return true
```

## Summary

**Golden Rule:** When calling gesture-required Chrome APIs in message handlers, do it **synchronously** before any `await`. Use `sender.tab?.id` or event parameters instead of async queries.