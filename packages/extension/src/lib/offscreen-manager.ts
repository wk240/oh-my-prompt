/**
 * Offscreen Document Manager
 *
 * Manages the lifecycle of the offscreen document for File System Access API operations.
 * The offscreen document provides a persistent context for file operations that require
 * user interaction context (permission requests).
 *
 * Chrome MV3 Service Workers cannot request permissions because they lack DOM/user interaction context.
 */

import { MessageType, MessageResponse } from '@oh-my-prompt/shared/messages'

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html'

// Track if offscreen document is already created
let offscreenDocumentCreated = false

// Track pending creation promise to prevent race conditions
let pendingCreationPromise: Promise<void> | null = null

/**
 * Ensure offscreen document exists before sending messages
 * Creates document if not already present
 * Handles race conditions by returning pending promise if creation in progress
 */
export async function ensureOffscreenDocument(): Promise<void> {
  // If creation already in progress, wait for it
  if (pendingCreationPromise) {
    return pendingCreationPromise
  }

  // Create new promise and track it
  pendingCreationPromise = doEnsureOffscreenDocument()
  try {
    await pendingCreationPromise
  } finally {
    pendingCreationPromise = null
  }
}

async function doEnsureOffscreenDocument(): Promise<void> {
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
        const permCheck = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_CHECK_PERMISSION })
        if (permCheck?.success !== undefined) {
          offscreenDocumentCreated = true
          return
        }
      }
    } catch {
      // Existing document doesn't respond correctly - close and recreate
    }

    // Close existing document before creating new one
    try {
      await chrome.offscreen.closeDocument()
    } catch {
      // Ignore close errors
    }
  }

  // Create offscreen document with retries
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'File System Access API requires DOM context for permission handling and file operations'
      })
      offscreenDocumentCreated = true

      // Wait for offscreen document to initialize (message listener needs to be ready)
      await waitForOffscreenReady()
      return
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Document might already exist (race condition) - try to use it
      if (errorMsg.includes('already exists') || errorMsg.includes('single offscreen document')) {
        offscreenDocumentCreated = true
        await waitForOffscreenReady()
        return
      }

      // Document closed before loading - retry
      if (errorMsg.includes('closed before fully loading') && attempt < maxRetries) {
        console.warn(`[Oh My Prompt] Offscreen document creation attempt ${attempt} failed, retrying...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      // Final attempt failed or other error - log and proceed
      console.error('[Oh My Prompt] Failed to create offscreen document:', errorMsg)
      // Don't throw - offscreen will be created on next request
      return
    }
  }
}

/**
 * Wait for offscreen document to be ready to receive messages
 * Sends a ping message and waits for response
 * Also waits for folder handle to be cached (for permission requests)
 */
async function waitForOffscreenReady(): Promise<void> {
  const maxAttempts = 15  // Increased to match longer init retries
  const initialDelayMs = 500  // Increased initial delay
  const retryDelayMs = 500    // Increased retry delay

  // Initial delay - allow document script to load and initialize
  await new Promise(resolve => setTimeout(resolve, initialDelayMs))

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_PING })
      if (response?.success) {
        // Check if handle is cached (for permission requests)
        if (response.handleCached === true) {
          return
        }
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

  // Handle null/undefined response when offscreen document not ready
  if (!response) {
    return { success: false, error: 'OFFSCREEN_UNAVAILABLE' }
  }

  return response as MessageResponse<T>
}