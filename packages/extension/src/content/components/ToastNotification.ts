/**
 * ToastNotification - Pure DOM toast (no React dependency)
 * Replaces React Portal version to avoid duplicate React bundle in content script
 */

const PORTAL_ID = 'prompt-script-dropdown-portal'

function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID
    document.body.appendChild(container)
  }
  return container
}

/**
 * Show a toast notification that auto-dismisses after 2 seconds
 * @param message - The message to display
 */
export function showToast(message: string): void {
  const container = getPortalContainer()

  const toast = document.createElement('div')
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: #171717;
    color: #ffffff;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483647;
  `
  toast.textContent = message

  container.appendChild(toast)

  // Auto-dismiss after 2 seconds
  setTimeout(() => {
    toast.remove()
  }, 2000)
}