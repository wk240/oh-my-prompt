/**
 * API configuration sync (plain text, no encryption)
 * Saves VisionApiConfig to secrets/ directory in backup folder
 */

import type { VisionApiConfig, ProviderConfigsStorage } from '@oh-my-prompt/shared/types'
import { SECRETS_DIR_NAME, API_CONFIG_FILE, PROVIDER_CONFIGS_FILE } from '@oh-my-prompt/shared/constants'

interface ApiConfigFile {
  version: string
  config: VisionApiConfig
  timestamp: string
}

interface ProviderConfigsFile {
  version: string
  configs: ProviderConfigsStorage
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
  try {
    // Get secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME)

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
    // Check error type for better messaging
    const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'Unknown')

    // NotFoundError is expected when secrets directory or file doesn't exist (new folder)
    // This is normal behavior, not an error - silently return null
    if (errorName === 'NotFoundError') {
      return null
    }

    // Other errors (NotAllowedError, SecurityError) indicate permission issues
    // These are worth logging as warnings
    console.warn('[Oh My Prompt] Failed to read API config:', errorName, error instanceof Error ? error.message : '')
    return null
  }
}

/**
 * Save ProviderConfigsStorage to secrets directory (plain text JSON)
 */
export async function syncProviderConfigsToFolder(
  storage: ProviderConfigsStorage,
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // Create config file structure
    const configFile: ProviderConfigsFile = {
      version: '1.0',
      configs: storage,
      timestamp: new Date().toISOString()
    }

    // Create secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME, { create: true })

    // Write plain text JSON file
    const fileHandle = await secretsDir.getFileHandle(PROVIDER_CONFIGS_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(configFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt] Provider configs saved to secrets/', PROVIDER_CONFIGS_FILE)
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Failed to save provider configs:', error)
    return false
  }
}

/**
 * Read ProviderConfigsStorage from secrets directory (plain text JSON)
 * Returns null if file doesn't exist or parsing fails
 */
export async function readProviderConfigsFromFolder(
  handle: FileSystemDirectoryHandle
): Promise<ProviderConfigsStorage | null> {
  try {
    // Get secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME)

    // Read config file
    const fileHandle = await secretsDir.getFileHandle(PROVIDER_CONFIGS_FILE)
    const file = await fileHandle.getFile()
    const content = await file.text()

    // Parse config file
    const configFile: ProviderConfigsFile = JSON.parse(content)

    // Validate version
    if (configFile.version !== '1.0') {
      console.warn('[Oh My Prompt] Unknown provider configs version:', configFile.version)
      return null
    }

    console.log('[Oh My Prompt] Provider configs loaded from secrets/', PROVIDER_CONFIGS_FILE)
    return configFile.configs
  } catch (error) {
    // Check error type for better messaging
    const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'Unknown')

    // NotFoundError is expected when secrets directory or file doesn't exist (new folder)
    // This is normal behavior, not an error - silently return null
    if (errorName === 'NotFoundError') {
      return null
    }

    // Other errors (NotAllowedError, SecurityError) indicate permission issues
    // These are worth logging as warnings
    console.warn('[Oh My Prompt] Failed to read provider configs:', errorName, error instanceof Error ? error.message : '')
    return null
  }
}