import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Loader2, Check, X, RefreshCw, Settings } from 'lucide-react'
import { MessageType } from '../shared/messages'
import type { VisionApiErrorPayload, VisionApiErrorType } from '../shared/types'
import { CAPTURED_IMAGE_STORAGE_KEY } from '../shared/constants'

interface LoadingAppState {
  status: 'loading' | 'success' | 'error'
  prompt?: string
  imageUrl?: string
  errorType?: VisionApiErrorType
  errorMessage?: string
  errorAction?: 'reconfigure' | 'retry' | 'close'
  retryCount: number
}

function LoadingApp() {
  const [state, setState] = useState<LoadingAppState>({ status: 'loading', retryCount: 0 })

  // Request API call on mount
  useEffect(() => {
    requestApiCall(0)
  }, [])

  const requestApiCall = async (retryCount: number) => {
    setState({ status: 'loading', retryCount })

    // Get captured image URL from storage
    try {
      const result = await chrome.storage.local.get(CAPTURED_IMAGE_STORAGE_KEY)
      const capturedData = result[CAPTURED_IMAGE_STORAGE_KEY] as { url: string } | undefined

      if (!capturedData || !capturedData.url) {
        setState({
          status: 'error',
          errorType: 'network',
          errorMessage: '未找到图片URL',
          errorAction: 'close',
          retryCount
        })
        return
      }

      const imageUrl = capturedData.url
      console.log('[Oh My Prompt] Loading page: requesting API call for', imageUrl.substring(0, 50) + '...')

      // Send API call request to service worker
      const response = await chrome.runtime.sendMessage({
        type: MessageType.VISION_API_CALL,
        payload: { imageUrl, retryCount }
      })

      if (response.success) {
        setState({
          status: 'success',
          prompt: response.data.prompt,
          imageUrl,
          retryCount
        })
      } else {
        // Error response from service worker
        const errorPayload = response.error as VisionApiErrorPayload
        setState({
          status: 'error',
          errorType: errorPayload.type,
          errorMessage: errorPayload.message,
          errorAction: errorPayload.action,
          retryCount
        })
      }
    } catch (err) {
      console.error('[Oh My Prompt] Loading page error:', err)
      setState({
        status: 'error',
        errorType: 'network',
        errorMessage: '请求失败，请重试',
        errorAction: 'retry',
        retryCount
      })
    }
  }

  const handleRetry = () => {
    requestApiCall(state.retryCount + 1)
  }

  const handleReconfigure = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') })
    window.close()
  }

  const handleClose = () => {
    window.close()
  }

  const handleConfirm = () => {
    // Phase 12 will handle prompt insertion
    // For now, show success feedback and close
    console.log('[Oh My Prompt] User confirmed prompt:', state.prompt?.substring(0, 50) + '...')
    // TODO: Phase 12 - Insert to Lovart input or copy to clipboard
    window.close()
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h1 className="text-base font-semibold text-gray-900">图片转提示词</h1>
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
          {/* Loading state - VISION-03 */}
          {state.status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">正在分析图片...</p>
            </div>
          )}

          {/* Success state */}
          {state.status === 'success' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">生成的提示词：</p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {state.prompt}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleConfirm}>
                  <Check style={{ width: 16, height: 16 }} />
                  确认
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* Error state - VISION-04, D-05 */}
          {state.status === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-red-500" role="alert">{state.errorMessage}</p>
              <div className="flex gap-2">
                {state.errorAction === 'reconfigure' && (
                  <Button onClick={handleReconfigure}>
                    <Settings style={{ width: 16, height: 16 }} />
                    重新配置
                  </Button>
                )}
                {state.errorAction === 'retry' && (
                  <Button onClick={handleRetry}>
                    <RefreshCw style={{ width: 16, height: 16 }} />
                    重新尝试
                  </Button>
                )}
                <Button variant="outline" onClick={handleClose}>
                  <X style={{ width: 16, height: 16 }} />
                  关闭
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoadingApp