/**
 * Version Checker Module
 * Checks for updates from GitHub Releases API
 */

import type { UpdateStatus } from '../shared/types'

const REPO_OWNER = 'wk240'
const REPO_NAME = 'oh-my-prompt'
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`

const UPDATE_STATUS_KEY = 'omps_update_status'

// Re-export UpdateStatus type for convenience
export type { UpdateStatus } from '../shared/types'

/**
 * Compare semantic version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

/**
 * Fetch latest release from GitHub API
 */
async function fetchLatestRelease(): Promise<{
  version: string
  downloadUrl: string
  releaseNotes?: string
} | null> {
  try {
    const response = await fetch(API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[Oh My Prompt] No releases found in repository')
        return null
      }
      console.error('[Oh My Prompt] GitHub API error:', response.status)
      return null
    }

    const data = await response.json()

    // Find the .crx or .zip asset for download
    const asset = data.assets?.find((a: { name: string }) =>
      a.name.endsWith('.crx') || a.name.endsWith('.zip')
    )

    return {
      version: data.tag_name?.replace(/^v/, '') || data.name || '0.0.0',
      downloadUrl: asset?.browser_download_url || data.html_url,
      releaseNotes: data.body
    }
  } catch (error) {
    console.error('[Oh My Prompt] Failed to fetch release:', error)
    return null
  }
}

/**
 * Check for updates and store status
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  const currentVersion = chrome.runtime.getManifest().version
  const release = await fetchLatestRelease()

  const status: UpdateStatus = {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    downloadUrl: '',
    checkedAt: Date.now()
  }

  if (release) {
    status.latestVersion = release.version
    status.downloadUrl = release.downloadUrl
    status.releaseNotes = release.releaseNotes
    status.hasUpdate = compareVersions(release.version, currentVersion) > 0
  }

  // Store status in chrome.storage.local
  await chrome.storage.local.set({ [UPDATE_STATUS_KEY]: status })

  console.log('[Oh My Prompt] Update check result:', status)
  return status
}

/**
 * Get stored update status
 */
export async function getUpdateStatus(): Promise<UpdateStatus | null> {
  try {
    const result = await chrome.storage.local.get(UPDATE_STATUS_KEY)
    return result[UPDATE_STATUS_KEY] || null
  } catch (error) {
    console.error('[Oh My Prompt] Failed to get update status:', error)
    return null
  }
}

/**
 * Clear update status
 */
export async function clearUpdateStatus(): Promise<void> {
  await chrome.storage.local.remove(UPDATE_STATUS_KEY)
  console.log('[Oh My Prompt] Update status cleared')
}