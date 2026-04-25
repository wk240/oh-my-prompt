import { SYNC_DB_NAME, SYNC_STORE_NAME, SYNC_HANDLE_KEY } from '@/shared/constants'

// Legacy DB name for migration (v1.1.4 and earlier)
const LEGACY_SYNC_DB_NAME = 'oh-my-prompt-script-sync'

/**
 * Open IndexedDB for storing FileSystemDirectoryHandle
 * chrome.storage cannot store handles, so we use IndexedDB
 */
export async function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Open legacy IndexedDB (for migration from old DB name)
 */
async function openLegacySyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_SYNC_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Migrate folder handle from legacy DB to new DB
 * Returns the handle if migration succeeded, null otherwise
 */
async function migrateFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const legacyDb = await openLegacySyncDB()
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const transaction = legacyDb.transaction(SYNC_STORE_NAME, 'readonly')
      const store = transaction.objectStore(SYNC_STORE_NAME)
      const request = store.get(SYNC_HANDLE_KEY)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => legacyDb.close()
    })

    if (handle) {
      // Save to new DB
      await saveFolderHandle(handle)
      // Delete legacy DB
      indexedDB.deleteDatabase(LEGACY_SYNC_DB_NAME)
      console.log('[Oh My Prompt] Migrated folder handle from legacy DB')
      return handle
    }

    // No handle in legacy DB, delete it
    indexedDB.deleteDatabase(LEGACY_SYNC_DB_NAME)
    return null
  } catch (error) {
    console.warn('[Oh My Prompt] Legacy DB migration failed:', error)
    return null
  }
}

/**
 * Save folder handle to IndexedDB
 */
export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openSyncDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_STORE_NAME)
    const request = store.put(handle, SYNC_HANDLE_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Get folder handle from IndexedDB
 * Returns null if not found
 *
 * Migration: If new DB is empty, attempts to migrate from legacy DB name.
 *
 * Note: Handles restored from IndexedDB may have limited API availability.
 * Validation is deferred to actual file operations - if handle is invalid,
 * backupToFolder will throw and caller can handle the error.
 */
export async function getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openSyncDB()

  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readonly')
    const store = transaction.objectStore(SYNC_STORE_NAME)
    const request = store.get(SYNC_HANDLE_KEY)

    request.onsuccess = () => {
      resolve(request.result || null)
    }

    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })

  if (handle) {
    console.log('[Oh My Prompt] IndexedDB handle found')
    return handle
  }

  // Try migration from legacy DB
  console.log('[Oh My Prompt] IndexedDB handle not found, checking legacy DB...')
  return migrateFolderHandle()
}

/**
 * Remove folder handle from IndexedDB
 */
export async function removeFolderHandle(): Promise<void> {
  const db = await openSyncDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_STORE_NAME)
    const request = store.delete(SYNC_HANDLE_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Check if folder handle has valid permission
 * Returns 'granted', 'prompt', or 'denied'
 */
export async function checkFolderPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<PermissionState> {
  try {
    return await handle.queryPermission({ mode })
  } catch (error) {
    console.warn('[Oh My Prompt] Permission check failed:', error)
    return 'denied'
  }
}

/**
 * Request permission restoration for folder handle
 * Returns 'granted' if successful, otherwise the permission state
 * Note: If user previously granted permission, this returns 'granted' without prompting
 */
export async function requestFolderPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<PermissionState> {
  try {
    return await handle.requestPermission({ mode })
  } catch (error) {
    console.warn('[Oh My Prompt] Permission request failed:', error)
    return 'denied'
  }
}