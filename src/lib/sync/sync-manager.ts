import type { FullBackupData } from './file-sync'
import { BACKUP_FILE_NAME, IMAGE_DIR_NAME, VISION_API_CONFIG_STORAGE_KEY } from '../../shared/constants'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle, checkFolderPermission } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder } from './file-sync'
import type { BackupVersion } from './file-sync'
import { MessageType } from '../../shared/messages'
import { ensureOffscreenDocument, sendToOffscreen } from '../offscreen-manager'

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
 * Trigger sync after data change (including temporary prompts)
 * Called by store.saveToStorage() - routes through offscreen document for better permission handling
 * Returns sync result with error details if failed
 */
export async function triggerSync(backupData: FullBackupData): Promise<{ success: boolean; error?: SyncErrorInfo }> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()

  // If sync not enabled, mark as unsynced and return
  if (!settings.syncEnabled) {
    if (backupData.prompts.length > 0 || backupData.temporaryPrompts.length > 0) {
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
    }
    return { success: false } // No backup configured
  }

  // Get version for backup file
  const version = chrome.runtime.getManifest().version

  // Try sync via offscreen document first (better permission handling)
  try {
    await ensureOffscreenDocument()
    const result = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })

    if (result.success) {
      await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
      console.log('[Oh My Prompt] Auto-sync completed via offscreen, temporaryPrompts:', backupData.temporaryPrompts.length)
      return { success: true }
    }

    // Handle offscreen sync errors
    const error = result.error || 'UNKNOWN'
    console.warn('[Oh My Prompt] Offscreen sync failed:', error)

    // Map error to SyncErrorInfo
    if (error === 'FOLDER_NOT_CONFIGURED') {
      await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
      return { success: false, error: { type: 'folder_lost', message: '文件夹信息已丢失，请重新选择' } }
    }
    if (error === 'PERMISSION_DENIED') {
      await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
      return { success: false, error: { type: 'permission_lost', message: '文件夹权限已失效，请在备份设置中恢复权限' } }
    }

    // Generic write failure
    await storageManager.updateSettings({ hasUnsyncedChanges: true })
    return { success: false, error: { type: 'write_failed', message: '同步失败，请稍后重试' } }
  } catch (offscreenError) {
    console.error('[Oh My Prompt] Offscreen document unavailable:', offscreenError)

    // Fallback: try direct sync (will likely fail in Service Worker context)
    // This fallback is for popup context where permissions might still be valid
    const handle = await getFolderHandle()
    if (!handle) {
      await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
      return { success: false, error: { type: 'folder_lost', message: '文件夹信息已丢失，请重新选择' } }
    }

    const permission = await checkFolderPermission(handle, 'readwrite')
    if (permission !== 'granted') {
      await storageManager.updateSettings({ syncEnabled: false, hasUnsyncedChanges: true })
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
      await syncToLocalFolder(backupData, handle, version)
      await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
      console.log('[Oh My Prompt] Auto-sync completed (fallback), temporaryPrompts:', backupData.temporaryPrompts.length)
      return { success: true }
    } catch (error) {
      console.error('[Oh My Prompt] Fallback sync failed:', error)
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
      return { success: false, error: { type: 'write_failed', message: '同步失败，请稍后重试' } }
    }
  }
}

/**
 * Initial sync check at startup
 * Also restores API config from encrypted file if needed
 * Uses offscreen document for better permission handling
 */
