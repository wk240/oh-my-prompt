---
description: Lovart 平台多注入点支持 - agent-chat-footer 区域
status: planning
---

# PLAN: Lovart Agent Image Generator 注入

## Goal
在 Lovart 平台的 agent-chat-footer 区域（图片生成器输入框）添加闪电按钮注入点，与现有的主聊天输入框注入并存。

## Problem Analysis
当前架构：
- `PlatformConfig.uiInjection` 是单一配置对象
- `Coordinator` 创建单一 `Detector` + `Injector` 实例
- 不支持多注入点并存

用户提供的新注入位置：
- 输入框: `textarea#agent-image-generator-prompt`
- 容器: `div#agent-chat-footer`
- 建议锚点: `div#generator-prompt-container` 或其父级 flex container

## Implementation Strategy

### 方案：扩展架构支持多注入点（最小改动）

1. **扩展 PlatformConfig 类型**
   - 添加 `uiInjectionMultiple?: UIInjectionConfig[]` 可选字段
   - 保持向后兼容，单注入点仍用 `uiInjection`

2. **修改 Coordinator 支持多注入**
   - 创建 `Injector[]` 数组而非单一实例
   - 根据 `uiInjectionMultiple` 配置循环创建多个注入器
   - 每个注入器绑定不同的输入检测选择器

3. **更新 Lovart 配置**
   - 添加 `inputDetectionAgent` 选择器配置
   - 添加 `uiInjectionMultiple` 包含 agent-chat-footer 注入点

## Files to Modify
- `src/content/platforms/base/types.ts` - 添加 `uiInjectionMultiple` 类型
- `src/content/core/coordinator.ts` - 支持多注入器初始化
- `src/content/platforms/lovart/config.ts` - 添加 agent 区域注入配置

## Detailed Tasks

### Task 1: 扩展 types.ts
添加可选的 `uiInjectionMultiple` 字段到 `PlatformConfig`:
```typescript
interface PlatformConfig {
  // ... existing fields
  uiInjection: UIInjectionConfig
  uiInjectionMultiple?: UIInjectionConfig[]  // NEW: multi-injection support
}
```

### Task 2: 修改 coordinator.ts
- 将 `injector` 改为 `injectors: Injector[]`
- 在 `handleUniversalInputDetected` 中处理多注入配置
- 根据 URL 路径或输入元素特征匹配正确的注入配置

### Task 3: 更新 Lovart 配置
添加 agent 区域的注入配置：
```typescript
uiInjectionMultiple: [
  {
    anchorSelector: '#generator-prompt-container',
    position: 'before',
    inputSelector: '#agent-image-generator-prompt',  // NEW field needed?
  }
]
```

需要考虑：如何让多注入器各自绑定到正确的输入元素？

## Alternative Approach (更简单)

不修改核心架构，在 Lovart 层面用策略处理：
- `LovartInserter` 或 `LovartButton` 中检测当前激活的输入区域
- 根据页面路由判断注入哪个位置

但这不够灵活，后续添加更多注入点会很复杂。

## Decision
采用 Lovart 专用方案：扩展 Lovart 配置支持多注入点，根据检测到的输入元素动态选择注入配置。

## 确认的信息
- 两个区域不会同时存在于同一页面
- 按钮样式与现有 LovartButton 一致
- 采用 Lovart 专用解决方案（不修改核心架构）

## Implementation Steps

1. **扩展 types.ts** - 添加可选的 `secondaryInjection` 配置
2. **修改 coordinator.ts** - 检测输入元素类型，选择正确的注入配置
3. **更新 Lovart 配置** - 添加 agent-generator 区域的注入配置
4. **测试** - 验证两个页面路径下注入正确

---
*Plan updated: 2026-05-06*