import type { FullBackupData } from './file-sync'
import type { ProviderConfigsStorage } from '@oh-my-prompt/shared/types'
import { BACKUP_FILE_NAME, IMAGE_DIR_NAME, VISION_API_CONFIG_STORAGE_KEY, PROVIDER_CONFIGS_STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import { StorageManager } from '../storage'
import { getFolderHandle, saveFolderHandle, checkFolderPermission } from './indexeddb'
import { syncToLocalFolder, readFromLocalFolder, selectSyncFolder } from './file-sync'
import type { BackupVersion } from './file-sync'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { ensureOffscreenDocument, sendToOffscreen } from '../offscreen-manager'
import { readApiConfigFromFolder } from './api-config-sync'

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

  // Auto-fix: check if folder handle exists but syncEnabled is false
  // This can happen after extension refresh or when permission is in 'prompt' state
  if (!settings.syncEnabled) {
    // Check if we have a folder handle via offscreen document
    try {
      await ensureOffscreenDocument()
      const permResult = await sendToOffscreen<{ hasFolder: boolean; permission?: 'granted' | 'prompt' | 'denied' }>(MessageType.OFFSCREEN_CHECK_PERMISSION)

      // If folder exists and permission is not denied, auto-enable sync
      if (permResult.success && permResult.data?.hasFolder && permResult.data.permission !== 'denied') {
        console.log('[Oh My Prompt] Auto-fixing syncEnabled in triggerSync: folder exists, permission:', permResult.data.permission)
        await storageManager.updateSettings({ syncEnabled: true })
        // Continue with sync below
      } else {
        // No folder or permission denied - mark as unsynced and return
        if (backupData.prompts.length > 0 || backupData.temporaryPrompts.length > 0) {
          await storageManager.updateSettings({ hasUnsyncedChanges: true })
        }
        return { success: false } // No backup configured or permission denied
      }
    } catch (e) {
      console.warn('[Oh My Prompt] Failed to check folder status in triggerSync:', e)
      // Fallback: mark as unsynced if sync not enabled
      if (backupData.prompts.length > 0 || backupData.temporaryPrompts.length > 0) {
        await storageManager.updateSettings({ hasUnsyncedChanges: true })
      }
      return { success: false }
    }
  }

  // Get version for backup file
  const version = chrome.runtime.getManifest().version

  // Try sync via offscreen document first (better permission handling)
  try {
    await ensureOffscreenDocument()
    const result = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })

    if (result.success) {
      await storageManager.updateSettings({ lastSyncTime: Date.now(), hasUnsyncedChanges: false })
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
    if (error === 'PERMISSION_PROMPT') {
      // Permission needs to be restored via user gesture (not permanently lost)
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
      return { success: false, error: { type: 'permission_lost', message: '文件夹权限需要重新授权，请在备份设置中恢复权限' } }
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
      return { success: true }
    } catch (error) {
      console.error('[Oh My Prompt] Fallback sync failed:', error)
      await storageManager.updateSettings({ hasUnsyncedChanges: true })
      return { success: false, error: { type: 'write_failed', message: '同步失败，请稍后重试' } }
    }
  }
}

/**
 * Restore API config from encrypted file in folder
 * Called when user selects a folder or on plugin startup
 * Returns true if config was restored, false otherwise
 */
export async function restoreApiConfigFromFolder(): Promise<boolean> {

  try {
    // Check if API config already exists in storage
    const apiConfigResult = await chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
    if (apiConfigResult[VISION_API_CONFIG_STORAGE_KEY]) {
      return false
    }

    // Get folder handle
    const handle = await getFolderHandle()
    if (!handle) {
      return false
    }

    // Try to read encrypted config from folder (direct read, not via offscreen)
    const config = await readApiConfigFromFolder(handle)
    if (!config) {
      return false
    }

    // Save to storage
    await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: config })
    return true
  } catch (error) {
    console.warn('[Oh My Prompt] restoreApiConfigFromFolder: Failed:', error)
    return false
  }
}

/**
 * Initial sync check at startup
 * Also restores API config from encrypted file if needed
 * Uses offscreen document for better permission handling
 */
