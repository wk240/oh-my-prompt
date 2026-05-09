/**
 * Auth Callback Content Script
 *
 * Runs on OAuth callback pages to extract tokens from URL and save to extension storage.
 * This bridges the gap between web-app OAuth and extension Supabase client.
 *
 * URL format: /auth/callback#access_token=xxx&refresh_token=xxx&...
 */

console.log('[Oh My Prompt] Auth callback script loaded')

// Supabase project reference (extracted from URL)
const SUPABASE_PROJECT_REF = 'futfxudabvjfldlismun'

// Extract tokens from URL hash
const hash = window.location.hash.substring(1) // Remove '#'
const params = new URLSearchParams(hash)

const accessToken = params.get('access_token')
const refreshToken = params.get('refresh_token')
const expiresAt = params.get('expires_at')
const expiresIn = params.get('expires_in')
const tokenType = params.get('token_type')
const providerToken = params.get('provider_token')

if (accessToken) {
  console.log('[Oh My Prompt] Found access token, saving to storage...')

  // Build Supabase session object (must be JSON string for storage adapter)
  // Supabase expects this format for its storage adapter
  const sessionData = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken || '',
    expires_in: expiresIn ? parseInt(expiresIn) : 3600,
    expires_at: expiresAt ? parseInt(expiresAt) : Math.floor(Date.now() / 1000) + 3600,
    token_type: tokenType || 'bearer',
    provider_token: providerToken || null
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

    // Show success message to user
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui;">
        <div style="text-align: center;">
          <h2 style="color: #22c55e;">登录成功</h2>
          <p style="color: #666;">请关闭此页面，返回扩展继续使用</p>
          <button onclick="window.close()" style="margin-top: 16px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
            关闭页面
          </button>
        </div>
      </div>
    `
  })
} else {
  console.log('[Oh My Prompt] No access token in URL, checking for error...')

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

    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui;">
        <div style="text-align: center;">
          <h2 style="color: #ef4444;">登录失败</h2>
          <p style="color: #666;">${errorMsg || errorCode || '未知错误'}</p>
          <button onclick="window.close()" style="margin-top: 16px; padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">
            关闭页面
          </button>
        </div>
      </div>
    `
  }
}