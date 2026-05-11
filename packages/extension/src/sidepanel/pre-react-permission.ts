/**
 * Pre-React script: restore folder permission before React loads
 * This must run before React to capture user gesture for permission request
 * Extracted from inline script to comply with Chrome MV3 CSP (script-src 'self')
 */

(async function preReactPermissionRestore() {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('oh-my-prompt-sync', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains('handles')) {
          database.createObjectStore('handles');
        }
      };
    });

    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
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
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'prompt') {
        const result = await handle.requestPermission({ mode: 'readwrite' });
        if (result === 'granted') {
          chrome.runtime.sendMessage({
            type: 'SET_SETTINGS_ONLY',
            payload: { settings: { syncEnabled: true, hasUnsyncedChanges: false } }
          }).catch(() => {});
        }
      } else if (permission === 'granted') {
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