export async function initialSync(): Promise<void> {
  console.log('[Oh My Prompt] initialSync: Starting...')

  try {
    // Check folder configuration via offscreen document
    await ensureOffscreenDocument()
    const permResult = await sendToOffscreen<{ hasFolder: boolean; permission?: 'granted' | 'prompt' | 'denied'; folderName?: string }>(MessageType.OFFSCREEN_CHECK_PERMISSION)

    if (!permResult.success || !permResult.data?.hasFolder) {
      console.log('[Oh My Prompt] initialSync: No folder configured')
      return
    }

    console.log('[Oh My Prompt] initialSync: Folder handle found:', permResult.data.folderName)

    // Check permission status
    const permission = permResult.data.permission
    if (permission !== 'granted') {
      console.warn('[Oh My Prompt] Initial sync skipped - permission status:', permission)
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

    // Read backup data via offscreen (includes temporaryPrompts)
    const backupResult = await sendToOffscreen<FullBackupData>(MessageType.OFFSCREEN_READ_BACKUP, { filename: BACKUP_FILE_NAME })
    const localData = backupResult.success ? backupResult.data : null

    // Case: chrome.storage empty, local has data -> restore
    if (localData && storageData.userData.prompts.length === 0) {
      await storageManager.updateUserData({
        prompts: localData.prompts,
        categories: localData.categories
      })
      // Restore temporary prompts if exist
      if (localData.temporaryPrompts && localData.temporaryPrompts.length > 0) {
        await storageManager.updateTemporaryPrompts(localData.temporaryPrompts)
        console.log('[Oh My Prompt] Restored temporary prompts:', localData.temporaryPrompts.length)
      }
      console.log('[Oh My Prompt] Restored from local folder backup')
    }

    // Case: both have data -> sync chrome.storage to local
    if (localData && storageData.userData.prompts.length > 0) {
      const settings = await storageManager.getSettings()
      if (settings.syncEnabled) {
        const version = chrome.runtime.getManifest().version
        const backupData: FullBackupData = {
          prompts: storageData.userData.prompts,
          categories: storageData.userData.categories,
          temporaryPrompts: storageData.temporaryPrompts || []
        }
        const syncResult = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })
        if (syncResult.success) {
          await storageManager.updateSettings({ lastSyncTime: Date.now() })
        }
      }
    }

    // Restore API config from encrypted file if not in storage
    console.log('[Oh My Prompt] initialSync: Checking for encrypted API config...')
    try {
      const apiConfigResult = await chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
      console.log('[Oh My Prompt] initialSync: Existing API config in storage:', !!apiConfigResult[VISION_API_CONFIG_STORAGE_KEY])

      if (!apiConfigResult[VISION_API_CONFIG_STORAGE_KEY]) {
        console.log('[Oh My Prompt] initialSync: Attempting to read from folder...')
        const apiResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_API_CONFIG)
        console.log('[Oh My Prompt] initialSync: Encrypted config read result:', !!apiResult.success)

        if (apiResult.success && apiResult.data) {
          await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: apiResult.data })
          console.log('[Oh My Prompt] Restored API config from encrypted file')
        }
      }
    } catch (apiRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore API config:', apiRestoreError)
    }
  } catch (error) {
    console.error('[Oh My Prompt] Initial sync failed:', error)
    // Mark as unsynced on failure
    const storageManager = StorageManager.getInstance()
    await storageManager.updateSettings({ hasUnsyncedChanges: true })
  }
}

