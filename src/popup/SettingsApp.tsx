import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { X, Bot, Database, Upload, Download, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { MessageType } from '../shared/messages'
import type { StorageSchema } from '../shared/types'
import { readImportFile, mergeImportData } from '../lib/import-export'

function SettingsApp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [visionEnabled, setVisionEnabled] = useState(true)

  // Load vision setting on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
      if (response?.success && response.data?.settings) {
        setVisionEnabled(response.data.settings.visionEnabled ?? true)
      }
    })
  }, [])

  const handleClose = () => {
    window.close()
  }

  // Open API config page
  const handleOpenApiConfig = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/api-config.html') })
    window.close()
  }

  // Open backup page
  const handleOpenBackup = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/backup.html') })
    window.close()
  }

  // Export data
  const handleExport = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Get current data from storage
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
      if (response?.success && response.data) {
        const data: StorageSchema = response.data
        const exportResponse = await chrome.runtime.sendMessage({
          type: MessageType.EXPORT_DATA,
          payload: data
        })
        if (exportResponse?.success) {
          setSuccess('导出成功')
        } else {
          setError(exportResponse?.error || '导出失败')
        }
      } else {
        setError('获取数据失败')
      }
    } catch {
      setError('导出失败')
    } finally {
      setLoading(false)
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 2000)
    }
  }

  // Import data
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setLoading(true)
      setError(null)
      setSuccess(null)

      const result = await readImportFile(file)

      if (result.valid && result.data) {
        // Get current data
        const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
        if (response?.success && response.data) {
          const currentData = response.data.userData
          const merged = mergeImportData(
            { prompts: currentData.prompts, categories: currentData.categories },
            result.data.userData
          )

          // Save merged data
          const saveResponse = await chrome.runtime.sendMessage({
            type: MessageType.SET_STORAGE,
            payload: {
              version: chrome.runtime.getManifest().version,
              userData: { prompts: merged.prompts, categories: merged.categories }
            }
          })

          if (saveResponse?.success) {
            setSuccess(`导入成功：新增 ${merged.addedCount} 条`)
          } else {
            setError('保存数据失败')
          }
        } else {
          setError('获取当前数据失败')
        }
      } else {
        setError(result.error || '导入失败')
      }

      setLoading(false)
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 2000)
    }

    input.click()
  }

  // Toggle vision feature
  const handleVisionToggle = async (enabled: boolean) => {
    setVisionEnabled(enabled)
    chrome.runtime.sendMessage({
      type: MessageType.SET_SETTINGS_ONLY,
      payload: { settings: { visionEnabled: enabled } }
    })
    setSuccess(enabled ? '转提示词功能已开启' : '转提示词功能已关闭')
    setTimeout(() => setSuccess(null), 2000)
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h1 className="text-base font-semibold text-gray-900">设置中心</h1>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="关闭"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Navigation items */}
          <button
            onClick={handleOpenApiConfig}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-md bg-purple-100 text-purple-600">
                <Bot style={{ width: 16, height: 16 }} />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">视觉AI配置</div>
                <div className="text-xs text-gray-500">配置API密钥，支持图片转提示词</div>
              </div>
            </div>
            <ChevronRight style={{ width: 16, height: 16, color: '#9ca3af' }} />
          </button>

          <button
            onClick={handleOpenBackup}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-md bg-blue-100 text-blue-600">
                <Database style={{ width: 16, height: 16 }} />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">本地备份</div>
                <div className="text-xs text-gray-500">选择文件夹自动同步</div>
              </div>
            </div>
            <ChevronRight style={{ width: 16, height: 16, color: '#9ca3af' }} />
          </button>

          {/* Vision feature toggle */}
          <div className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-md bg-green-100 text-green-600">
                {visionEnabled ? <Eye style={{ width: 16, height: 16 }} /> : <EyeOff style={{ width: 16, height: 16 }} />}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">转提示词功能</div>
                <div className="text-xs text-gray-500">图片悬停按钮转提示词</div>
              </div>
            </div>
            <button
              onClick={() => handleVisionToggle(!visionEnabled)}
              className={`w-12 h-6 rounded-full transition-colors ${visionEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
              aria-label={visionEnabled ? '关闭转提示词功能' : '开启转提示词功能'}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${visionEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}
              />
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-4"></div>

          {/* Import/Export buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleImport}
              disabled={loading}
              className="flex-1"
            >
              <Upload style={{ width: 16, height: 16 }} />
              {loading ? '导入中...' : '导入数据'}
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={loading}
              className="flex-1"
            >
              <Download style={{ width: 16, height: 16 }} />
              {loading ? '导出中...' : '导出数据'}
            </Button>
          </div>

          {/* Messages */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600">{success}</p>
          )}

          {/* Hint */}
          <p className="text-xs text-gray-500 pt-2">
            提示：所有数据仅存储在本地，不会同步到云端
          </p>
        </div>
      </div>
    </div>
  )
}

export default SettingsApp