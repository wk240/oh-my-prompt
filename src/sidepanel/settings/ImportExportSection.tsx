import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import { Upload, Download } from 'lucide-react'
import { MessageType } from '@/shared/messages'
import type { StorageSchema } from '@/shared/types'
import { readImportFile, mergeImportData } from '@/lib/import-export'

/**
 * ImportExportSection - Handles import/export of prompts in SidePanel settings
 * Provides buttons to import and export prompt data as JSON files
 */
export function ImportExportSection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  /**
   * Export current prompt data to JSON file
   * Flow: GET_STORAGE -> EXPORT_DATA (chrome.downloads)
   */
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
      // Auto-dismiss messages after 2 seconds
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 2000)
    }
  }

  /**
   * Import prompt data from JSON file
   * Flow: file input -> readImportFile -> mergeImportData -> SET_STORAGE
   */
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
      // Auto-dismiss messages after 2 seconds
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 2000)
    }

    input.click()
  }

  return (
    <div className="p-4 bg-white rounded-lg border">
      <h3 className="text-sm font-medium text-gray-900 mb-3">导入导出</h3>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleImport}
          disabled={loading}
          className="flex-1"
        >
          <Upload className="w-4 h-4" />
          {loading ? '导入prompt中...' : '导入prompt'}
        </Button>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={loading}
          className="flex-1"
        >
          <Download className="w-4 h-4" />
          {loading ? '导出prompt中...' : '导出prompt'}
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-500 mt-3">{error}</p>
      )}

      {/* Success message */}
      {success && (
        <p className="text-sm text-green-600 mt-3">{success}</p>
      )}

      {/* Tip */}
      <p className="text-xs text-gray-500 mt-3">
        提示：导入时会保留已有数据，仅添加新内容
      </p>
    </div>
  )
}