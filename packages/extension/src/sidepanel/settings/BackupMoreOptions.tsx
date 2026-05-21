import { useState } from 'react'
import {
  Download,
  Upload,
  History,
  LogOut,
  FolderOpen,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'
import { WEB_APP_URL } from '@/lib/config'
import { Button } from '@/popup/components/ui/button'
import type { BackupStatusStorage } from '@/lib/sync/types'

interface BackupMoreOptionsProps {
  status: BackupStatusStorage | null
  onLogout?: () => void
  onChangeFolder?: () => void
  onViewHistory?: () => void
  onMergeFromCloud?: () => void
  onViewDiff?: () => void
  onEmergencyExport?: () => void
  loading?: boolean
}

/**
 * BackupMoreOptions - Section with backup options
 *
 * Features:
 * - Emergency export warning when both cloud and local have failed
 * - Cloud backup options (always expanded)
 * - Local backup options (always expanded)
 * - Multi-device sync options (expandable, only shown if cloud logged in)
 */
export function BackupMoreOptions({
  status,
  onLogout,
  onChangeFolder,
  onViewHistory,
  onMergeFromCloud,
  onViewDiff,
  onEmergencyExport,
  loading = false
}: BackupMoreOptionsProps) {
  const [showSyncOptions, setShowSyncOptions] = useState(false)

  if (!status) return null

  // Determine if both backups failed (cloud.retryCount >= 3 AND local.retryCount >= 3)
  const bothFailed = status.cloud.retryCount >= 3 && status.local.retryCount >= 3

  // Cloud is logged in
  const cloudLoggedIn = status.cloud.loggedIn ?? false

  // Local is enabled
  const localEnabled = status.local.enabled

  return (
    <div className="space-y-3 pt-3">
      {/* Emergency warning if bothFailed */}
      {bothFailed && (
        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">⚠️ 数据安全警告</span>
          </div>
          <p className="text-sm text-red-700 mb-3 leading-relaxed">
            所有备份方式均已失败。数据仅存在于本地存储，扩展卸载后将丢失。
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={onEmergencyExport}
            disabled={loading}
            className="w-full h-9"
          >
            <Download className="w-4 h-4" />
            {loading ? '导出中...' : '应急导出所有数据'}
          </Button>
        </div>
      )}

      {/* Cloud backup options (if loggedIn) - always expanded */}
      {cloudLoggedIn && (
        <div className="p-3 border border-gray-200 rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Upload className="w-4 h-4 text-gray-500" />
            <span>云端备份选项</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">登录状态</span>
            <span className="text-sm text-green-600">已登录</span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`${WEB_APP_URL}/backup`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              进入Web端管理
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            disabled={loading}
            className="w-full h-9"
          >
            <LogOut className="w-4 h-4" />
            {loading ? '退出中...' : '退出登录'}
          </Button>
        </div>
      )}

      {/* Local backup options (if enabled) - always expanded */}
      {localEnabled && (
        <div className="p-3 border border-gray-200 rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <FolderOpen className="w-4 h-4 text-gray-500" />
            <span>本地备份选项</span>
          </div>

          {status.local.folderName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">文件夹</span>
              <span className="text-sm text-gray-500 truncate max-w-[140px]" title={status.local.folderName}>
                {status.local.folderName}
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onChangeFolder}
              disabled={loading}
              className="flex-1 h-9"
            >
              <FolderOpen className="w-4 h-4" />
              更换文件夹
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onViewHistory}
              disabled={loading}
              className="flex-1 h-9"
            >
              <History className="w-4 h-4" />
              查看历史
            </Button>
          </div>
        </div>
      )}

      {/* Multi-device sync options (if cloud loggedIn) */}
      {cloudLoggedIn && (
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => setShowSyncOptions(!showSyncOptions)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4 text-gray-500" />
              多设备同步选项
            </span>
            {showSyncOptions ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showSyncOptions && (
            <div className="p-3 pt-0 space-y-3 border-t border-gray-100">
              <p className="text-sm text-gray-600 leading-relaxed">
                合并云端数据可将其他设备的数据合并到本地，保留本地独有数据。
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMergeFromCloud}
                  disabled={loading}
                  className="flex-1 h-9"
                >
                  <Download className="w-4 h-4" />
                  {loading ? '合并中...' : '合并云端数据'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewDiff}
                  disabled={loading}
                  className="flex-1 h-9"
                >
                  查看差异
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