export interface ExistingBackupInfo {
  hasBackup: boolean
  promptCount?: number
  categoryCount?: number
  temporaryPromptCount?: number // Temporary library prompt count
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
      const backupData: FullBackupData = {
        prompts: data.userData.prompts,
        categories: data.userData.categories,
        temporaryPrompts: data.temporaryPrompts || []
      }
      await syncToLocalFolder(backupData, existingHandle)
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
          existingBackupInfo.temporaryPromptCount = existingData.temporaryPrompts?.length || 0
          existingBackupInfo.backupTime = parsed.backupTime
        } catch {
          existingBackupInfo.hasBackup = true
          existingBackupInfo.promptCount = existingData.prompts.length
          existingBackupInfo.categoryCount = existingData.categories.length
          existingBackupInfo.temporaryPromptCount = existingData.temporaryPrompts?.length || 0
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
          existingBackupInfo.temporaryPromptCount = existingData.temporaryPrompts?.length || 0
          existingBackupInfo.backupTime = parsed.backupTime
        } catch {
          existingBackupInfo.hasBackup = true
          existingBackupInfo.promptCount = existingData.prompts.length
          existingBackupInfo.categoryCount = existingData.categories.length
          existingBackupInfo.temporaryPromptCount = existingData.temporaryPrompts?.length || 0
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
 * Manual sync trigger (called from popup)
 * Routes through offscreen document for better permission handling
 * Returns whether a new history backup was created
 */
export async function manualSync(): Promise<{ success: boolean; createdNewBackup?: boolean; error?: string }> {
  try {
    await ensureOffscreenDocument()

    // Check permission first
    const permResult = await sendToOffscreen<{ hasFolder: boolean; permission?: 'granted' | 'prompt' | 'denied' }>(MessageType.OFFSCREEN_CHECK_PERMISSION)
    if (!permResult.success || !permResult.data?.hasFolder) {
      return { success: false, error: '文件夹权限已失效，请重新选择' }
    }

    if (permResult.data.permission === 'denied') {
      return { success: false, error: '文件夹权限被拒绝，请更换文件夹' }
    }

    if (permResult.data.permission === 'prompt') {
      // Try to request permission through offscreen document
      const restoreResult = await sendToOffscreen<{ permission: 'granted' | 'prompt' | 'denied' }>(MessageType.OFFSCREEN_REQUEST_PERMISSION)
      if (!restoreResult.success) {
        return { success: false, error: '文件夹权限已失效，请在备份设置中恢复权限' }
      }
    }

    // Sync via offscreen document
    const storageManager = StorageManager.getInstance()
    const data = await storageManager.getData()
    const version = chrome.runtime.getManifest().version
    const backupData: FullBackupData = {
      prompts: data.userData.prompts,
      categories: data.userData.categories,
      temporaryPrompts: data.temporaryPrompts || []
    }
    const syncResult = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })

    if (syncResult.success) {
      await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
      return { success: true, createdNewBackup: true }
    }

    return { success: false, error: syncResult.error || '同步失败' }
  } catch (error) {
    console.error('[Oh My Prompt] Manual sync failed:', error)
    return { success: false, error: '同步失败，请检查文件夹权限' }
  }
}

/**
 * Get current sync status for UI
 * Uses offscreen document for permission check
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const storageManager = StorageManager.getInstance()
  const settings = await storageManager.getSettings()

  try {
    await ensureOffscreenDocument()
    const permResult = await sendToOffscreen<{ hasFolder: boolean; permission?: 'granted' | 'prompt' | 'denied'; folderName?: string }>(MessageType.OFFSCREEN_CHECK_PERMISSION)

    if (!permResult.success || !permResult.data?.hasFolder) {
      return {
        enabled: settings.syncEnabled,
        hasFolder: false,
        lastSyncTime: settings.lastSyncTime,
        hasUnsyncedChanges: settings.hasUnsyncedChanges,
        dismissedBackupWarning: settings.dismissedBackupWarning,
        permissionStatus: undefined
      }
    }

    return {
      enabled: settings.syncEnabled,
      hasFolder: true,
      lastSyncTime: settings.lastSyncTime,
      folderName: permResult.data.folderName,
      hasUnsyncedChanges: settings.hasUnsyncedChanges,
      dismissedBackupWarning: settings.dismissedBackupWarning,
      permissionStatus: permResult.data.permission
    }
  } catch (error) {
    // Fallback: use direct permission check (for popup context)
    console.warn('[Oh My Prompt] Offscreen permission check failed, using fallback:', error)
    const handle = await getFolderHandle()
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
}

/**
 * Restore permission for existing folder handle
 * Uses offscreen document for permission request
 * Returns success if permission was granted, otherwise error
 */
