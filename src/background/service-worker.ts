import { MessageType, MessageResponse } from '../shared/messages'
import type { StorageSchema, SyncSettings, VisionApiConfig, InsertPromptPayload, InsertResultPayload, SaveTemporaryPromptPayload, UpdateTemporaryPromptFormatPayload, Prompt, ProviderConfig, ProviderConfigsStorage } from '../shared/types'
import { StorageManager } from '../lib/storage'
import { saveFolderHandle, getFolderHandle } from '../lib/sync/indexeddb'
import { getSyncStatus, triggerSync, restorePermission, initialSync } from '../lib/sync/sync-manager'
import { syncApiConfigToFolder } from '../lib/sync/api-config-sync'
import { checkForUpdate, getUpdateStatus, clearUpdateStatus, type UpdateStatus } from '../lib/version-checker'
import { executeVisionApiCall, classifyApiError, getLanguagePreference } from '../lib/vision-api'
import { asyncCompressImageFromUrl } from '../lib/image-utils'
import { CAPTURED_IMAGE_STORAGE_KEY, VISION_API_CONFIG_STORAGE_KEY, PROVIDER_CONFIGS_STORAGE_KEY, LEGACY_VISION_API_CONFIG_KEY } from '../shared/constants'
import { validateProviderConfig, maskApiKey } from '../lib/config-validator'
import { sendToOffscreen } from '../lib/offscreen-manager'
import '../lib/migrations/register' // Register all migrations


// Create context menu on startup (survives service worker restarts)
function createContextMenu(): void {
  chrome.contextMenus.create({
    id: 'convert-to-prompt',
    title: '用 OhMyPrompt 将此图片转为Prompt',
    contexts: ['image'], // D-02, MENU-02: Only appear on image elements
    targetUrlPatterns: ['http://*/*', 'https://*/*'] // D-03, D-07: Filter to http/https URLs only
  }, () => {
    if (chrome.runtime.lastError) {
      // Chrome runtime.lastError has message property
      const errorMsg = chrome.runtime.lastError.message
      // Ignore duplicate/already exists errors on restart
      if (errorMsg && (errorMsg.includes('already exists') || errorMsg.includes('duplicate'))) {
      } else {
        console.error('[Oh My Prompt] Context menu creation error:', errorMsg || JSON.stringify(chrome.runtime.lastError))
      }
    } else {
    }
  })
}

// Create on startup
createContextMenu()

// Run initial sync on startup (restores data from backup folder including encrypted API config)
initialSync().catch(err => console.error('[Oh My Prompt] Initial sync error:', err))

// Also create on install (for clean install)
chrome.runtime.onInstalled.addListener(() => {
  createContextMenu()

  // Set side panel to open on action click (Chrome 116+)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Oh My Prompt] Side panel behavior error:', error))

  // Run initial sync on install (restores data from backup folder)
  initialSync().catch(err => console.error('[Oh My Prompt] Initial sync on install error:', err))
})

// Open side panel when extension icon is clicked (fallback for older Chrome versions)
chrome.action.onClicked.addListener((tab) => {
  // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
  if (tab.id !== undefined && tab.id >= 0) {
    chrome.sidePanel.open({ tabId: tab.id })
      .catch((error) => console.error('[Oh My Prompt] Side panel open error:', error))
  }
})

const storageManager = StorageManager.getInstance()

/**
 * Migrate legacy VisionApiConfig to new ProviderConfigsStorage
 * Runs on install and startup
 */
async function migrateLegacyProviderConfig(): Promise<void> {
  const result = await chrome.storage.local.get([
    LEGACY_VISION_API_CONFIG_KEY,
    PROVIDER_CONFIGS_STORAGE_KEY
  ])

  // Skip if new configs already exist
  const existingStorage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
  if (existingStorage && existingStorage.configs && existingStorage.configs.length > 0) {
    return
  }

  // Migrate legacy config
  const legacyConfig = result[LEGACY_VISION_API_CONFIG_KEY] as VisionApiConfig | undefined
  if (legacyConfig?.apiKey) {
    const migratedConfig: ProviderConfig = {
      id: crypto.randomUUID(),
      providerId: 'migrated',
      providerName: '迁移的配置',
      apiKey: legacyConfig.apiKey,
      apiEndpoint: legacyConfig.baseUrl,
      apiFormat: legacyConfig.apiFormat === 'anthropic' ? 'anthropic_messages' : 'chat_completions',
      selectedModel: legacyConfig.modelName,
      configuredAt: legacyConfig.configuredAt || Date.now(),
      isCustom: true
    }

    await chrome.storage.local.set({
      [PROVIDER_CONFIGS_STORAGE_KEY]: {
        configs: [migratedConfig],
        activeConfigId: migratedConfig.id
      }
    })

    console.log('[Oh My Prompt] Migrated legacy API config to provider configs')
  }
}

