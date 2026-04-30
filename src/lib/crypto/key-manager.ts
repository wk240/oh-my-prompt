/**
 * Key management for encryption
 * Salt is stored in backup folder (secrets/salt.bin) for cross-installation recovery
 * Key is derived from salt using PBKDF2 with fixed passphrase
 */

import { SECRETS_DIR_NAME, SALT_FILE } from '@/shared/constants'

const PBKDF2_ITERATIONS = 100000
const KEY_LENGTH = 256
const SALT_LENGTH = 16

// Fixed passphrase for key derivation (salt provides uniqueness per backup folder)
// This is a trade-off: anyone with the folder can decrypt, but it prevents casual access
const PASSPHRASE = 'OhMyPrompt-Encryption-Key-2026'

/**
 * Get or create salt from backup folder
 * Salt is stored in secrets/salt.bin for cross-installation recovery
 */
export async function getOrCreateSalt(handle: FileSystemDirectoryHandle): Promise<Uint8Array> {
  try {
    // Try to read existing salt from folder
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME)
    const fileHandle = await secretsDir.getFileHandle(SALT_FILE)
    const file = await fileHandle.getFile()
    const saltData = await file.arrayBuffer()
    const salt = new Uint8Array(saltData)

    console.log('[Oh My Prompt] Read existing encryption salt from folder')
    return salt
  } catch {
    // Salt file doesn't exist, create new one
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

    // Create secrets directory and save salt
    const secretsDir = await handle.getDirectoryHandle(SECRETS_DIR_NAME, { create: true })
    const fileHandle = await secretsDir.getFileHandle(SALT_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(salt)
    await writable.close()

    console.log('[Oh My Prompt] Created new encryption salt in folder')
    return salt
  }
}

/**
 * Derive AES-GCM encryption key from salt
 * Uses fixed passphrase + salt for key derivation
 */
export async function deriveEncryptionKey(salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passphraseData = encoder.encode(PASSPHRASE)

  // Import as PBKDF2 key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )

  // Derive AES-GCM key using PBKDF2
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  )

  return derivedKey
}

/**
 * Get encryption key from backup folder
 * Main entry point - combines salt retrieval and key derivation
 */
export async function getEncryptionKey(handle: FileSystemDirectoryHandle): Promise<CryptoKey> {
  const salt = await getOrCreateSalt(handle)
  return deriveEncryptionKey(salt)
}