# 多平台架构重构设计

**日期**: 2026-04-30
**状态**: 待审查
**目标**: 将现有 Lovart 专属架构重构为支持多平台（Lovart、ChatGPT、Claude.ai、Gemini、国内设计平台等）的分层适配架构

---

## 背景

当前 content script 架构针对 Lovart 平台硬编码：
- 输入框选择器硬编码在 `input-detector.ts`
- UI 注入位置硬编码在 `ui-injector.tsx`
- 域名限制硬编码在 `manifest.json` 和 `constants.ts`

需要支持多平台，且平台数量会持续增长，需要架构层面的抽象和分层。

---

## 设计原则

1. **配置驱动优先**: 大多数平台只需提供选择器配置，无需写额外代码
2. **策略可覆盖**: 复杂平台可选择性覆盖特定策略（如插入逻辑）
3. **核心复用**: MutationObserver 检测、Shadow DOM 注入、消息路由等核心逻辑共用
4. **平等扩展**: 所有平台平等放置，无特殊分层

---

## 目录结构

```
src/content/
├── core/                      # 核心逻辑（所有平台共用）
│   ├── detector.ts            # MutationObserver + 选择器匹配
│   ├── injector.ts            # Shadow DOM 挂载
│   └── coordinator.ts         # 入口协调器
│
├── platforms/                 # 平台适配层（所有平台平等）
│   ├── registry.ts            # 平台注册表（URL 匹配 → 平台）
│   ├── base/                  # 基础策略定义
│   │   ├── types.ts           # PlatformConfig 类型定义
│   │   ├── strategy-interface.ts  # 策略接口定义
│   │   └── default-strategies.ts  # 默认策略实现
│   │
│   ├── lovart/                # Lovart
│   │   ├── config.ts          # 平台配置
│   │   └── strategies.ts      # 自定义插入策略（Lexical 编辑器）
│   │
│   ├── chatgpt/               # ChatGPT
│   │   └── config.ts
│   │
│   ├── claude-ai/             # Claude.ai
│   │   └── config.ts
│   │
│   ├── gemini/                # Gemini
│   │   └── config.ts
│   │
│   ├── liblib/                # LibLib
│   │   └── config.ts
│   │
│   ├── jimeng/                # 即梦
│   │   └── config.ts
│   │
│   └── ...                    # 其他平台同理
│
├── components/                # UI 组件
│   ├── DropdownApp.tsx        # 下拉容器
│   ├── TriggerButton.tsx      # 默认闪电按钮
│   └── ...                    # 其他组件
│
├── styles/                    # Shadow DOM 样式
│   └ dropdown-styles.ts
│
└── vision-modal-manager.tsx   # Vision Modal（保持不变）
```

---

## 核心类型定义

### PlatformConfig

```typescript
interface PlatformConfig {
  // === 平台标识 ===
  id: string                    // 平台唯一标识，如 'lovart', 'chatgpt'
  name: string                  // 显示名称

  // === URL 匹配 ===
  urlPatterns: UrlPattern[]     // 匹配规则，满足任一即激活

  // === 输入检测 ===
  inputDetection: InputDetectionConfig

  // === UI 注入 ===
  uiInjection: UIInjectionConfig

  // === 可选策略覆盖 ===
  strategies?: StrategyOverrides
}
```

### UrlPattern

```typescript
interface UrlPattern {
  type: 'domain' | 'pathname' | 'full' | 'regex'
  value: string
}

// 示例:
// { type: 'domain', value: 'lovart.ai' }
// { type: 'pathname', value: '/chat' }
// { type: 'regex', value: '^https://claude\\.ai' }
```

### InputDetectionConfig

```typescript
interface InputDetectionConfig {
  selectors: string[]           // 输入框选择器，按优先级排序
  validate?: (element: HTMLElement) => boolean  // 可选验证函数
  debounceMs?: number           // 检测防抖（默认 100ms）
}
```

### UIInjectionConfig

```typescript
interface UIInjectionConfig {
  anchorSelector: string        // 锚点元素选择器
  position: 'before' | 'after' | 'prepend' | 'append'
  buttonStyle?: ButtonStyleConfig   // 轻量样式定制
  customButton?: React.ComponentType  // 完全自定义按钮
}

interface ButtonStyleConfig {
  icon?: 'lightning' | 'sparkle' | 'wand' | 'custom'
  customIcon?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  color?: string
}
```

### StrategyOverrides

