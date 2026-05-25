# Ecommerce Multi Reference Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the ecommerce Agent from one product image to up to 6 compact reference images, sending all images to generation and AI-assisted selling point writing.

**Architecture:** Add a multi-image payload contract while preserving the legacy single-image field. Normalize image inputs at API boundaries, then update both ecommerce UIs to use a shared local reference-image array shape. Keep result parsing, bundle formatting, quota behavior, and the general Agent unchanged.

**Tech Stack:** TypeScript, React, Chrome MV3 messaging, Vitest, Next.js API route, OpenAI/Anthropic-compatible multimodal request bodies.

---

## File Structure

- Modify `packages/shared/types/agent.ts`
  - Add `productImages?: string[]` to `AgentGeneratePayload`.
  - Keep `productImage?: string` as the legacy compatibility field.
- Modify `packages/extension/src/lib/agent-api.ts`
  - Add exported helpers for product image normalization and multimodal request body construction.
  - Send all ecommerce reference images to Anthropic, OpenAI Chat Completions, OpenAI Responses, and official API calls.
- Modify `packages/extension/src/lib/agent-templates.ts`
  - Clarify ecommerce prompt semantics for multiple reference images.
- Modify `packages/extension/src/background/agent-handler.ts`
  - Update ecommerce AI-write payload to accept `imageDataList?: string[]` and legacy `imageData?: string`.
  - Send all images to third-party and official AI-write requests.
- Modify `packages/web-app/app/api/vision/generate/route.ts`
  - Accept `productImages?: string[]`.
  - Normalize legacy `productImage` into the new array before calling the proxy.
- Modify `packages/web-app/lib/vision-proxy.ts`
  - Add multi-image request support for official Agent proxy calls.
- Modify `packages/extension/src/sidepanel/views/EcommerceView.tsx`
  - Replace single-image state with compact multi-reference upload UI.
- Modify `packages/extension/src/content/components/EcommercePanel.tsx`
  - Replace single-image state and persisted state with compact multi-reference upload UI.
- Modify `packages/extension/src/content/components/DropdownContainer.tsx`
  - Update default ecommerce persisted state to use `productImages`.
- Modify tests:
  - `packages/extension/src/lib/__tests__/agent-api.test.ts`
  - `packages/extension/src/sidepanel/views/__tests__/ecommerce-view-layout.test.ts`
  - Add `packages/web-app/lib/vision-proxy.test.ts` coverage if existing test setup can mock env/fetch cleanly; otherwise keep web proxy validation in route-level implementation plus typecheck.

## Task 1: Shared Payload Contract And Extension Request Helpers

**Files:**
- Modify: `packages/shared/types/agent.ts`
- Modify: `packages/extension/src/lib/agent-api.ts`
- Test: `packages/extension/src/lib/__tests__/agent-api.test.ts`

- [ ] **Step 1: Write failing tests for image normalization and request bodies**

Append these tests to `packages/extension/src/lib/__tests__/agent-api.test.ts`:

