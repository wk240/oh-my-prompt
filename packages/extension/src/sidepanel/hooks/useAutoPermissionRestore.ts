/**
 * useAutoPermissionRestore - Auto restore folder permission on first user interaction
 *
 * When openPanelOnActionClick: true, Chrome auto-opens sidepanel but action.onClicked
 * doesn't fire, so we lose user gesture for permission restore.
 *
 * Solution: Listen for user's first interaction (click/keyboard) inside sidepanel,
 * and send permission request in SYNC path (before any async operation).
 *
 * IMPORTANT: Permission request must be sent in SYNC path to preserve user gesture.
 * The offscreen document handles the actual permission check - if permission is already
 * granted, it returns 'granted' immediately without showing a dialog.
 */

import { useEffect, useRef } from 'react'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { ensureOffscreenDocument } from '@/lib/offscreen-manager'

/**
 * Hook to auto-restore folder permission on first user interaction
 * Pre-caches folder handle on mount, then requests permission on first user click
 */
export function useAutoPermissionRestore() {
  const hasAttemptedRestore = useRef(false)
  const isInitialized = useRef(false)

  useEffect(() => {
    // Step 1: Ensure offscreen document exists and pre-cache folder handle
    // This MUST happen BEFORE any user click to preserve gesture in sync path
    if (!isInitialized.current) {
      isInitialized.current = true
      ensureOffscreenDocument()
        .then(() => {
          // Now send message to cache handle (offscreen document is ready)
          chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_CHECK_PERMISSION })
            .then((_response) => {
              // Handle pre-cached (no log needed)
            })
            .catch(() => {})
        })
        .catch((err) => {
          console.warn('[Oh My Prompt] Failed to ensure offscreen document:', err)
        })
    }

    // Step 2: Listen for user interaction to restore permission
    const attemptRestore = (event: Event) => {
      // Skip if already attempted
      if (hasAttemptedRestore.current) {
        return
      }

      // Ignore clicks on restore buttons (they handle permission themselves)
      const target = event.target as HTMLElement
      if (target.closest('[data-permission-action]')) {
        return
      }

      // Mark as attempted immediately
      hasAttemptedRestore.current = true

      // CRITICAL: Send request BEFORE any async operation
      // User gesture propagates through chrome.runtime.sendMessage in sync context
      // The offscreen document will:
      // 1. Use cached handle (from pre-cache above)
      // 2. Request permission if needed (has gesture from this click)
      // 3. Return success/granted if already granted (no dialog)
      chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_REQUEST_PERMISSION })
        .then((response) => {
          if (response?.success) {
            // Trigger sync to clear any pending unsynced changes
            // This will also set syncEnabled: true and hasUnsyncedChanges: false if sync succeeds
            chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC }).catch(() => {})
          } else {
            // GESTURE_LOST or PERMISSION_DENIED - user needs to click restore button manually
            // Reset to allow future attempts
            hasAttemptedRestore.current = false
          }
        })
        .catch((err) => {
          console.warn('[Oh My Prompt] Permission request failed:', err)
          hasAttemptedRestore.current = false
        })
    }

    // Add global click listener (capture phase for sync execution)
    const handleClick = (event: MouseEvent) => {
      attemptRestore(event)
    }

    // Add keyboard listener for Enter/Space interactions
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        attemptRestore(event)
      }
    }

    // Use capture phase to ensure sync execution before React handlers
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  return { hasAttemptedRestore: hasAttemptedRestore.current }
}