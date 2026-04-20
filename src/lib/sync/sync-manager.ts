import type { UserData } from '../../shared/types'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder, listBackupVersions, readBackupFile } from './file-sync'
import type { BackupVersion } from './file-sync'

export interface SyncStatus {
  enabled: boolean
  hasFolder: boolean
  lastSyncTime?: number
  folderName?: string
}

/**
 * Trigger sync after data change
 * Called by store.saveToStorage()
 */
export async function triggerSync(userData: UserData): Promise<void> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()

  if (!settings.syncEnabled) {
    return
  }

  const handle = await getFolderHandle()

  if (!handle) {
    // Folder handle lost - disable sync
    await storageManager.updateSettings({ syncEnabled: false })
    console.warn('[Oh My Prompt Script] Sync folder handle lost, disabled sync')
    return
  }

  try {
    await syncToLocalFolder(userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })
    console.log('[Oh My Prompt Script] Auto-sync completed')
  } catch (error) {
    console.error('[Oh My Prompt Script] Auto-sync failed:', error)
    // Keep syncEnabled - user can see error in settings
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
    console.log('[Oh My Prompt Script] Restored from local folder backup')
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
        console.error('[Oh My Prompt Script] Initial sync failed:', error)
      }
    }
  }
}

/**
 * Enable sync - reuse existing folder if permission valid, otherwise select new
 */
export async function enableSync(): Promise<{ success: boolean; error?: string }> {
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
      console.error('[Oh My Prompt Script] Reuse existing folder failed:', error)
      return { success: false, error: '同步失败，请检查文件夹权限或更换文件夹' }
    }
  }

  // No valid handle - select new folder
  const handle = await selectSyncFolder()
  if (!handle) {
    return { success: false, error: '请选择一个文件夹' }
  }

  try {
    await saveFolderHandle(handle)

    // Sync current data immediately
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({
      syncEnabled: true,
      lastSyncTime: Date.now()
    })

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt Script] Enable sync failed:', error)
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
 */
export async function changeSyncFolder(): Promise<{ success: boolean; error?: string }> {
  const handle = await selectSyncFolder()
  if (!handle) {
    return { success: false, error: '请选择一个文件夹' }
  }

  try {
    await saveFolderHandle(handle)

    // Sync current data to new folder
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({
      lastSyncTime: Date.now()
    })

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt Script] Change folder failed:', error)
    return { success: false, error: '更换文件夹失败，请检查权限' }
  }
}

/**
 * Manual sync trigger
 */
export async function manualSync(): Promise<{ success: boolean; error?: string }> {
  const handle = await getFolderHandle()
  if (!handle) {
    return { success: false, error: '文件夹权限已失效，请重新选择' }
  }

  try {
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })
    return { success: true }
  } catch (error) {
    return { success: false, error: '同步失败，请检查文件夹权限' }
  }
}

/**
 * Get current sync status for UI
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()
  const handle = await getFolderHandle()

  return {
    enabled: settings.syncEnabled,
    hasFolder: handle !== null,
    lastSyncTime: settings.lastSyncTime,
    folderName: handle?.name
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
    console.error('[Oh My Prompt Script] Restore failed:', error)
    return { success: false, error: '恢复失败，请检查文件权限' }
  }
}