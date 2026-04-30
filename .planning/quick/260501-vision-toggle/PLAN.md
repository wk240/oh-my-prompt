---
slug: vision-toggle
date: 2026-05-01
status: complete
---

# 为转提示词功能添加设置开关

## 需求
在转提示词功能（Vision modal - 图片转提示词）增加一个开关，放在设置界面里。

## 实现方案

### 1. 存储类型改动 (`src/shared/types.ts`)
- 在 `SyncSettings` 中添加 `visionEnabled?: boolean` 字段
- 默认值 `true`（默认开启）

### 2. 默认设置 (`src/lib/storage.ts`)
- 在 `getDefaultSettings()` 中添加 `visionEnabled: true`

### 3. 设置界面 (`src/popup/SettingsApp.tsx`)
- 在现有设置项下方添加一个开关项
- UI：使用 Toggle 开关样式（参考 Chrome 扩展设置常见模式）
- 点击时调用 `SET_SETTINGS_ONLY` 消息保存设置

### 4. Vision modal 触发点检查
需要检查以下触发点：
- `src/content/image-hover-button-manager.tsx` - 图片悬停按钮
- `src/content/core/coordinator.ts` - Lovart dropdown 触发
- `src/content/vision-only-script.ts` - 专门的 Vision 功能脚本

在这些文件中，触发 Vision modal 前先读取设置检查 `visionEnabled`。

## 涉及文件
1. `src/shared/types.ts` - 类型定义
2. `src/lib/storage.ts` - 默认值
3. `src/popup/SettingsApp.tsx` - 设置界面
4. `src/content/image-hover-button-manager.tsx` - 图片悬停触发检查
5. `src/content/core/coordinator.ts` - Lovart 触发检查
6. `src/content/vision-only-script.ts` - Vision-only 脚本触发检查

## 任务清单
- [x] 在 SyncSettings 类型中添加 visionEnabled 字段
- [x] 在 storage.ts 默认设置中添加 visionEnabled: true
- [x] 在 SettingsApp.tsx 中添加开关 UI
- [x] 在 image-hover-button-manager.tsx 中添加设置检查
- [x] 在 coordinator.ts 中添加设置检查
- [x] 在 vision-only-script.ts 中添加设置检查
- [x] 构建验证通过