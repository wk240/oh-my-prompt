/**
 * Agent message handler module
 * Handles AGENT_GENERATE message type for prompt enhancement
 * Reads provider config directly from storage to avoid nested messaging
 * (service worker cannot send messages to itself)
 */

import type { AgentGeneratePayload, AgentGenerateResult, ProviderConfig, ProviderConfigsStorage, EcommercePlatform, EcommerceLanguage } from '@oh-my-prompt/shared/types'
import { MessageResponse } from '@oh-my-prompt/shared/messages'
import { PROVIDER_CONFIGS_STORAGE_KEY } from '@oh-my-prompt/shared/constants'
import { executeAgentApiCallWithProviderConfig } from '../lib/agent-api'
import { buildEcommerceAiWritePrompt } from '../lib/agent-templates'
import { WEB_APP_URL } from '@/lib/config'
import { getSupabaseClient } from '@/lib/cloud-sync/supabase-client'

function getFullEndpoint(baseUrl: string, apiFormat: 'anthropic_messages' | 'chat_completions' | 'openai_responses'): string {
  const normalizedBase = baseUrl.replace(/\/$/, '')

  if (apiFormat === 'anthropic_messages') {
    if (normalizedBase.includes('/messages')) return normalizedBase
    if (normalizedBase.includes('/v1')) return normalizedBase + '/messages'
    return normalizedBase + '/v1/messages'
  }

  if (apiFormat === 'openai_responses') {
    if (normalizedBase.includes('/responses')) return normalizedBase
    if (normalizedBase.includes('/v1')) return normalizedBase + '/responses'
    return normalizedBase + '/v1/responses'
  }

  if (normalizedBase.includes('/chat/completions')) return normalizedBase
  if (normalizedBase.includes('/v1')) return normalizedBase + '/chat/completions'
  return normalizedBase + '/v1/chat/completions'
}

function joinTextParts(parts: Array<{ type?: string; text?: string }> | undefined): string {
  return (parts || [])
    .filter(part => (part.type === undefined || part.type === 'text' || part.type === 'output_text') && typeof part.text === 'string' && part.text.trim())
    .map(part => part.text!.trim())
    .join('\n')
}

/**
 * Handle AGENT_GENERATE message from content script or sidepanel
 * Reads active provider config directly from storage (avoids nested chrome.runtime.sendMessage
 * which doesn't work from service worker to itself — same pattern as VISION_API_CALL handler).
 * @param payload - Agent generation payload with input text and template category
 * @param sendResponse - Response callback for message reply
 * @returns true for async response (required by Chrome message API)
 */
