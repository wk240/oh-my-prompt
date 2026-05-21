/**
 * Auth Callback Content Script
 *
 * Runs on OAuth callback pages to extract tokens from URL and save to extension storage.
 * This bridges the gap between web-app OAuth and extension Supabase client.
 *
 * URL format: /auth/callback#access_token=xxx&refresh_token=xxx&...
 *
 * Timing: Web-app returns HTML with JavaScript that injects tokens into hash.
 * We need to wait for the hash to be set before extracting tokens.
 *
 * Fix: Now awaits sendMessage() before showing success UI to ensure sync completes
 * even if user closes the tab immediately.
 */

console.log('[Oh My Prompt] Auth callback script loaded')

// Supabase project reference (extracted from URL)
const SUPABASE_PROJECT_REF = 'futfxudabvjfldlismun'

/**
 * Decode JWT access token to extract user info.
 * Supabase JWT contains user metadata in the claims.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // Decode payload (base64url)
    const payload = parts[1]
    // Replace URL-safe base64 chars with standard base64 chars
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)

    const decoded = atob(padded)
    return JSON.parse(decoded)
  } catch (e) {
    console.error('[Oh My Prompt] Failed to decode JWT:', e)
    return null
  }
}

/**
 * Helper function to create styled page using DOM APIs (avoiding CSP violations)
 * Matches web-app's cyber-minimalist design system from globals.css
 */
function createStyledPage(config: {
  iconStroke: string
  title: string
  description: string
  iconType: 'success' | 'error' | 'timeout'
}) {
  // Clear body
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild)
  }

  // Set body with grid background and atmospheric effects
  document.body.style.cssText = `
    min-height: 100vh;
    background: #0e0e10;
    background-image: radial-gradient(circle, rgba(249, 245, 248, 0.1) 1.2px, transparent 1.2px);
    background-size: 24px 24px;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #f9f5f8;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 24px;
    box-sizing: border-box;
  `

  // Create card container (glass panel effect)
  const card = document.createElement('div')
  card.style.cssText = `
    background-color: rgba(38, 37, 40, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(72, 71, 74, 0.2);
    border-radius: 12px;
    padding: 48px 40px;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 0 40px -10px rgba(249, 245, 248, 0.08);
  `

  // Icon container with subtle background
  const iconContainer = document.createElement('div')
  iconContainer.style.cssText = `
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    background: ${config.iconType === 'success' ? 'rgba(129, 236, 255, 0.1)' : 'rgba(255, 113, 108, 0.1)'};
  `

  // Icon SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', config.iconStroke)
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.style.cssText = 'width: 48px; height: 48px;'

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle.setAttribute('cx', '12')
  circle.setAttribute('cy', '12')
  circle.setAttribute('r', '10')
  svg.appendChild(circle)

  if (config.iconType === 'success') {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M9 12l2 2 4-4')
    svg.appendChild(path)
  } else if (config.iconType === 'error') {
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line1.setAttribute('x1', '15')
    line1.setAttribute('y1', '9')
    line1.setAttribute('x2', '9')
    line1.setAttribute('y2', '15')
    svg.appendChild(line1)

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line2.setAttribute('x1', '9')
    line2.setAttribute('y1', '9')
    line2.setAttribute('x2', '15')
    line2.setAttribute('y2', '15')
    svg.appendChild(line2)
  } else if (config.iconType === 'timeout') {
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    polyline.setAttribute('points', '12 6 12 12 16 14')
    svg.appendChild(polyline)
  }

  iconContainer.appendChild(svg)
  card.appendChild(iconContainer)

  // Title with Space Grotesk font
  const title = document.createElement('h2')
  title.style.cssText = `
    font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #f9f5f8;
    letter-spacing: -0.02em;
  `
  title.textContent = config.title
  card.appendChild(title)

  // Description
  const desc = document.createElement('p')
  desc.style.cssText = `
    color: #adaaad;
    font-size: 15px;
    margin: 0 0 24px 0;
    line-height: 1.5;
  `
  desc.innerHTML = config.description
  card.appendChild(desc)

  document.body.appendChild(card)
}

/**
 * Extract tokens from URL hash and save to chrome.storage.
 * Now returns a Promise that resolves when sync is complete.
 *
 * @returns Promise<boolean> - true if tokens extracted and sync message sent successfully
 */
