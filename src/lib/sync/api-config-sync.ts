/**
 * API configuration sync (plain text, no encryption)
 * Saves VisionApiConfig to secrets/ directory in backup folder
 */

import type { VisionApiConfig } from '../../shared/types'
import { SECRETS_DIR_NAME, API_CONFIG_FILE } from '../../shared/constants'

interface ApiConfigFile {
  version: string
  config: VisionApiConfig
  timestamp: string
}

/**
 * Save API config to secrets directory (plain text JSON)
 */
export async function syncApiConfigToFolder(
  config: VisionApiConfig,
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // Create config file structure
    const configFile: ApiConfigFile = {
      version: '1.0',
      config,
      timestamp: new Date().toISOString()
    }

    // Create secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME, { create: true })

    // Write plain text JSON file
    const fileHandle = await secretsDir.getFileHandle(API_CONFIG_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(configFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt] API config saved to secrets/', API_CONFIG_FILE)
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Failed to save API config:', error)
    return false
  }
}

/**
 * Read API config from secrets directory (plain text JSON)
 * Returns null if file doesn't exist or parsing fails
 */
export async function readApiConfigFromFolder(
  handle: FileSystemDirectoryHandle
): Promise<VisionApiConfig | null> {
  console.log('[Oh My Prompt] readApiConfigFromFolder: Starting...')
  try {
    // Get secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME)
    console.log('[Oh My Prompt] readApiConfigFromFolder: secrets directory found')

    // Read config file
    const fileHandle = await secretsDir.getFileHandle(API_CONFIG_FILE)
    const file = await fileHandle.getFile()
    const content = await file.text()
    console.log('[Oh My Prompt] readApiConfigFromFolder: file read, size:', content.length)

    // Parse config file
    const configFile: ApiConfigFile = JSON.parse(content)

    // Validate version
    if (configFile.version !== '1.0') {
      console.warn('[Oh My Prompt] Unknown config version:', configFile.version)
      return null
    }

    console.log('[Oh My Prompt] API config loaded from secrets/', API_CONFIG_FILE)
    return configFile.config
  } catch (error) {
    // File doesn't exist or parsing failed
    console.warn('[Oh My Prompt] Failed to read API config:', error)
    return null
  }
}