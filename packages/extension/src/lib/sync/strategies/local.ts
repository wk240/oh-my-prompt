import {
  BACKUP_FILE_NAME,
  BACKUP_HISTORY_PREFIX,
  BACKUP_HISTORY_PATTERN,
  MAX_BACKUP_HISTORY,
} from '@oh-my-prompt/shared/constants'
import { computeBackupDataHash } from '../hash'
import { getFolderHandle, saveFolderHandle, removeFolderHandle, checkFolderPermission } from '../indexeddb'
import { BaseSyncStrategy } from './base'
import { FullBackupData, SyncResult, StrategyStatus, SyncResultError } from '../types'
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

/**
 * Local folder backup strategy using File System Access API
 * Persists folder handle in IndexedDB for browser restart recovery
 */
export class LocalSyncStrategy extends BaseSyncStrategy {
  constructor() {
    super('local', 'Local Backup')
  }

  /**
   * Check if local sync is available (folder handle exists).
   * Note: Permission check is deferred to actual sync operation.
   * Service Worker may return 'prompt' from queryPermission even if
   * permission was granted in popup context. The actual sync via
   * offscreen document handles permission request when needed.
   */
  async isAvailable(): Promise<boolean> {
    const handle = await getFolderHandle()
    return handle !== null
  }

  /**
   * Sync data to local folder
   * Creates omps-latest.json and history backup if content changed
   */
  async sync(data: FullBackupData): Promise<SyncResult> {
    const handle = await getFolderHandle()
    if (!handle) {
      return { success: false, error: 'PERMISSION_DENIED' as SyncResultError }
    }

    // Check permission - Service Worker cannot requestPermission()
    // If permission not granted, return error and let UI handle via offscreen document
    const permission = await checkFolderPermission(handle, 'readwrite')
    if (permission !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' as SyncResultError }
    }

    try {
      const contentHash = await computeBackupDataHash(data)
      const manifestVersion =
        typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version
          ? chrome.runtime.getManifest().version
          : '1.0.0'

      const backupFile = {
        version: manifestVersion,
        userData: {
          prompts: data.prompts,
          categories: data.categories,
        },
        temporaryPrompts: data.temporaryPrompts,
        imageAssets: data.imageAssets || {},
        pendingImageDeletes: data.pendingImageDeletes || [],
        backupTime: new Date().toISOString(),
        contentHash,
      }

      // Write to omps-latest.json
      const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(JSON.stringify(backupFile, null, 2))
      await writable.close()

      // Create history backup if content changed
      const hashExists = await this.checkHashExistsInHistory(handle, contentHash)
      if (!hashExists) {
        await this.createHistoryBackup(handle)
      }

      // Cleanup old backups
      await this.cleanupOldBackups(handle)

      return {
        success: true,
        syncedAt: Date.now(),
        promptsCount: data.prompts.length,
        categoriesCount: data.categories.length,
        temporaryPromptsCount: data.temporaryPrompts.length,
      }
    } catch (error) {
      console.error('[Oh My Prompt] Local sync failed:', error)
      return { success: false, error: 'SYNC_FAILED' as SyncResultError }
    }
  }

  /**
   * Restore data from local folder backup
   * Reads from omps-latest.json
   */
  async restore(): Promise<FullBackupData | null> {
    const handle = await getFolderHandle()
    if (!handle) {
      return null
    }

    try {
      const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME)
      const file = await fileHandle.getFile()
      const content = await file.text()
      const parsed = JSON.parse(content)

      // Validate structure - supports new format (userData + temporaryPrompts) and legacy format
      if (parsed.userData && typeof parsed.userData === 'object') {
        const userData = parsed.userData as { prompts: unknown; categories: unknown }
        if (!Array.isArray(userData.prompts) || !Array.isArray(userData.categories)) {
          console.warn('[Oh My Prompt] Invalid userData format in local backup')
          return null
        }
        return {
          prompts: userData.prompts as Prompt[],
          categories: userData.categories as Category[],
          temporaryPrompts: parsed.temporaryPrompts || [],
          imageAssets: parsed.imageAssets || {},
          pendingImageDeletes: parsed.pendingImageDeletes || [],
          timestamp: parsed.backupTime ? new Date(parsed.backupTime).getTime() : Date.now(),
        }
      }

      // Legacy format: prompts/categories directly on object
      if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.categories)) {
        console.warn('[Oh My Prompt] Invalid local backup format')
        return null
      }

      return {
        prompts: parsed.prompts as Prompt[],
        categories: parsed.categories as Category[],
        temporaryPrompts: [],
        imageAssets: parsed.imageAssets || {},
        pendingImageDeletes: parsed.pendingImageDeletes || [],
        timestamp: parsed.backupTime ? new Date(parsed.backupTime).getTime() : Date.now(),
      }
    } catch (error) {
      // User cancelled or picker failed
      return null
    }
  }

  /**
   * Get current status of local sync.
   * Note: Service Worker cannot directly read files or query permission.
   * Returns basic status based on handle existence and stored settings.
   * Detailed file operations are handled by sync-manager via offscreen document.
   */
  async getStatus(): Promise<StrategyStatus> {
    const handle = await getFolderHandle()
    if (!handle) {
      return { enabled: false }
    }

    // Handle exists - enabled (actual permission check happens during sync)
    // Try to get last sync time from stored settings (managed by sync-manager)
    try {
      const result = await chrome.storage.local.get('syncStatus')
      const syncStatus = result.syncStatus || {}
      return {
        enabled: true,
        lastSyncTime: syncStatus.lastLocalSyncTime,
        error: syncStatus.localError
      }
    } catch {
      return { enabled: true }
    }
  }

  /**
   * Select folder for sync using File System Access API
   * Returns handle if successful, null if cancelled
   */
  async selectFolder(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      })

      // Save handle to IndexedDB for persistence
      await saveFolderHandle(handle)

      return handle
    } catch {
      // User cancelled or picker failed
      return null
    }
  }

  /**
   * Disconnect from folder sync
   */
  async disconnect(): Promise<void> {
    await removeFolderHandle()
  }

  // --- Private methods for IndexedDB operations ---

  // --- Private methods for backup history ---

  /**
   * Check if content hash already exists in history files
   */
  private async checkHashExistsInHistory(
    handle: FileSystemDirectoryHandle,
    hash: string
  ): Promise<boolean> {
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
   * Create history backup copy with timestamp
   */
  private async createHistoryBackup(handle: FileSystemDirectoryHandle): Promise<void> {
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
    } catch (error) {
      console.warn('[Oh My Prompt] Failed to create history backup:', error)
    }
  }

  /**
   * Cleanup old backups beyond MAX_BACKUP_HISTORY limit
   */
  private async cleanupOldBackups(handle: FileSystemDirectoryHandle): Promise<void> {
    try {
      const historyFiles: { name: string; time: number }[] = []

      const dirHandle = handle as FileSystemDirectoryHandle & {
        keys: () => AsyncIterableIterator<string>
      }
      for await (const name of dirHandle.keys()) {
        if (BACKUP_HISTORY_PATTERN.test(name)) {
          // Extract timestamp from filename: omps-backup-20260510-120000.json
          const timestampStr = name.match(/\d{8}\d{6}/)?.[0]
          if (timestampStr) {
            historyFiles.push({
              name: name,
              time: parseInt(timestampStr, 10),
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
        }
      }
    } catch (error) {
      console.warn('[Oh My Prompt] Failed to cleanup old backups:', error)
    }
  }
}
