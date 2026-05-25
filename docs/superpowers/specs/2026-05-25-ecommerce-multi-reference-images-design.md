# Ecommerce Multi Reference Images Design

## Summary

Upgrade the ecommerce set-image Agent from a single product image to a compact multi-reference image flow. Users can upload up to 6 images, each up to 5 MB. All uploaded images are treated as one reference set; there is no category, role, or ordering step.

## Goals

- Support multiple reference photos in both ecommerce Agent entry points:
  - `packages/extension/src/sidepanel/views/EcommerceView.tsx`
  - `packages/extension/src/content/components/EcommercePanel.tsx`
- Keep the UI compact enough for the sidepanel and content-script dropdown.
- Send all reference images to generation and AI-assisted selling point writing.
- Preserve compatibility with existing single-image payloads while moving the ecommerce UI to the new multi-image state.

## Non-Goals

- Do not add image categories such as product, packaging, style, or scene.
- Do not require or expose image ordering.
- Do not change the general Agent upload flow.
- Do not change quota semantics; one generation or AI-write request still counts as one request.

## UX Design

The current "商品原图" upload area becomes "参考图片".

The upload area uses a compact thumbnail row:

- 64 x 64 thumbnails.
- Horizontal wrapping grid.
- Add tile shown while fewer than 6 images are present.
- `n / 6` count in the section header.
- Per-image remove button.
- File names are not permanently shown to keep the panel dense; they may be provided via `title` or accessible label.

Validation:

- Non-image files are skipped and report "请上传图片文件".
- Files larger than 5 MB are skipped and report "单张图片不能超过 5MB".
- If a selection would exceed 6 images, only available slots are filled and the user sees "最多上传 6 张参考图".
- A batch upload may partially succeed when some files are valid.

The generate button remains gated by selling point text, not by image presence. Reference images improve output but are not required.

## Data Model

Add a local UI model:

```ts
interface EcommerceReferenceImage {
  id: string
  dataUrl: string
  name: string
}
```

Replace the ecommerce UI state:

```ts
productImage: string | null
productImageName: string
```

with:

```ts
productImages: EcommerceReferenceImage[]
```

For content-script persisted state, store the same array:

```ts
productImages: EcommerceReferenceImage[]
```

## Shared Payload Contract

Extend `AgentGeneratePayload`:

```ts
productImages?: string[]
productImage?: string
```

`productImage` stays as a compatibility field for existing callers and tests. New ecommerce UI code sends `productImages` only.

API code normalizes both fields through one helper:

```ts
function getPayloadProductImages(payload: AgentGeneratePayload): string[] {
  if (payload.productImages?.length) return payload.productImages
  return payload.productImage ? [payload.productImage] : []
}
```

This helper is used for:

- `hasProductImages` prompt selection.
- Anthropic request body construction.
- OpenAI Chat Completions request body construction.
- OpenAI Responses request body construction.
- Official API request body construction.

## API Flow

Third-party APIs:

- Anthropic Messages: append every reference image as an image content item after the user text.
- OpenAI Chat Completions: append every reference image as `image_url` content.
- OpenAI Responses: append every reference image as `input_image` content.

Official API:

- Extension sends `productImages` to `/api/vision/generate`.
- The web route accepts `productImages?: string[]`.
- `callThirdPartyAgentApi` accepts the array and forwards all images to the configured upstream model.
- The route still accepts `productImage` for compatibility and normalizes to an array internally.

AI write:

- `AGENT_ECOMMERCE_AI_WRITE` payload changes from `imageData` to `imageDataList`.
- The handler accepts both `imageDataList?: string[]` and legacy `imageData?: string`.
- All reference images are sent to the model for selling point extraction.

## Prompt Semantics

`buildEcommerceSystemPrompt` continues receiving `hasProductImages: boolean`, but the image instruction changes to make multi-image behavior explicit:

- Treat all images as the same product reference set.
- Synthesize product appearance, color, material, shape, packaging, and detail information across the images.
- Do not assume different photos are different products unless the text says so.

## Error Handling

User-facing upload errors are toast-only and do not clear existing valid images.

API errors keep current behavior:

- `NO_CONFIG` asks the user to log in or configure API.
- `NOT_LOGGED_IN` asks the user to log in.
- `UNSUPPORTED_FORMAT` reports unsupported API format.
- `timeout` reports request timeout.

If an upstream API rejects too many images or a large payload, surface the upstream error text as today. A future iteration can add client-side compression if this becomes common.

## Testing

Add or update tests for:

- Payload normalization from `productImages` and legacy `productImage`.
- Third-party request bodies containing all uploaded images.
- Official API request body sending `productImages`.
- AI-write handler accepting multiple images and legacy single image.
- Content-script ecommerce persisted state storing `productImages`.
- Existing ecommerce result parsing and prompt bundle behavior remaining unchanged.

Minimum verification:

```bash
npm run typecheck --workspace=@oh-my-prompt/extension
npm run test:unit --workspace=@oh-my-prompt/extension -- agent-api ecommerce
```

If the targeted test filter is not supported by the project runner, run the full extension unit suite instead:

```bash
npm run test:unit --workspace=@oh-my-prompt/extension
```