export async function handleAgentGenerate(
  payload: AgentGeneratePayload,
  sendResponse: (response: MessageResponse<AgentGenerateResult>) => void
): Promise<boolean> {
  // 醒目的开始标记
  console.log('🔴🔴🔴 [AGENT PERFORMANCE TEST START] 🔴🔴🔴')

  const perfLog = (step: string, startTime?: number) => {
    const now = performance.now()
    const elapsed = startTime ? now - startTime : 0
    console.log(`⏱️ [AGENT] ${step}${startTime ? ` (${elapsed.toFixed(0)}ms)` : ''}`)
    return now
  }

  const totalStart = perfLog('START handler total')

  try {
    // Read active config directly from storage (same pattern as Vision API handler)
    const storageStart = perfLog('START read storage (provider config)')
    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    perfLog('END read storage (provider config)', storageStart)

    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
    const activeConfig: ProviderConfig | null =
      (storage?.activeConfigId && storage?.configs?.find(c => c.id === storage.activeConfigId)) || null

    perfLog('START executeAgentApiCallWithProviderConfig')
    const agentResult = await executeAgentApiCallWithProviderConfig(payload, undefined, activeConfig)
    perfLog('END executeAgentApiCallWithProviderConfig', totalStart)

    perfLog('END handler total', totalStart)

    sendResponse({ success: true, data: agentResult })
  } catch (error) {
    console.error('[Oh My Prompt] Agent API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    sendResponse({ success: false, error: errorMessage })
  }
  return true // Async response
}

/**
 * Handle AGENT_ECOMMERCE_AI_WRITE message for AI-assisted selling points generation
 * Takes a product image and generates selling point descriptions for e-commerce platforms.
 * Constructs API calls directly (instead of using executeAgentApiCallWithProviderConfig)
 * because it needs a custom system prompt (buildEcommerceAiWritePrompt) instead of
 * the default agent system prompt.
 * @param payload - Payload with imageData, platform, and language
 * @param sendResponse - Response callback for message reply
 * @returns true for async response (required by Chrome message API)
 */
export async function handleEcommerceAiWrite(
  payload: { imageDataList?: string[]; imageData?: string; platform: EcommercePlatform; language: EcommerceLanguage },
  sendResponse: (response: MessageResponse<string>) => void
): Promise<boolean> {
  try {
    const { imageDataList, imageData, platform, language } = payload
    const filteredImageDataList = imageDataList?.filter(Boolean) || []
    const images = filteredImageDataList.length ? filteredImageDataList : imageData ? [imageData] : []

    if (images.length === 0) {
      sendResponse({ success: false, error: '请先上传参考图片' })
      return true
    }

    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
    const activeConfig = storage?.configs?.find(c => c.id === storage.activeConfigId)

    if (!activeConfig) {
      sendResponse({ success: false, error: 'NO_CONFIG: 未配置API密钥' })
      return true
    }

    // Build systemPrompt locally (single source of truth)
    const systemPrompt = buildEcommerceAiWritePrompt(platform, language)

    // For omp_official format, use the official API
    if (activeConfig.apiFormat === 'omp_official') {
      const supabase = getSupabaseClient()
      if (!supabase) {
        sendResponse({ success: false, error: 'NOT_LOGGED_IN: 请先登录' })
        return true
      }

      let sessionResult: { data: { session: { access_token: string } | null }; error: unknown }
      try {
        sessionResult = await supabase.auth.getSession()
      } catch {
        sendResponse({ success: false, error: 'NOT_LOGGED_IN: 请先登录' })
        return true
      }

      if (sessionResult.error || !sessionResult.data.session?.access_token) {
        sendResponse({ success: false, error: 'NOT_LOGGED_IN: 请先登录' })
        return true
      }

      const session = sessionResult.data.session
      const response = await fetch(`${WEB_APP_URL}/api/vision/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          mode: 'agent',
          inputText: '请根据商品图片生成卖点描述',
          imageData: images[0],
          productImages: images,
          templateCategory: 'ecommerce',
          systemPrompt,
        })
      })

      const data = await response.json()
      if (!data.success) {
        sendResponse({ success: false, error: data.error || 'AI帮写失败' })
        return true
      }

      sendResponse({ success: true, data: data.data?.prompt || '' })
      return true
    }

    // For third-party APIs, construct the call directly
    // systemPrompt already built above

    let requestBody: Record<string, unknown>
    let headers: Record<string, string>

    if (activeConfig.apiFormat === 'anthropic_messages') {
      const imageContent = images.map(image => {
        const base64Data = image.includes(',') ? image.split(',')[1] : image
        const mediaType = image.match(/^data:(image\/[^;]+);base64,/)?.[1] || 'image/jpeg'
        return {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Data }
        }
      })

      const content: Array<Record<string, unknown>> = [
        ...imageContent,
        { type: 'text', text: '请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': activeConfig.apiKey,
        'anthropic-version': '2023-06-01'
      }
    } else if (activeConfig.apiFormat === 'openai_responses') {
      const content: Array<Record<string, unknown>> = [
        ...images.map(image => ({ type: 'input_image', image_url: image })),
        { type: 'input_text', text: '请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'gpt-4o',
        instructions: systemPrompt,
        max_output_tokens: 2048,
        input: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeConfig.apiKey}`
      }
    } else {
      // chat_completions format
      const content: Array<Record<string, unknown>> = [
        ...images.map(image => ({ type: 'image_url', image_url: { url: image } })),
        { type: 'text', text: systemPrompt + '\n\n请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'gpt-4o',
        max_tokens: 1024,
        messages: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeConfig.apiKey}`
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000)

    const endpointUrl = getFullEndpoint(
      activeConfig.apiEndpoint,
      activeConfig.apiFormat as 'anthropic_messages' | 'chat_completions' | 'openai_responses'
    )

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }

    const data = await response.json()
    let text: string

    if (activeConfig.apiFormat === 'anthropic_messages') {
      text = joinTextParts(data.content)
    } else if (activeConfig.apiFormat === 'openai_responses') {
      text = typeof data.output_text === 'string' && data.output_text.trim()
        ? data.output_text.trim()
        : joinTextParts(data.output?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || []))
    } else {
      const content = data.choices?.[0]?.message?.content
      text = typeof content === 'string' ? content.trim() : joinTextParts(content)
    }

    sendResponse({ success: true, data: text })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'AI帮写失败'
    sendResponse({ success: false, error: errorMessage })
  }
  return true
}
