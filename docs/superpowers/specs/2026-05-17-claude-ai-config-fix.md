# Claude.ai 平台配置修复

## 背景

现有 Claude.ai 配置使用 `.composer-footer` 作为 UI 注入锚点，但新版 Claude.ai UI 中此元素不存在，导致触发按钮无法注入。

## 目标

更新 Claude.ai 平台配置，适配新版 UI。

## 设计

### 输入检测

添加 `data-testid` 选择器作为优先匹配：

```typescript
selectors: [
  'div[data-testid="chat-input"][contenteditable="true"]',  // 新增优先
  'div[contenteditable="true"][role="textbox"]',
  '.ProseMirror[contenteditable="true"]',
]
```

### UI 注入锚点

替换锚点选择器，使用稳定的 `aria-label` 属性：

```typescript
uiInjection: {
  anchorSelector: 'button[aria-label="Add files, connectors, and more"]',
  position: 'before',
}
```

触发按钮将出现在工具栏最左侧，"添加文件"按钮之前。

## 修改范围

- `packages/extension/src/content/platforms/claude-ai/config.ts`

## 测试验证

1. 访问 `https://claude.ai/chat/...` 页面
2. 确认输入框被检测到
3. 确认触发按钮出现在"添加文件"按钮左侧
4. 确认选择提示词后能正确插入到输入框