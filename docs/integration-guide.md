# Integration Guide — 添加新平台支持

> **受众:** 贡献者为本项目添加新的 AI 平台支持

## Quick Start

添加新平台只需两个文件：

```
src/content/platforms/{platform}/
├── config.ts      # 必需 — 平台配置
└── strategies.ts  # 可选 — 自定义插入策略
```

## Step 1: 创建配置文件

```typescript
// src/content/platforms/{platform}/config.ts
import { PlatformConfig } from '@/content/platforms/base/types'
import { DefaultInserter } from '@/content/platforms/base/default-strategies'

export const platformConfig: PlatformConfig = {
  id: 'my-platform',
  name: 'My Platform',
  
  // URL 匹配规则
  urlPatterns: [
    { type: 'domain', value: 'myplatform.com' },
    { type: 'pathname', value: '/create' },  // 可选，限定路径
  ],
  
  // 输入框检测
  inputDetection: {
    selectors: [
      'textarea.prompt-input',      // 优先选择器
      '[data-testid="input-box"]',  // 备选
      'input[type="text"]',         // 兜底
    ],
    debounceMs: 100,  // 可选，防抖延迟
  },
  
  // UI 注入位置
  uiInjection: {
    anchorSelector: '.input-container',  // 锚点元素
    position: 'after',  // 'before' | 'after' | 'prepend' | 'append'
  },
  
  // 使用默认插入策略（大多数平台）
  strategies: {
    inserter: new DefaultInserter(),
  },
}
```

### URL Pattern Types

| Type | Example | Match Logic |
|------|---------|-------------|
| `domain` | `lovart.ai` | `location.hostname.includes(value)` |
| `pathname` | `/create` | `location.pathname.startsWith(value)` |
| `full` | `https://...` | `location.href === value` |
| `regex` | `lovart\.ai` | `new RegExp(value).test(location.href)` |

### Position Options

| Position | UI Placement |
|----------|--------------|
| `before` | 锚点元素之前 |
| `after` | 锚点元素之后（最常用）|
| `prepend` | 锚点内部开头 |
| `append` | 锚点内部结尾 |

## Step 2: 注册平台

编辑 `src/content/platforms/registry.ts`：

```typescript
import { platformConfig as myPlatform } from './my-platform/config'

// 在 registerAllPlatforms() 中添加
registerPlatform(myPlatform)
```

## Step 3: 测试

1. `npm run dev`
2. 在 Chrome 加载 `dist/`
3. 访问目标平台页面
4. 检查：
   - 输入框旁是否出现闪电图标按钮
   - 点击按钮是否打开下拉菜单
   - 选择提示词是否正确插入

## Custom Strategies (可选)

默认策略适用于 `<textarea>`、`<input>` 和大多数富文本编辑器。

### 需要自定义的情况

- **Lexical 编辑器** (如 Lovart) — 需特殊事件触发
- **ProseMirror 编辑器** (如 Claude.ai) — 需原生 setter 调用
- **自定义组件** — 需模拟特定键盘事件

### 实现自定义策略

```typescript
// src/content/platforms/{platform}/strategies.ts
import { InsertStrategy } from '@/content/platforms/base/strategy-interface'

export class MyPlatformInserter implements InsertStrategy {
  insert(element: HTMLElement, text: string): boolean {
    // 1. 聚焦元素
    element.focus()
    
    // 2. 执行插入（根据平台特性）
    // 例如：触发特定事件、调用 API 等
    
    // 3. 返回成功/失败
    return true
  }
}
```

在 `config.ts` 中使用：

```typescript
strategies: {
  inserter: new MyPlatformInserter(),
}
```

## 已支持平台参考

| Platform | Editor Type | Strategy |
|----------|-------------|----------|
| Lovart | Lexical | `LovartInserter` |
| Claude.ai | ProseMirror | `ClaudeAiInserter` |
| ChatGPT | Custom textarea | `DefaultInserter` |
| Gemini | Rich text | `DefaultInserter` |
| LibLib | textarea | `DefaultInserter` |
| 即梦 | textarea | `DefaultInserter` |

查看 `src/content/platforms/*/` 目录了解具体实现。

## Troubleshooting

### 问题：按钮不出现

- 检查 `urlPatterns` 是否正确匹配
- 检查 `anchorSelector` 是否存在
- 打开 DevTools，查看 `[Oh My Prompt]` 日志

### 问题：提示词不插入

- 检查输入框 `selectors` 是否正确
- 尝试自定义 `InsertStrategy`
- 检查 React/Vue 等框架的事件绑定

### 问题：样式冲突

Content Script 使用 Shadow DOM 隔离，不应有 CSS 冲突。如有问题，检查宿主页面是否修改了 Shadow DOM 边界。

---

*Last updated: 2026-04-30*