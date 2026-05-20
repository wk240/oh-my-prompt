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

  // Set body background
  document.body.style.cssText = 'min-height: 100vh; background: #0e0e10; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #f9f5f8; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;'

  // Icon
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', config.iconStroke)
  svg.setAttribute('stroke-width', '2')
  svg.style.cssText = 'width: 64px; height: 64px; margin-bottom: 24px;'

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

  document.body.appendChild(svg)

  // Title
  const title = document.createElement('h2')
  title.style.cssText = 'font-size: 22px; font-weight: 600; margin: 0 0 8px 0;'
  title.textContent = config.title
  document.body.appendChild(title)

  // Description
  const desc = document.createElement('p')
  desc.style.cssText = 'color: rgba(173, 170, 173, 0.9); font-size: 14px; margin: 0 0 24px 0;'
  desc.innerHTML = config.description
  document.body.appendChild(desc)

  // Close button
  const button = document.createElement('button')
  button.style.cssText = 'padding: 14px 28px; background: linear-gradient(135deg, #81ecff 0%, #00e3fd 100%); color: #003840; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600;'
  button.textContent = '关闭页面'
  button.addEventListener('click', () => {
    window.close()
  })
  document.body.appendChild(button)
}

function extractAndSaveTokens(): boolean {
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

  chrome.storage.local.set({
    [storageKey]: sessionData
  }, () => {
    console.log('[Oh My Prompt] Session saved to storage with key:', storageKey)

    // Notify background script that auth completed
    chrome.runtime.sendMessage({
      type: 'AUTH_CALLBACK_COMPLETE',
      payload: { success: true }
    }).catch(err => {
      console.warn('[Oh My Prompt] Failed to notify background:', err)
    })

    // Check route type - auto-close for sync route, show UI for callback route
    const isSyncRoute = window.location.pathname.includes('/auth/extension/sync')

    if (isSyncRoute) {
      // Auto-close after 500ms delay (allow message to send)
      setTimeout(() => {
        console.log('[Oh My Prompt] Auto-closing sync tab')
        window.close()
      }, 500)
    } else {
      // OAuth callback - show success page with manual close button
      createStyledPage({
        iconStroke: '#81ecff',
        title: '登录成功',
        description: '云端同步已激活',
        iconType: 'success'
      })
    }
  })

  return true
}

// Try immediate extraction (if hash already set)
if (extractAndSaveTokens()) {
  // Success, tokens extracted immediately
} else {
  // Hash not ready yet, wait for it
  console.log('[Oh My Prompt] Waiting for tokens in hash...')

  // Check if this is the sync page - it may redirect to login if no session
  const isSyncRoute = window.location.pathname.includes('/auth/extension/sync')
  const initialUrl = window.location.href

  // Listen for hashchange event (when web-app's JavaScript sets the hash)
  const handleHashChange = () => {
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

    if (extractAndSaveTokens()) {
      // Keep listening for 'close' signal even after token extraction success
      // This handles the case where window.close() fails due to browser restrictions
      // and user clicks the "关闭此页面" button on web app's success page
    }
  }

  window.addEventListener('hashchange', handleHashChange)

  // For sync page: monitor URL changes - if redirected to login, stop polling silently
  // This is expected behavior when user is not logged in
  let redirected = false
  if (isSyncRoute) {
    const checkRedirect = () => {
      if (window.location.href !== initialUrl && window.location.pathname.includes('/auth/login')) {
        console.log('[Oh My Prompt] Sync page redirected to login - stopping token polling')
        redirected = true
        clearInterval(pollInterval)
        window.removeEventListener('hashchange', handleHashChange)
      }
    }
    // Check URL every 100ms along with polling
    setInterval(checkRedirect, 100)
  }

  // Also poll periodically as fallback (in case hashchange doesn't fire)
  let pollCount = 0
  const maxPolls = 50 // Poll for up to 5 seconds (100ms interval)
  const pollInterval = setInterval(() => {
    // If already redirected (for sync page), don't show timeout
    if (redirected) return

    pollCount++
    if (extractAndSaveTokens()) {
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