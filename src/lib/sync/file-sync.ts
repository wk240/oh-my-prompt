import type { Prompt, Category, UserData } from '../../shared/types'
import { BACKUP_FILE_NAME, BACKUP_HISTORY_PREFIX, BACKUP_HISTORY_PATTERN, MAX_BACKUP_HISTORY } from '../../shared/constants'
import { computeUserDataHash } from './hash'

export interface BackupVersion {
  filename: string
  backupTime: string
  promptCount: number
  categoryCount: number
  isLatest: boolean
  contentHash?: string
}

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

    const contentHash = await computeUserDataHash(userData)

    const backupFile = {
      version: chrome.runtime.getManifest().version,
      userData: {
        prompts: userData.prompts,
        categories: userData.categories
      },
      backupTime: new Date().toISOString(),
      contentHash
    }

    await writable.write(JSON.stringify(backupFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt] Backup saved:', BACKUP_FILE_NAME)
  } catch (error) {
    console.error('[Oh My Prompt] Failed to backup:', error)
    throw error
  }
}

export interface SyncResult {
  createdNewBackup: boolean // True if new history backup was created, false if content unchanged
}

/**
 * Sync user data to local folder (uses same file as backup)
 * Also creates history backup (only if content changed) and cleans up old versions
 * Returns SyncResult indicating whether a new history backup was created
 */
export async function syncToLocalFolder(
  userData: UserData,
  handle: FileSystemDirectoryHandle
): Promise<SyncResult> {
  try {
    const contentHash = await computeUserDataHash(userData)

    const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable()

    const backupFile = {
      version: chrome.runtime.getManifest().version,
      userData: {
        prompts: userData.prompts,
        categories: userData.categories
      },
      backupTime: new Date().toISOString(),
      contentHash
    }

    await writable.write(JSON.stringify(backupFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt] Synced to local folder:', BACKUP_FILE_NAME)

    // Create history backup only if content changed
    const hashExists = await checkHashExistsInHistory(handle, contentHash)
    let createdNewBackup = false
    if (!hashExists) {
      await createHistoryBackup(handle)
      createdNewBackup = true
    } else {
      console.log('[Oh My Prompt] Skipped history backup - content unchanged')
    }

    await cleanupOldBackups(handle)
    return { createdNewBackup }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to sync to local folder:', error)
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
        console.warn('[Oh My Prompt] Invalid userData format')
        return null
      }
      return {
        prompts: userData.prompts as Prompt[],
        categories: userData.categories as Category[]
      }
    }

    // Legacy format: prompts/categories directly on object
    if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.categories)) {
      console.warn('[Oh My Prompt] Invalid local file format')
      return null
    }

    return {
      prompts: parsed.prompts as Prompt[],
      categories: parsed.categories as Category[]
    }
  } catch (error) {
    console.warn('[Oh My Prompt] Failed to read local file:', error)
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
      console.warn('[Oh My Prompt] Folder permission denied')
      return null
    }

    return handle
  } catch (error) {
    // User cancelled or picker failed
    console.log('[Oh My Prompt] Folder selection cancelled:', error)
    return null
  }
}

/**
 * Check if a hash already exists in history backup files
 */
