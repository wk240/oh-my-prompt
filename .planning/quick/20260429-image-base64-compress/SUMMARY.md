---
status: complete
completed: 2026-04-29
---

# Summary: 图片转提示词改用Base64传输+压缩

## Changes Made

### 1. 新增图片压缩工具 (`src/lib/image-utils.ts`)
- `asyncCompressImageFromUrl()`: 从URL获取图片并压缩为base64
- 使用 OffscreenCanvas API（支持 service worker 环境）
- 默认最大尺寸 1024x1024，保持宽高比
- 默认 JPEG 质量 70%，显著减小体积
- `extractBase64Data()`: 从 data URL 提取纯 base64 字符串

### 2. 修改 Vision API 请求构建 (`src/lib/vision-api.ts`)
- `buildAnthropicRequest()` 支持 base64 格式（`type: 'base64'`, `media_type`, `data`）
- `buildOpenAIRequest()` 支持 base64 格式（data URL 作为 `image_url.url`）
- `executeVisionApiCall()` 新增 `format` 参数，自动处理 Anthropic 的纯 base64 要求

### 3. 修改 Service Worker 处理流程 (`src/background/service-worker.ts`)
- VISION_API_CALL 处理流程：
  1. 验证图片 URL
  2. **新增**: 调用 `asyncCompressImageFromUrl()` 压缩图片
  3. 调用 `executeVisionApiCall()` 传递 base64 数据
  4. 处理压缩失败错误

### 4. 更新类型定义 (`src/shared/types.ts`)
- `VisionApiCallPayload` 新增 `imageBase64` 和 `imageFormat` 字段

## Benefits
- 大图片（如 4K 图片）可正常处理，不会因体积过大导致 API 失败
- 压缩后体积通常减少 50-90%
- 避免 CORS 问题（某些图片服务不允许跨域访问）