```typescript
interface StrategyOverrides {
  inserter?: InsertStrategy     // 覆盖文本插入
  detector?: DetectStrategy     // 覆盖检测逻辑（极少数需要）
}
```

---

## 核心模块设计

### 1. 平台注册表 (registry.ts)

职责: 管理 all 平台配置，根据 URL 匹配激活平台

```typescript
const PLATFORMS: PlatformConfig[] = [
  lovartConfig,
  chatgptConfig,
  // 新增平台在此添加
]

function matchPlatform(url: string): PlatformConfig | null {
  // 遍历 PLATFORMS，返回第一个匹配的配置
}
```

### 2. 入口协调器 (coordinator.ts)

职责: 替代现有 content-script.ts，统一入口

工作流程:
1. 调用 `matchPlatform()` 匹配当前页面
2. 无匹配则直接退出（非目标平台）
3. 有匹配则初始化 Detector、Injector
4. 监听 service worker 消息

```typescript
class Coordinator {
  init() {
    const platform = matchPlatform(window.location.href)
    if (!platform) return

    const inserter = platform.strategies?.inserter ?? createDefaultInserter()
    this.detector = new Detector(platform.inputDetection, this.onInputDetected)
    this.detector.start()
    this.setupMessageListener(inserter)
  }
}
```

### 3. 检测器 (detector.ts)

职责: 接收平台配置的选择器，执行 MutationObserver 检测

变化:
- 不再硬编码 INPUT_SELECTORS
- 接收 InputDetectionConfig 作为构造参数
- 支持平台自定义验证函数

### 4. 注入器 (injector.ts)

职责: 接收 UIInjectionConfig，在指定位置挂载 Shadow DOM

变化:
- 不再硬编码 TARGET_SELECTOR
- 支持 before/after/prepend/append 四种位置
- 支持自定义按钮组件

### 5. 插入策略 (strategies)

**默认策略 (default-strategies.ts)**:
- 适用大多数 textarea/input
- execCommand → value setter fallback → contenteditable fallback

**自定义策略示例 (Lovart)**:
- Lexical 编辑器需要特殊的插入逻辑
- 通过 `strategies.inserter` 覆盖

---

## 平台配置示例

### ChatGPT（简单平台）

```typescript
export const chatgptConfig: PlatformConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',

  urlPatterns: [
    { type: 'domain', value: 'chatgpt.com' },
    { type: 'domain', value: 'chat.openai.com' },
  ],

  inputDetection: {
    selectors: [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'textarea[placeholder*="Message"]',
    ],
  },

  uiInjection: {
    anchorSelector: '[data-testid="composer-footer"]',
    position: 'prepend',
  },
}
```

### Lovart（复杂平台）

```typescript
export const lovartConfig: PlatformConfig = {
  id: 'lovart',
  name: 'Lovart',

  urlPatterns: [
    { type: 'domain', value: 'lovart.ai' },
  ],

  inputDetection: {
    selectors: [
      '[data-testid="agent-message-input"]',
      '[data-lexical-editor="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: '[data-testid="agent-input-bottom-more-button"]',
    position: 'before',
  },

  strategies: {
    inserter: new LovartInserter(),  // Lexical 编辑器专用
  },
}
```

---

## Manifest 修改

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/core/coordinator.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

改为 `<all_urls>`，由 coordinator 内部判断是否激活。

---

## 迁移计划

### Phase 1: 基础架构
1. 创建 `core/` 目录和基础模块
2. 创建 `platforms/base/` 类型定义
3. 实现 registry 和 coordinator

### Phase 2: Lovart 迁移
1. 将现有 Lovart 选择器提取为 config.ts
2. 提取 Lexical 插入策略为 strategies.ts
3. 验证功能不变

### Phase 3: 新平台接入
1. ChatGPT 配置
2. Claude.ai 配置
3. Gemini 配置
4. 国内设计平台配置

### Phase 4: 清理
1. 移除旧 content-script.ts、input-detector.ts、ui-injector.tsx
2. 更新 CLAUDE.md 文档
3. 测试所有平台

---

## 验收标准

1. Lovart 功能完全不变
2. 新增平台只需创建 config.ts（无策略覆盖情况下）
3. coordinator 在非目标页面直接退出，无副作用
4. 所有平台的消息路由正常工作
5. Vision Modal 功能不受影响

---

## 待定事项

- 具体平台的选择器需要在实施时调研确定
- 国内设计平台（LibLib、即梦等）的 UI 位置需要实际测试
- 是否需要平台优先级机制（多个平台匹配同一 URL 时）