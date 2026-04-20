import type { Prompt, Category, LocalSyncFile, UserData } from '../../shared/types'

const SYNC_FILE_NAME = 'user-prompts.json'

/**
 * Sync user data to local folder
 */
export async function syncToLocalFolder(
  userData: UserData,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const fileHandle = await handle.getFileHandle(SYNC_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable()

    const syncFile: LocalSyncFile = {
      version: 1,
      prompts: userData.prompts,
      categories: userData.categories,
      exportedAt: Date.now()
    }

    await writable.write(JSON.stringify(syncFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt Script] Synced to local folder:', SYNC_FILE_NAME)
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
    const fileHandle = await handle.getFileHandle(SYNC_FILE_NAME)
    const file = await fileHandle.getFile()
    const content = await file.text()
    const parsed = JSON.parse(content)

    // Validate structure and version
    if (parsed.version !== 1) {
      console.warn('[Oh My Prompt Script] Unsupported file version:', parsed.version)
      return null
    }

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