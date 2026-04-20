import type { Prompt, Category, UserData } from '../../shared/types'

const BACKUP_FILE_NAME = 'oh-my-prompt-script-backup.json'

/**
 * Backup user data to local folder with fixed filename
 * Used by refresh button for quick backup before reload
 */
export async function backupToFolder(
  userData: UserData,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable()

    const backupFile = {
      version: chrome.runtime.getManifest().version,
      userData: {
        prompts: userData.prompts,
        categories: userData.categories
      },
      backupTime: new Date().toISOString()
    }

    await writable.write(JSON.stringify(backupFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt Script] Backup saved:', BACKUP_FILE_NAME)
  } catch (error) {
    console.error('[Oh My Prompt Script] Failed to backup:', error)
    throw error
  }
}

/**
 * Sync user data to local folder (uses same file as backup)
 */
export async function syncToLocalFolder(
  userData: UserData,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable()

    const backupFile = {
      version: chrome.runtime.getManifest().version,
      userData: {
        prompts: userData.prompts,
        categories: userData.categories
      },
      backupTime: new Date().toISOString()
    }

    await writable.write(JSON.stringify(backupFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt Script] Synced to local folder:', BACKUP_FILE_NAME)
  } catch (error) {
    console.error('[Oh My Prompt Script] Failed to sync to local folder:', error)
    throw error
  }
}

/**
 * Read user data from local folder
 * Returns null if file doesn't exist or is invalid
 */
export async function readFromLocalFolder(
  handle: FileSystemDirectoryHandle
): Promise<UserData | null> {
  try {
    const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME)
    const file = await fileHandle.getFile()
    const content = await file.text()
    const parsed = JSON.parse(content)

    // Validate structure - supports both new format (userData) and legacy format
    if (parsed.userData && typeof parsed.userData === 'object') {
      const userData = parsed.userData as { prompts: unknown; categories: unknown }
      if (!Array.isArray(userData.prompts) || !Array.isArray(userData.categories)) {
        console.warn('[Oh My Prompt Script] Invalid userData format')
        return null
      }
      return {
        prompts: userData.prompts as Prompt[],
        categories: userData.categories as Category[]
      }
    }

    // Legacy format: prompts/categories directly on object
    if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.categories)) {
      console.warn('[Oh My Prompt Script] Invalid local file format')
      return null
    }

    return {
      prompts: parsed.prompts as Prompt[],
      categories: parsed.categories as Category[]
    }
  } catch (error) {
    console.warn('[Oh My Prompt Script] Failed to read local file:', error)
    return null
  }
}

/**
 * Request user to select a folder for sync
 * Returns handle if successful, null if cancelled or denied
 */
export async function selectSyncFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    })

    // Verify permission
    const permission = await handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      console.warn('[Oh My Prompt Script] Folder permission denied')
      return null
    }

    return handle
  } catch (error) {
    // User cancelled or picker failed
    console.log('[Oh My Prompt Script] Folder selection cancelled:', error)
    return null
  }
}