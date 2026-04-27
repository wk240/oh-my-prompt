import type { UserData } from '../../shared/types'
import { BACKUP_FILE_NAME, IMAGE_DIR_NAME } from '../../shared/constants'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle, checkFolderPermission, requestFolderPermission } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder, listBackupVersions, readBackupFile } from './file-sync'
import type { BackupVersion } from './file-sync'

export interface SyncStatus {
  enabled: boolean
  hasFolder: boolean
  lastSyncTime?: number
  folderName?: string
  hasUnsyncedChanges?: boolean
  dismissedBackupWarning?: boolean
  permissionStatus?: 'granted' | 'prompt' | 'denied' // Permission state for restore UI
}

/**
 * Trigger sync after data change
 * Called by store.saveToStorage()
 * Returns true if sync succeeded, false if failed or skipped (user should be reminded)
 */
export async function triggerSync(userData: UserData): Promise<boolean> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()

  // If sync not enabled, mark as unsynced and return false to trigger reminder
  if (!settings.syncEnabled) {
    if (userData.prompts.length > 0) {
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
    }
    return false // No backup configured - should remind user
  }

  const handle = await getFolderHandle()

  if (!handle) {
    // Folder handle lost - disable sync and mark as unsynced
    await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
    console.warn('[Oh My Prompt] Sync folder handle lost, disabled sync')
    return false
  }

  try {
    await syncToLocalFolder(userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
    console.log('[Oh My Prompt] Auto-sync completed')
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Auto-sync failed:', error)
    // Mark as unsynced so UI can show reminder
    await storageManager.updateSettings({ hasUnsyncedChanges: true })
    return false
  }
}

/**
 * Initial sync check at startup
 */
export async function initialSync(): Promise<void> {
  const handle = await getFolderHandle()
  if (!handle) return

  const storageManager = StorageManager.getInstance()
  const storageData = await storageManager.getData()
  const localData = await readFromLocalFolder(handle)

  // Case: chrome.storage empty, local has data -> restore
  if (localData && storageData.userData.prompts.length === 0) {
    await storageManager.updateUserData(localData)
    console.log('[Oh My Prompt] Restored from local folder backup')
    return
  }

  // Case: both have data -> sync chrome.storage to local
  if (localData && storageData.userData.prompts.length > 0) {
    const settings = await storageManager.getSettings()
    if (settings.syncEnabled) {
      try {
        await syncToLocalFolder(storageData.userData, handle)
        await storageManager.updateSettings({ lastSyncTime: Date.now() })
      } catch (error) {
        console.error('[Oh My Prompt] Initial sync failed:', error)
      }
    }
  }
}

export interface ExistingBackupInfo {
  hasBackup: boolean
  promptCount?: number
  categoryCount?: number
  backupTime?: string
}

export interface EnableSyncResult {
  success: boolean
  error?: string
  existingBackup?: ExistingBackupInfo
}

/**
 * Enable sync - reuse existing folder if permission valid, otherwise select new
 */
export async function enableSync(): Promise<EnableSyncResult> {
  // First check if we have a saved handle with valid permission
  const existingHandle = await getFolderHandle()

  if (existingHandle) {
    // Reuse existing folder
    try {
      const storageManager = StorageManager.getInstance()
      const data = await storageManager.getData()
      await syncToLocalFolder(data.userData, existingHandle)
      await storageManager.updateSettings({
        syncEnabled: true,
        lastSyncTime: Date.now()
      })
      return { success: true }
    } catch (error) {
      console.error('[Oh My Prompt] Reuse existing folder failed:', error)
      return { success: false, error: '同步失败，请检查文件夹权限或更换文件夹' }
    }
  }

  // No valid handle - select new folder
  const handle = await selectSyncFolder()
  if (!handle) {
    return { success: false, error: '请选择一个文件夹' }
  }

  try {
    // IMPORTANT: Verify permission by creating images directory BEFORE saving handle
    // This ensures permission is actually granted in the current context (popup)
    // Service Worker cannot request permission without user activation
    try {
      await handle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
      console.log('[Oh My Prompt] Images directory created, permission verified')
    } catch (permError) {
      console.error('[Oh My Prompt] Permission verification failed:', permError)
      return { success: false, error: '文件夹权限验证失败，请重新选择' }
    }

    await saveFolderHandle(handle)

    // Check for existing backup in the selected folder
    const existingBackupInfo: ExistingBackupInfo = { hasBackup: false }
    try {
      const existingData = await readFromLocalFolder(handle)
      if (existingData && existingData.prompts.length > 0) {
        // Read backup time from latest file
        try {
          const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME)
          const file = await fileHandle.getFile()
          const content = await file.text()
          const parsed = JSON.parse(content)
          existingBackupInfo.hasBackup = true
          existingBackupInfo.promptCount = existingData.prompts.length
          existingBackupInfo.categoryCount = existingData.categories.length
          existingBackupInfo.backupTime = parsed.backupTime
        } catch {
          existingBackupInfo.hasBackup = true
          existingBackupInfo.promptCount = existingData.prompts.length
          existingBackupInfo.categoryCount = existingData.categories.length
        }
      }
    } catch {
      // No existing backup or read error - ignore
    }

    // Only save folder handle and enable sync, no auto-backup on first selection
    const storageManager = StorageManager.getInstance()
    await storageManager.updateSettings({
      syncEnabled: true
    })

    return { success: true, existingBackup: existingBackupInfo }
  } catch (error) {
    console.error('[Oh My Prompt] Enable sync failed:', error)
    return { success: false, error: '同步失败，请检查文件夹权限' }
  }
}

/**
 * Disable sync but keep folder handle for re-enable
 */
