/**
 * Pre-React permission restore script
 * Executed before React loads to capture user gesture for File System Access API
 *
 * Chrome's user gesture context is lost after async operations.
 * This script runs synchronously on page load, before React initialization,
 * allowing requestPermission() to succeed without prompting the user again.
 */
(async function preReactPermissionRestore() {
  try {
    // Open IndexedDB directly (no imports available at this stage)
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('oh-my-prompt-sync', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      // Handle upgrade - create store if needed
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains('handles')) {
          database.createObjectStore('handles');
        }
      };
    });

    // Get folder handle from IndexedDB
    const handle = await new Promise((resolve) => {
      try {
        const transaction = db.transaction(['handles'], 'readonly');
        const store = transaction.objectStore('handles');
        const request = store.get('folderHandle');
        request.onerror = () => resolve(null);
        request.onsuccess = () => resolve(request.result);
      } catch {
        resolve(null);
      }
    });

    if (handle) {
      // Check permission status
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      console.log('[Oh My Prompt] Pre-React permission status:', permission);

      if (permission === 'prompt') {
        // User gesture is available here (sidepanel just opened from click)
        console.log('[Oh My Prompt] Pre-React: restoring folder permission...');
        const result = await handle.requestPermission({ mode: 'readwrite' });
        console.log('[Oh My Prompt] Pre-React: requestPermission result:', result);

        if (result === 'granted') {
          console.log('[Oh My Prompt] Pre-React: permission restored successfully');
          // Enable sync in settings
          chrome.runtime.sendMessage({
            type: 'SET_SETTINGS_ONLY',
            payload: { settings: { syncEnabled: true, hasUnsyncedChanges: false } }
          }).catch(() => {});
        }
      } else if (permission === 'granted') {
        // Permission already good, ensure sync enabled
        chrome.runtime.sendMessage({
          type: 'SET_SETTINGS_ONLY',
          payload: { settings: { syncEnabled: true } }
        }).catch(() => {});
      }
    }

    db.close();
  } catch (e) {
    console.warn('[Oh My Prompt] Pre-React permission check failed:', e);
  }
})();