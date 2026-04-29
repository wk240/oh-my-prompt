---
status: in-progress
created: 2026-04-29
---

# Plan: 图片转提示词改用Base64传输+压缩

## Objective
修改"转提示词"功能，将图片从URL传输改为Base64格式，传输前先压缩图片以减小体积。

## Background
当前实现：
- 右键菜单获取图片URL (`info.srcUrl`)
- 直接将URL传递给Vision API（OpenAI/Anthropic格式）
- 问题：大图片可能导致API请求失败或超时

## Implementation Steps

### Step 1: 创建图片压缩工具函数
- 新建 `src/lib/image-utils.ts`
- 实现 `compressImage()` 函数：
  - 使用 Canvas API 进行压缩
  - 支持质量控制参数
  - 限制最大尺寸（如 1024x1024）
  - 返回 base64 字符串

### Step 2: 修改 Vision API 请求构建
- 修改 `src/lib/vision-api.ts`：
  - `buildAnthropicRequest()` 支持 base64 格式（`type: 'base64'`）
  - `buildOpenAIRequest()` 支持 base64 格式（`image_url.url` 可为 data URL）
  - 新增 `imageFormat` 参数区分 url/base64

### Step 3: 修改 Service Worker 处理流程
- 修改 `src/background/service-worker.ts`：
  - VISION_API_CALL 处理中：
    - 先 fetch 图片数据
    - 调用压缩函数
    - 生成 base64
    - 传递给 Vision API

### Step 4: 更新类型定义
- `src/shared/types.ts`：
  - `VisionApiCallPayload` 改为支持 `imageData?: string` (base64)

## Files to Modify
1. `src/lib/image-utils.ts` (新建)
2. `src/lib/vision-api.ts` (修改)
3. `src/background/service-worker.ts` (修改)
4. `src/shared/types.ts` (修改)

## Success Criteria
- 大图片能正常处理（压缩后传输）
- API调用成功率提升
- 小图片保持原质量