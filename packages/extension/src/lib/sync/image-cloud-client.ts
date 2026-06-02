import { WEB_APP_URL, SUPABASE_PROJECT_REF } from '@/lib/config'
import { HARD_IMAGE_SIZE_LIMIT, computeBlobSha256 } from './image-processing'

const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

export interface UploadCloudImageInput {
  imageId: string
  promptId: string
  blob: Blob
  hash: string
  width: number
  height: number
  size: number
}

export interface UploadCloudImageResult {
  success: boolean
  cloudUrl?: string
  cloudPath?: string
  size?: number
  error?: string
}

export interface DownloadCloudImageExpected {
  size?: number
  hash?: string
}

export interface DownloadCloudImageResult {
  success: boolean
  blob?: Blob
  error?: 'DOWNLOAD_FAILED' | 'FILE_TOO_LARGE' | 'INVALID_RESPONSE' | 'SIZE_MISMATCH' | 'HASH_MISMATCH' | string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'NETWORK_ERROR'
}

async function getAuthTokenDirect(): Promise<string | null> {
  const result = await chrome.storage.local.get(AUTH_STORAGE_KEY)
  const sessionData = result[AUTH_STORAGE_KEY]
  if (typeof sessionData !== 'string') return null

  let session: unknown
  try {
    session = JSON.parse(sessionData)
  } catch {
    return null
  }

  if (!isRecord(session)) return null
  if (typeof session.access_token !== 'string' || typeof session.expires_at !== 'number') return null
  if (session.expires_at < Math.floor(Date.now() / 1000)) return null
  return session.access_token
}

async function isWebpBlob(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  return header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
}

function normalizeDownloadedWebp(blob: Blob): Blob {
  return blob.type === 'image/webp' ? blob : new Blob([blob], { type: 'image/webp' })
}

export async function downloadCloudImage(
  url: string,
  expected: DownloadCloudImageExpected = {}
): Promise<DownloadCloudImageResult> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `HTTP_${response.status}` }
    }

    const blob = await response.blob()
    if (blob.size > HARD_IMAGE_SIZE_LIMIT) {
      return { success: false, error: 'FILE_TOO_LARGE' }
    }

    const contentType = response.headers.get('Content-Type') || ''
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return { success: false, error: 'INVALID_RESPONSE' }
    }

    if (!await isWebpBlob(blob)) {
      return { success: false, error: 'INVALID_RESPONSE' }
    }

    if (expected.size !== undefined && blob.size !== expected.size) {
      return { success: false, error: 'SIZE_MISMATCH' }
    }

    if (expected.hash) {
      const hash = await computeBlobSha256(blob)
      if (hash !== expected.hash) {
        return { success: false, error: 'HASH_MISMATCH' }
      }
    }

    return { success: true, blob: normalizeDownloadedWebp(blob) }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) || 'DOWNLOAD_FAILED' }
  }
}

export async function uploadCloudImage(input: UploadCloudImageInput): Promise<UploadCloudImageResult> {
  const token = await getAuthTokenDirect()
  if (!token) return { success: false, error: 'NOT_LOGGED_IN' }

  const formData = new FormData()
  formData.set('file', input.blob, `${input.imageId}.webp`)
  formData.set('imageId', input.imageId)
  formData.set('promptId', input.promptId)
  formData.set('hash', input.hash)
  formData.set('width', String(input.width))
  formData.set('height', String(input.height))
  formData.set('size', String(input.size))

  try {
    const response = await fetch(`${WEB_APP_URL}/api/images/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    })
    const body: unknown = await response.json().catch(() => ({}))
    if (!isRecord(body)) {
      return { success: false, error: response.ok ? 'MALFORMED_RESPONSE' : `HTTP_${response.status}` }
    }
    if (!response.ok || body.success !== true) {
      return { success: false, error: typeof body.error === 'string' ? body.error : `HTTP_${response.status}` }
    }
    if (!isRecord(body.data)) {
      return { success: false, error: 'MALFORMED_RESPONSE' }
    }
    if (
      typeof body.data.cloudUrl !== 'string' ||
      typeof body.data.cloudPath !== 'string' ||
      typeof body.data.size !== 'number'
    ) {
      return { success: false, error: 'MALFORMED_RESPONSE' }
    }

    return {
      success: true,
      cloudUrl: body.data.cloudUrl,
      cloudPath: body.data.cloudPath,
      size: body.data.size
    }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

export async function deleteCloudImage(imageId: string, cloudPath?: string): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthTokenDirect()
  if (!token) return { success: false, error: 'NOT_LOGGED_IN' }

  try {
    const response = await fetch(`${WEB_APP_URL}/api/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cloudPath })
    })
    const body: unknown = await response.json().catch(() => ({}))
    if (!isRecord(body)) {
      return { success: false, error: response.ok ? 'MALFORMED_RESPONSE' : `HTTP_${response.status}` }
    }
    if (!response.ok || body.success !== true) {
      return { success: false, error: typeof body.error === 'string' ? body.error : `HTTP_${response.status}` }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}
