/**
 * Handle cache for FileSystemDirectoryHandle
 *
 * FileSystemDirectoryHandle loses prototype methods when retrieved from IndexedDB
 * in a different context. We cache the handle at module level in content script
 * to keep it alive during the session.
 */

let cachedHandle: FileSystemDirectoryHandle | null = null

/**
 * Cache a folder handle for use during this session
 */
export function cacheFolderHandle(handle: FileSystemDirectoryHandle): void {
  cachedHandle = handle
  console.log('[Oh My Prompt Script] Handle cached for session')
}

/**
 * Get cached folder handle (null if not cached or session expired)
 */
export function getCachedFolderHandle(): FileSystemDirectoryHandle | null {
  return cachedHandle
}

/**
 * Clear cached handle
 */
export function clearCachedFolderHandle(): void {
  cachedHandle = null
}