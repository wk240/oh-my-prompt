/**
 * Offscreen Document Manager
 *
 * Manages the lifecycle of the offscreen document for File System Access API operations.
 * The offscreen document provides a persistent context for file operations that require
 * user interaction context (permission requests).
 *
 * Chrome MV3 Service Workers cannot request permissions because they lack DOM/user interaction context.
 */

import { MessageType, MessageResponse } from '../shared/messages'

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html'

// Track if offscreen document is already created
let offscreenDocumentCreated = false

/**
 * Ensure offscreen document exists before sending messages
 * Creates document if not already present
 */
export async function ensureOffscreenDocument(): Promise<void> {
  // Always check if offscreen document already exists (Service Worker may restart)
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  })

  if (existingContexts.length > 0) {
    // Check if existing document has correct handlers by sending a versioned ping
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_PING })
      if (response?.success) {
        // Document exists and responds - verify it handles expected messages
        // Try a lightweight check to ensure handlers are loaded
        const permCheck = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_CHECK_PERMISSION })
        if (permCheck?.success !== undefined) {
          offscreenDocumentCreated = true
          console.log('[Oh My Prompt] Offscreen document already exists and is responsive')
          return
        }
      }
    } catch {
      // Existing document doesn't respond correctly - close and recreate
      console.log('[Oh My Prompt] Existing offscreen document unresponsive, recreating...')
    }

    // Close existing document before creating new one
    try {
      await chrome.offscreen.closeDocument()
      console.log('[Oh My Prompt] Closed stale offscreen document')
    } catch {
      // Ignore close errors
    }
  }

  // Create offscreen document
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'File System Access API requires DOM context for permission handling and file operations'
    })
    offscreenDocumentCreated = true
    console.log('[Oh My Prompt] Offscreen document created successfully')

    // Wait for offscreen document to initialize (message listener needs to be ready)
    await waitForOffscreenReady()
  } catch (error) {
    // Document might already exist (race condition)
    if (error instanceof Error && (
      error.message.includes('already exists') ||
      error.message.includes('single offscreen document')
    )) {
      offscreenDocumentCreated = true
      console.log('[Oh My Prompt] Offscreen document already exists (caught in error)')
      // Wait for readiness
      await waitForOffscreenReady()
      return
    }
    console.error('[Oh My Prompt] Failed to create offscreen document:', error)
    throw error
  }
}

/**
 * Wait for offscreen document to be ready to receive messages
 * Sends a ping message and waits for response
 */
async function waitForOffscreenReady(): Promise<void> {
  const maxAttempts = 10
  const initialDelayMs = 200  // Wait for script to load before first ping
  const retryDelayMs = 150    // Delay between retry attempts

  // Initial delay - allow document script to load and initialize
  await new Promise(resolve => setTimeout(resolve, initialDelayMs))

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_PING })
      if (response?.success) {
        console.log('[Oh My Prompt] Offscreen document ready (attempt', attempt, ')')
        return
      }
    } catch (error) {
      // Connection not ready yet
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  console.warn('[Oh My Prompt] Offscreen document readiness check failed after', maxAttempts, 'attempts, proceeding anyway')
}

/**
 * Close offscreen document when no longer needed
 * Usually kept open for the entire session
 */
export async function closeOffscreenDocument(): Promise<void> {
  if (!offscreenDocumentCreated) {
    return
  }

  try {
    await chrome.offscreen.closeDocument()
    offscreenDocumentCreated = false
    console.log('[Oh My Prompt] Offscreen document closed')
  } catch (error) {
    // Document might already be closed
    if (error instanceof Error && error.message.includes('does not exist')) {
      offscreenDocumentCreated = false
      return
    }
    console.warn('[Oh My Prompt] Failed to close offscreen document:', error)
  }
}

/**
 * Send message to offscreen document
 * Ensures document exists before sending
 */
export async function sendToOffscreen<T = unknown>(
  type: MessageType,
  payload?: unknown
): Promise<MessageResponse<T>> {
  await ensureOffscreenDocument()

  const response = await chrome.runtime.sendMessage({
    type,
    payload
  })

  return response as MessageResponse<T>
}