/**
 * API configuration encryption sync
 * Encrypts VisionApiConfig and saves to secrets/ directory in backup folder
 * Salt is also stored in secrets/salt.bin for cross-installation recovery
 */

import type { VisionApiConfig } from '../../shared/types'
import { SECRETS_DIR_NAME, API_CONFIG_ENC_FILE } from '../../shared/constants'
import { getEncryptionKey } from '../crypto/key-manager'
import { encryptData, decryptData } from '../crypto/aes-gcm'

interface EncryptedApiConfig {
  version: string
  algorithm: 'AES-GCM-256'
  iv: string // base64 encoded
  encrypted: string // base64 encoded
  timestamp: string
}

/**
 * Encrypt API config and save to secrets directory
 * Also ensures salt file exists for future decryption
 */
export async function syncApiConfigToFolder(
  config: VisionApiConfig,
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // Get encryption key (creates salt if needed)
    const key = await getEncryptionKey(handle)

    // Serialize config to JSON
    const configJson = JSON.stringify(config)

    // Encrypt
    const { ciphertext, iv } = await encryptData(configJson, key)

    // Create encrypted file structure
    const encryptedFile: EncryptedApiConfig = {
      version: '1.0',
      algorithm: 'AES-GCM-256',
      iv: btoa(String.fromCharCode(...iv)), // base64 encode IV
      encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))), // base64 encode ciphertext
      timestamp: new Date().toISOString()
    }

    // Create secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME, { create: true })

    // Write encrypted file
    const fileHandle = await secretsDir.getFileHandle(API_CONFIG_ENC_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(encryptedFile, null, 2))
    await writable.close()

    console.log('[Oh My Prompt] API config encrypted and saved to secrets/', API_CONFIG_ENC_FILE)
    return true
  } catch (error) {
    console.error('[Oh My Prompt] Failed to encrypt API config:', error)
    return false
  }
}

/**
 * Read and decrypt API config from secrets directory
 * Returns null if file doesn't exist or decryption fails
 */
export async function readApiConfigFromFolder(
  handle: FileSystemDirectoryHandle
): Promise<VisionApiConfig | null> {
  console.log('[Oh My Prompt] readApiConfigFromFolder: Starting...')
  try {
    // Get secrets directory
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME)
    console.log('[Oh My Prompt] readApiConfigFromFolder: secrets directory found')

    // Read encrypted file
    const fileHandle = await secretsDir.getFileHandle(API_CONFIG_ENC_FILE)
    const file = await fileHandle.getFile()
    const content = await file.text()
    console.log('[Oh My Prompt] readApiConfigFromFolder: encrypted file read, size:', content.length)

    // Parse encrypted structure
    const encryptedFile: EncryptedApiConfig = JSON.parse(content)

    // Validate structure
    if (encryptedFile.algorithm !== 'AES-GCM-256') {
      console.warn('[Oh My Prompt] Unknown encryption algorithm:', encryptedFile.algorithm)
      return null
    }

    console.log('[Oh My Prompt] readApiConfigFromFolder: algorithm validated')

    // Get encryption key (reads existing salt from folder)
    const key = await getEncryptionKey(handle)
    console.log('[Oh My Prompt] readApiConfigFromFolder: encryption key obtained')

    // Decode base64 IV and ciphertext
    const iv = Uint8Array.from(atob(encryptedFile.iv), c => c.charCodeAt(0))
    const ciphertext = Uint8Array.from(atob(encryptedFile.encrypted), c => c.charCodeAt(0))
    console.log('[Oh My Prompt] readApiConfigFromFolder: IV length:', iv.length, 'ciphertext length:', ciphertext.length)

    // Decrypt (convert Uint8Array to ArrayBuffer)
    const decryptedJson = await decryptData(ciphertext.buffer as ArrayBuffer, iv, key)
    console.log('[Oh My Prompt] readApiConfigFromFolder: decrypted successfully')

    // Parse config
    const config: VisionApiConfig = JSON.parse(decryptedJson)

    console.log('[Oh My Prompt] API config decrypted from secrets/', API_CONFIG_ENC_FILE)
    return config
  } catch (error) {
    // File doesn't exist or decryption failed
    console.warn('[Oh My Prompt] Failed to read encrypted API config:', error)
    return null
  }
}