async function checkHashExistsInHistory(handle: FileSystemDirectoryHandle, hash: string): Promise<boolean> {
  try {
    const dirHandle = handle as FileSystemDirectoryHandle & {
      keys: () => AsyncIterableIterator<string>
    }
    for await (const name of dirHandle.keys()) {
      if (BACKUP_HISTORY_PATTERN.test(name)) {
        try {
          const fileHandle = await handle.getFileHandle(name)
          const file = await fileHandle.getFile()
          const content = await file.text()
          const parsed = JSON.parse(content)
          if (parsed.contentHash === hash) {
            return true
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Create a history backup copy with timestamp
 */
async function createHistoryBackup(handle: FileSystemDirectoryHandle): Promise<void> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  const historyFilename = `${BACKUP_HISTORY_PREFIX}${year}${month}${day}-${hour}${minute}${second}.json`

  try {
    // Read latest backup
    const latestHandle = await handle.getFileHandle(BACKUP_FILE_NAME)
    const latestFile = await latestHandle.getFile()
    const content = await latestFile.text()

    // Write to history file
    const historyHandle = await handle.getFileHandle(historyFilename, { create: true })
    const writable = await historyHandle.createWritable()
    await writable.write(content)
    await writable.close()

    console.log('[Oh My Prompt] History backup created:', historyFilename)
  } catch (error) {
    console.warn('[Oh My Prompt] Failed to create history backup:', error)
  }
}

/**
 * Cleanup old backups exceeding MAX_BACKUP_HISTORY limit
 */
async function cleanupOldBackups(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const historyFiles: { name: string; time: number }[] = []

    // TypeScript lacks proper types for directory iterator, use assertion
    const dirHandle = handle as FileSystemDirectoryHandle & {
      keys: () => AsyncIterableIterator<string>
    }
    for await (const name of dirHandle.keys()) {
      if (BACKUP_HISTORY_PATTERN.test(name)) {
        // Extract timestamp from filename: backup-20260421143052.json
        const timestampStr = name.match(/\d{8}\d{6}/)?.[0]
        if (timestampStr) {
          historyFiles.push({
            name: name,
            time: parseInt(timestampStr, 10)
          })
        }
      }
    }

    // Sort by time (newest first)
    historyFiles.sort((a, b) => b.time - a.time)

    // Remove files beyond limit
    if (historyFiles.length > MAX_BACKUP_HISTORY) {
      const toRemove = historyFiles.slice(MAX_BACKUP_HISTORY)
      for (const file of toRemove) {
        await handle.removeEntry(file.name)
        console.log('[Oh My Prompt] Removed old backup:', file.name)
      }
    }
  } catch (error) {
    console.warn('[Oh My Prompt] Failed to cleanup old backups:', error)
  }
}

/**
 * List all backup versions in folder
 */
export async function listBackupVersions(handle: FileSystemDirectoryHandle): Promise<BackupVersion[]> {
  const versions: BackupVersion[] = []

  try {
    // Check latest.json
    try {
      const latestHandle = await handle.getFileHandle(BACKUP_FILE_NAME)
      const latestFile = await latestHandle.getFile()
      const content = await latestFile.text()
      const parsed = JSON.parse(content)

      versions.push({
        filename: BACKUP_FILE_NAME,
        backupTime: parsed.backupTime || '',
        promptCount: parsed.userData?.prompts?.length || 0,
        categoryCount: parsed.userData?.categories?.length || 0,
        isLatest: true,
        contentHash: parsed.contentHash
      })
    } catch {
      // latest.json not found
    }

    // Check history files
    const dirHandle = handle as FileSystemDirectoryHandle & {
      keys: () => AsyncIterableIterator<string>
    }
    for await (const name of dirHandle.keys()) {
      if (BACKUP_HISTORY_PATTERN.test(name)) {
        try {
          const fileHandle = await handle.getFileHandle(name)
          const file = await fileHandle.getFile()
          const content = await file.text()
          const parsed = JSON.parse(content)

          versions.push({
            filename: name,
            backupTime: parsed.backupTime || '',
            promptCount: parsed.userData?.prompts?.length || 0,
            categoryCount: parsed.userData?.categories?.length || 0,
            isLatest: false,
            contentHash: parsed.contentHash
          })
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Sort by backupTime (newest first)
    versions.sort((a, b) => new Date(b.backupTime).getTime() - new Date(a.backupTime).getTime())
  } catch (error) {
    console.warn('[Oh My Prompt] Failed to list backup versions:', error)
  }

  return versions
}

/**
 * Read specific backup file and return UserData
 */
export async function readBackupFile(
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<UserData | null> {
  try {
    const fileHandle = await handle.getFileHandle(filename)
    const file = await fileHandle.getFile()
    const content = await file.text()
    const parsed = JSON.parse(content)

    // Validate structure
    if (parsed.userData && typeof parsed.userData === 'object') {
      const userData = parsed.userData as { prompts: unknown; categories: unknown }
      if (!Array.isArray(userData.prompts) || !Array.isArray(userData.categories)) {
        return null
      }
      return {
        prompts: userData.prompts as Prompt[],
        categories: userData.categories as Category[]
      }
    }

    // Legacy format
    if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.categories)) {
      return null
    }

    return {
      prompts: parsed.prompts as Prompt[],
      categories: parsed.categories as Category[]
    }
  } catch (error) {
    console.warn('[Oh My Prompt] Failed to read backup file:', error)
    return null
  }
}