async function extractAndSaveTokens(): Promise<boolean> {
  // Extract tokens from URL hash
  const hash = window.location.hash.substring(1) // Remove '#'
  if (!hash) {
    return false
  }

  const params = new URLSearchParams(hash)

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const expiresAt = params.get('expires_at')
  const expiresIn = params.get('expires_in')
  const tokenType = params.get('token_type')
  const providerToken = params.get('provider_token')

  if (!accessToken) {
    console.log('[Oh My Prompt] No access token in hash yet')
    return false
  }

  console.log('[Oh My Prompt] Found access token, saving to storage...')

  // Decode JWT to get user info
  const jwtPayload = decodeJwtPayload(accessToken)
  const userId = (jwtPayload?.sub as string) || ''
  const userEmail = (jwtPayload?.email as string) || ''

  // Extract user metadata from JWT claims
  const userMetadata = jwtPayload?.user_metadata as Record<string, unknown> | undefined
  const appMetadata = jwtPayload?.app_metadata as Record<string, unknown> | undefined

  // Build Supabase session object (must be JSON string for storage adapter)
  // Supabase expects this format for its storage adapter
  const sessionData = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken || '',
    expires_in: expiresIn ? parseInt(expiresIn) : 3600,
    expires_at: expiresAt ? parseInt(expiresAt) : Math.floor(Date.now() / 1000) + 3600,
    token_type: tokenType || 'bearer',
    provider_token: providerToken || null,
    // Include user object for auth-service.ts compatibility
    user: {
      id: userId,
      email: userEmail,
      aud: jwtPayload?.aud || 'authenticated',
      role: jwtPayload?.role || 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_metadata: userMetadata || {},
      app_metadata: appMetadata || {},
      is_anonymous: false
    }
  })

  // Save to chrome.storage.local with Supabase's expected key format
  // Key format: sb-{projectRef}-auth-token
  const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`

  // Save to storage first
  await chrome.storage.local.set({
    [storageKey]: sessionData
  })
  console.log('[Oh My Prompt] Session saved to storage with key:', storageKey)

  // Notify background script that auth completed - MUST wait for this to complete
  // before showing UI, otherwise message may be lost if user closes tab quickly
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AUTH_CALLBACK_COMPLETE',
      payload: { success: true }
    })
    console.log('[Oh My Prompt] Background script acknowledged:', response)
  } catch (err) {
    console.warn('[Oh My Prompt] Failed to notify background:', err)
    // Still show success UI - storage is saved, sidepanel can detect via storage listener
  }

  // Show success page - page will auto-close via hashchange listener
  createStyledPage({
    iconStroke: '#81ecff',
    title: '登录成功',
    description: '云端同步已激活<br/>页面即将自动关闭',
    iconType: 'success'
  })

  // Auto-close the tab after showing success message
  // window.close() only works for tabs opened by script (OAuth flow opens tabs via chrome.tabs.create)
  setTimeout(() => {
    window.close()
    // If window.close() fails (browser restriction), send message to service worker to close tab
    // This provides a fallback mechanism
    chrome.runtime.sendMessage({ type: 'CLOSE_AUTH_TAB' }).catch(err => {
      console.warn('[Oh My Prompt] Failed to send close message:', err)
    })
  }, 1500)

  return true
}

// Try immediate extraction (if hash already set)
extractAndSaveTokens().then(success => {
  if (success) {
    // Success, tokens extracted immediately
  } else {
    // Hash not ready yet, wait for it
    console.log('[Oh My Prompt] Waiting for tokens in hash...')

    // Listen for hashchange event (when web-app's JavaScript sets the hash)
    const handleHashChange = async () => {
      // Check if user wants to close the tab
      const hash = window.location.hash.substring(1)
      if (hash === 'close') {
        console.log('[Oh My Prompt] Close signal received, asking service worker to close tab')
        chrome.runtime.sendMessage({ type: 'CLOSE_AUTH_TAB' }).catch(err => {
          console.warn('[Oh My Prompt] Failed to send close message:', err)
        })
        window.removeEventListener('hashchange', handleHashChange)
        return
      }

      const success = await extractAndSaveTokens()
      if (success) {
        // Keep listening for 'close' signal even after token extraction success
        // This handles the case where window.close() fails due to browser restrictions
        // and user clicks the "关闭此页面" button on web app's success page
      }
    }

    window.addEventListener('hashchange', handleHashChange)

    // Also poll periodically as fallback (in case hashchange doesn't fire)
    let pollCount = 0
    const maxPolls = 50 // Poll for up to 5 seconds (100ms interval)
    const pollInterval = setInterval(async () => {
      pollCount++
      const success = await extractAndSaveTokens()
      if (success) {
        clearInterval(pollInterval)
        // Keep hashchange listener for 'close' signal handling
      } else if (pollCount >= maxPolls) {
        clearInterval(pollInterval)
        window.removeEventListener('hashchange', handleHashChange)

        // Timeout - check for error in hash
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const errorCode = params.get('error_code')
        const errorMsg = params.get('error_description') || params.get('error') || params.get('msg')

        if (errorCode || errorMsg) {
          console.error('[Oh My Prompt] Auth error:', errorCode, errorMsg)

          chrome.runtime.sendMessage({
            type: 'AUTH_CALLBACK_COMPLETE',
            payload: { success: false, error: errorMsg || errorCode }
          }).catch(err => {
            console.warn('[Oh My Prompt] Failed to notify background:', err)
          })

          createStyledPage({
            iconStroke: '#ff716c',
            title: '登录失败',
            description: errorMsg || errorCode || '未知错误',
            iconType: 'error'
          })
        } else {
          console.error('[Oh My Prompt] Auth timeout - no tokens received')

          chrome.runtime.sendMessage({
            type: 'AUTH_CALLBACK_COMPLETE',
            payload: { success: false, error: '登录超时，未收到认证信息' }
          }).catch(err => {
            console.warn('[Oh My Prompt] Failed to notify background:', err)
          })

          createStyledPage({
            iconStroke: '#ff716c',
            title: '登录超时',
            description: '未收到认证信息，请重试',
            iconType: 'timeout'
          })
        }
      }
    }, 100)
  }
})