```ts
import {
  buildOpenAIRequest,
  buildOpenAIResponsesRequest,
  getPayloadProductImages,
} from '../agent-api'
import type { AgentGeneratePayload } from '@oh-my-prompt/shared/types'

describe('getPayloadProductImages', () => {
  it('prefers productImages over the legacy productImage field', () => {
    const payload: AgentGeneratePayload = {
      inputText: 'wireless earbuds',
      templateCategory: 'ecommerce',
      productImages: ['data:image/jpeg;base64,one', 'data:image/png;base64,two'],
      productImage: 'data:image/webp;base64,legacy',
    }

    expect(getPayloadProductImages(payload)).toEqual([
      'data:image/jpeg;base64,one',
      'data:image/png;base64,two',
    ])
  })

  it('falls back to legacy productImage when productImages is empty', () => {
    const payload: AgentGeneratePayload = {
      inputText: 'wireless earbuds',
      templateCategory: 'ecommerce',
      productImage: 'data:image/webp;base64,legacy',
    }

    expect(getPayloadProductImages(payload)).toEqual(['data:image/webp;base64,legacy'])
  })
})

describe('agent multimodal request builders', () => {
  it('adds every product image to OpenAI chat completions content', () => {
    const body = buildOpenAIRequest(
      'system prompt',
      'user text',
      'gpt-4o',
      8192,
      undefined,
      ['data:image/jpeg;base64,one', 'data:image/png;base64,two'],
    ) as {
      messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>
    }

    const imageUrls = body.messages[0].content
      .filter(part => part.type === 'image_url')
      .map(part => part.image_url?.url)

    expect(imageUrls).toEqual(['data:image/jpeg;base64,one', 'data:image/png;base64,two'])
  })

  it('adds every product image to OpenAI Responses content', () => {
    const body = buildOpenAIResponsesRequest(
      'system prompt',
      'user text',
      'gpt-4o',
      8192,
      undefined,
      ['data:image/jpeg;base64,one', 'data:image/png;base64,two'],
    ) as {
      input: Array<{ content: Array<{ type: string; image_url?: string }> }>
    }

    const imageUrls = body.input[0].content
      .filter(part => part.type === 'input_image')
      .map(part => part.image_url)

    expect(imageUrls).toEqual(['data:image/jpeg;base64,one', 'data:image/png;base64,two'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-api
```

Expected: FAIL because `productImages` is not in `AgentGeneratePayload`, `getPayloadProductImages` is not exported, and request builders are not exported or still accept a single `productImage`.

- [ ] **Step 3: Add the shared payload field**

In `packages/shared/types/agent.ts`, update `AgentGeneratePayload`:

```ts
export interface AgentGeneratePayload {
  inputText: string
  imageData?: string // Optional reference image (base64 data URL)
  templateCategory: AgentTemplateCategory
  productImages?: string[]           // 多张商品参考图 (base64 data URLs)
  productImage?: string              // Legacy single product image compatibility field
  ecommerceConfig?: EcommerceConfig  // 电商专属配置
}
```

- [ ] **Step 4: Export normalization and OpenAI request helpers**

In `packages/extension/src/lib/agent-api.ts`, add this helper near the constants:

```ts
export function getPayloadProductImages(payload: AgentGeneratePayload): string[] {
  if (payload.productImages?.length) {
    return payload.productImages.filter(Boolean)
  }
  return payload.productImage ? [payload.productImage] : []
}
```

Change `buildOpenAIRequest` signature and implementation:

```ts
export function buildOpenAIRequest(
  systemPrompt: string,
  userText: string,
  modelName: string,
  maxTokens: number,
  imageData?: string,
  productImages: string[] = []
): object {
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []

  userContent.push({
    type: 'text',
    text: `${systemPrompt}\n\n用户描述：${userText}`
  })

  productImages.forEach(productImage => {
    userContent.push({
      type: 'image_url',
      image_url: { url: productImage }
    })
  })

  if (imageData) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageData }
    })
  }

  return {
    model: modelName,
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: userContent
    }]
  }
}
```

Change `buildOpenAIResponsesRequest` signature and implementation:

```ts
export function buildOpenAIResponsesRequest(
  systemPrompt: string,
  userText: string,
  modelName: string,
  maxTokens: number,
  imageData?: string,
  productImages: string[] = []
): object {
  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> = [
    { type: 'input_text', text: userText }
  ]

  productImages.forEach(productImage => {
    content.push({ type: 'input_image', image_url: productImage })
  })

  if (imageData) {
    content.push({ type: 'input_image', image_url: imageData })
  }

  return {
    model: modelName,
    instructions: systemPrompt,
    max_output_tokens: maxTokens,
    input: [{
      role: 'user',
      content
    }]
  }
}
```

- [ ] **Step 5: Use normalized images in `executeAgentApiCallWithProviderConfig`**

