import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Loader2, Check, X, RefreshCw, Settings } from 'lucide-react'
import { MessageType } from '../shared/messages'
import type { VisionApiErrorPayload, VisionApiErrorType, InsertPromptPayload, SaveTemporaryPromptPayload } from '../shared/types'
import { CAPTURED_IMAGE_STORAGE_KEY } from '../shared/constants'

interface LoadingAppState {
  status: 'loading' | 'success' | 'error' | 'confirming'  // Add 'confirming' state
  prompt?: string
  imageUrl?: string
  errorType?: VisionApiErrorType
  errorMessage?: string
  errorAction?: 'reconfigure' | 'retry' | 'close'
  retryCount: number
  // Phase 12: Lovart detection and delivery result
  isLovartPage?: boolean      // True if user is on Lovart page (D-01)
  lovartTabId?: number        // Lovart tab ID for INSERT_PROMPT routing
  feedbackMessage?: string    // Success/error feedback (D-09)
  deliveryStatus?: 'pending' | 'success' | 'failed'  // Insert/clipboard result
}

function LoadingApp() {
  const [state, setState] = useState<LoadingAppState>({ status: 'loading', retryCount: 0 })

  // Request API call on mount
  useEffect(() => {
    requestApiCall(0)
  }, [])

  /**
   * Detect if user is on Lovart page (D-01)
   * @returns { isLovart: boolean, tabId?: number }
   */
  const detectLovartPage = async (): Promise<{ isLovart: boolean; tabId?: number }> => {
    try {
      // Get captured image tab info from storage
      const result = await chrome.storage.local.get(CAPTURED_IMAGE_STORAGE_KEY)
      const capturedData = result[CAPTURED_IMAGE_STORAGE_KEY] as { url: string; tabId?: number } | undefined

      if (!capturedData || !capturedData.tabId) {
        // No tab info stored, query active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const activeTab = tabs[0]
        if (!activeTab?.url || !activeTab?.id) {
          return { isLovart: false }
        }

        const lovartPattern = /^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/
        return {
          isLovart: lovartPattern.test(activeTab.url),
          tabId: activeTab.id
        }
      }

      // Use stored tab ID
      const storedTabId = capturedData.tabId
      const tab = await chrome.tabs.get(storedTabId)
      if (!tab?.url) {
        return { isLovart: false, tabId: storedTabId }
      }

      const lovartPattern = /^https?:\/\/(?:[^/]*\.)?lovart\.ai(?:\/|$)/
      return {
        isLovart: lovartPattern.test(tab.url),
        tabId: storedTabId
      }
    } catch (error) {
      console.warn('[Oh My Prompt] Lovart detection error:', error)
      return { isLovart: false }
    }
  }

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
      // Permission should have been granted when user saved API config in SettingsApp
      const response = await chrome.runtime.sendMessage({
        type: MessageType.VISION_API_CALL,
        payload: { imageUrl, retryCount }
      })

      if (response.success) {
        // Detect Lovart page (D-01)
        const lovartInfo = await detectLovartPage()

        setState({
          status: 'success',
          prompt: response.data.prompt,
          imageUrl,
          retryCount,
          isLovartPage: lovartInfo.isLovart,
          lovartTabId: lovartInfo.tabId
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

  /**
   * Copy text to clipboard (D-02)
   */
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      console.log('[Oh My Prompt] Copied to clipboard')
      return true
    } catch (error) {
      console.error('[Oh My Prompt] Clipboard copy failed:', error)
      return false
    }
  }

  /**
   * Generate prompt name from content
   * Uses first 30 chars + timestamp for uniqueness
   */
  const generatePromptName = (prompt: string): string => {
    const firstLine = prompt.split('\n')[0] || prompt
    const truncated = firstLine.substring(0, 30).trim()
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return `${truncated}... (${timestamp})`
  }

  /**
   * Handle user confirmation: insert/copy + save + feedback + auto-close
   * (D-02, D-03, D-09, D-10)
   */
  const handleConfirm = async () => {
    if (!state.prompt) {
      setState({
        ...state,
        status: 'error',
        errorMessage: '没有可用的提示词',
        errorAction: 'close'
      })
      return
    }

    // Set confirming state to show progress
    setState({ ...state, status: 'confirming' })

    // Step 1: Insert to Lovart or copy to clipboard (D-02, D-12)
    let insertSuccess = false
    let clipboardSuccess = false

    if (state.isLovartPage && state.lovartTabId) {
      // Try Lovart insertion (INSERT-01, D-02)
      try {
        const response = await chrome.runtime.sendMessage({
          type: MessageType.INSERT_PROMPT,
          payload: {
            prompt: state.prompt,
            tabId: state.lovartTabId
          } as InsertPromptPayload
        })

        insertSuccess = response?.success === true

        if (!insertSuccess) {
          // D-12: Fallback to clipboard if Lovart insert fails
          console.warn('[Oh My Prompt] Lovart insert failed, falling back to clipboard')
          clipboardSuccess = await copyToClipboard(state.prompt)
        }
      } catch (error) {
        console.error('[Oh My Prompt] INSERT_PROMPT error:', error)
        // D-12: Fallback to clipboard
        clipboardSuccess = await copyToClipboard(state.prompt)
      }
    } else {
      // Non-Lovart page: clipboard copy (INSERT-02, D-02)
      clipboardSuccess = await copyToClipboard(state.prompt)
    }

    // Step 2: Save to '临时' category (D-03, D-04)
    // Generate name from prompt (first 30 chars + timestamp)
    const promptName = generatePromptName(state.prompt)

    try {
      await chrome.runtime.sendMessage({
        type: MessageType.SAVE_TEMPORARY_PROMPT,
        payload: {
          name: promptName,
          content: state.prompt,
          imageUrl: state.imageUrl
        } as SaveTemporaryPromptPayload
      })
      console.log('[Oh My Prompt] Saved to 临时 category:', promptName)
    } catch (saveError) {
      console.error('[Oh My Prompt] Save to temporary failed:', saveError)
      // Continue even if save fails - user still got the prompt
    }

    // Step 3: Show feedback (D-09)
    let feedbackMessage = ''
    if (insertSuccess) {
      feedbackMessage = '已插入Lovart输入框，已保存到临时分类'
    } else if (clipboardSuccess) {
      feedbackMessage = '已复制到剪贴板，已保存到临时分类'
    } else {
      feedbackMessage = '插入失败，请手动粘贴。已保存到临时分类'
    }

    setState({
      ...state,
      status: 'success',
      deliveryStatus: insertSuccess || clipboardSuccess ? 'success' : 'failed',
      feedbackMessage
    })

    // Step 4: Auto-close after 1 second (D-10)
    setTimeout(() => {
      window.close()
    }, 1000)
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

          {/* Success state - preview before confirmation */}
          {state.status === 'success' && !state.feedbackMessage && (
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

          {/* Success state - feedback after confirmation */}
          {state.status === 'success' && state.feedbackMessage && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <Check style={{ width: 16, height: 16 }} />
                <p className="text-sm">{state.feedbackMessage}</p>
              </div>
              <p className="text-xs text-gray-500">页面将在1秒后自动关闭</p>
            </div>
          )}

          {/* Confirming state - showing progress */}
          {state.status === 'confirming' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">正在处理...</p>
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