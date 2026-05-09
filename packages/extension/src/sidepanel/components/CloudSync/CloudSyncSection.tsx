// packages/extension/src/sidepanel/components/CloudSync/CloudSyncSection.tsx
import { useState, useEffect } from 'react'
import { AuthModal } from './AuthModal'
import { SyncStatusCard } from './SyncStatusCard'
import { getAuthState, signOut } from '@/lib/cloud-sync/auth-service'
import { uploadToCloud, downloadFromCloud, applyDownloadedData } from '@/lib/cloud-sync/cloud-sync-service'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { CloudAuthState } from '@oh-my-prompt/shared/types'

export function CloudSyncSection() {
  const [authState, setAuthState] = useState<CloudAuthState | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    loadAuthState()
  }, [])

  // Listen for auth callback updates from service worker
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: { success: boolean; error?: string } }) => {
      if (message.type === 'AUTH_STATUS_UPDATE') {
        console.log('[Oh My Prompt] Received auth status update:', message.payload)
        if (message.payload?.success) {
          loadAuthState()
          setSuccess('登录成功')
        } else {
          setError(message.payload?.error || '登录失败')
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const loadAuthState = async () => {
    setLoading(true)
    const state = await getAuthState()
    setAuthState(state)
    setLoading(false)
  }

  const handleLogin = () => {
    setAuthModalOpen(true)
  }

  const handleAuthSuccess = async () => {
    await loadAuthState()
    setSuccess('登录成功')
  }

  const handleLogout = async () => {
    await signOut()
    setAuthState(null)
    setSuccess('已退出登录')
  }

  const handleUpload = async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)

    const result = await uploadToCloud()

    setSyncing(false)

    if (result.success) {
      setSuccess(`上传成功：${result.promptsCount || 0} 个提示词`)
      await loadAuthState()
    } else {
      if (result.error === 'NOT_LOGGED_IN') {
        setAuthModalOpen(true)
      } else {
        setError(result.error || '上传失败')
      }
    }
  }

  const handleDownload = async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)

    const result = await downloadFromCloud()

    setSyncing(false)

    if (result.success && result.data) {
      const applyResult = await applyDownloadedData(result.data)

      if (applyResult.success) {
        setSuccess(`下载成功：${result.data.prompts.length} 个提示词`)
        await loadAuthState()

        // Notify content script to refresh
        try {
          await chrome.runtime.sendMessage({ type: MessageType.REFRESH_DATA })
        } catch (err) {
          console.warn('[Oh My Prompt] Failed to notify refresh:', err)
        }
      } else {
        setError('应用数据失败')
      }
    } else {
      if (result.error === 'NOT_LOGGED_IN') {
        setAuthModalOpen(true)
      } else {
        setError(result.error || '下载失败')
      }
    }
  }

  return (
    <div className="w-full space-y-4 p-4">
      {/* Status Card */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-4">云端同步</h3>

        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-600 mb-4">{success}</p>
        )}

        <SyncStatusCard
          authState={authState}
          loading={loading}
          syncing={syncing}
          onLogin={handleLogin}
          onUpload={handleUpload}
          onDownload={handleDownload}
          onLogout={handleLogout}
        />

        {/* Tip */}
        <p className="text-xs text-gray-500 mt-4">
          提示：云端同步需订阅 Pro 或 Team 计划
        </p>
      </div>

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  )
}