Inside `executeAgentApiCallWithProviderConfig`, after `const isEcommerce = ...`, add:

```ts
const productImages = getPayloadProductImages(payload)
```

Then replace both `!!(payload.productImage || payload.imageData)` checks for ecommerce with:

```ts
!!(productImages.length || payload.imageData)
```

In the Anthropic request block, replace the single product image append with:

```ts
productImages.forEach(productImage => {
  const base64Data = extractBase64Data(productImage)
  if (base64Data) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: extractMediaType(productImage), data: base64Data }
    })
  }
})
```

Update request builder calls:

```ts
requestBody = buildOpenAIResponsesRequest(systemPrompt, payload.inputText, config.selectedModel, maxTokens, payload.imageData, productImages)
```

```ts
requestBody = buildOpenAIRequest(systemPrompt, payload.inputText, config.selectedModel, maxTokens, payload.imageData, productImages)
```

- [ ] **Step 6: Send `productImages` to the official API**

In `executeOfficialAgentApiCall`, before `fetch`, add:

```ts
const productImages = getPayloadProductImages(payload)
```

In the JSON body, replace the legacy spread:

```ts
...(productImages.length > 0 && { productImages }),
...(payload.productImage && !payload.productImages?.length && { productImage: payload.productImage }),
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-api
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/types/agent.ts packages/extension/src/lib/agent-api.ts packages/extension/src/lib/__tests__/agent-api.test.ts
git commit -m "feat(extension): support multi image agent payloads"
```

## Task 2: Official Web Proxy Multi-Image Support

**Files:**
- Modify: `packages/web-app/app/api/vision/generate/route.ts`
- Modify: `packages/web-app/lib/vision-proxy.ts`

- [ ] **Step 1: Update the route body type and normalization**

In `packages/web-app/app/api/vision/generate/route.ts`, add `productImages?: string[]` to the request body type:

```ts
productImages?: string[]
productImage?: string
```

Before calling `callThirdPartyAgentApi`, normalize:

```ts
const productImages = Array.isArray(body.productImages) && body.productImages.length > 0
  ? body.productImages.filter((image): image is string => typeof image === 'string' && image.startsWith('data:image/'))
  : body.productImage && body.productImage.startsWith('data:image/')
    ? [body.productImage]
    : []
```

Update the call:

```ts
const prompt = await callThirdPartyAgentApi(
  body.inputText!,
  body.systemPrompt!,
  body.imageData,
  body.ecommerceConfig,
  productImages
)
```

- [ ] **Step 2: Update `buildAgentRequest` to accept product image arrays**

In `packages/web-app/lib/vision-proxy.ts`, change `buildAgentRequest` signature:

```ts
function buildAgentRequest(
  format: string,
  model: string,
  inputText: string,
  systemPrompt: string,
  imageData?: string,
  productImages: string[] = [],
  maxTokens = DEFAULT_AGENT_MAX_TOKENS
): object {
```

Replace every single `productImage` block with `productImages.forEach(...)`.

For Anthropic:

```ts
productImages.forEach(productImage => {
  const base64Data = productImage.replace(/^data:image\/\w+;base64,/, '')
  const mediaType = extractMediaType(productImage)
  content.push({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64Data }
  })
})
```

For OpenAI Responses:

```ts
productImages.forEach(productImage => {
  content.push({ type: 'input_image', image_url: productImage })
})
```

For Chat Completions:

```ts
productImages.forEach(productImage => {
  userContent.push({
    type: 'image_url',
    image_url: { url: productImage }
  })
})
```

- [ ] **Step 3: Update `callThirdPartyAgentApi` signature and caller**

Change the exported signature:

```ts
export async function callThirdPartyAgentApi(
  inputText: string,
  systemPrompt: string,
  imageData?: string,
  ecommerceConfig?: {
    platform: string
    market: string
    language: string
    aspectRatio: string
    sellingPoints: string
    setStructure: string
  },
  productImages: string[] = []
): Promise<string> {
```