// Run migration on install and startup
chrome.runtime.onInstalled.addListener(migrateLegacyProviderConfig)
chrome.runtime.onStartup.addListener(migrateLegacyProviderConfig)

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: 'pong' } as MessageResponse<string>)
        break

      case MessageType.GET_STORAGE:
        storageManager.getData()
          .then(data => sendResponse({ success: true, data } as MessageResponse<StorageSchema>))
          .catch(error => {
            console.error('[Oh My Prompt] GET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage retrieval failed' })
          })
        return true // Required for async response

      case MessageType.SET_STORAGE:
        if (!message.payload) {
          console.error('[Oh My Prompt] SET_STORAGE: No payload provided')
          sendResponse({ success: false, error: 'No payload provided' })
          return true
        }

        // Merge with existing settings to preserve syncEnabled, etc.
        storageManager.getData()
          .then(existingData => {
            const payload = message.payload as StorageSchema
            // Preserve existing settings if payload doesn't have full settings
            const mergedSettings: SyncSettings = {
              ...existingData.settings,
              ...payload.settings
            }

            const mergedData: StorageSchema = {
              version: payload.version,
              userData: payload.userData,
              settings: mergedSettings,
              temporaryPrompts: payload.temporaryPrompts ?? existingData.temporaryPrompts,
              _migrationComplete: payload._migrationComplete ?? existingData._migrationComplete
            }

            return storageManager.saveData(mergedData).then(() => mergedData)
          })
          .then((savedData: StorageSchema) => {
            // Trigger sync with full backup data (including temporary prompts)
            const backupData = {
              prompts: savedData.userData.prompts,
              categories: savedData.userData.categories,
              temporaryPrompts: savedData.temporaryPrompts || []
            }
            return triggerSync(backupData).then(syncResult => {
              if (!syncResult.success) {
                console.warn('[Oh My Prompt] Sync failed:', syncResult.error?.type, syncResult.error?.message)

                // Notify UI about sync failure with error details
                chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
                  tabs.forEach(tab => {
                    // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
                    if (tab.id !== undefined && tab.id >= 0) {
                      chrome.tabs.sendMessage(tab.id, {
                        type: MessageType.SYNC_FAILED,
                        payload: {
                          errorType: syncResult.error?.type,
                          errorMessage: syncResult.error?.message
                        }
                      })
                    }
                  })
                })
              }
              // Return sync status and error info in response
              sendResponse({
                success: true,
                data: {
                  syncSuccess: syncResult.success,
                  syncError: syncResult.error
                }
              } as MessageResponse)
            })
          })
          .catch(error => {
            console.error('[Oh My Prompt] SET_STORAGE error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      case MessageType.INSERT_PROMPT:
        // Phase 12: Forward INSERT_PROMPT to content script (D-02)
        const insertPayload = message.payload as InsertPromptPayload
        if (!insertPayload || !insertPayload.prompt || !insertPayload.tabId) {
          sendResponse({ success: false, error: 'Invalid payload: prompt and tabId required' })
          return true
        }

        // Forward to content script on Lovart tab
        chrome.tabs.sendMessage(insertPayload.tabId, {
          type: MessageType.INSERT_PROMPT_TO_CS,
          payload: { prompt: insertPayload.prompt }
        })
          .then((response: InsertResultPayload | undefined) => {
            if (response && response.success) {
              sendResponse({ success: true })
            } else {
              sendResponse({
                success: false,
                error: response?.error || 'Insert failed'
              })
            }
          })
          .catch((error) => {
            console.error('[Oh My Prompt] INSERT_PROMPT forwarding error:', error)
            sendResponse({ success: false, error: 'Tab not reachable' })
          })
        return true // Required for async response

      case MessageType.SAVE_FOLDER_HANDLE:
        // Save handle from content script (backup already done in content script)
        const handle = message.payload?.handle as FileSystemDirectoryHandle | undefined
        const folderName = message.payload?.folderName as string | undefined
        const lastSyncTime = message.payload?.lastSyncTime as number | undefined
        if (!handle) {
          sendResponse({ success: false, error: 'No handle provided' })
          return true
        }
        saveFolderHandle(handle)
          .then(() => storageManager.updateSettings({
            lastSyncTime: lastSyncTime || Date.now()
          }))
          .then(() => getSyncStatus())
          .then(status => {
            // Update status with folder name if provided
            if (folderName && status) {
              status.folderName = folderName
            }
            sendResponse({ success: true, data: status } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt] SAVE_FOLDER_HANDLE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.GET_SYNC_STATUS:
        // Get current sync status for UI display
        getSyncStatus()
          .then(status => sendResponse({ success: true, data: status } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] GET_SYNC_STATUS error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.GET_FOLDER_HANDLE:
        // Get folder handle for content script (IndexedDB is context-isolated)
        // NOTE: FileSystemDirectoryHandle cannot be passed cross-origin via message
        // This is kept for backward compatibility but content scripts should use SAVE_IMAGE instead
        getFolderHandle()
          .then(handle => sendResponse({ success: true, data: handle } as MessageResponse<FileSystemDirectoryHandle | null>))
          .catch(error => {
            console.error('[Oh My Prompt] GET_FOLDER_HANDLE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SAVE_IMAGE:
        // Save image to folder via offscreen document (better permission handling)
        const saveImagePayload = message.payload as { promptId: string; data: number[]; originalFilename?: string }
        if (!saveImagePayload || !saveImagePayload.promptId || !saveImagePayload.data) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        sendToOffscreen(MessageType.OFFSCREEN_SAVE_IMAGE, saveImagePayload)
          .then(result => sendResponse(result as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] SAVE_IMAGE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.READ_IMAGE:
        // Read image from folder via offscreen document
        const readImagePayload = message.payload as { relativePath: string }
        if (!readImagePayload || !readImagePayload.relativePath) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        sendToOffscreen(MessageType.OFFSCREEN_READ_IMAGE, readImagePayload)
          .then(result => sendResponse(result as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] READ_IMAGE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.DELETE_IMAGE:
        // Delete image from folder via offscreen document
        const deleteImagePayload = message.payload as { promptId: string }
        if (!deleteImagePayload || !deleteImagePayload.promptId) {
          sendResponse({ success: false, error: 'Invalid payload' })
          return true
        }
        sendToOffscreen(MessageType.OFFSCREEN_DELETE_IMAGE, deleteImagePayload)
          .then(result => sendResponse(result as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] DELETE_IMAGE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SET_UNSYNCED_FLAG:
        // Set hasUnsyncedChanges flag after reorder operations
        storageManager.updateSettings({ hasUnsyncedChanges: true })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] SET_UNSYNCED_FLAG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.OPEN_BACKUP_PAGE:
        // Open backup page in a new tab with source tab ID
        const sourceTabId = _sender.tab?.id
        const url = sourceTabId
          ? `src/popup/backup.html?sourceTabId=${sourceTabId}`
          : 'src/popup/backup.html'
        chrome.tabs.create({ url: chrome.runtime.getURL(url) })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_BACKUP_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open backup page' })
          })
        return true // Required for async response

      case MessageType.REFRESH_DATA:
        // Broadcast refresh to all content scripts (handled by tabs.sendMessage)
        // This is just a confirmation from backup page
        sendResponse({ success: true } as MessageResponse)
        break

      case MessageType.CHECK_UPDATE:
        // Manual update check triggered from popup (no badge notification)
        checkForUpdate()
          .then(status => {
            sendResponse({ success: true, data: status } as MessageResponse<UpdateStatus>)
          })
          .catch(error => {
            console.error('[Oh My Prompt] CHECK_UPDATE error:', error)
            sendResponse({ success: false, error: 'Failed to check for updates' })
          })
        return true // Required for async response

      case MessageType.GET_UPDATE_STATUS:
        // Get stored update status for popup display
        getUpdateStatus()
          .then(status => sendResponse({ success: true, data: status } as MessageResponse<UpdateStatus | null>))
          .catch(error => {
            console.error('[Oh My Prompt] GET_UPDATE_STATUS error:', error)
            sendResponse({ success: false, error: 'Failed to get update status' })
          })
        return true // Required for async response

      case MessageType.CLEAR_UPDATE_STATUS:
        // Clear update notification (user dismissed)
        clearUpdateStatus()
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] CLEAR_UPDATE_STATUS error:', error)
            sendResponse({ success: false, error: 'Failed to clear update status' })
          })
        return true // Required for async response

      case MessageType.OPEN_EXTENSIONS:
        // Open Chrome extensions page (cannot use window.open in content script)
        chrome.tabs.create({ url: 'chrome://extensions' })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_EXTENSIONS error:', error)
            sendResponse({ success: false, error: 'Failed to open extensions page' })
          })
        return true // Required for async response

      case MessageType.OPEN_SETTINGS_PAGE:
        // Open settings.html for settings center (called from dropdown or VisionModal)
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_SETTINGS_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open settings page' })
          })
        return true // Required for async response

      case MessageType.OPEN_API_CONFIG_PAGE:
        // Open api-config.html from Vision Modal (content script cannot use chrome.tabs)
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/api-config.html') })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] OPEN_API_CONFIG_PAGE error:', error)
            sendResponse({ success: false, error: 'Failed to open API config page' })
          })
        return true // Required for async response

      case MessageType.EXPORT_DATA:
        // Export data as JSON file download using data URL (service worker doesn't support blob URLs)
        const exportPayload = message.payload as { version: string; userData: { prompts: unknown[]; categories: unknown[] }; settings: unknown }
        const exportFilename = 'oh-my-prompt.json'
        const exportJson = JSON.stringify(exportPayload, null, 2)
        const exportDataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(exportJson)}`
        chrome.downloads.download({
          url: exportDataUrl,
          filename: exportFilename,
          saveAs: true
        })
          .then(() => {
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt] EXPORT_DATA error:', error)
            sendResponse({ success: false, error: 'Failed to download file' })
          })
        return true // Required for async response

      case MessageType.DISMISS_BACKUP_WARNING:
        // User dismissed backup warning - save preference
        storageManager.updateSettings({ dismissedBackupWarning: true })
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] DISMISS_BACKUP_WARNING error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.RESTORE_PERMISSION:
        // Restore folder permission after extension update
        restorePermission()
          .then(result => sendResponse({ success: result.success, error: result.error } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] RESTORE_PERMISSION error:', error)
            sendResponse({ success: false, error: 'Failed to restore permission' })
          })
        return true // Required for async response

      case MessageType.REQUEST_PERMISSION_GESTURE:
        // Direct permission request via offscreen document, preserving user gesture
        // CRITICAL: User gesture propagates through message chain, but only in SYNC execution path
        // We must forward the message immediately without any await
        // The offscreen document uses cached handle for synchronous permission request
        console.log('[Oh My Prompt] Forwarding permission request to offscreen with gesture')
        chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_REQUEST_PERMISSION })
          .then((response: MessageResponse) => {
            console.log('[Oh My Prompt] Offscreen permission response:', response)
            sendResponse(response)
          })
          .catch(error => {
            console.error('[Oh My Prompt] REQUEST_PERMISSION_GESTURE error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.OPEN_SIDEPANEL_FOR_PERMISSION:
        // Open sidepanel to restore folder permission (user gesture propagates from content script click)
        // CRITICAL: User gesture must be used in synchronous execution path, NOT after await
        // Chrome preserves user gesture only until the first await in async context
        const senderTabId = _sender.tab?.id

        if (senderTabId && senderTabId >= 0) {
          // MUST call sidePanel.open() immediately before any await - this preserves user gesture
          chrome.sidePanel.open({ tabId: senderTabId })
            .then(() => {
              console.log('[Oh My Prompt] Sidepanel opened for permission restore from content script')
              // Now restore permission via offscreen document (async operations after sidepanel is open)
              restorePermission()
                .then(restoreResult => {
                  if (restoreResult.success) {
                    console.log('[Oh My Prompt] Permission restored successfully via sidepanel trigger')
                    sendResponse({ success: true } as MessageResponse)
                  } else {
                    console.warn('[Oh My Prompt] Permission restore failed:', restoreResult.error)
                    sendResponse({ success: false, error: restoreResult.error || 'Permission restore failed' })
                  }
                })
                .catch(error => {
                  console.error('[Oh My Prompt] restorePermission error:', error)
                  sendResponse({ success: false, error: String(error) })
                })
            })
            .catch(error => {
              console.error('[Oh My Prompt] sidePanel.open error:', error)
              sendResponse({ success: false, error: String(error) })
            })
        } else {
          sendResponse({ success: false, error: 'No sender tab' })
        }
        return true // Required for async response

      case MessageType.SET_SETTINGS_ONLY:
        // Update settings only, no backup trigger (for language toggle)
        const settingsPayload = message.payload as { settings: SyncSettings }
        if (!settingsPayload || !settingsPayload.settings) {
          sendResponse({ success: false, error: 'No settings provided' })
          return true
        }
        storageManager.updateSettings(settingsPayload.settings)
          .then(() => sendResponse({ success: true } as MessageResponse))
          .catch(error => {
            console.error('[Oh My Prompt] SET_SETTINGS_ONLY error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      // Phase 10: API configuration handlers (AUTH-01, AUTH-02, AUTH-04)
      case MessageType.GET_API_CONFIG:
        // Get Vision API configuration from storage
        chrome.storage.local.get(VISION_API_CONFIG_STORAGE_KEY)
          .then((result) => {
            const config = result[VISION_API_CONFIG_STORAGE_KEY] as VisionApiConfig | undefined
            sendResponse({ success: true, data: config || null } as MessageResponse<VisionApiConfig | null>)
          })
          .catch(error => {
            console.error('[Oh My Prompt] GET_API_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.SET_API_CONFIG:
        // Save Vision API configuration with timestamp
        const apiConfigPayload = message.payload as VisionApiConfig
        if (!apiConfigPayload || !apiConfigPayload.baseUrl || !apiConfigPayload.apiKey || !apiConfigPayload.modelName) {
          sendResponse({ success: false, error: 'Invalid payload: baseUrl, apiKey, and modelName required' })
          return true
        }
        // SECURITY: Log baseUrl and modelName only, never apiKey (AUTH-02, T-10-01)
        const configWithTimestamp: VisionApiConfig = {
          ...apiConfigPayload,
          configuredAt: Date.now()
        }
        chrome.storage.local.set({ [VISION_API_CONFIG_STORAGE_KEY]: configWithTimestamp })
          .then(async () => {
            sendResponse({ success: true } as MessageResponse)

            // Auto-sync encrypted config to backup folder (if configured)
            try {
              const handle = await getFolderHandle()
              if (handle) {
                const encrypted = await syncApiConfigToFolder(configWithTimestamp, handle)
                if (encrypted) {
                }
              }
            } catch (encryptError) {
              // Encryption failed, but storage save succeeded - log warning only
              console.warn('[Oh My Prompt] Failed to encrypt API config to folder:', encryptError)
            }
          })
          .catch(error => {
            console.error('[Oh My Prompt] SET_API_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      case MessageType.DELETE_API_CONFIG:
        // Delete Vision API configuration
        chrome.storage.local.remove(VISION_API_CONFIG_STORAGE_KEY)
          .then(() => {
            sendResponse({ success: true } as MessageResponse)
          })
          .catch(error => {
            console.error('[Oh My Prompt] DELETE_API_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true // Required for async response

      // Provider config management (multi-provider support)
      case MessageType.GET_PROVIDER_CONFIGS:
        // Get all provider configs (mask apiKey for UI display)
        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then((result) => {
            const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            if (!storage) {
              sendResponse({ success: true, data: { configs: [], activeConfigId: null } })
              return
            }
            // SECURITY: Mask apiKey for UI display
            const maskedConfigs = storage.configs.map(config => ({
              ...config,
              apiKey: maskApiKey(config.apiKey)
            }))
            sendResponse({
              success: true,
              data: {
                configs: maskedConfigs,
                activeConfigId: storage.activeConfigId
              }
            })
          })
          .catch(error => {
            console.error('[Oh My Prompt] GET_PROVIDER_CONFIGS error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      case MessageType.ADD_PROVIDER_CONFIG:
        const addPayload = message.payload as Partial<ProviderConfig>
        if (!addPayload) {
          sendResponse({ success: false, error: 'No payload provided' })
          return true
        }

        // Validate config
        const addValidation = validateProviderConfig(addPayload)
        if (!addValidation.valid) {
          sendResponse({ success: false, error: addValidation.errors.join('; ') })
          return true
        }

        // Generate full config
        const newConfig: ProviderConfig = {
          id: crypto.randomUUID(),
          providerId: addPayload.providerId || 'custom',
          providerName: addPayload.providerName || '自定义配置',
          apiKey: addPayload.apiKey!,
          apiEndpoint: addPayload.apiEndpoint!,
          apiFormat: addPayload.apiFormat || 'chat_completions',
          selectedModel: addPayload.selectedModel!,
          configuredAt: Date.now(),
          isCustom: addPayload.isCustom ?? (addPayload.providerId === 'custom')
        }

        // Get existing storage and add new config
        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then((result) => {
            const existingStorage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            const configs = existingStorage?.configs || []
            const isFirstConfig = configs.length === 0

            const updatedStorage: ProviderConfigsStorage = {
              configs: [...configs, newConfig],
              activeConfigId: isFirstConfig ? newConfig.id : (existingStorage?.activeConfigId || null)
            }

            return chrome.storage.local.set({ [PROVIDER_CONFIGS_STORAGE_KEY]: updatedStorage })
          })
          .then(() => sendResponse({ success: true, data: { id: newConfig.id } }))
          .catch(error => {
            console.error('[Oh My Prompt] ADD_PROVIDER_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      case MessageType.UPDATE_PROVIDER_CONFIG:
        const providerUpdatePayload = message.payload as { id: string; updates: Partial<ProviderConfig> }
        if (!providerUpdatePayload?.id) {
          sendResponse({ success: false, error: 'Config ID required' })
          return true
        }

        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then((result) => {
            const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            if (!storage) {
              sendResponse({ success: false, error: 'No configs found' })
              return
            }

            const configIndex = storage.configs.findIndex(c => c.id === providerUpdatePayload.id)
            if (configIndex === -1) {
              sendResponse({ success: false, error: 'Config not found' })
              return
            }

            const existingConfig = storage.configs[configIndex]
            const updatedConfig: ProviderConfig = {
              ...existingConfig,
              ...providerUpdatePayload.updates,
              id: existingConfig.id, // Preserve ID
              configuredAt: existingConfig.configuredAt // Preserve timestamp
            }

            // Validate updated config
            const updateValidation = validateProviderConfig(updatedConfig)
            if (!updateValidation.valid) {
              sendResponse({ success: false, error: updateValidation.errors.join('; ') })
              return
            }

            const updatedConfigs = [...storage.configs]
            updatedConfigs[configIndex] = updatedConfig

            return chrome.storage.local.set({
              [PROVIDER_CONFIGS_STORAGE_KEY]: {
                configs: updatedConfigs,
                activeConfigId: storage.activeConfigId
              }
            })
          })
          .then(() => sendResponse({ success: true }))
          .catch(error => {
            console.error('[Oh My Prompt] UPDATE_PROVIDER_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      case MessageType.DELETE_PROVIDER_CONFIG:
        const deletePayload = message.payload as { id: string }
        if (!deletePayload?.id) {
          sendResponse({ success: false, error: 'Config ID required' })
          return true
        }

        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then((result) => {
            const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            if (!storage) {
              sendResponse({ success: false, error: 'No configs found' })
              return
            }

            const filteredConfigs = storage.configs.filter(c => c.id !== deletePayload.id)
            const wasActive = storage.activeConfigId === deletePayload.id

            // If deleted config was active, auto-activate first remaining or null
            let newActiveId: string | null = null
            if (wasActive && filteredConfigs.length > 0) {
              newActiveId = filteredConfigs[0].id
            } else if (!wasActive) {
              newActiveId = storage.activeConfigId
            }

            return chrome.storage.local.set({
              [PROVIDER_CONFIGS_STORAGE_KEY]: {
                configs: filteredConfigs,
                activeConfigId: newActiveId
              }
            })
          })
          .then(() => sendResponse({ success: true }))
          .catch(error => {
            console.error('[Oh My Prompt] DELETE_PROVIDER_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      case MessageType.SET_ACTIVE_CONFIG:
        const activePayload = message.payload as { id: string }
        if (!activePayload?.id) {
          sendResponse({ success: false, error: 'Config ID required' })
          return true
        }

        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then((result) => {
            const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            if (!storage) {
              sendResponse({ success: false, error: 'No configs found' })
              return
            }

            // Validate config exists
            const configExists = storage.configs.some(c => c.id === activePayload.id)
            if (!configExists) {
              sendResponse({ success: false, error: 'Config not found' })
              return
            }

            return chrome.storage.local.set({
              [PROVIDER_CONFIGS_STORAGE_KEY]: {
                configs: storage.configs,
                activeConfigId: activePayload.id
              }
            })
          })
          .then(() => sendResponse({ success: true }))
          .catch(error => {
            console.error('[Oh My Prompt] SET_ACTIVE_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      case MessageType.GET_ACTIVE_CONFIG:
        // Get active config with full apiKey (for Vision API use only)
        // SECURITY: Only use in trusted contexts (service worker → vision-api)
        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then((result) => {
            const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            if (!storage || !storage.activeConfigId) {
              sendResponse({ success: true, data: null })
              return
            }

            const activeConfig = storage.configs.find(c => c.id === storage.activeConfigId)
            sendResponse({ success: true, data: activeConfig || null })
          })
          .catch(error => {
            console.error('[Oh My Prompt] GET_ACTIVE_CONFIG error:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return true

      // Phase 11: Vision API call handler (VISION-01, VISION-02)
      // Now compresses image to base64 before sending to API
      case MessageType.VISION_API_CALL:
        const visionCallPayload = message.payload as { imageUrl: string; base64Data?: string; retryCount?: number }
        if (!visionCallPayload || (!visionCallPayload.imageUrl && !visionCallPayload.base64Data)) {
          sendResponse({ success: false, error: { type: 'network', message: '无效的图片数据', action: 'close' } })
          return true
        }

        const imageUrl = visionCallPayload.imageUrl || ''
        const base64Data = visionCallPayload.base64Data

        if (!base64Data) {
          if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            sendResponse({ success: false, error: { type: 'unsupported_image', message: '图片URL格式无效', action: 'close' } })
            return true
          }
        }

        // Use PROVIDER_CONFIGS_STORAGE_KEY for new ProviderConfig architecture
        chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
          .then(async (result) => {
            const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
            if (!storage || !storage.activeConfigId) {
              sendResponse({
                success: false,
                error: { type: 'invalid_key', message: 'API 未配置，请先添加配置', action: 'settings' }
              })
              return
            }

            const activeConfig = storage.configs.find(c => c.id === storage.activeConfigId)
            if (!activeConfig || !activeConfig.apiKey) {
              sendResponse({
                success: false,
                error: { type: 'invalid_key', message: 'API Key 未配置', action: 'settings' }
              })
              return
            }

            const retryCount = visionCallPayload.retryCount || 0

            try {
              let base64Image: string

              if (base64Data) {
                base64Image = base64Data
              } else {
                base64Image = await asyncCompressImageFromUrl(imageUrl)
              }

              // Convert ProviderConfig to VisionApiConfig for backward compatibility
              const legacyConfig: VisionApiConfig = {
                baseUrl: activeConfig.apiEndpoint,
                apiKey: activeConfig.apiKey,
                modelName: activeConfig.selectedModel,
                apiFormat: activeConfig.apiFormat === 'anthropic_messages' ? 'anthropic' : 'openai'
              }

              const resultData = await executeVisionApiCall(legacyConfig, base64Image, 'base64')
              const languagePreference = await getLanguagePreference()
              const primaryPrompt = languagePreference === 'en' ? resultData.en.prompt : resultData.zh.prompt
              sendResponse({ success: true, data: { prompt: primaryPrompt, fullData: resultData } })
            } catch (apiError) {
              if (apiError instanceof Error && apiError.message.includes('Failed to fetch image')) {
                sendResponse({
                  success: false,
                  error: { type: 'network', message: '图片下载失败，请检查图片链接', action: 'close' }
                })
                return
              }
              if (apiError instanceof Error && apiError.message.includes('Unsupported image type')) {
                sendResponse({
                  success: false,
                  error: { type: 'unsupported_image', message: '图片格式不支持', action: 'close' }
                })
                return
              }
              const classifiedError = classifyApiError(apiError, retryCount)
              sendResponse({ success: false, error: classifiedError })
            }
          })
          .catch((storageError) => {
            console.error('[Oh My Prompt] VISION_API_CALL storage error:', storageError)
            sendResponse({
              success: false,
              error: { type: 'network', message: '读取配置失败', action: 'settings' }
            })
          })
        return true // Required for async response

      // Phase 12: Save to temporary library (independent storage, not in category system)
      // Now also saves image locally if folder is configured
      case MessageType.SAVE_TEMPORARY_PROMPT:
        const savePayload = message.payload as SaveTemporaryPromptPayload
        if (!savePayload || !savePayload.name || !savePayload.content) {
          sendResponse({ success: false, error: 'Invalid payload: name and content required' })
          return true
        }

        storageManager.getData()
          .then(async (data) => {
            // Get or initialize temporary prompts array
            const temporaryPrompts = data.temporaryPrompts || []

            // Calculate order (min order - 1 for reverse sorting - newest first)
            const minOrder = temporaryPrompts.length > 0 ? Math.min(...temporaryPrompts.map(p => p.order)) : 0

            // Add new prompt to temporary library - support bilingual content and description
            const newPrompt: Prompt = {
              id: crypto.randomUUID(),
              name: savePayload.name,
              nameEn: savePayload.nameEn, // English name (optional)
              content: savePayload.content,
              contentEn: savePayload.contentEn, // English content (optional)
              description: savePayload.description, // Chinese analysis (optional)
              descriptionEn: savePayload.descriptionEn, // English analysis (optional)
              categoryId: 'temporary', // Special marker for temporary library
              order: minOrder - 1,
              remoteImageUrl: savePayload.imageUrl // Optional source URL
            }

            // Try to save image locally if imageUrl or base64Data provided and folder configured
            let localImageSaved = false
            const hasImageData = savePayload.imageUrl || savePayload.base64Data
            if (hasImageData) {
              try {
                // Check if folder is configured via offscreen document
                const permResult = await sendToOffscreen<{ hasFolder: boolean; permission?: 'granted' | 'prompt' | 'denied' }>(MessageType.OFFSCREEN_CHECK_PERMISSION)

                let proceedWithSave = false

                if (!permResult.success) {
                  console.warn('[Oh My Prompt] Offscreen permission check failed:', permResult.error)
                } else if (!permResult.data?.hasFolder) {
                } else if (permResult.data?.permission === 'prompt') {
                  // Permission needs re-authorization - request via offscreen document
                  const requestResult = await sendToOffscreen<{ permission: 'granted' | 'denied' }>(MessageType.OFFSCREEN_REQUEST_PERMISSION)
                  if (!requestResult.success || requestResult.data?.permission !== 'granted') {
                    console.warn('[Oh My Prompt] Permission request failed:', requestResult.error)
                  } else {
                    proceedWithSave = true
                  }
                } else if (permResult.data?.permission === 'granted') {
                  proceedWithSave = true
                } else {
                  console.warn('[Oh My Prompt] Folder permission denied, skipping local image save')
                }

                // Get image data for saving
                if (proceedWithSave) {
                  let dataArray: number[]

                  if (savePayload.base64Data) {
                    // Use base64 data directly (for file:// images converted by content script)
                    const base64Content = savePayload.base64Data.split(',')[1] // Remove data:image/xxx;base64, prefix
                    const binaryString = atob(base64Content)
                    dataArray = Array.from(new Uint8Array(binaryString.length)).map((_, i) => binaryString.charCodeAt(i))
                  } else {
                    // Fetch from URL (for http/https URLs)
                    const imageResponse = await fetch(savePayload.imageUrl!)
                    if (!imageResponse.ok) {
                      console.warn('[Oh My Prompt] Image download failed:', imageResponse.status, imageResponse.statusText)
                      dataArray = []
                    } else {
                      const imageBlob = await imageResponse.blob()
                      const arrayBuffer = await imageBlob.arrayBuffer()
                      dataArray = Array.from(new Uint8Array(arrayBuffer))
                    }
                  }

                  if (dataArray.length > 0) {
                    // Determine extension
                    const ext = savePayload.imageUrl?.split('.').pop()?.toLowerCase() || 'jpg'

                    // Save via offscreen document
                    const saveResult = await sendToOffscreen<{ relativePath: string }>(MessageType.OFFSCREEN_SAVE_IMAGE, {
                      promptId: newPrompt.id,
                      data: dataArray,
                      originalFilename: `image.${ext}`
                    })

                    if (!saveResult.success) {
                      console.warn('[Oh My Prompt] Offscreen save image failed:', saveResult.error)
                    } else if (saveResult.data?.relativePath) {
                      newPrompt.localImage = saveResult.data.relativePath
                      localImageSaved = true
                    }
                  }
                }
              } catch (imageError) {
                // Image save failed, but prompt is already saved
                // Keep remoteImageUrl as fallback
                console.warn('[Oh My Prompt] Image save exception:', imageError)
              }
            } else {
            }

            // Add to temporary prompts array
            temporaryPrompts.push(newPrompt)

            // Save to storage with temporaryPrompts field
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: data.userData,
              settings: data.settings,
              temporaryPrompts
            })


            // Broadcast REFRESH_DATA to all Lovart tabs so dropdown updates immediately
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true, data: { localImageSaved } })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] SAVE_TEMPORARY_PROMPT error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      // Update temporary prompt format (re-save with different format)
      case MessageType.UPDATE_TEMPORARY_PROMPT_FORMAT:
        const updatePayload = message.payload as UpdateTemporaryPromptFormatPayload
        if (!updatePayload || !updatePayload.taskId || !updatePayload.result) {
          sendResponse({ success: false, error: 'Invalid payload: taskId and result required' })
          return true
        }

        storageManager.getData()
          .then(async (data) => {
            // Get current temporary prompts
            const temporaryPrompts = data.temporaryPrompts || []
            const result = updatePayload.result
            const newFormat = updatePayload.newFormat

            // Generate prompt name from content or title
            const promptName = result.zh.title || result.zh.prompt.substring(0, 30).replace(/\n/g, ' ').trim() + '...'
            const promptNameEn = result.en.title || result.en.prompt.substring(0, 30).replace(/\n/g, ' ').trim() + '...'

            // Build content based on new format
            const content = newFormat === 'json'
              ? JSON.stringify(result.zh_json || result.json_prompt)
              : result.zh.prompt

            const contentEn = newFormat === 'json'
              ? JSON.stringify(result.en_json || result.json_prompt)
              : result.en.prompt

            // Find and update the existing prompt by matching imageUrl or create new entry
            // Since temporary prompts don't store taskId, we match by imageUrl
            const existingIndex = updatePayload.imageUrl
              ? temporaryPrompts.findIndex(p => p.remoteImageUrl === updatePayload.imageUrl)
              : -1

            if (existingIndex >= 0) {
              // Update existing prompt
              temporaryPrompts[existingIndex] = {
                ...temporaryPrompts[existingIndex],
                content,
                contentEn,
                description: result.zh.analysis,
                descriptionEn: result.en.analysis,
              }
            } else {
              // Create new prompt entry (fallback)
              const newPrompt: Prompt = {
                id: crypto.randomUUID(),
                name: promptName,
                nameEn: promptNameEn,
                content,
                contentEn,
                description: result.zh.analysis,
                descriptionEn: result.en.analysis,
                categoryId: 'temporary',
                order: temporaryPrompts.length > 0 ? Math.min(...temporaryPrompts.map(p => p.order)) - 1 : 0,
                remoteImageUrl: updatePayload.imageUrl
              }
              temporaryPrompts.push(newPrompt)
            }

            // Save to storage
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: data.userData,
              settings: data.settings,
              temporaryPrompts
            })

            // Broadcast REFRESH_DATA
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] UPDATE_TEMPORARY_PROMPT_FORMAT error:', error)
            sendResponse({ success: false, error: 'Storage save failed' })
          })
        return true // Required for async response

      // Clear all temporary prompts
      case MessageType.CLEAR_TEMPORARY_PROMPTS:
        storageManager.getData()
          .then(async (data) => {
            // Clear temporary prompts array
            const version = chrome.runtime.getManifest().version
            await storageManager.saveData({
              version,
              userData: data.userData,
              settings: data.settings,
              temporaryPrompts: []
            })


            // Broadcast REFRESH_DATA to all Lovart tabs
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] CLEAR_TEMPORARY_PROMPTS error:', error)
            sendResponse({ success: false, error: 'Storage clear failed' })
          })
        return true // Required for async response

      // Transfer temporary prompt to a category
      case MessageType.TRANSFER_TEMPORARY_PROMPT:
        const transferPayload = message.payload as { promptId: string; targetCategoryId: string }
        if (!transferPayload || !transferPayload.promptId || !transferPayload.targetCategoryId) {
          sendResponse({ success: false, error: 'Invalid payload: promptId and targetCategoryId required' })
          return true
        }

        storageManager.getData()
          .then(async (data) => {
            const temporaryPrompts = data.temporaryPrompts || []
            const prompts = data.userData.prompts

            // Find the prompt in temporary library
            const promptIndex = temporaryPrompts.findIndex(p => p.id === transferPayload.promptId)
            if (promptIndex === -1) {
              sendResponse({ success: false, error: 'Prompt not found in temporary library' })
              return
            }

            const promptToTransfer = temporaryPrompts[promptIndex]

            // Calculate order in target category
            const categoryPrompts = prompts.filter(p => p.categoryId === transferPayload.targetCategoryId)
            const maxOrder = categoryPrompts.length > 0 ? Math.max(...categoryPrompts.map(p => p.order)) : -1

            // Update prompt for transfer
            promptToTransfer.categoryId = transferPayload.targetCategoryId
            promptToTransfer.order = maxOrder + 1

            // Remove from temporary and add to prompts
            temporaryPrompts.splice(promptIndex, 1)
            prompts.push(promptToTransfer)

            // Save to storage
            const version = chrome.runtime.getManifest().version
            const userData = { prompts, categories: data.userData.categories }
            await storageManager.saveData({
              version,
              userData,
              settings: data.settings,
              temporaryPrompts
            })


            // Trigger auto-sync with full backup data
            const backupData = {
              prompts,
              categories: data.userData.categories,
              temporaryPrompts
            }
            triggerSync(backupData).catch(err => console.warn('[Oh My Prompt] Sync after transfer failed:', err))

            // Broadcast REFRESH_DATA to all Lovart tabs
            chrome.tabs.query({ url: ['*://lovart.ai/*', '*://*.lovart.ai/*'] }, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id !== undefined && tab.id >= 0) {
                  chrome.tabs.sendMessage(tab.id, { type: MessageType.REFRESH_DATA })
                }
              })
            })

            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error('[Oh My Prompt] TRANSFER_TEMPORARY_PROMPT error:', error)
            sendResponse({ success: false, error: 'Transfer failed' })
          })
        return true // Required for async response

      default:
        // Skip OFFSCREEN_* messages - they are handled by offscreen document
        if (message.type.startsWith('OFFSCREEN_')) {
          // Don't respond, let offscreen document handle it
          return false
        }
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
    }

    return true // Required for async sendResponse
  }
)

/**
 * Show notification for unsupported page error
 */
function showUnsupportedPageNotification(): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
    title: 'Oh My Prompt',
    message: '此页面不支持此功能，请在普通网页上使用'
  })
}

// Vision Modal: Handle context menu click - request permission and send message to content script
chrome.contextMenus.onClicked.addListener(async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === 'convert-to-prompt') {
    if (!info.srcUrl) {
      console.warn('[Oh My Prompt] No srcUrl in context menu click data')
      return
    }

    // Double-check URL type (targetUrlPatterns should handle this, but validate defensively)
    if (!info.srcUrl.startsWith('http://') && !info.srcUrl.startsWith('https://')) {
      console.warn('[Oh My Prompt] Invalid URL type (not http/https):', info.srcUrl)
      return
    }

    // Store image URL for tracking (optional, modal uses imageUrl directly)
    chrome.storage.local.set({
      [CAPTURED_IMAGE_STORAGE_KEY]: {
        url: info.srcUrl,
        capturedAt: Date.now(),
        tabId: tab?.id
      }
    })
      .then(() => {
        // Send message to content script to open modal
        // Check tab.id is valid (>= 0, not TAB_ID_NONE which is -1)
        if (tab?.id !== undefined && tab.id >= 0) {
          chrome.tabs.sendMessage(tab.id, {
            type: MessageType.OPEN_VISION_MODAL,
            payload: {
              imageUrl: info.srcUrl,
              tabId: tab.id
            }
          })
            .then((response) => {
              // Any response means content script handled it (success or error shown in modal)
              if (response?.success) {
              } else {
                // Content script received but had internal error - don't open new tab
                // Error will be shown in the modal or logged
                console.warn('[Oh My Prompt] Vision modal internal error:', response?.error)
              }
            })
            .catch((error) => {
              console.error('[Oh My Prompt] Failed to send message to content script:', error)
              // Content script is unreachable on special pages (chrome://, about:, etc.)
              showUnsupportedPageNotification()
            })
        } else {
          // No valid tab ID
          showUnsupportedPageNotification()
        }
      })
      .catch((error) => {
        console.error('[Oh My Prompt] Storage error:', error)
        // Fallback: try to open modal anyway - check tab.id is valid
        if (tab?.id !== undefined && tab.id >= 0) {
          chrome.tabs.sendMessage(tab.id, {
            type: MessageType.OPEN_VISION_MODAL,
            payload: {
              imageUrl: info.srcUrl,
              tabId: tab.id
            }
          })
        } else {
          showUnsupportedPageNotification()
        }
      })
  }
})