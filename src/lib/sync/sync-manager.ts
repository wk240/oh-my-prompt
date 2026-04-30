import type { UserData } from '../../shared/types'
import { BACKUP_FILE_NAME, IMAGE_DIR_NAME, VISION_API_CONFIG_STORAGE_KEY } from '../../shared/constants'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle, checkFolderPermission, requestFolderPermission } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder, listBackupVersions, readBackupFile } from './file-sync'
import { readApiConfigFromFolder } from './api-config-sync'
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

export interface SyncErrorInfo {
  type: 'permission_lost' | 'folder_lost' | 'write_failed' | 'unknown'
  message: string
}

/**
 * Trigger sync after data change
 * Called by store.saveToStorage()
 * Returns sync result with error details if failed
 */
export async function triggerSync(userData: UserData): Promise<{ success: boolean; error?: SyncErrorInfo }> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()

  // If sync not enabled, mark as unsynced and return
  if (!settings.syncEnabled) {
    if (userData.prompts.length > 0) {
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
    }
    return { success: false } // No backup configured
  }

  const handle = await getFolderHandle()

  if (!handle) {
    // Folder handle lost - disable sync and mark as unsynced
    await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
    console.warn('[Oh My Prompt] Sync folder handle lost, disabled sync')
    return { success: false, error: { type: 'folder_lost', message: '文件夹信息已丢失，请重新选择' } }
  }

  // Check permission BEFORE attempting sync (critical fix)
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    // Permission lost - cannot restore in Service Worker context
    // Mark as unsynced so UI can show permission restore prompt
    await storageManager.updateSettings({
      syncEnabled: false, // Disable auto-sync until permission restored
      hasUnsyncedChanges: true
    })
    console.warn('[Oh My Prompt] Sync permission lost:', permission)
    return {
      success: false,
      error: {
        type: 'permission_lost',
        message: permission === 'denied'
          ? '文件夹权限被拒绝，请更换文件夹'
          : '文件夹权限已失效，请在备份设置中恢复权限'
      }
    }
  }

  try {
    await syncToLocalFolder(userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
    console.log('[Oh My Prompt] Auto-sync completed')
    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Auto-sync failed:', error)

    // Classify error type for better user feedback
    let errorInfo: SyncErrorInfo
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
        errorInfo = { type: 'permission_lost', message: '文件夹权限已失效，请恢复权限' }
        await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
      } else if (error.name === 'NotFoundError') {
        errorInfo = { type: 'folder_lost', message: '文件夹已被删除或移动，请重新选择' }
        await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
      } else {
        errorInfo = { type: 'write_failed', message: '写入文件失败，请检查磁盘空间' }
        await storageManager.updateSettings({ hasUnsyncedChanges: true })
      }
    } else {
      errorInfo = { type: 'unknown', message: '同步失败，请稍后重试' }
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
    }

    return { success: false, error: errorInfo }
  }
}

/**
 * Initial sync check at startup
 * Also restores API config from encrypted file if needed
 */
export async function initialSync(): Promise<void> {
  console.log('[Oh My Prompt] initialSync: Starting...')

  const handle = await getFolderHandle()
  if (!handle) {
    console.log('[Oh My Prompt] initialSync: No folder handle found')
    return
  }

  console.log('[Oh My Prompt] initialSync: Folder handle found:', handle.name)

  // Check permission before proceeding
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    console.warn('[Oh My Prompt] Initial sync skipped - permission status:', permission)
    // Mark as unsynced so user sees permission restore prompt in backup UI
    const storageManager = StorageManager.getInstance()
    await storageManager.updateSettings({
      syncEnabled: false,
      hasUnsyncedChanges: true
    })
    return
  }

  console.log('[Oh My Prompt] initialSync: Permission granted')

  const storageManager = StorageManager.getInstance()
  const storageData = await storageManager.getData()

  try {
    const localData = await readFromLocalFolder(handle)

    // Case: chrome.storage empty, local has data -> restore
    if (localData && storageData.userData.prompts.length === 0) {
      await storageManager.updateUserData(localData)
      console.log('[Oh My Prompt] Restored from local folder backup')
    }

    // Case: both have data -> sync chrome.storage to local
    if (localData && storageData.userData.prompts.length > 0) {
      const settings = await storageManager.getSettings()
      if (settings.syncEnabled) {
        await syncToLocalFolder(storageData.userData, handle)
        await storageManager.updateSettings({ lastSyncTime: Date.now() })
      }
    }

    // Restore API config from encrypted file if not in storage
    console.log('[Oh My Prompt] initialSync: Checking for encrypted API config...')
    try {
      const apiConfigResult = await chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
      console.log('[Oh My Prompt] initialSync: Existing API config in storage:', !!apiConfigResult[VISION_API_CONFIG_STORAGE_KEY])

      if (!apiConfigResult[VISION_API_CONFIG_STORAGE_KEY]) {
        console.log('[Oh My Prompt] initialSync: Attempting to read from folder...')
        const encryptedConfig = await readApiConfigFromFolder(handle)
        console.log('[Oh My Prompt] initialSync: Encrypted config read result:', !!encryptedConfig)

        if (encryptedConfig) {
          await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: encryptedConfig })
          console.log('[Oh My Prompt] Restored API config from encrypted file')
        }
      }
    } catch (apiRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore API config:', apiRestoreError)
    }
  } catch (error) {
    console.error('[Oh My Prompt] Initial sync failed:', error)
    // Mark as unsynced on failure
    await storageManager.updateSettings({ hasUnsyncedChanges: true })
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

  // Check permission before attempting sync
  const permission = await checkFolderPermission(handle, 'readwrite')
  if (permission !== 'granted') {
    if (permission === 'denied') {
      return { success: false, error: '文件夹权限被拒绝，请更换文件夹' }
    }
    // Permission is 'prompt' - need to restore via popup
    return { success: false, error: '文件夹权限已失效，请在备份设置中恢复权限' }
  }

  try {
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    const result = await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
    return { success: true, createdNewBackup: result.createdNewBackup }
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return { success: false, error: '文件夹已被删除或移动，请重新选择' }
    }
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