Update request body construction:

```ts
const requestBody = buildAgentRequest(apiFormat, apiModel, inputText, systemPrompt, imageData, productImages, maxTokens)
```

- [ ] **Step 4: Run web-app typecheck/build**

Run:

```bash
npm run web:build
```

Expected: PASS. If the build fails for unrelated environment variables, run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

and record the web build blocker in the task notes before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/api/vision/generate/route.ts packages/web-app/lib/vision-proxy.ts
git commit -m "feat(web): proxy ecommerce reference images"
```

## Task 3: Multi-Image AI Write Handler

**Files:**
- Modify: `packages/extension/src/background/agent-handler.ts`
- Test: `packages/extension/src/background/__tests__/service-worker.test.ts` or `packages/extension/src/lib/__tests__/agent-api.test.ts` if handler-level fetch mocking is not practical.

- [ ] **Step 1: Update handler payload type**

In `packages/extension/src/background/agent-handler.ts`, change the function signature:

```ts
export async function handleEcommerceAiWrite(
  payload: { imageDataList?: string[]; imageData?: string; platform: EcommercePlatform; language: EcommerceLanguage },
  sendResponse: (response: MessageResponse<string>) => void
): Promise<boolean> {
```

At the top of the function, replace image extraction with:

```ts
const { imageDataList, imageData, platform, language } = payload
const images = imageDataList?.length ? imageDataList.filter(Boolean) : imageData ? [imageData] : []

if (images.length === 0) {
  sendResponse({ success: false, error: '请先上传参考图片' })
  return true
}
```

- [ ] **Step 2: Send all images to the official API**

In the `omp_official` fetch body, replace `imageData` with:

```ts
imageData: images[0],
productImages: images,
```

Keep `imageData` as first image for compatibility with the route and existing upstream assumptions.

- [ ] **Step 3: Send all images to Anthropic AI-write requests**

Replace the single-image base64 logic with:

```ts
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
```

- [ ] **Step 4: Send all images to OpenAI AI-write requests**

For `openai_responses`, replace the content setup with:

```ts
const content: Array<Record<string, unknown>> = [
  ...images.map(image => ({ type: 'input_image', image_url: image })),
  { type: 'input_text', text: '请根据商品图片生成卖点描述' }
]
```

For `chat_completions`, replace the content setup with:

```ts
const content: Array<Record<string, unknown>> = [
  ...images.map(image => ({ type: 'image_url', image_url: { url: image } })),
  { type: 'text', text: systemPrompt + '\n\n请根据商品图片生成卖点描述' }
]
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/background/agent-handler.ts
git commit -m "feat(extension): analyze ecommerce reference image sets"
```

## Task 4: Ecommerce Prompt Semantics

**Files:**
- Modify: `packages/extension/src/lib/agent-templates.ts`
- Test: `packages/extension/src/lib/__tests__/agent-templates.test.ts`

- [ ] **Step 1: Write a failing prompt semantics test**

Append to `packages/extension/src/lib/__tests__/agent-templates.test.ts`:

```ts
import { buildEcommerceSystemPrompt } from '../agent-templates'

describe('buildEcommerceSystemPrompt multi-image semantics', () => {
  it('tells the model to treat uploaded ecommerce images as one reference set', () => {
    const prompt = buildEcommerceSystemPrompt({
      platform: 'amazon',
      market: 'china',
      language: 'zh',
      aspectRatio: '1:1',
      sellingPoints: '主动降噪，长续航',
      setStructure: 'smart',
    }, true)

    expect(prompt).toContain('同一组商品参考图')
    expect(prompt).toContain('不要将不同照片误判为不同商品')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-templates
```

Expected: FAIL because the current prompt does not contain the new multi-image wording.

- [ ] **Step 3: Update `imageInstruction`**

In `packages/extension/src/lib/agent-templates.ts`, replace the ecommerce `imageInstruction` with:

```ts
const imageInstruction = hasProductImages
  ? `用户提供了一组商品参考图，请将所有图片视为同一商品的多角度/细节/包装参考。请综合分析商品外观、颜色、材质、形状、包装和细节特征，确保生成的提示词准确描述商品；除非用户文字明确说明，否则不要将不同照片误判为不同商品。`
  : ''
```

- [ ] **Step 4: Run the test**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-templates
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/agent-templates.ts packages/extension/src/lib/__tests__/agent-templates.test.ts
git commit -m "feat(extension): clarify ecommerce multi image prompts"
```

## Task 5: Sidepanel Ecommerce Multi-Image UI

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`
- Modify: `packages/extension/src/sidepanel/index.css`
- Test: `packages/extension/src/sidepanel/views/__tests__/ecommerce-view-layout.test.ts`

- [ ] **Step 1: Add source-level layout assertions**

Append this test to `packages/extension/src/sidepanel/views/__tests__/ecommerce-view-layout.test.ts`:

```ts
it('uses compact multi-reference image state and payloads', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/sidepanel/views/EcommerceView.tsx'),
    'utf8',
  )
  const css = readFileSync(
    resolve(repoRoot, 'src/sidepanel/index.css'),
    'utf8',
  )

  expect(source).toContain('interface EcommerceReferenceImage')
  expect(source).toContain('const MAX_REFERENCE_IMAGES = 6')
  expect(source).toContain('const [productImages, setProductImages]')
  expect(source).toContain('multiple')
  expect(source).toContain('productImages: productImages.map(image => image.dataUrl)')
  expect(source).toContain('imageDataList: productImages.map(image => image.dataUrl)')
  expect(source).toContain('参考图片')
  expect(css).toContain('.ecommerce-panel-reference-grid')
  expect(css).toMatch(/\.ecommerce-panel-reference-thumb\s*\{[^}]*width:\s*64px;/s)
  expect(css).toMatch(/\.ecommerce-panel-reference-thumb\s*\{[^}]*height:\s*64px;/s)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- ecommerce-view-layout
```

Expected: FAIL because the sidepanel still uses single-image state and CSS.

- [ ] **Step 3: Add constants and reference image state**

In `packages/extension/src/sidepanel/views/EcommerceView.tsx`, add near config types:

```ts
interface EcommerceReferenceImage {
  id: string
  dataUrl: string
  name: string
}

const MAX_REFERENCE_IMAGES = 6
const MAX_REFERENCE_IMAGE_SIZE = 5 * 1024 * 1024
```

Replace state:

```ts
const [productImages, setProductImages] = useState<EcommerceReferenceImage[]>([])
```

Remove:

```ts
const [productImage, setProductImage] = useState<string | null>(null)
const [productImageName, setProductImageName] = useState('')
```

- [ ] **Step 4: Replace upload handlers**

Replace `handleImageUpload` and `handleRemoveImage` with:

```ts
const readImageFile = (file: File): Promise<EcommerceReferenceImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({
        id: crypto.randomUUID(),
        dataUrl: e.target?.result as string,
        name: file.name,
      })
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return

  const remainingSlots = MAX_REFERENCE_IMAGES - productImages.length
  const selectedFiles = files.slice(0, Math.max(0, remainingSlots))

  if (remainingSlots <= 0 || files.length > remainingSlots) {
    showToast('最多上传 6 张参考图')
  }

  const validFiles: File[] = []
  for (const file of selectedFiles) {
    if (!file.type.startsWith('image/')) {
      showToast('请上传图片文件')
      continue
    }
    if (file.size > MAX_REFERENCE_IMAGE_SIZE) {
      showToast('单张图片不能超过 5MB')
      continue
    }
    validFiles.push(file)
  }

  try {
    const images = await Promise.all(validFiles.map(readImageFile))
    if (images.length > 0) {
      setProductImages(prev => [...prev, ...images].slice(0, MAX_REFERENCE_IMAGES))
    }
  } catch {
    showToast('图片读取失败')
  } finally {
    event.target.value = ''
  }
}, [productImages.length, showToast])

const handleRemoveImage = useCallback((id: string) => {
  setProductImages(prev => prev.filter(image => image.id !== id))
  if (fileInputRef.current) {
    fileInputRef.current.value = ''
  }
}, [])
```

- [ ] **Step 5: Update AI-write and generate payloads**

In `handleAiWrite`, replace `!productImage` with `productImages.length === 0`, and send:

```ts
payload: {
  imageDataList: productImages.map(image => image.dataUrl),
  platform,
  language,
},
```

Update dependencies from `productImage` to `productImages`.

In `handleGenerate`, send:

```ts
productImages: productImages.map(image => image.dataUrl),
```

Remove `productImage`.

- [ ] **Step 6: Replace upload JSX**

Replace the single image upload section with:

```tsx
<div className="ecommerce-panel-section">
  <div className="ecommerce-panel-reference-header">
    <label className="ecommerce-panel-label">参考图片</label>
    <span className="ecommerce-panel-reference-count">{productImages.length} / {MAX_REFERENCE_IMAGES}</span>
  </div>
  <div className="ecommerce-panel-reference-grid">
    {productImages.map(image => (
      <div key={image.id} className="ecommerce-panel-reference-thumb" title={image.name}>
        <img src={image.dataUrl} alt="参考图片" className="ecommerce-panel-reference-img" />
        <button
          className="ecommerce-panel-reference-remove"
          onClick={() => handleRemoveImage(image.id)}
          aria-label={`移除 ${image.name}`}
          disabled={isLoading}
        >
          <X style={{ width: 12, height: 12 }} />
        </button>
      </div>
    ))}
    {productImages.length < MAX_REFERENCE_IMAGES && (
      <button
        type="button"
        className="ecommerce-panel-reference-add"
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
      >
        <Upload style={{ width: 16, height: 16 }} />
        <span>添加</span>
      </button>
    )}
  </div>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/*"
    multiple
    onChange={handleImageUpload}
    style={{ display: 'none' }}
    disabled={isLoading}
  />
  <p className="ecommerce-panel-reference-hint">最多 6 张，每张 5MB 内。全部图片作为同一组参考图提交。</p>
</div>
```

- [ ] **Step 7: Add compact CSS**

Append to `packages/extension/src/sidepanel/index.css`:

```css
.ecommerce-panel-reference-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ecommerce-panel-reference-count {
  font-size: 12px;
  color: #64748b;
}

.ecommerce-panel-reference-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ecommerce-panel-reference-thumb,
.ecommerce-panel-reference-add {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  flex: 0 0 auto;
}

.ecommerce-panel-reference-thumb {
  position: relative;
  overflow: hidden;
  border: 1px solid #d1d5db;
  background: #f8fafc;
}

.ecommerce-panel-reference-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ecommerce-panel-reference-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 0;
  background: rgba(17, 24, 39, 0.88);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ecommerce-panel-reference-add {
  border: 1px dashed #94a3b8;
  background: white;
  color: #475569;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 10px;
  cursor: pointer;
}

.ecommerce-panel-reference-add:disabled,
.ecommerce-panel-reference-remove:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ecommerce-panel-reference-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
```

- [ ] **Step 8: Run layout test and typecheck**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- ecommerce-view-layout
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx packages/extension/src/sidepanel/index.css packages/extension/src/sidepanel/views/__tests__/ecommerce-view-layout.test.ts
git commit -m "feat(extension): add sidepanel ecommerce reference images"
```

## Task 6: Content-Script Ecommerce Panel Multi-Image UI

**Files:**
- Modify: `packages/extension/src/content/components/EcommercePanel.tsx`
- Modify: `packages/extension/src/content/styles/dropdown-styles.ts`
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`
- Test: `packages/extension/src/sidepanel/views/__tests__/agent-insert-actions.test.ts`

- [ ] **Step 1: Add source-level assertions for dropdown persisted state**

Append this test to `packages/extension/src/sidepanel/views/__tests__/agent-insert-actions.test.ts`:

```ts
it('persists ecommerce dropdown reference images as an array', () => {
  const panelSource = readFileSync(
    resolve(repoRoot, 'src/content/components/EcommercePanel.tsx'),
    'utf8',
  )
  const containerSource = readFileSync(
    resolve(repoRoot, 'src/content/components/DropdownContainer.tsx'),
    'utf8',
  )

  expect(panelSource).toContain('interface EcommerceReferenceImage')
  expect(panelSource).toContain('productImages: EcommerceReferenceImage[]')
  expect(panelSource).toContain('productImages: productImages.map(image => image.dataUrl)')
  expect(panelSource).toContain('imageDataList: productImages.map(image => image.dataUrl)')
  expect(containerSource).toContain('productImages: []')
  expect(containerSource).not.toContain('productImage: null, productImageName')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-insert-actions
```

Expected: FAIL because dropdown ecommerce state still stores `productImage` and `productImageName`.

- [ ] **Step 3: Update persisted state type and default**

In `packages/extension/src/content/components/EcommercePanel.tsx`, add:

```ts
interface EcommerceReferenceImage {
  id: string
  dataUrl: string
  name: string
}

const MAX_REFERENCE_IMAGES = 6
const MAX_REFERENCE_IMAGE_SIZE = 5 * 1024 * 1024
```

Update `EcommercePersistedState`:

```ts
export interface EcommercePersistedState {
  productImages: EcommerceReferenceImage[]
  platform: string
  market: string
  language: string
  aspectRatio: string
  sellingPoints: string
  setStructure: 'smart' | 'custom'
  customCounts: EcommerceCustomCounts
  result: EcommerceGenerateResult | null
  generationConfigSnapshot: EcommerceConfig | null
  expandedPromptIndexes: number[]
  viewMode: 'form' | 'result'
}
```

Update `DEFAULT_PERSISTED_STATE`:

```ts
productImages: [],
```

Remove `productImage` and `productImageName`.

- [ ] **Step 4: Update component state and persistence snapshot**

Replace:

```ts
const [productImage, setProductImage] = useState<string | null>(initState.productImage)
const [productImageName, setProductImageName] = useState(initState.productImageName)
```

with:

```ts
const [productImages, setProductImages] = useState<EcommerceReferenceImage[]>(initState.productImages)
```

Update `buildPersistedState` to include:

```ts
productImages,
```

and remove `productImage, productImageName`.

- [ ] **Step 5: Port upload handlers from sidepanel**

Use the same `readImageFile`, `handleImageUpload`, and `handleRemoveImage` implementation from Task 5, replacing `showToast` calls with the content component's imported `showToast`.

- [ ] **Step 6: Update AI-write and generate payloads**

Use the same payload changes from Task 5:

```ts
imageDataList: productImages.map(image => image.dataUrl)
```

and:

```ts
productImages: productImages.map(image => image.dataUrl)
```

Update disabled state:

```tsx
disabled={isAiWriting || productImages.length === 0}
```

- [ ] **Step 7: Replace upload JSX with inline-compatible compact markup**

Use the same JSX structure from Task 5. Keep class names identical:

```tsx
ecommerce-panel-reference-header
ecommerce-panel-reference-count
ecommerce-panel-reference-grid
ecommerce-panel-reference-thumb
ecommerce-panel-reference-img
ecommerce-panel-reference-remove
ecommerce-panel-reference-add
ecommerce-panel-reference-hint
```

- [ ] **Step 8: Add dropdown CSS**

In `packages/extension/src/content/styles/dropdown-styles.ts`, add matching class rules for the content-script Shadow DOM stylesheet. Use the same visual values as Task 5:

```css
.ecommerce-panel-reference-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ecommerce-panel-reference-count { font-size: 12px; color: #64748b; }
.ecommerce-panel-reference-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.ecommerce-panel-reference-thumb, .ecommerce-panel-reference-add { width: 64px; height: 64px; border-radius: 6px; flex: 0 0 auto; }
.ecommerce-panel-reference-thumb { position: relative; overflow: hidden; border: 1px solid #d1d5db; background: #f8fafc; }
.ecommerce-panel-reference-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ecommerce-panel-reference-remove { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 999px; border: 0; background: rgba(17, 24, 39, 0.88); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ecommerce-panel-reference-add { border: 1px dashed #94a3b8; background: white; color: #475569; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 10px; cursor: pointer; }
.ecommerce-panel-reference-add:disabled, .ecommerce-panel-reference-remove:disabled { cursor: not-allowed; opacity: 0.55; }
.ecommerce-panel-reference-hint { margin: 8px 0 0; font-size: 12px; color: #64748b; line-height: 1.4; }
```

- [ ] **Step 9: Update DropdownContainer default state**

In `packages/extension/src/content/components/DropdownContainer.tsx`, replace ecommerce default state fields:

```ts
productImage: null, productImageName: '',
```

with:

```ts
productImages: [],
```

- [ ] **Step 10: Run test and typecheck**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-insert-actions
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/extension/src/content/components/EcommercePanel.tsx packages/extension/src/content/styles/dropdown-styles.ts packages/extension/src/content/components/DropdownContainer.tsx packages/extension/src/sidepanel/views/__tests__/agent-insert-actions.test.ts
git commit -m "feat(extension): add dropdown ecommerce reference images"
```

## Task 7: End-to-End Verification

**Files:**
- No code changes expected unless verification exposes a defect.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-api agent-templates ecommerce-view-layout agent-insert-actions
```

Expected: PASS. If the runner does not accept multiple filters, run the four filtered commands individually.

- [ ] **Step 2: Run extension typecheck**

Run:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 3: Run extension build**

Run:

```bash
npm run build --workspace=@oh-my-prompt/extension
```

Expected: PASS.

- [ ] **Step 4: Run web build or document blocker**

Run:

```bash
npm run web:build
```

Expected: PASS. If it fails because required production env vars are missing, record the exact env blocker and run any available web-app typecheck/test command from `packages/web-app/package.json`.

- [ ] **Step 5: Manual smoke test in extension dev build**

Run:

```bash
npm run dev
```

Load `packages/extension/dist/` in Chrome. In the sidepanel ecommerce Agent:

1. Open ecommerce Agent.
2. Upload 2 valid images at once.
3. Upload a third valid image.
4. Remove one image.
5. Try uploading more than 6 images and confirm the "最多上传 6 张参考图" toast.
6. Confirm thumbnails are compact 64 x 64 and do not crowd the form.
7. Click AI 帮写 and confirm the request starts only when at least one image exists.
8. Enter selling points and click generate.

Expected: all UI interactions work; request payload includes `productImages` with all current images.

- [ ] **Step 6: Final commit if verification required fixes**

Only if Step 1-5 required fixes:

```bash
git add <fixed-files>
git commit -m "fix(extension): verify ecommerce reference images"
```

## Self-Review Checklist

- Spec coverage:
  - Multi-image upload in both ecommerce entry points: Tasks 5 and 6.
  - 6 image / 5 MB validation: Tasks 5 and 6.
  - Generation sends all images: Tasks 1, 2, 5, and 6.
  - AI-write sends all images: Task 3 plus UI payload changes in Tasks 5 and 6.
  - Legacy single-image compatibility: Tasks 1, 2, and 3.
  - Prompt semantics: Task 4.
- Placeholder scan:
  - No TBD/TODO/fill-in-later instructions.
  - Every code-changing step includes exact code or exact replacement instructions.
- Type consistency:
  - UI model uses `EcommerceReferenceImage`.
  - Payload array is always `productImages`.
  - AI-write array is always `imageDataList`.
  - Legacy fields remain `productImage` and `imageData`.
