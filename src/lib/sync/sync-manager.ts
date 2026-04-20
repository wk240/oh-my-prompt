import type { UserData } from '../../shared/types'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle, removeFolderHandle } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder } from './file-sync'

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
 * Enable sync and select folder
 */
export async function enableSync(): Promise<{ success: boolean; error?: string }> {
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
    // Clean up handle on failure
    await removeFolderHandle()
    console.error('[Oh My Prompt Script] Enable sync failed:', error)
    return { success: false, error: '同步失败，请检查文件夹权限' }
  }
}

/**
 * Disable sync and clear handle
 */
export async function disableSync(): Promise<void> {
  await removeFolderHandle()
  const storageManager = StorageManager.getInstance()
  await storageManager.updateSettings({
    syncEnabled: false,
    lastSyncTime: undefined
  })
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