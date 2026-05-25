import { describe, expect, it } from 'vitest'
import {
  buildOpenAIRequest,
  buildOpenAIResponsesRequest,
  extractAgentTextContent,
  getPayloadProductImages,
} from '../agent-api'

describe('extractAgentTextContent', () => {
  it('extracts chat completion text from content blocks', () => {
    const text = extractAgentTextContent('chat_completions', {
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'First prompt' },
              { type: 'output_text', text: 'Second prompt' },
            ],
          },
        },
      ],
    })

    expect(text).toBe('First prompt\nSecond prompt')
  })

  it('extracts responses output_text content', () => {
    const text = extractAgentTextContent('openai_responses', {
      output_text: 'Structured ecommerce prompts',
    })

    expect(text).toBe('Structured ecommerce prompts')
  })
})

describe('getPayloadProductImages', () => {
  it('prefers productImages over legacy productImage field', () => {
    const productImages = getPayloadProductImages({
      inputText: 'Describe this product',
      templateCategory: 'ecommerce',
      productImages: [
        'data:image/jpeg;base64,one',
        'data:image/png;base64,two',
      ],
      productImage: 'data:image/webp;base64,legacy',
    })

    expect(productImages).toEqual([
      'data:image/jpeg;base64,one',
      'data:image/png;base64,two',
    ])
  })

  it('falls back to legacy productImage when productImages is empty', () => {
    const productImages = getPayloadProductImages({
      inputText: 'Describe this product',
      templateCategory: 'ecommerce',
      productImages: [],
      productImage: 'data:image/webp;base64,legacy',
    })

    expect(productImages).toEqual(['data:image/webp;base64,legacy'])
  })

  it('falls back to legacy productImage when productImages is absent', () => {
    const productImages = getPayloadProductImages({
      inputText: 'Describe this product',
      templateCategory: 'ecommerce',
      productImage: 'data:image/webp;base64,legacy',
    })

    expect(productImages).toEqual(['data:image/webp;base64,legacy'])
  })

  it('filters falsey productImages without falling back to legacy', () => {
    const productImages = getPayloadProductImages({
      inputText: 'Describe this product',
      templateCategory: 'ecommerce',
      productImages: ['', 'data:image/png;base64,two'],
      productImage: 'data:image/webp;base64,legacy',
    })

    expect(productImages).toEqual(['data:image/png;base64,two'])
  })

  it('returns an empty array when present productImages only contains falsey values', () => {
    const productImages = getPayloadProductImages({
      inputText: 'Describe this product',
      templateCategory: 'ecommerce',
      productImages: [''],
      productImage: 'data:image/webp;base64,legacy',
    })

    expect(productImages).toEqual([])
  })
})

describe('agent multimodal request builders', () => {
  const productImages = [
    'data:image/jpeg;base64,one',
    'data:image/png;base64,two',
  ]

  it('includes every product image in OpenAI chat completions requests in order', () => {
    const request = buildOpenAIRequest(
      'system prompt',
      'user text',
      'gpt-4o',
      8192,
      undefined,
      productImages
    ) as {
      messages: Array<{
        content: Array<{ type: string; image_url?: { url: string } }>
      }>
    }

    const imageUrls = request.messages[0].content
      .filter(item => item.type === 'image_url')
      .map(item => item.image_url?.url)

    expect(imageUrls).toEqual(productImages)
  })

  it('includes every product image in OpenAI responses requests in order', () => {
    const request = buildOpenAIResponsesRequest(
      'system prompt',
      'user text',
      'gpt-4o',
      8192,
      undefined,
      productImages
    ) as {
      input: Array<{
        content: Array<{ type: string; image_url?: string }>
      }>
    }

    const imageUrls = request.input[0].content
      .filter(item => item.type === 'input_image')
      .map(item => item.image_url)

    expect(imageUrls).toEqual(productImages)
  })
})