export async function restorePermission(): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureOffscreenDocument()

    // Check if folder exists
    const permResult = await sendToOffscreen<{ hasFolder: boolean }>(MessageType.OFFSCREEN_CHECK_PERMISSION)
    if (!permResult.success || !permResult.data?.hasFolder) {
      return { success: false, error: '文件夹信息已丢失，请重新选择' }
    }

    // Request permission via offscreen document
    const restoreResult = await sendToOffscreen<{ permission: 'granted' | 'prompt' | 'denied' }>(MessageType.OFFSCREEN_REQUEST_PERMISSION)

    if (restoreResult.success && restoreResult.data?.permission === 'granted') {
      // Permission restored successfully - sync current data
      const storageManager = StorageManager.getInstance()
      const data = await storageManager.getData()
      const backupData: FullBackupData = {
        prompts: data.userData.prompts,
        categories: data.userData.categories,
        temporaryPrompts: data.temporaryPrompts || []
      }
      const syncResult = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData })

      if (syncResult.success) {
        await storageManager.updateSettings({
          syncEnabled: true,
          lastSyncTime: Date.now(),
          hasUnsyncedChanges: false
        })
        console.log('[Oh My Prompt] Permission restored and sync completed')
        return { success: true }
      }
      return { success: false, error: '同步失败，请检查文件夹权限' }
    }

    if (restoreResult.error === 'PERMISSION_DENIED') {
      return { success: false, error: '权限被拒绝，请更换文件夹' }
    }

    return { success: false, error: '请在弹出的对话框中授权' }
  } catch (error) {
    console.error('[Oh My Prompt] Permission restore failed:', error)
    return { success: false, error: '恢复权限失败，请重新选择文件夹' }
  }
}

/**
 * Get backup versions list for UI
 * Uses offscreen document for file operations
 */
export async function getBackupVersions(): Promise<{ versions: BackupVersion[]; error?: string }> {
  try {
    await ensureOffscreenDocument()
    const result = await sendToOffscreen<BackupVersion[]>(MessageType.OFFSCREEN_LIST_VERSIONS)

    if (result.success && result.data) {
      return { versions: result.data }
    }

    return { versions: [], error: result.error || '读取版本列表失败' }
  } catch (error) {
    console.error('[Oh My Prompt] Get backup versions failed:', error)
    return { versions: [], error: '读取版本列表失败' }
  }
}

/**
 * Restore data from specific backup version (including temporary prompts)
 * Uses offscreen document for file operations
 */
export async function restoreFromBackup(
  filename: string,
  backupFirst: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureOffscreenDocument()

    // Read backup file via offscreen (includes temporaryPrompts)
    const readResult = await sendToOffscreen<FullBackupData>(MessageType.OFFSCREEN_READ_BACKUP, { filename })
    if (!readResult.success || !readResult.data) {
      return { success: false, error: readResult.error || '备份文件无效或已损坏' }
    }

    const backupData = readResult.data

    // Optionally backup current data before restoring
    if (backupFirst) {
      const storageManager = StorageManager.getInstance()
      const currentData = await storageManager.getData()
      const version = chrome.runtime.getManifest().version
      const currentBackupData: FullBackupData = {
        prompts: currentData.userData.prompts,
        categories: currentData.userData.categories,
        temporaryPrompts: currentData.temporaryPrompts || []
      }
      await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData: currentBackupData, version })
    }

    // Restore backup data (including temporary prompts)
    const storageManager = StorageManager.getInstance()
    await storageManager.updateUserData({
      prompts: backupData.prompts,
      categories: backupData.categories
    })
    // Restore temporary prompts
    if (backupData.temporaryPrompts) {
      await storageManager.updateTemporaryPrompts(backupData.temporaryPrompts)
      console.log('[Oh My Prompt] Restored temporary prompts:', backupData.temporaryPrompts.length)
    }
    await storageManager.updateSettings({ lastSyncTime: Date.now() })

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Restore failed:', error)
    return { success: false, error: '恢复失败，请检查文件权限' }
  }
}