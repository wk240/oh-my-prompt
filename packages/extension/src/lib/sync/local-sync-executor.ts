/**
 * Local sync executor - handles local folder sync via offscreen document.
 *
 * Separated from sync-manager.ts to avoid circular dependency with orchestrator.
 * Service Worker cannot directly use File System Access API, so all local
 * file operations must go through offscreen document.
 */

import { ensureOffscreenDocument, sendToOffscreen } from '../offscreen-manager'
import { getFolderHandle, checkFolderPermission } from './indexeddb'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { FullBackupData } from './types'

export interface LocalSyncResult {
  success: boolean
  error?: string
  syncedAt?: number
}

/**
 * Execute local sync via offscreen document.
 * This is the ONLY way to perform local sync from Service Worker context.
 *
 * @param backupData - Data to sync to local folder
 * @returns LocalSyncResult with success status
 */
export async function executeLocalSync(backupData: FullBackupData): Promise<LocalSyncResult> {
  // Get version for backup file
  const version = chrome.runtime.getManifest().version

  // Try sync via offscreen document
  try {
    await ensureOffscreenDocument()
    const result = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })

    if (result.success) {
      return {
        success: true,
        syncedAt: Date.now()
      }
    }

    // Handle offscreen sync errors
    const error = result.error || 'UNKNOWN'
    console.warn('[Oh My Prompt] Offscreen sync failed:', error)
    return { success: false, error }
  } catch (offscreenError) {
    console.error('[Oh My Prompt] Offscreen document unavailable:', offscreenError)

    // Fallback: try direct sync (will likely fail in Service Worker context)
    // This fallback is for popup context where permissions might still be valid
    const handle = await getFolderHandle()
    if (!handle) {
      return { success: false, error: 'FOLDER_NOT_CONFIGURED' }
    }

    const permission = await checkFolderPermission(handle, 'readwrite')
    if (permission !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' }
    }

    // Direct sync should work in popup/content script context
    // Re-send to offscreen which will handle the actual file write
    try {
      await ensureOffscreenDocument()
      const retryResult = await sendToOffscreen(MessageType.OFFSCREEN_SYNC, { backupData, version })
      if (retryResult.success) {
        return { success: true, syncedAt: Date.now() }
      }
      return { success: false, error: retryResult.error || 'SYNC_FAILED' }
    } catch {
      return { success: false, error: 'SYNC_FAILED' }
    }
  }
}