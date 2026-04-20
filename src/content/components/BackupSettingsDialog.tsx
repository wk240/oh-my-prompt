/**
 * BackupSettingsDialog - Portal-rendered dialog for backup folder selection
 * Used in content script dropdown when backup fails due to no folder configured
 */

import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback } from 'react'
import { X, FolderOpen, Check } from 'lucide-react'

const PORTAL_ID = 'oh-my-prompt-script-dropdown-portal'

interface SyncStatus {
  enabled: boolean
  hasFolder: boolean
  lastSyncTime?: number
  folderName?: string
}

interface BackupSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  onBackupSuccess?: () => void
}

function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID
    document.body.appendChild(container)
  }
  return container
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function BackupSettingsDialog({
  isOpen,
  onClose,
  onBackupSuccess
}: BackupSettingsDialogProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load sync status on open
  useEffect(() => {
    if (isOpen) {
      loadStatus()
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const loadStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' })
      if (response?.success) {
        setStatus(response.data)
      } else {
        setError('获取状态失败')
      }
    } catch (err) {
      setError('获取状态失败')
    } finally {
      setLoading(false)
    }
  }

  // Overlay click handler
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  // Handle folder selection
  const handleSelectFolder = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SELECT_AND_SAVE_FOLDER' })
      if (response?.success) {
        setStatus(response.data)
        onBackupSuccess?.()
      } else {
        setError(response?.error || '选择文件夹失败')
      }
    } catch (err) {
      setError('选择文件夹失败')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 2147483647,
        }}
      />
      {/* Dialog */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '480px',
          maxWidth: '90vw',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          zIndex: 2147483647,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #E5E5E5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#171717' }}>
              本地备份设置
            </span>
            {!status?.hasFolder && (
              <p style={{
                fontSize: '12px',
                color: '#737373',
                marginTop: '4px'
              }}>
                选择文件夹以启用备份，数据变更时自动同步
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#171717',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px' }}>
          {loading && !status ? (
            <div style={{ fontSize: '12px', color: '#737373', textAlign: 'center' }}>
              加载中...
            </div>
          ) : (
            <>
              {/* Status display if has folder */}
              {status?.hasFolder && (
                <>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#171717' }}>
                      状态
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#22c55e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <Check style={{ width: 12, height: 12 }} />
                      已配置
                    </span>
                  </div>

                  {status.folderName && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#171717' }}>
                        备份文件夹
                      </span>
                      <span style={{
                        fontSize: '12px',
                        color: '#737373',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {status.folderName}
                      </span>
                    </div>
                  )}

                  {status.lastSyncTime && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#171717' }}>
                        上次备份
                      </span>
                      <span style={{ fontSize: '12px', color: '#737373' }}>
                        {formatTimestamp(status.lastSyncTime)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Error message */}
              {error && (
                <p style={{
                  fontSize: '12px',
                  color: '#ef4444',
                  marginBottom: '12px',
                }}>
                  {error}
                </p>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {!status?.hasFolder ? (
                  <button
                    onClick={handleSelectFolder}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      background: '#171717',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#fff',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    <FolderOpen style={{ width: 14, height: 14 }} />
                    {loading ? '处理中...' : '选择文件夹并启用'}
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: '#f8f8f8',
                      border: '1px solid #E5E5E5',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#171717',
                      cursor: 'pointer',
                    }}
                  >
                    完成
                  </button>
                )}
              </div>

              {/* Hint */}
              <p style={{
                fontSize: '11px',
                color: '#737373',
                marginTop: '12px',
              }}>
                提示：扩展卸载后数据仍可从此文件夹恢复
              </p>
            </>
          )}
        </div>
      </div>
    </>,
    getPortalContainer()
  )
}