---
status: complete
date: 2026-05-01
slug: vision-toggle
---

# Summary: 为转提示词功能添加设置开关

## 实现内容

为 Vision modal（图片转提示词）功能添加了一个设置开关，用户可以在设置界面中开启或关闭此功能。

## 改动文件

1. **`src/shared/types.ts`** - 在 `SyncSettings` 接口中添加 `visionEnabled?: boolean` 字段
2. **`src/lib/storage.ts`** - 在默认设置中添加 `visionEnabled: true`
3. **`src/popup/SettingsApp.tsx`** - 添加开关 UI，使用 Toggle Switch 样式
4. **`src/content/image-hover-button-manager.tsx`** - 图片悬停按钮点击时检查设置，禁用时显示 toast 提示
5. **`src/content/core/coordinator.ts`** - OPEN_VISION_MODAL 消息处理时检查设置
6. **`src/content/vision-only-script.ts`** - OPEN_VISION_MODAL 消息处理时检查设置

## 功能行为

- **默认开启**：新用户默认可以使用转提示词功能
- **设置界面**：在设置中心添加了"转提示词功能"开关项，带有眼睛图标
- **禁用提示**：当功能关闭时，点击图片悬停按钮会显示 toast："转提示词功能已关闭，请在设置中开启"
- **异步检查**：所有触发点都通过 `chrome.runtime.sendMessage` 异步获取设置，默认回退为启用状态

## 构建验证

TypeScript 编译和 Vite 构建均通过，无错误。