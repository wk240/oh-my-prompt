/**
 * AES-GCM-256 encryption/decryption utilities
 * Uses Web Crypto API for secure authenticated encryption
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits, recommended for AES-GCM

/**
 * Encrypt data using AES-GCM-256
 * Returns ciphertext and IV (both needed for decryption)
 */
export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  // Generate random IV for each encryption (critical for security)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encoder = new TextEncoder()
  const encodedData = encoder.encode(data)

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv as unknown as BufferSource // Type workaround for TypeScript
    },
    key,
    encodedData
  )

  return { ciphertext, iv }
}

/**
 * Decrypt data using AES-GCM-256
 * Requires the same IV used during encryption
 */
export async function decryptData(
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv as unknown as BufferSource // Type workaround for TypeScript
    },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/**
 * Generate a new AES-GCM key from raw key material
 * Used internally by key-manager
 */
export async function importKeyFromRaw(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer, // Convert to ArrayBuffer
    { name: ALGORITHM },
    false, // not extractable
    ['encrypt', 'decrypt']
  )
}

/**
 * Generate a random AES-GCM key (for testing purposes)
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    true, // extractable for testing
    ['encrypt', 'decrypt']
  )
}