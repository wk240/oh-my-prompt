---
status: complete
completed_at: 2026-05-06T15:15:00Z
---

# SUMMARY: Lovart Agent Image Generator 注入点

## What was done
为 Lovart 平台添加了 agent-chat-footer 区域（图片生成器输入框）的闪电按钮注入点。

## Changes made
1. **types.ts** - 扩展 `UIInjectionConfig` 添加 `inputSelector` 字段，扩展 `PlatformConfig` 添加 `secondaryInjections` 数组
2. **coordinator.ts** - 添加 `selectInjectionConfig()` 方法根据检测到的输入元素选择正确的注入配置
3. **lovart/config.ts** - 添加 `#agent-image-generator-prompt` 到输入检测选择器，添加 `secondaryInjections` 配置用于 agent 区域注入

## How it works
- 当检测到 `#agent-image-generator-prompt` 输入框时，使用 `secondaryInjections[0]` 配置（锚点为 `#generator-prompt-container`）
- 否则使用默认的 `uiInjection` 配置（主聊天区域）
- 两个区域互斥，不会同时出现

## Files modified
- `src/content/platforms/base/types.ts` (类型扩展)
- `src/content/core/coordinator.ts` (注入选择逻辑)
- `src/content/platforms/lovart/config.ts` (Lovart 配置)

## Testing
- TypeScript 检查通过
- 生产构建成功
- LovartInserter 已支持 textarea 插入

---
*Completed: 2026-05-06*