export async function disableSync(): Promise<void> {
  const storageManager = StorageManager.getInstance()
  await storageManager.updateSettings({
    syncEnabled: false
  })
}

/**
 * Change sync folder - select new folder and replace existing
 * Returns existingBackup info if new folder has backup files
 */
export async function changeSyncFolder(): Promise<{ success: boolean; error?: string; existingBackup?: ExistingBackupInfo }> {
  const handle = await selectSyncFolder()
  if (!handle) {
    return { success: false, error: '请选择一个文件夹' }
  }

  try {
    // IMPORTANT: Verify permission by creating images directory BEFORE saving handle
    // This ensures permission is actually granted in the current context (popup)
    try {
      await handle.getDirectoryHandle(IMAGE_DIR_NAME, { create: true })
      console.log('[Oh My Prompt] Images directory created, permission verified')
    } catch (permError) {
      console.error('[Oh My Prompt] Permission verification failed:', permError)
      return { success: false, error: '文件夹权限验证失败，请重新选择' }
    }

    await saveFolderHandle(handle)

    // Check for existing backup in the new folder
    const existingBackupInfo: ExistingBackupInfo = { hasBackup: false }
    try {
      const existingData = await readFromLocalFolder(handle)
      if (existingData && existingData.prompts.length > 0) {
        // Read backup time from latest file
        try {
          const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME)
          const file = await fileHandle.getFile()
          const content = await file.text()
          const parsed = JSON.parse(content)
          existingBackupInfo.hasBackup = true
          existingBackupInfo.promptCount = existingData.prompts.length
          existingBackupInfo.categoryCount = existingData.categories.length
          existingBackupInfo.backupTime = parsed.backupTime
        } catch {
          existingBackupInfo.hasBackup = true
          existingBackupInfo.promptCount = existingData.prompts.length
          existingBackupInfo.categoryCount = existingData.categories.length
        }
      }
    } catch {
      // No existing backup or read error - ignore
    }

    const storageManager = StorageManager.getInstance()
    await storageManager.updateSettings({
      syncEnabled: true,
      lastSyncTime: Date.now()
    })

    return { success: true, existingBackup: existingBackupInfo }
  } catch (error) {
    console.error('[Oh My Prompt] Change folder failed:', error)
    return { success: false, error: '更换文件夹失败，请检查权限' }
  }
}

/**
 * Manual sync trigger
 * Returns whether a new history backup was created
 */
export async function manualSync(): Promise<{ success: boolean; createdNewBackup?: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: '文件夹权限已失效，请重新选择' }
  }

  try {
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    const result = await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
    return { success: true, createdNewBackup: result.createdNewBackup }
  } catch (error) {
    return { success: false, error: '同步失败，请检查文件夹权限' }
  }
}

/**
 * Get current sync status for UI
 * Includes permission check for folder handle
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()
  const handle = await getFolderHandle()

  // Check permission status if handle exists
  let permissionStatus: 'granted' | 'prompt' | 'denied' | undefined = undefined
  if (handle) {
    permissionStatus = await checkFolderPermission(handle)
  }

  return {
    enabled: settings.syncEnabled,
    hasFolder: handle !== null,
    lastSyncTime: settings.lastSyncTime,
    folderName: handle?.name,
    hasUnsyncedChanges: settings.hasUnsyncedChanges,
    dismissedBackupWarning: settings.dismissedBackupWarning,
    permissionStatus
  }
}

/**
 * Restore permission for existing folder handle
 * Returns success if permission was granted, otherwise error
 * Note: If user previously granted permission, this returns success without prompting
 */
export async function restorePermission(): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: '文件夹信息已丢失，请重新选择' }
  }

  try {
    const permission = await requestFolderPermission(handle)
    if (permission === 'granted') {
      // Permission restored successfully - sync current data
      const storageManager = StorageManager.getInstance()
      const data = await storageManager.getData()
      await syncToLocalFolder(data.userData, handle)
      await storageManager.updateSettings({
        syncEnabled: true,
        lastSyncTime: Date.now(),
        hasUnsyncedChanges: false
      })
      console.log('[Oh My Prompt] Permission restored and sync completed')
      return { success: true }
    } else if (permission === 'prompt') {
      // User needs to interact - they should click again
      return { success: false, error: '请在弹出的对话框中授权' }
    } else {
      // Permission denied - user needs to select new folder
      return { success: false, error: '权限被拒绝，请更换文件夹' }
    }
  } catch (error) {
    console.error('[Oh My Prompt] Permission restore failed:', error)
    return { success: false, error: '恢复权限失败，请重新选择文件夹' }
  }
}

/**
 * Get backup versions list for UI
 */
export async function getBackupVersions(): Promise<{ versions: BackupVersion[]; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { versions: [], error: '文件夹权限已失效，请重新选择' }
  }

  try {
    const versions = await listBackupVersions(handle)
    return { versions }
  } catch (error) {
    return { versions: [], error: '读取版本列表失败' }
  }
}

/**
 * Restore data from specific backup version
 */
export async function restoreFromBackup(
  filename: string,
  backupFirst: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: '文件夹权限已失效，请重新选择' }
  }

  try {
    const userData = await readBackupFile(handle, filename)
    if (!userData) {
      return { success: false, error: '备份文件无效或已损坏' }
    }

    // Optionally backup current data before restoring
    if (backupFirst) {
      const storageManager = StorageManager.getInstance()
      const currentData = await storageManager.getUserData()
      await syncToLocalFolder(currentData, handle)
    }

    // Restore backup data
    const storageManager = StorageManager.getInstance()
    await storageManager.updateUserData(userData)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Restore failed:', error)
    return { success: false, error: '恢复失败，请检查文件权限' }
  }
}