export async function initialSync(): Promise<void> {

  try {
    // Check folder configuration via offscreen document
    await ensureOffscreenDocument()
    const permResult = await sendToOffscreen<{ hasFolder: boolean; permission?: 'granted' | 'prompt' | 'denied'; folderName?: string }>(MessageType.OFFSCREEN_CHECK_PERMISSION)

    if (!permResult.success || !permResult.data?.hasFolder) {
      return
    }


    // Check permission status
    const permission = permResult.data.permission
    if (permission !== 'granted') {
      console.warn('[Oh My Prompt] Initial sync skipped - permission status:', permission)
      // Don't disable sync - just mark as unsynced
      // syncEnabled should remain true so that permission restore can trigger sync
      const storageManager = StorageManager.getInstance()
      await storageManager.updateSettings({
        hasUnsyncedChanges: true
      })
      return
    }


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
      }
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
    try {
      const apiConfigResult = await chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)

      if (!apiConfigResult[VISION_API_CONFIG_STORAGE_KEY]) {
        const apiResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_API_CONFIG)

        if (apiResult.success && apiResult.data) {
          await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: apiResult.data })
        }
      }
    } catch (apiRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore API config:', apiRestoreError)
    }

    // Restore ProviderConfigsStorage from folder if not in storage
    try {
      const providerConfigsResult = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)

      if (!providerConfigsResult[PROVIDER_CONFIGS_STORAGE_KEY]) {
        const providerResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_PROVIDER_CONFIGS)

        if (providerResult.success && providerResult.data) {
          await chrome.storage.local.set({ [PROVIDER_CONFIGS_STORAGE_KEY]: providerResult.data })
        }
      }
    } catch (providerRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore provider configs:', providerRestoreError)
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
      // Restore API config from folder if not in storage
      await restoreApiConfigFromFolder()
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

    // Restore API config from folder if not in storage
    await restoreApiConfigFromFolder()

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

    // Restore API config from folder if not in storage
    await restoreApiConfigFromFolder()

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

    // Auto-fix: if folder handle exists but syncEnabled is false, enable sync
    if (!settings.syncEnabled && permResult.data.hasFolder) {
      console.log('[Oh My Prompt] Auto-fixing syncEnabled: folder exists, enabling sync')
      await storageManager.updateSettings({ syncEnabled: true })
    }

    return {
      enabled: true, // Always true when folder exists
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

    // Auto-fix: if folder handle exists but syncEnabled is false, enable sync
    if (!settings.syncEnabled && handle) {
      console.log('[Oh My Prompt] Auto-fixing syncEnabled: folder exists (fallback), enabling sync')
      await storageManager.updateSettings({ syncEnabled: true })
    }

    return {
      enabled: handle !== null, // Always true when folder exists
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
  console.log('[Oh My Prompt] getBackupVersions: starting...')
  try {
    await ensureOffscreenDocument()
    console.log('[Oh My Prompt] getBackupVersions: offscreen ready, sending message...')
    const result = await sendToOffscreen<BackupVersion[]>(MessageType.OFFSCREEN_LIST_VERSIONS)
    console.log('[Oh My Prompt] getBackupVersions: result=', JSON.stringify(result))

    if (result.success && result.data) {
      console.log('[Oh My Prompt] getBackupVersions: success, versions count=', result.data.length)
      return { versions: result.data }
    }

    // Convert technical errors to user-friendly messages
    const errorCode = result.error || 'READ_FAILED'
    console.warn('[Oh My Prompt] getBackupVersions: failed with error=', errorCode)
    let errorMessage: string
    if (errorCode === 'PERMISSION_PROMPT') {
      errorMessage = '文件夹权限需要恢复，请点击"恢复权限"按钮'
    } else if (errorCode === 'PERMISSION_DENIED') {
      errorMessage = '文件夹权限被拒绝，请更换文件夹'
    } else if (errorCode === 'FOLDER_NOT_CONFIGURED') {
      errorMessage = '请先配置备份文件夹'
    } else {
      errorMessage = '读取备份历史失败'
    }

    return { versions: [], error: errorMessage }
  } catch (error) {
    console.error('[Oh My Prompt] Get backup versions failed:', error)
    return { versions: [], error: '读取备份历史失败' }
  }
}

/**
 * Restore data from specific backup version (including temporary prompts)
 * Uses offscreen document for file operations
 *
 * @param filename - Backup filename to restore
 * @param backupFirst - Whether to backup current data before restoring (default: true)
 * @param mode - 'replace' replaces all data, 'merge' merges with current data (default: 'replace')
 * @returns Success status with merge counts if mode='merge'
 */
export async function restoreFromBackup(
  filename: string,
  backupFirst: boolean = true,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{
  success: boolean
  error?: string
  addedCount?: number
  updatedCount?: number
  addedCategories?: number
}> {
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

    // Handle merge mode
    if (mode === 'merge') {
      const storageManager = StorageManager.getInstance()
      const currentData = await storageManager.getData()

      const { mergePromptData } = await import('./merge-data')
      const merged = mergePromptData(
        currentData.userData.prompts,
        backupData.prompts,
        currentData.userData.categories,
        backupData.categories
      )

      await storageManager.updateUserData({
        prompts: merged.prompts,
        categories: merged.categories
      })

      // Handle temporary prompts: keep current + add new from backup
      const currentTempIds = new Set(currentData.temporaryPrompts?.map(p => p.id) || [])
      const mergedTemporaryPrompts = [
        ...(currentData.temporaryPrompts || []),
        ...(backupData.temporaryPrompts?.filter(p => !currentTempIds.has(p.id)) || [])
      ]
      if (mergedTemporaryPrompts.length > 0) {
        await storageManager.updateTemporaryPrompts(mergedTemporaryPrompts)
      }

      await storageManager.updateSettings({ lastSyncTime: Date.now() })

      // Sync merged data to latest backup
      const version = chrome.runtime.getManifest().version
      const mergedBackupData: FullBackupData = {
        prompts: merged.prompts,
        categories: merged.categories,
        temporaryPrompts: mergedTemporaryPrompts
      }
      await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData: mergedBackupData, version })

      return {
        success: true,
        addedCount: merged.addedPrompts,
        updatedCount: merged.updatedPrompts,
        addedCategories: merged.addedCategories
      }
    }

    // Replace mode: Restore backup data (including temporary prompts)
    const storageManager = StorageManager.getInstance()
    await storageManager.updateUserData({
      prompts: backupData.prompts,
      categories: backupData.categories
    })
    // Restore temporary prompts
    if (backupData.temporaryPrompts) {
      await storageManager.updateTemporaryPrompts(backupData.temporaryPrompts)
    }
    await storageManager.updateSettings({ lastSyncTime: Date.now() })

    // Sync restored data to latest backup file (omps-latest.json)
    // This ensures the restored state becomes the "current" backup state
    const version = chrome.runtime.getManifest().version
    await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })

    // Restore API config from backup folder (overwrite existing)
    try {
      const apiResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_API_CONFIG)
      if (apiResult.success && apiResult.data) {
        await chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: apiResult.data })
        console.log('[Oh My Prompt] API config restored from backup')
      }
    } catch (apiRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore API config from backup:', apiRestoreError)
    }

    // Restore ProviderConfigs from backup folder (overwrite existing)
    try {
      const providerResult = await sendToOffscreen(MessageType.OFFSCREEN_READ_PROVIDER_CONFIGS)
      if (providerResult.success && providerResult.data) {
        await chrome.storage.local.set({ [PROVIDER_CONFIGS_STORAGE_KEY]: providerResult.data })
        console.log('[Oh My Prompt] Provider configs restored from backup')
      }
    } catch (providerRestoreError) {
      console.warn('[Oh My Prompt] Failed to restore provider configs from backup:', providerRestoreError)
    }

    return { success: true }
  } catch (error) {
    console.error('[Oh My Prompt] Restore failed:', error)
    return { success: false, error: '恢复失败，请检查文件权限' }
  }
}

/**
 * Trigger provider configs sync to local folder
 * Called after ADD/UPDATE/DELETE/SET_ACTIVE_PROVIDER_CONFIG operations
 * Routes through offscreen document for better permission handling
 */
export async function triggerProviderConfigsSync(): Promise<boolean> {
  try {
    // Get current provider configs from storage
    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined

    if (!storage) {
      return false
    }

    // Get folder handle
    const handle = await getFolderHandle()
    if (!handle) {
      console.warn('[Oh My Prompt] No folder handle for provider configs sync')
      return false
    }

    // Sync via offscreen document
    await ensureOffscreenDocument()
    const syncResult = await sendToOffscreen(MessageType.OFFSCREEN_SAVE_PROVIDER_CONFIGS, { storage })

    return syncResult.success
  } catch (error) {
    console.error('[Oh My Prompt] Provider configs sync failed:', error)
    return false
  }
}