# 电商套图 Agent 面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Agent UI with a specialized ecommerce panel when the "电商套图" template is selected, supporting single image upload, platform/market/language/aspect-ratio selectors, expandable structure options with counter rows, AI-assisted selling points, full-screen result view, and structured multi-prompt output.

**Architecture:** Conditional rendering — when `agentSelectedTemplate === 'ecommerce'`, render `EcommercePanel`/`EcommerceView` instead of `AgentPanel`/`AgentView`. New types extend existing `AgentGeneratePayload`/`AgentGenerateResult`. A dedicated system prompt builder produces structured JSON output. The "AI帮写" feature uses a separate message type and handler. Result display uses full-screen view replacement (form ↔ result views) with state preservation on back navigation.

**Tech Stack:** React 19, TypeScript, Zustand, Chrome Extension MV3 messaging, inline styles (content script), CSS classes (sidepanel)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/types/agent.ts` | Modify | Add ecommerce types, extend Payload/Result |
| `packages/shared/messages.ts` | Modify | Add `AGENT_ECOMMERCE_AI_WRITE` |
| `packages/extension/src/data/ecommerce-config.json` | Create | Platform/market/language/ratio dropdown data |
| `packages/extension/src/lib/agent-templates.ts` | Modify | Add `buildEcommerceSystemPrompt`, `buildEcommerceAiWritePrompt`, `getPlatformRules` |
| `packages/extension/src/content/components/EcommercePanel.tsx` | Create | Content script ecommerce panel (single image upload, expandable structure cards, full-screen result view) |
| `packages/extension/src/sidepanel/views/EcommerceView.tsx` | Create | Sidepanel ecommerce view (same features, CSS classes) |
| `packages/extension/src/content/styles/dropdown-styles.ts` | Modify | Add `ecommerce-*` CSS classes (single upload, expandable cards, counters, result view) |
| `packages/extension/src/sidepanel/index.css` | Modify | Add `ecommerce-*` CSS classes (same) |
| `packages/extension/src/content/components/DropdownContainer.tsx` | Modify | Conditional render `EcommercePanel` |
| `packages/extension/src/sidepanel/views/PromptListView.tsx` | Modify | Conditional render `EcommerceView` |
| `packages/extension/src/lib/agent-api.ts` | Modify | Handle `ecommerceConfig`, `productImage` single image, JSON result parsing |
| `packages/extension/src/background/agent-handler.ts` | Modify | Add `handleEcommerceAiWrite` |
| `packages/extension/src/background/service-worker.ts` | Modify | Route `AGENT_ECOMMERCE_AI_WRITE` |
| `packages/web-app/lib/vision-proxy.ts` | Modify | Add server-side `buildEcommerceSystemPrompt`, handle ecommerce config |
| `packages/web-app/app/api/vision/generate/route.ts` | Modify | Accept `ecommerceConfig` and `productImage` |

---

### Task 1: Add ecommerce types to shared types

**Files:**
- Modify: `packages/shared/types/agent.ts`

- [ ] **Step 1: Add ecommerce types and extend existing interfaces**

Add the following types after the existing `AgentGenerateResult` interface in `packages/shared/types/agent.ts`:

```typescript
// 电商平台
export type EcommercePlatform = 'amazon' | 'taobao' | 'jd' | 'pinduoduo' | 'temu' | 'shein'

// 目标市场
export type EcommerceMarket = 'china' | 'usa' | 'europe' | 'japan' | 'southeast_asia'

// 输出语言
export type EcommerceLanguage = 'zh' | 'en' | 'ja'

// 图片比例
export type EcommerceAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'

// 自定义套图数量配置
export interface EcommerceCustomCounts {
  whiteBg: number
  scene: number
  sellingPoint: number
  other: number
}

// 电商配置
export interface EcommerceConfig {
  platform: EcommercePlatform
  market: EcommerceMarket
  language: EcommerceLanguage
  aspectRatio: EcommerceAspectRatio
  sellingPoints: string
  setStructure: 'smart' | 'custom'
  customCounts?: EcommerceCustomCounts
}

// 电商结构化生成结果
export interface EcommerceGenerateResult {
  prompts: Array<{
    type: string
    typeEn: string
    prompt: string
    aspectRatio: string
  }>
  templateCategory: 'ecommerce'
}
```

Then extend `AgentGeneratePayload` to add:

```typescript
productImage?: string             // 单张商品原图 (base64 data URL)
ecommerceConfig?: EcommerceConfig  // 电商专属配置
```

And extend `AgentGenerateResult` to add:

```typescript
ecommercePrompts?: EcommerceGenerateResult  // 结构化多提示词结果
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (the new fields are optional, so existing code is unaffected)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/types/agent.ts
git commit -m "feat: add ecommerce types and extend Agent payload/result"
```

---

### Task 2: Add AGENT_ECOMMERCE_AI_WRITE message type

**Files:**
- Modify: `packages/shared/messages.ts`

- [ ] **Step 1: Add the new message type**

Add `AGENT_ECOMMERCE_AI_WRITE` to the `MessageType` enum in `packages/shared/messages.ts`, near the other `AGENT_*` entries:

```typescript
AGENT_ECOMMERCE_AI_WRITE = 'AGENT_ECOMMERCE_AI_WRITE',
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/messages.ts
git commit -m "feat: add AGENT_ECOMMERCE_AI_WRITE message type"
```

---

### Task 3: Create ecommerce config data file

**Files:**
- Create: `packages/extension/src/data/ecommerce-config.json`

- [ ] **Step 1: Create the config JSON file**

Create `packages/extension/src/data/ecommerce-config.json`:

```json
{
  "platforms": [
    { "id": "amazon", "name": "亚马逊", "nameEn": "Amazon" },
    { "id": "taobao", "name": "淘宝", "nameEn": "Taobao" },
    { "id": "jd", "name": "京东", "nameEn": "JD.com" },
    { "id": "pinduoduo", "name": "拼多多", "nameEn": "Pinduoduo" },
    { "id": "temu", "name": "Temu", "nameEn": "Temu" },
    { "id": "shein", "name": "Shein", "nameEn": "Shein" }
  ],
  "markets": [
    { "id": "china", "name": "中国", "nameEn": "China" },
    { "id": "usa", "name": "美国", "nameEn": "USA" },
    { "id": "europe", "name": "欧洲", "nameEn": "Europe" },
    { "id": "japan", "name": "日本", "nameEn": "Japan" },
    { "id": "southeast_asia", "name": "东南亚", "nameEn": "Southeast Asia" }
  ],
  "languages": [
    { "id": "zh", "name": "中文", "nameEn": "Chinese" },
    { "id": "en", "name": "English", "nameEn": "English" },
    { "id": "ja", "name": "日本語", "nameEn": "Japanese" }
  ],
  "aspectRatios": [
    { "id": "1:1", "name": "1:1" },
    { "id": "4:3", "name": "4:3" },
    { "id": "3:4", "name": "3:4" },
    { "id": "16:9", "name": "16:9" },
    { "id": "9:16", "name": "9:16" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/data/ecommerce-config.json
git commit -m "feat: add ecommerce dropdown config data"
```

---

### Task 4: Add ecommerce system prompt builders to agent-templates.ts

**Files:**
- Modify: `packages/extension/src/lib/agent-templates.ts`

- [ ] **Step 1: Add imports and platform rules**

At the top of `packages/extension/src/lib/agent-templates.ts`, add imports for the new types:

```typescript
import type { EcommercePlatform, EcommerceConfig } from '@oh-my-prompt/shared/types'
```

Add the `getPlatformRules` function after the existing `buildAgentSystemPrompt` function:

```typescript
export function getPlatformRules(platform: EcommercePlatform): string {
  const rules: Record<EcommercePlatform, string> = {
    amazon: '主图必须纯白背景（RGB 255,255,255），产品占画面85%以上面积，禁止水印、文字、Logo。副图可展示使用场景、尺寸对比、功能细节。建议7张图。',
    taobao: '白底或浅色渐变背景主图，促销文字不超过20%面积，建议5张图。副图突出卖点、细节、场景。',
    jd: '白底主图，产品居中，允许品牌Logo水印。副图展示功能、细节、场景。建议5-8张图。',
    pinduoduo: '突出产品主体，背景简洁，强调性价比。主图可加促销标签。建议5-10张图。',
    temu: '白底或场景图，英文标注为主，面向海外消费者。主图简洁突出产品。建议6-8张图。',
    shein: '时尚感强，场景图为主，模特展示优先。风格年轻化，色彩鲜明。建议6-8张图。'
  }
  return rules[platform] || rules.amazon
}
```

- [ ] **Step 2: Add buildEcommerceSystemPrompt**

Add after `getPlatformRules`:

```typescript
export function buildEcommerceSystemPrompt(
  config: EcommerceConfig,
  hasProductImages: boolean
): string {
  const platformRules = getPlatformRules(config.platform)
  const marketNames: Record<string, string> = {
    china: '中国', usa: '美国', europe: '欧洲', japan: '日本', southeast_asia: '东南亚'
  }
  const languageNames: Record<string, string> = {
    zh: '中文', en: '英文', ja: '日文'
  }

  const imageInstruction = hasProductImages
    ? `用户提供了商品参考图片，请仔细分析图片中的商品外观、颜色、材质、形状等特征，确保生成的提示词准确描述商品。`
    : ''

  const sellingPointsSection = config.sellingPoints.trim()
    ? `\n## 商品卖点\n${config.sellingPoints.trim()}\n请在提示词中自然融入以上卖点。`
    : ''

  const structureInstruction = config.setStructure === 'smart'
    ? `请根据平台规则和商品类型，智能决定最优的图片类型组合（通常5-7张），确保覆盖主图、场景图、细节图、卖点图等关键类型。`
    : config.customCounts
      ? `请按照以下数量生成各类型图片提示词：白底图 ${config.customCounts.whiteBg} 张、场景图 ${config.customCounts.scene} 张、卖点图 ${config.customCounts.sellingPoint} 张、其他类型 ${config.customCounts.other} 张（由AI智能匹配最优类型）。`
      : `请生成以下固定类型的图片提示词：主图、场景图、细节图、卖点图、对比图、氛围图、品牌图。`

  return `你是电商套图提示词专家。根据用户提供的商品信息${hasProductImages ? '和参考图片' : ''}，生成一套完整的电商产品展示图片提示词。

## 平台要求
当前平台：${config.platform}
${platformRules}

## 目标市场
${marketNames[config.market] || config.market}市场，请遵循该市场的消费者偏好和审美习惯。

## 输出语言
所有提示词使用${languageNames[config.language] || config.language}输出。图片类型标签同时提供中文和英文。

## 图片比例
所有图片比例为 ${config.aspectRatio}。
${imageInstruction}
${sellingPointsSection}

## 套图结构
${structureInstruction}

## 输出格式
请严格以JSON格式输出，不要包含任何其他文字：
{
  "prompts": [
    { "type": "图片类型（中文）", "typeEn": "Image type (English)", "prompt": "详细的图片生成提示词", "aspectRatio": "${config.aspectRatio}" }
  ]
}`
}
```

- [ ] **Step 3: Add buildEcommerceAiWritePrompt**

Add after `buildEcommerceSystemPrompt`:

```typescript
export function buildEcommerceAiWritePrompt(
  platform: EcommercePlatform,
  language: EcommerceLanguage
): string {
  const languageNames: Record<string, string> = {
    zh: '中文', en: '英文', ja: '日文'
  }
  return `你是电商商品卖点撰写专家。请根据提供的商品图片，生成3-5条简洁有力的商品卖点描述。

要求：
1. 每条卖点一行，不要编号
2. 使用${languageNames[language] || '中文'}
3. 适合${platform}平台的风格
4. 突出产品核心优势和差异化卖点
5. 语言简洁有力，每条不超过30字

请直接输出卖点，不要包含任何其他文字。`
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/agent-templates.ts
git commit -m "feat: add ecommerce system prompt builders and platform rules"
```

---

### Task 5: Add ecommerce CSS classes to dropdown-styles.ts

**Files:**
- Modify: `packages/extension/src/content/styles/dropdown-styles.ts`

- [ ] **Step 1: Add ecommerce CSS classes**

In `packages/extension/src/content/styles/dropdown-styles.ts`, find the closing backtick of the `DROPDOWN_STYLES` string. Before the closing backtick, add the following CSS classes (following the `agent-panel-*` naming convention used for content script):

```css
.ecommerce-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 16px;
  gap: 14px;
  overflow-y: auto;
  box-sizing: border-box;
  position: relative;
}

.ecommerce-panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ecommerce-panel-label {
  font-size: 12px;
  font-weight: 500;
  color: #525252;
}

.ecommerce-panel-upload-area {
  width: 100%;
  min-height: 80px;
  border: 1.5px dashed #D4D4D4;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
  box-sizing: border-box;
  padding: 12px;
}

.ecommerce-panel-upload-area:hover {
  border-color: #A16207;
}

.ecommerce-panel-upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #A3A3A3;
  font-size: 11px;
}

.ecommerce-panel-upload-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.ecommerce-panel-upload-thumb {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.ecommerce-panel-upload-info {
  flex: 1;
  font-size: 12px;
  color: #404040;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ecommerce-panel-upload-remove {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #E5E5E5;
  border-radius: 4px;
  cursor: pointer;
  color: #737373;
  font-size: 12px;
  padding: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.ecommerce-panel-upload-remove:hover {
  color: #dc2626;
  border-color: #fecaca;
  background: #FEF2F2;
}

.ecommerce-panel-select-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ecommerce-panel-select-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ecommerce-panel-select-label {
  font-size: 11px;
  color: #737373;
}

.ecommerce-panel-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  font-size: 12px;
  color: #171717;
  background: white;
  cursor: pointer;
  outline: none;
  appearance: auto;
}

.ecommerce-panel-select:focus {
  border-color: #A16207;
}

.ecommerce-panel-textarea-section {
  position: relative;
}

.ecommerce-panel-textarea {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.ecommerce-panel-textarea:focus {
  border-color: #A16207;
}

.ecommerce-panel-ai-write-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  background: white;
  font-size: 11px;
  color: #A16207;
  cursor: pointer;
  transition: all 0.15s;
}

.ecommerce-panel-ai-write-btn:hover {
  background: #FFFBEB;
  border-color: #A16207;
}

.ecommerce-panel-ai-write-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ecommerce-panel-structure-card {
  border: 1.5px solid #E5E5E5;
  border-radius: 8px;
  background: white;
  transition: all 0.15s;
  overflow: hidden;
}

.ecommerce-panel-structure-card.active {
  border-color: #A16207;
  background: #FFFBEB;
}

.ecommerce-panel-structure-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
}

.ecommerce-panel-structure-card-checkbox {
  width: 16px;
  height: 16px;
  border: 1.5px solid #D4D4D4;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  font-size: 10px;
  color: transparent;
}

.ecommerce-panel-structure-card-checkbox.checked {
  background: #A16207;
  border-color: #A16207;
  color: white;
}

.ecommerce-panel-structure-card-title {
  font-size: 12px;
  font-weight: 500;
  color: #171717;
}

.ecommerce-panel-structure-card-desc {
  font-size: 11px;
  color: #737373;
  margin-top: 2px;
}

.ecommerce-panel-structure-card-body {
  display: none;
  padding: 0 12px 12px;
  flex-direction: column;
  gap: 10px;
}

.ecommerce-panel-structure-card.active .ecommerce-panel-structure-card-body {
  display: flex;
}

.ecommerce-panel-counter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ecommerce-panel-counter-label {
  font-size: 12px;
  color: #404040;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 48px;
}

.ecommerce-panel-counter-desc {
  font-size: 11px;
  color: #A3A3A3;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ecommerce-panel-counter-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ecommerce-panel-counter-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #E5E5E5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #525252;
  padding: 0;
  transition: all 0.15s;
}

.ecommerce-panel-counter-btn:hover {
  border-color: #A16207;
  color: #A16207;
}

.ecommerce-panel-counter-value {
  min-width: 20px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: #171717;
}

.ecommerce-panel-counter-ai-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: #FFFBEB;
  color: #A16207;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  flex-shrink: 0;
}

.ecommerce-panel-generate-btn {
  width: 100%;
  padding: 10px 16px;
  background: #171717;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.ecommerce-panel-generate-btn:hover {
  background: #404040;
}

.ecommerce-panel-generate-btn:disabled {
  background: #D4D4D4;
  cursor: not-allowed;
}

.ecommerce-panel-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: omp-spin 0.6s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

.ecommerce-panel-error {
  padding: 10px 12px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 8px;
  font-size: 12px;
  color: #B91C1C;
}

.ecommerce-panel-result-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: white;
  z-index: 10;
}

.ecommerce-panel-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #E5E5E5;
  flex-shrink: 0;
}

.ecommerce-panel-result-back-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  cursor: pointer;
  color: #525252;
  font-size: 14px;
  padding: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.ecommerce-panel-result-back-btn:hover {
  border-color: #A16207;
  color: #A16207;
}

.ecommerce-panel-result-title {
  font-size: 13px;
  font-weight: 600;
  color: #171717;
  flex: 1;
}

.ecommerce-panel-result-count {
  font-size: 11px;
  color: #737373;
  flex-shrink: 0;
}

.ecommerce-panel-result-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ecommerce-panel-result-card {
  background: #f8f8f8;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  padding: 12px;
}

.ecommerce-panel-result-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ecommerce-panel-result-type-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: #FFFBEB;
  color: #A16207;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.ecommerce-panel-result-text {
  font-size: 12px;
  line-height: 1.6;
  color: #404040;
  white-space: pre-wrap;
  word-break: break-word;
}

.ecommerce-panel-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.ecommerce-panel-action-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  cursor: pointer;
  color: #64748B;
  transition: all 0.15s;
  padding: 0;
}

.ecommerce-panel-action-btn:hover {
  color: #A16207;
  border-color: #A16207;
}

.ecommerce-panel-result-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #E5E5E5;
  flex-shrink: 0;
  background: white;
}

.ecommerce-panel-result-footer-btn-primary {
  flex: 1;
  padding: 10px 16px;
  background: #171717;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.ecommerce-panel-result-footer-btn-primary:hover {
  background: #404040;
}

.ecommerce-panel-result-footer-btn-secondary {
  flex: 1;
  padding: 10px 16px;
  background: white;
  color: #525252;
  border: 1.5px solid #E5E5E5;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.ecommerce-panel-result-footer-btn-secondary:hover {
  border-color: #A16207;
  color: #A16207;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/content/styles/dropdown-styles.ts
git commit -m "feat: add ecommerce panel CSS classes for content script"
```

---

### Task 6: Add ecommerce CSS classes to sidepanel index.css

**Files:**
- Modify: `packages/extension/src/sidepanel/index.css`

- [ ] **Step 1: Add ecommerce CSS classes**

In `packages/extension/src/sidepanel/index.css`, append the following CSS classes at the end of the file (following the `agent-*` naming convention for sidepanel, but using `ecommerce-*` prefix for the new panel):

```css
/* Ecommerce Panel */
.ecommerce-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 16px;
  gap: 16px;
  overflow-y: auto;
  box-sizing: border-box;
}

.ecommerce-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ecommerce-label {
  font-size: 13px;
  font-weight: 500;
  color: #525252;
}

.ecommerce-image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.ecommerce-image-slot {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: 1.5px dashed #D4D4D4;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.15s;
}

.ecommerce-image-slot:hover {
  border-color: #A16207;
}

.ecommerce-image-slot.has-image {
  border-style: solid;
  border-color: #E5E5E5;
}

.ecommerce-upload-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #A3A3A3;
  font-size: 12px;
}

.ecommerce-image-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ecommerce-image-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  padding: 0;
  line-height: 1;
}

.ecommerce-select-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ecommerce-select-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ecommerce-select-label {
  font-size: 12px;
  color: #737373;
}

.ecommerce-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  font-size: 13px;
  color: #171717;
  background: white;
  cursor: pointer;
  outline: none;
  appearance: auto;
}

.ecommerce-select:focus {
  border-color: #A16207;
}

.ecommerce-textarea-section {
  position: relative;
}

.ecommerce-textarea {
  width: 100%;
  min-height: 88px;
  padding: 12px 14px;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.ecommerce-textarea:focus {
  border-color: #A16207;
}

.ecommerce-ai-write-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  background: white;
  font-size: 12px;
  color: #A16207;
  cursor: pointer;
  transition: all 0.15s;
}

.ecommerce-ai-write-btn:hover {
  background: #FFFBEB;
  border-color: #A16207;
}

.ecommerce-ai-write-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ecommerce-structure-row {
  display: flex;
  gap: 10px;
}

.ecommerce-structure-option {
  flex: 1;
  padding: 10px 14px;
  border: 1.5px solid #E5E5E5;
  border-radius: 8px;
  background: white;
  font-size: 13px;
  color: #525252;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}

.ecommerce-structure-option.active {
  border-color: #A16207;
  color: #A16207;
  background: #FFFBEB;
}

.ecommerce-generate-btn {
  width: 100%;
  padding: 12px 16px;
  background: #171717;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.ecommerce-generate-btn:hover {
  background: #404040;
}

.ecommerce-generate-btn:disabled {
  background: #D4D4D4;
  cursor: not-allowed;
}

.ecommerce-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: omp-spin 0.6s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

.ecommerce-error-banner {
  padding: 12px 14px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 8px;
  font-size: 13px;
  color: #B91C1C;
}

.ecommerce-result-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ecommerce-result-card {
  background: #f8f8f8;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  padding: 14px;
}

.ecommerce-result-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ecommerce-result-type-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  background: #FFFBEB;
  color: #A16207;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.ecommerce-result-text {
  font-size: 13px;
  line-height: 1.6;
  color: #404040;
  white-space: pre-wrap;
  word-break: break-word;
}

.ecommerce-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.ecommerce-result-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  cursor: pointer;
  color: #64748B;
  transition: all 0.15s;
  padding: 0;
}

.ecommerce-result-btn:hover {
  color: #A16207;
  border-color: #A16207;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/sidepanel/index.css
git commit -m "feat: add ecommerce view CSS classes for sidepanel"
```

---

### Task 7: Create EcommercePanel component (content script)

**Files:**
- Create: `packages/extension/src/content/components/EcommercePanel.tsx`

- [ ] **Step 1: Create the EcommercePanel component**

Create `packages/extension/src/content/components/EcommercePanel.tsx` with the following content. This follows the same patterns as `AgentPanel.tsx` — inline styles for Portal rendering, `showToast` from content script, `CategorySelectDialog` direct import, `AGENT_GENERATE` message to service worker.

```tsx
import React, { useState, useEffect, useRef } from 'react'
import type { AgentTemplateCategory, EcommercePlatform, EcommerceMarket, EcommerceLanguage, EcommerceAspectRatio, EcommerceConfig, EcommerceCustomCounts, EcommerceGenerateResult } from '@oh-my-prompt/shared/types'
import type { Category } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { showToast } from './ToastNotification'
import { CategorySelectDialog } from './CategorySelectDialog'
import ecommerceConfigData from '@/data/ecommerce-config.json'

interface EcommercePanelProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
}

const DEFAULT_CUSTOM_COUNTS: EcommerceCustomCounts = { whiteBg: 1, scene: 2, sellingPoint: 2, other: 2 }

export function EcommercePanel({ selectedTemplate, extractedText, categories, onSave }: EcommercePanelProps) {
  const [productImage, setProductImage] = useState<string | null>(null)
  const [productImageName, setProductImageName] = useState<string>('')
  const [platform, setPlatform] = useState<EcommercePlatform>('amazon')
  const [market, setMarket] = useState<EcommerceMarket>('china')
  const [language, setLanguage] = useState<EcommerceLanguage>('zh')
  const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>('1:1')
  const [sellingPoints, setSellingPoints] = useState('')
  const [setStructure, setSetStructure] = useState<'smart' | 'custom'>('smart')
  const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>(DEFAULT_CUSTOM_COUNTS)
  const [isAiWriting, setIsAiWriting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form')
  const [ecommerceResult, setEcommerceResult] = useState<EcommerceGenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savePromptIndex, setSavePromptIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (extractedText) {
      setSellingPoints(prev => prev || extractedText)
    }
  }, [extractedText])

  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS }, (response) => {
      if (response?.success) {
        const configs = response.data?.configs || []
        const activeId = response.data?.activeConfigId
        setHasConfig(configs.length > 0 && activeId !== null && activeId !== undefined)
      } else {
        setHasConfig(false)
      }
    })
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setProductImage(dataUrl)
      setProductImageName(file.name)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeImage = () => {
    setProductImage(null)
    setProductImageName('')
  }

  const handleAiWrite = async () => {
    if (!productImage) {
      showToast('请先上传商品图片')
      return
    }
    setIsAiWriting(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_ECOMMERCE_AI_WRITE,
        payload: {
          imageData: productImage,
          platform,
          language
        }
      })
      if (response?.success) {
        setSellingPoints(response.data || '')
        showToast('卖点生成成功')
      } else {
        showToast(response?.error || 'AI帮写失败')
      }
    } catch {
      showToast('AI帮写请求失败')
    } finally {
      setIsAiWriting(false)
    }
  }

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setEcommerceResult(null)

    const ecommerceConfig: EcommerceConfig = {
      platform,
      market,
      language,
      aspectRatio,
      sellingPoints,
      setStructure,
      ...(setStructure === 'custom' ? { customCounts } : {})
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_GENERATE,
        payload: {
          inputText: sellingPoints || '电商产品套图',
          productImage,
          templateCategory: 'ecommerce',
          ecommerceConfig
        }
      })
      if (response?.success) {
        const data = response.data
        if (data?.ecommercePrompts) {
          setEcommerceResult(data.ecommercePrompts)
          setViewMode('result')
        } else if (data?.prompt) {
          try {
            const parsed = JSON.parse(data.prompt)
            if (parsed.prompts) {
              setEcommerceResult(parsed as EcommerceGenerateResult)
              setViewMode('result')
            } else {
              setEcommerceResult({
                prompts: [{ type: '生成结果', typeEn: 'Result', prompt: data.prompt, aspectRatio }],
                templateCategory: 'ecommerce'
              })
              setViewMode('result')
            }
          } catch {
            setEcommerceResult({
              prompts: [{ type: '生成结果', typeEn: 'Result', prompt: data.prompt, aspectRatio }],
              templateCategory: 'ecommerce'
            })
            setViewMode('result')
          }
        }
      } else {
        const errMsg = response?.error || '生成失败'
        if (errMsg.startsWith('NO_CONFIG:')) {
          setError('请先配置API密钥')
        } else if (errMsg.startsWith('NOT_LOGGED_IN:')) {
          setError('请先登录')
        } else {
          setError(errMsg)
        }
      }
    } catch {
      setError('请求失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast('已复制'))
  }

  const copyAllPrompts = () => {
    if (!ecommerceResult) return
    const allText = ecommerceResult.prompts.map(p => p.prompt).join('\n\n')
    navigator.clipboard.writeText(allText).then(() => showToast('已复制全部提示词'))
  }

  const handleSavePrompt = (index: number) => {
    setSavePromptIndex(index)
    setShowSaveDialog(true)
  }

  const handleSaveConfirm = (categoryId: string) => {
    if (savePromptIndex !== null && ecommerceResult) {
      const prompt = ecommerceResult.prompts[savePromptIndex]
      onSave(prompt.prompt, categoryId, 'ecommerce')
    }
    setShowSaveDialog(false)
    setSavePromptIndex(null)
  }

  const handleBackToForm = () => {
    setViewMode('form')
  }

  const handleRegenerate = () => {
    setViewMode('form')
    // Auto-trigger generate after view switches back
    setTimeout(() => handleGenerate(), 0)
  }

  const updateCustomCount = (key: keyof EcommerceCustomCounts, delta: number) => {
    setCustomCounts(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min(10, prev[key] + delta))
    }))
  }

  const canGenerate = hasConfig && !isLoading && (productImage !== null || sellingPoints.trim())

  // Setup guide when no config
  if (hasConfig === false) {
    return (
      <div className="ecommerce-panel">
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#737373', fontSize: '13px' }}>
          <p style={{ marginBottom: '12px' }}>请先配置API以使用电商套图功能</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => window.open('https://oh-my-prompt.com', '_blank')}
              style={{ padding: '8px 16px', background: '#171717', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
            >
              登录官方服务
            </button>
            <button
              onClick={() => chrome.runtime.sendMessage({ type: MessageType.OPEN_SIDEPANEL })}
              style={{ padding: '8px 16px', background: 'white', color: '#171717', border: '1px solid #E5E5E5', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
            >
              配置第三方API
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Result view (full-screen replacement)
  if (viewMode === 'result' && ecommerceResult) {
    return (
      <div className="ecommerce-panel">
        {/* Result header */}
        <div className="ecommerce-panel-result-header">
          <button className="ecommerce-panel-back-btn" onClick={handleBackToForm}>
            ← 返回
          </button>
          <span className="ecommerce-panel-result-title">生成结果</span>
          <span className="ecommerce-panel-result-count">{ecommerceResult.prompts.length} 张</span>
        </div>

        {/* Result body - scrollable */}
        <div className="ecommerce-panel-result-body">
          <div className="ecommerce-panel-result-grid">
            {ecommerceResult.prompts.map((item, index) => (
              <div key={index} className="ecommerce-panel-result-card">
                <div className="ecommerce-panel-result-card-header">
                  <span className="ecommerce-panel-result-type-tag">{item.type}</span>
                </div>
                <div className="ecommerce-panel-result-text">{item.prompt}</div>
                <div className="ecommerce-panel-result-actions">
                  <button className="ecommerce-panel-action-btn" title="复制" onClick={() => copyToClipboard(item.prompt)}>📋</button>
                  <button className="ecommerce-panel-action-btn" title="保存" onClick={() => handleSavePrompt(index)}>💾</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Result footer - fixed bar */}
        <div className="ecommerce-panel-result-footer">
          <button className="ecommerce-panel-copy-all-btn" onClick={copyAllPrompts}>
            一键复制全部
          </button>
          <button className="ecommerce-panel-regenerate-btn" onClick={handleRegenerate}>
            重新生成
          </button>
        </div>

        {/* Save dialog */}
        {showSaveDialog && (
          <CategorySelectDialog
            categories={categories}
            isOpen={showSaveDialog}
            onClose={() => { setShowSaveDialog(false); setSavePromptIndex(null) }}
            onConfirm={handleSaveConfirm}
          />
        )}
      </div>
    )
  }

  // Form view
  return (
    <div className="ecommerce-panel">
      {/* 商品原图 - single upload */}
      <div className="ecommerce-panel-section">
        <div className="ecommerce-panel-label">商品原图</div>
        {productImage ? (
          <div className="ecommerce-panel-image-uploaded">
            <img src={productImage} className="ecommerce-panel-image-thumb" alt="" />
            <div className="ecommerce-panel-image-info">
              <span className="ecommerce-panel-image-filename">{productImageName}</span>
              <button className="ecommerce-panel-image-remove" onClick={removeImage}>✕</button>
            </div>
          </div>
        ) : (
          <div
            className="ecommerce-panel-image-upload-area"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="ecommerce-panel-upload-icon">
              <span style={{ fontSize: '20px' }}>+</span>
              <span>点击上传商品图片</span>
            </div>
          </div>
        )}
        <input
          ref={el => { fileInputRef.current = el }}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
      </div>

      {/* 生成设置 */}
      <div className="ecommerce-panel-section">
        <div className="ecommerce-panel-label">生成设置</div>
        <div className="ecommerce-panel-select-row">
          <div className="ecommerce-panel-select-wrapper">
            <div className="ecommerce-panel-select-label">平台</div>
            <select className="ecommerce-panel-select" value={platform} onChange={e => setPlatform(e.target.value as EcommercePlatform)}>
              {ecommerceConfigData.platforms.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="ecommerce-panel-select-wrapper">
            <div className="ecommerce-panel-select-label">市场</div>
            <select className="ecommerce-panel-select" value={market} onChange={e => setMarket(e.target.value as EcommerceMarket)}>
              {ecommerceConfigData.markets.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="ecommerce-panel-select-row">
          <div className="ecommerce-panel-select-wrapper">
            <div className="ecommerce-panel-select-label">语言</div>
            <select className="ecommerce-panel-select" value={language} onChange={e => setLanguage(e.target.value as EcommerceLanguage)}>
              {ecommerceConfigData.languages.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="ecommerce-panel-select-wrapper">
            <div className="ecommerce-panel-select-label">比例</div>
            <select className="ecommerce-panel-select" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as EcommerceAspectRatio)}>
              {ecommerceConfigData.aspectRatios.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 商品卖点&要求 */}
      <div className="ecommerce-panel-section">
        <div className="ecommerce-panel-label">商品卖点&要求</div>
        <div className="ecommerce-panel-textarea-section">
          <textarea
            className="ecommerce-panel-textarea"
            value={sellingPoints}
            onChange={e => setSellingPoints(e.target.value)}
            placeholder="描述商品卖点、特色功能、目标用户..."
          />
          <button
            className="ecommerce-panel-ai-write-btn"
            onClick={handleAiWrite}
            disabled={isAiWriting || !productImage}
          >
            {isAiWriting ? <span className="ecommerce-panel-spinner" /> : '💡'}
            AI帮写
          </button>
        </div>
      </div>

      {/* 套图结构配置 - expandable cards */}
      <div className="ecommerce-panel-section">
        <div className="ecommerce-panel-label">套图结构</div>
        <div className="ecommerce-panel-structure-cards">
          {/* 智能匹配 card */}
          <div
            className={`ecommerce-panel-structure-card ${setStructure === 'smart' ? 'active' : ''}`}
            onClick={() => setSetStructure('smart')}
          >
            <div className="ecommerce-panel-structure-card-header">
              <input
                type="checkbox"
                className="ecommerce-panel-structure-checkbox"
                checked={setStructure === 'smart'}
                onChange={() => setSetStructure('smart')}
                onClick={e => e.stopPropagation()}
              />
              <span className="ecommerce-panel-structure-card-title">智能匹配</span>
            </div>
            <div className="ecommerce-panel-structure-card-desc">
              AI根据平台规则自动选择最优图片类型组合
            </div>
          </div>

          {/* 自定义配置 card */}
          <div
            className={`ecommerce-panel-structure-card ${setStructure === 'custom' ? 'active' : ''}`}
            onClick={() => setSetStructure('custom')}
          >
            <div className="ecommerce-panel-structure-card-header">
              <input
                type="checkbox"
                className="ecommerce-panel-structure-checkbox"
                checked={setStructure === 'custom'}
                onChange={() => setSetStructure('custom')}
                onClick={e => e.stopPropagation()}
              />
              <span className="ecommerce-panel-structure-card-title">自定义配置</span>
            </div>
            <div className="ecommerce-panel-structure-card-desc">
              手动指定各类型图片数量
            </div>
            {/* Expanded counter rows */}
            {setStructure === 'custom' && (
              <div className="ecommerce-panel-counter-rows">
                <div className="ecommerce-panel-counter-row">
                  <div className="ecommerce-panel-counter-label-group">
                    <span className="ecommerce-panel-counter-label">白底图</span>
                    <span className="ecommerce-panel-counter-desc">纯白背景产品展示图</span>
                  </div>
                  <div className="ecommerce-panel-counter-controls">
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('whiteBg', -1) }}>−</button>
                    <span className="ecommerce-panel-counter-value">{customCounts.whiteBg}</span>
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('whiteBg', 1) }}>+</button>
                  </div>
                </div>
                <div className="ecommerce-panel-counter-row">
                  <div className="ecommerce-panel-counter-label-group">
                    <span className="ecommerce-panel-counter-label">场景图</span>
                    <span className="ecommerce-panel-counter-desc">产品使用场景展示图</span>
                  </div>
                  <div className="ecommerce-panel-counter-controls">
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('scene', -1) }}>−</button>
                    <span className="ecommerce-panel-counter-value">{customCounts.scene}</span>
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('scene', 1) }}>+</button>
                  </div>
                </div>
                <div className="ecommerce-panel-counter-row">
                  <div className="ecommerce-panel-counter-label-group">
                    <span className="ecommerce-panel-counter-label">卖点图</span>
                    <span className="ecommerce-panel-counter-desc">突出产品卖点特色图</span>
                  </div>
                  <div className="ecommerce-panel-counter-controls">
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('sellingPoint', -1) }}>−</button>
                    <span className="ecommerce-panel-counter-value">{customCounts.sellingPoint}</span>
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('sellingPoint', 1) }}>+</button>
                  </div>
                </div>
                <div className="ecommerce-panel-counter-row">
                  <div className="ecommerce-panel-counter-label-group">
                    <span className="ecommerce-panel-counter-label">其他</span>
                    <span className="ecommerce-panel-counter-desc">
                      AI智能匹配最优类型
                      <span className="ecommerce-panel-ai-tag">AI智能匹配</span>
                    </span>
                  </div>
                  <div className="ecommerce-panel-counter-controls">
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('other', -1) }}>−</button>
                    <span className="ecommerce-panel-counter-value">{customCounts.other}</span>
                    <button className="ecommerce-panel-counter-btn" onClick={e => { e.stopPropagation(); updateCustomCount('other', 1) }}>+</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 生成按钮 */}
      <button
        className="ecommerce-panel-generate-btn"
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {isLoading ? (
          <><span className="ecommerce-panel-spinner" /> 生成中...</>
        ) : (
          '一键生成电商套图'
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <div className="ecommerce-panel-error">
          {error}
          <button
            onClick={handleGenerate}
            style={{ marginLeft: '8px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
          >
            重试
          </button>
        </div>
      )}

      {/* 保存对话框 */}
      {showSaveDialog && (
        <CategorySelectDialog
          categories={categories}
          isOpen={showSaveDialog}
          onClose={() => { setShowSaveDialog(false); setSavePromptIndex(null) }}
          onConfirm={handleSaveConfirm}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to EcommercePanel

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/content/components/EcommercePanel.tsx
git commit -m "feat: create EcommercePanel component for content script"
```

---

### Task 8: Create EcommerceView component (sidepanel)

**Files:**
- Create: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: Create the EcommerceView component**

Create `packages/extension/src/sidepanel/views/EcommerceView.tsx`. This follows the same patterns as `AgentView.tsx` — CSS classes from `index.css`, `ToastNotification` React component, lazy-loaded `CategorySelectDialog`, extra `onOpenSettings` prop.

```tsx
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import type { AgentTemplateCategory, EcommercePlatform, EcommerceMarket, EcommerceLanguage, EcommerceAspectRatio, EcommerceConfig, EcommerceGenerateResult } from '@oh-my-prompt/shared/types'
import type { Category } from '@oh-my-prompt/shared/types'
import { MessageType } from '@oh-my-prompt/shared/messages'
import { ToastNotification } from '../components/ToastNotification'
import { Tooltip } from '@/content/components/Tooltip'
import ecommerceConfigData from '@/data/ecommerce-config.json'

const CategorySelectDialog = lazy(() => import('@/content/components/CategorySelectDialog').then(m => ({ default: m.CategorySelectDialog })))

interface EcommerceViewProps {
  selectedTemplate: AgentTemplateCategory
  extractedText?: string
  categories: Category[]
  onSave: (prompt: string, categoryId: string, templateCategory: AgentTemplateCategory) => void
  onOpenSettings?: () => void
}

export default function EcommerceView({ selectedTemplate, extractedText, categories, onSave, onOpenSettings }: EcommerceViewProps) {
  const [productImage, setProductImages] = useState<string[]>([])
  const [platform, setPlatform] = useState<EcommercePlatform>('amazon')
  const [market, setMarket] = useState<EcommerceMarket>('china')
  const [language, setLanguage] = useState<EcommerceLanguage>('zh')
  const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>('1:1')
  const [sellingPoints, setSellingPoints] = useState('')
  const [setStructure, setSetStructure] = useState<'smart' | 'custom'>('smart')
  const [isAiWriting, setIsAiWriting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<EcommerceGenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savePromptIndex, setSavePromptIndex] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null])

  useEffect(() => {
    if (extractedText) {
      setSellingPoints(prev => prev || extractedText)
    }
  }, [extractedText])

  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_PROVIDER_CONFIGS }, (response) => {
      if (response?.success) {
        const configs = response.data?.configs || []
        const activeId = response.data?.activeConfigId
        setHasConfig(configs.length > 0 && activeId !== null && activeId !== undefined)
      } else {
        setHasConfig(false)
      }
    })
  }, [])

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 2000)
  }

  const handleImageUpload = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setProductImages(prev => {
        const next = [...prev]
        while (next.length < index) next.push('')
        next[index] = dataUrl
        return next.filter(Boolean)
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleAiWrite = async () => {
    if (productImage.length === 0) {
      showToast('请先上传商品图片')
      return
    }
    setIsAiWriting(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_ECOMMERCE_AI_WRITE,
        payload: {
          imageData: productImage[0],
          platform,
          language
        }
      })
      if (response?.success) {
        setSellingPoints(response.data || '')
        showToast('卖点生成成功')
      } else {
        showToast(response?.error || 'AI帮写失败')
      }
    } catch {
      showToast('AI帮写请求失败')
    } finally {
      setIsAiWriting(false)
    }
  }

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    const ecommerceConfig: EcommerceConfig = {
      platform,
      market,
      language,
      aspectRatio,
      sellingPoints,
      setStructure
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AGENT_GENERATE,
        payload: {
          inputText: sellingPoints || '电商产品套图',
          productImage,
          templateCategory: 'ecommerce',
          ecommerceConfig
        }
      })
      if (response?.success) {
        const data = response.data
        if (data?.ecommercePrompts) {
          setResult(data.ecommercePrompts)
        } else if (data?.prompt) {
          try {
            const parsed = JSON.parse(data.prompt)
            if (parsed.prompts) {
              setResult(parsed as EcommerceGenerateResult)
            } else {
              setResult({
                prompts: [{ type: '生成结果', typeEn: 'Result', prompt: data.prompt, aspectRatio }],
                templateCategory: 'ecommerce'
              })
            }
          } catch {
            setResult({
              prompts: [{ type: '生成结果', typeEn: 'Result', prompt: data.prompt, aspectRatio }],
              templateCategory: 'ecommerce'
            })
          }
        }
      } else {
        const errMsg = response?.error || '生成失败'
        if (errMsg.startsWith('NO_CONFIG:')) {
          setError('请先配置API密钥')
        } else if (errMsg.startsWith('NOT_LOGGED_IN:')) {
          setError('请先登录')
        } else {
          setError(errMsg)
        }
      }
    } catch {
      setError('请求失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast('已复制'))
  }

  const handleSavePrompt = (index: number) => {
    setSavePromptIndex(index)
    setShowSaveDialog(true)
  }

  const handleSaveConfirm = (categoryId: string) => {
    if (savePromptIndex !== null && result) {
      const prompt = result.prompts[savePromptIndex]
      onSave(prompt.prompt, categoryId, 'ecommerce')
    }
    setShowSaveDialog(false)
    setSavePromptIndex(null)
  }

  const canGenerate = hasConfig && !isLoading && (productImage.length > 0 || sellingPoints.trim())

  if (hasConfig === false) {
    return (
      <div className="ecommerce-view">
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#737373', fontSize: '13px' }}>
          <p style={{ marginBottom: '16px' }}>请先配置API以使用电商套图功能</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => window.open('https://oh-my-prompt.com', '_blank')}
              style={{ padding: '10px 20px', background: '#171717', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              登录官方服务
            </button>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                style={{ padding: '10px 20px', background: 'white', color: '#171717', border: '1px solid #E5E5E5', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                配置第三方API
              </button>
            )}
          </div>
        </div>
        {toastMessage && <ToastNotification message={toastMessage} onClose={() => setToastMessage(null)} />}
      </div>
    )
  }

  return (
    <div className="ecommerce-view">
      {/* 商品原图 */}
      <div className="ecommerce-section">
        <div className="ecommerce-label">商品原图</div>
        <div className="ecommerce-image-grid">
          {[0, 1, 2].map(index => (
            <div key={index} className={`ecommerce-image-slot ${productImage[index] ? 'has-image' : ''}`}>
              {productImage[index] ? (
                <>
                  <img src={productImage[index]} className="ecommerce-image-thumb" alt="" />
                  <button className="ecommerce-image-remove" onClick={() => removeImage(index)}>✕</button>
                </>
              ) : (
                <label className="ecommerce-upload-icon" onClick={() => fileInputRefs.current[index]?.click()}>
                  <span style={{ fontSize: '20px' }}>+</span>
                  <span>{index === 0 ? '上传' : ''}</span>
                </label>
              )}
              <input
                ref={el => { fileInputRefs.current[index] = el }}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload(index)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 生成设置 */}
      <div className="ecommerce-section">
        <div className="ecommerce-label">生成设置</div>
        <div className="ecommerce-select-row">
          <div className="ecommerce-select-wrapper">
            <div className="ecommerce-select-label">平台</div>
            <select className="ecommerce-select" value={platform} onChange={e => setPlatform(e.target.value as EcommercePlatform)}>
              {ecommerceConfigData.platforms.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="ecommerce-select-wrapper">
            <div className="ecommerce-select-label">市场</div>
            <select className="ecommerce-select" value={market} onChange={e => setMarket(e.target.value as EcommerceMarket)}>
              {ecommerceConfigData.markets.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="ecommerce-select-row">
          <div className="ecommerce-select-wrapper">
            <div className="ecommerce-select-label">语言</div>
            <select className="ecommerce-select" value={language} onChange={e => setLanguage(e.target.value as EcommerceLanguage)}>
              {ecommerceConfigData.languages.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="ecommerce-select-wrapper">
            <div className="ecommerce-select-label">比例</div>
            <select className="ecommerce-select" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as EcommerceAspectRatio)}>
              {ecommerceConfigData.aspectRatios.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 商品卖点&要求 */}
      <div className="ecommerce-section">
        <div className="ecommerce-label">商品卖点&要求</div>
        <div className="ecommerce-textarea-section">
          <textarea
            className="ecommerce-textarea"
            value={sellingPoints}
            onChange={e => setSellingPoints(e.target.value)}
            placeholder="描述商品卖点、特色功能、目标用户..."
          />
          <button
            className="ecommerce-ai-write-btn"
            onClick={handleAiWrite}
            disabled={isAiWriting || productImage.length === 0}
          >
            {isAiWriting ? <span className="ecommerce-spinner" /> : '💡'}
            AI帮写
          </button>
        </div>
      </div>

      {/* 套图结构配置 */}
      <div className="ecommerce-section">
        <div className="ecommerce-label">套图结构</div>
        <div className="ecommerce-structure-row">
          <button
            className={`ecommerce-structure-option ${setStructure === 'smart' ? 'active' : ''}`}
            onClick={() => setSetStructure('smart')}
          >
            智能匹配
          </button>
          <button
            className={`ecommerce-structure-option ${setStructure === 'custom' ? 'active' : ''}`}
            onClick={() => setSetStructure('custom')}
          >
            自定义配置
          </button>
        </div>
      </div>

      {/* 生成按钮 */}
      <button
        className="ecommerce-generate-btn"
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {isLoading ? (
          <><span className="ecommerce-spinner" /> 生成中...</>
        ) : (
          '一键生成电商套图'
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <div className="ecommerce-error-banner">
          {error}
          <button
            onClick={handleGenerate}
            style={{ marginLeft: '8px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
          >
            重试
          </button>
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="ecommerce-section">
          <div className="ecommerce-label">生成结果 ({result.prompts.length}张)</div>
          <div className="ecommerce-result-grid">
            {result.prompts.map((item, index) => (
              <div key={index} className="ecommerce-result-card">
                <div className="ecommerce-result-card-header">
                  <span className="ecommerce-result-type-tag">{item.type}</span>
                  <span style={{ fontSize: '11px', color: '#A3A3A3' }}>{item.aspectRatio}</span>
                </div>
                <div className="ecommerce-result-text">{item.prompt}</div>
                <div className="ecommerce-result-actions">
                  <Tooltip content="复制提示词">
                    <button className="ecommerce-result-btn" onClick={() => copyToClipboard(item.prompt)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                  </Tooltip>
                  <Tooltip content="保存到分类">
                    <button className="ecommerce-result-btn" onClick={() => handleSavePrompt(index)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 保存对话框 */}
      {showSaveDialog && (
        <Suspense fallback={null}>
          <CategorySelectDialog
            categories={categories}
            isOpen={showSaveDialog}
            onClose={() => { setShowSaveDialog(false); setSavePromptIndex(null) }}
            onConfirm={handleSaveConfirm}
          />
        </Suspense>
      )}

      {/* Toast */}
      {toastMessage && <ToastNotification message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to EcommerceView

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "feat: create EcommerceView component for sidepanel"
```

---

### Task 9: Integrate EcommercePanel in DropdownContainer

**Files:**
- Modify: `packages/extension/src/content/components/DropdownContainer.tsx`

- [ ] **Step 1: Add import for EcommercePanel**

At the top of `DropdownContainer.tsx`, add the import alongside the existing `AgentPanel` import:

```typescript
import { EcommercePanel } from './EcommercePanel'
```

- [ ] **Step 2: Replace AgentPanel with conditional render**

Find the section where `AgentPanel` is rendered (when `agentViewMode === 'agent'`). Replace:

```tsx
<AgentPanel
  selectedTemplate={agentSelectedTemplate}
  extractedText={agentExtractedText}
  categories={categories}
  onSave={handleAgentSave}
/>
```

With:

```tsx
{agentSelectedTemplate === 'ecommerce' ? (
  <EcommercePanel
    selectedTemplate={agentSelectedTemplate}
    extractedText={agentExtractedText}
    categories={categories}
    onSave={handleAgentSave}
  />
) : (
  <AgentPanel
    selectedTemplate={agentSelectedTemplate}
    extractedText={agentExtractedText}
    categories={categories}
    onSave={handleAgentSave}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/content/components/DropdownContainer.tsx
git commit -m "feat: integrate EcommercePanel in DropdownContainer"
```

---

### Task 10: Integrate EcommerceView in PromptListView

**Files:**
- Modify: `packages/extension/src/sidepanel/views/PromptListView.tsx`

- [ ] **Step 1: Add import for EcommerceView**

At the top of `PromptListView.tsx`, add the import alongside the existing `AgentView` import:

```typescript
import EcommerceView from './EcommerceView'
```

- [ ] **Step 2: Replace AgentView with conditional render**

Find the section where `AgentView` is rendered (when `agentViewMode === 'agent'`). Replace:

```tsx
<AgentView
  selectedTemplate={agentSelectedTemplate}
  extractedText={agentExtractedText}
  categories={categories}
  onSave={handleAgentSave}
  onOpenSettings={onOpenSettings}
/>
```

With:

```tsx
{agentSelectedTemplate === 'ecommerce' ? (
  <EcommerceView
    selectedTemplate={agentSelectedTemplate}
    extractedText={agentExtractedText}
    categories={categories}
    onSave={handleAgentSave}
    onOpenSettings={onOpenSettings}
  />
) : (
  <AgentView
    selectedTemplate={agentSelectedTemplate}
    extractedText={agentExtractedText}
    categories={categories}
    onSave={handleAgentSave}
    onOpenSettings={onOpenSettings}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/sidepanel/views/PromptListView.tsx
git commit -m "feat: integrate EcommerceView in PromptListView"
```

---

### Task 11: Update agent-api.ts for ecommerce support

**Files:**
- Modify: `packages/extension/src/lib/agent-api.ts`

- [ ] **Step 1: Add imports for ecommerce types**

At the top of `agent-api.ts`, add to the existing imports from shared types:

```typescript
import type { EcommerceConfig, EcommerceGenerateResult } from '@oh-my-prompt/shared/types'
```

And add import for the new prompt builder:

```typescript
import { buildEcommerceSystemPrompt } from './agent-templates'
```

- [ ] **Step 2: Modify executeAgentApiCallWithProviderConfig to handle ecommerce**

Find the `executeAgentApiCallWithProviderConfig` function. After the line that calls `buildAgentSystemPrompt`, add ecommerce-specific logic:

Replace the existing system prompt construction:

```typescript
const systemPrompt = buildAgentSystemPrompt(payload.templateCategory, !!payload.imageData)
```

With:

```typescript
const isEcommerce = payload.templateCategory === 'ecommerce' && payload.ecommerceConfig
const systemPrompt = isEcommerce
  ? buildEcommerceSystemPrompt(payload.ecommerceConfig!!, !!(payload.productImage || payload.imageData))
  : buildAgentSystemPrompt(payload.templateCategory, !!payload.imageData)
```

- [ ] **Step 3: Handle single product image in API request**

Find the section where the user message content is constructed (the `content` array for Anthropic format or the message for OpenAI format). Add support for `productImage` alongside the existing single `imageData`.

For the `anthropic_messages` format, find where `imageData` is added to the content array and add `productImage` before it:

```typescript
// Add single product image for ecommerce before single imageData
if (payload.productImage) {
  const base64Data = extractBase64Data(payload.productImage)
  if (base64Data) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64Data }
    })
  }
}
// Keep existing single imageData support
if (payload.imageData) {
  const base64Data = extractBase64Data(payload.imageData)
  if (base64Data) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64Data }
    })
  }
}
```

For the `chat_completions` format, similarly add `productImage` before `imageData`:

```typescript
// Add single product image for ecommerce
if (payload.productImage) {
  content.push({
    type: 'image_url',
    image_url: { url: payload.productImage }
  })
}
// Keep existing single imageData support
if (payload.imageData) {
  content.push({
    type: 'image_url',
    image_url: { url: payload.imageData }
  })
}
```

- [ ] **Step 4: Parse ecommerce JSON result**

Find where the result is constructed after the API response. After the existing `prompt` extraction, add ecommerce result parsing:

```typescript
// Parse ecommerce structured result
let ecommercePrompts: EcommerceGenerateResult | undefined
if (isEcommerce) {
  try {
    // Try to extract JSON from the response text
    const jsonMatch = promptText.match(/\{[\s\S]*"prompts"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.prompts && Array.isArray(parsed.prompts)) {
        ecommercePrompts = {
          prompts: parsed.prompts,
          templateCategory: 'ecommerce'
        }
      }
    }
  } catch {
    // JSON parsing failed, return as plain text result
  }
}
```

Then in the return object, add the `ecommercePrompts` field:

```typescript
return {
  prompt: promptText,
  templateCategory: payload.templateCategory,
  ecommercePrompts
}
```

- [ ] **Step 5: Update the omp_official format handler**

Find the `executeOfficialAgentApiCall` function. Update the request body to include `ecommerceConfig` and `productImage`:

In the `fetch` call body, after `templateCategory`, add:

```typescript
...(payload.ecommerceConfig && { ecommerceConfig: payload.ecommerceConfig }),
...(payload.productImage && { productImage: payload.productImage }),
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/lib/agent-api.ts
git commit -m "feat: add ecommerce config and multi-image support to agent API"
```

---

### Task 12: Add handleEcommerceAiWrite to agent-handler.ts

**Files:**
- Modify: `packages/extension/src/background/agent-handler.ts`

- [ ] **Step 1: Add imports**

Add imports at the top of `agent-handler.ts`:

```typescript
import { buildEcommerceAiWritePrompt } from '../lib/agent-templates'
import type { EcommercePlatform, EcommerceLanguage } from '@oh-my-prompt/shared/types'
```

- [ ] **Step 2: Add handleEcommerceAiWrite function**

Add the following function after the existing `handleAgentGenerate` function:

```typescript
export async function handleEcommerceAiWrite(
  payload: { imageData: string; platform: EcommercePlatform; language: EcommerceLanguage },
  sendResponse: (response: MessageResponse<string>) => void
): Promise<boolean> {
  try {
    const { imageData, platform, language } = payload

    // Read provider config directly from storage (SW cannot message itself)
    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
    const activeConfig = storage?.configs?.find(c => c.id === storage.activeConfigId)

    if (!activeConfig) {
      sendResponse({ success: false, error: 'NO_CONFIG: 未配置API密钥' })
      return true
    }

    const systemPrompt = buildEcommerceAiWritePrompt(platform, language)

    // Build a minimal agent payload for the AI write call
    const aiWritePayload: AgentGeneratePayload = {
      inputText: '请根据商品图片生成卖点描述',
      imageData,
      templateCategory: 'ecommerce'
    }

    // Temporarily override system prompt by calling API directly
    const apiResult = await executeAgentApiCallWithProviderConfig(
      aiWritePayload,
      undefined,
      activeConfig
    )

    sendResponse({ success: true, data: apiResult.prompt })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'AI帮写失败'
    sendResponse({ success: false, error: errorMessage })
  }
  return true
}
```

Note: The `buildEcommerceAiWritePrompt` system prompt needs to be used instead of the default agent system prompt. Since `executeAgentApiCallWithProviderConfig` uses `buildAgentSystemPrompt` internally, we need to modify the approach. Instead, we'll construct the API call directly in this handler.

Replace the above function with a version that constructs the API call directly:

```typescript
export async function handleEcommerceAiWrite(
  payload: { imageData: string; platform: EcommercePlatform; language: EcommerceLanguage },
  sendResponse: (response: MessageResponse<string>) => void
): Promise<boolean> {
  try {
    const { imageData, platform, language } = payload

    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
    const activeConfig = storage?.configs?.find(c => c.id === storage.activeConfigId)

    if (!activeConfig) {
      sendResponse({ success: false, error: 'NO_CONFIG: 未配置API密钥' })
      return true
    }

    const systemPrompt = buildEcommerceAiWritePrompt(platform, language)
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData

    let requestBody: Record<string, unknown>
    let headers: Record<string, string>

    if (activeConfig.apiFormat === 'anthropic_messages') {
      const content: Array<Record<string, unknown>> = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
        { type: 'text', text: '请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': activeConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    } else {
      // chat_completions format
      const content: Array<Record<string, unknown>> = [
        { type: 'image_url', image_url: { url: imageData } },
        { type: 'text', text: systemPrompt + '\n\n请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'gpt-4o',
        max_tokens: 1024,
        messages: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeConfig.apiKey}`
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000)

    const response = await fetch(activeConfig.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }

    const data = await response.json()
    let text: string

    if (activeConfig.apiFormat === 'anthropic_messages') {
      text = data.content?.[0]?.text || ''
    } else {
      text = data.choices?.[0]?.message?.content || ''
    }

    sendResponse({ success: true, data: text })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.message : 'AI帮写失败'
    sendResponse({ success: false, error: errorMessage })
  }
  return true
}
```

Wait — there's a typo in the error catch. Fix it: `error.message.message` should be `error.message`. Also need to handle the `omp_official` format. Let me correct:

```typescript
export async function handleEcommerceAiWrite(
  payload: { imageData: string; platform: EcommercePlatform; language: EcommerceLanguage },
  sendResponse: (response: MessageResponse<string>) => void
): Promise<boolean> {
  try {
    const { imageData, platform, language } = payload

    const result = await chrome.storage.local.get(PROVIDER_CONFIGS_STORAGE_KEY)
    const storage = result[PROVIDER_CONFIGS_STORAGE_KEY] as ProviderConfigsStorage | undefined
    const activeConfig = storage?.configs?.find(c => c.id === storage.activeConfigId)

    if (!activeConfig) {
      sendResponse({ success: false, error: 'NO_CONFIG: 未配置API密钥' })
      return true
    }

    // For omp_official format, use the official API
    if (activeConfig.apiFormat === 'omp_official') {
      const sessionResult = await chrome.storage.local.get('supabase_session')
      const session = sessionResult.supabase_session
      if (!session?.access_token) {
        sendResponse({ success: false, error: 'NOT_LOGGED_IN: 请先登录' })
        return true
      }

      const systemPrompt = buildEcommerceAiWritePrompt(platform, language)
      const response = await fetch(`${OMP_API_BASE}/api/vision/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          mode: 'agent',
          inputText: '请根据商品图片生成卖点描述',
          imageData,
          templateCategory: 'ecommerce',
          ecommerceAiWrite: true,
          ecommercePlatform: platform,
          ecommerceLanguage: language
        })
      })

      const data = await response.json()
      if (!data.success) {
        sendResponse({ success: false, error: data.error || 'AI帮写失败' })
        return true
      }

      sendResponse({ success: true, data: data.data?.prompt || '' })
      return true
    }

    // For third-party APIs, construct the call directly
    const systemPrompt = buildEcommerceAiWritePrompt(platform, language)
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData

    let requestBody: Record<string, unknown>
    let headers: Record<string, string>

    if (activeConfig.apiFormat === 'anthropic_messages') {
      const content: Array<Record<string, unknown>> = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
        { type: 'text', text: '请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': activeConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    } else {
      // chat_completions format
      const content: Array<Record<string, unknown>> = [
        { type: 'image_url', image_url: { url: imageData } },
        { type: 'text', text: systemPrompt + '\n\n请根据商品图片生成卖点描述' }
      ]
      requestBody = {
        model: activeConfig.selectedModel || 'gpt-4o',
        max_tokens: 1024,
        messages: [{ role: 'user', content }]
      }
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeConfig.apiKey}`
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000)

    const response = await fetch(activeConfig.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }

    const data = await response.json()
    let text: string

    if (activeConfig.apiFormat === 'anthropic_messages') {
      text = data.content?.[0]?.text || ''
    } else {
      text = data.choices?.[0]?.message?.content || ''
    }

    sendResponse({ success: true, data: text })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'AI帮写失败'
    sendResponse({ success: false, error: errorMessage })
  }
  return true
}
```

Note: You need to check the existing `agent-handler.ts` for the `OMP_API_BASE` constant and `PROVIDER_CONFIGS_STORAGE_KEY` import — they should already be available. Also check for the `ProviderConfigsStorage` type import.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background/agent-handler.ts
git commit -m "feat: add handleEcommerceAiWrite for AI selling points generation"
```

---

### Task 13: Route AGENT_ECOMMERCE_AI_WRITE in service-worker.ts

**Files:**
- Modify: `packages/extension/src/background/service-worker.ts`

- [ ] **Step 1: Add import**

At the top of `service-worker.ts`, add the import for the new handler (alongside the existing `handleAgentGenerate` import):

```typescript
import { handleAgentGenerate, handleEcommerceAiWrite } from './agent-handler'
```

- [ ] **Step 2: Add message routing case**

Find the `switch` statement on `message.type` in the `chrome.runtime.onMessage.addListener` callback. After the existing `AGENT_GENERATE` case, add:

```typescript
case MessageType.AGENT_ECOMMERCE_AI_WRITE:
  handleEcommerceAiWrite(message.payload as { imageData: string; platform: EcommercePlatform; language: EcommerceLanguage }, sendResponse)
  return true
```

You'll also need to import the types at the top:

```typescript
import type { EcommercePlatform, EcommerceLanguage } from '@oh-my-prompt/shared/types'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/background/service-worker.ts
git commit -m "feat: route AGENT_ECOMMERCE_AI_WRITE in service worker"
```

---

### Task 14: Update web-app vision-proxy.ts for ecommerce support

**Files:**
- Modify: `packages/web-app/lib/vision-proxy.ts`

- [ ] **Step 1: Add ecommerce system prompt builder**

Add the `buildEcommerceSystemPrompt` function and `buildEcommerceAiWritePrompt` function to `vision-proxy.ts`. These mirror the extension-side implementations. Add them after the existing `buildAgentSystemPrompt` function:

```typescript
function getPlatformRules(platform: string): string {
  const rules: Record<string, string> = {
    amazon: '主图必须纯白背景（RGB 255,255,255），产品占画面85%以上面积，禁止水印、文字、Logo。副图可展示使用场景、尺寸对比、功能细节。建议7张图。',
    taobao: '白底或浅色渐变背景主图，促销文字不超过20%面积，建议5张图。副图突出卖点、细节、场景。',
    jd: '白底主图，产品居中，允许品牌Logo水印。副图展示功能、细节、场景。建议5-8张图。',
    pinduoduo: '突出产品主体，背景简洁，强调性价比。主图可加促销标签。建议5-10张图。',
    temu: '白底或场景图，英文标注为主，面向海外消费者。主图简洁突出产品。建议6-8张图。',
    shein: '时尚感强，场景图为主，模特展示优先。风格年轻化，色彩鲜明。建议6-8张图。'
  }
  return rules[platform] || rules.amazon
}

function buildEcommerceSystemPrompt(
  config: {
    platform: string
    market: string
    language: string
    aspectRatio: string
    sellingPoints: string
    setStructure: string
  },
  hasProductImages: boolean
): string {
  const platformRules = getPlatformRules(config.platform)
  const marketNames: Record<string, string> = {
    china: '中国', usa: '美国', europe: '欧洲', japan: '日本', southeast_asia: '东南亚'
  }
  const languageNames: Record<string, string> = {
    zh: '中文', en: '英文', ja: '日文'
  }

  const imageInstruction = hasProductImages
    ? '用户提供了商品参考图片，请仔细分析图片中的商品外观、颜色、材质、形状等特征，确保生成的提示词准确描述商品。'
    : ''

  const sellingPointsSection = config.sellingPoints?.trim()
    ? `\n## 商品卖点\n${config.sellingPoints.trim()}\n请在提示词中自然融入以上卖点。`
    : ''

  const structureInstruction = config.setStructure === 'smart'
    ? '请根据平台规则和商品类型，智能决定最优的图片类型组合（通常5-7张），确保覆盖主图、场景图、细节图、卖点图等关键类型。'
    : '请生成以下固定类型的图片提示词：主图、场景图、细节图、卖点图、对比图、氛围图、品牌图。'

  return `你是电商套图提示词专家。根据用户提供的商品信息${hasProductImages ? '和参考图片' : ''}，生成一套完整的电商产品展示图片提示词。

## 平台要求
当前平台：${config.platform}
${platformRules}

## 目标市场
${marketNames[config.market] || config.market}市场，请遵循该市场的消费者偏好和审美习惯。

## 输出语言
所有提示词使用${languageNames[config.language] || config.language}输出。图片类型标签同时提供中文和英文。

## 图片比例
所有图片比例为 ${config.aspectRatio}。
${imageInstruction}
${sellingPointsSection}

## 套图结构
${structureInstruction}

## 输出格式
请严格以JSON格式输出，不要包含任何其他文字：
{
  "prompts": [
    { "type": "图片类型（中文）", "typeEn": "Image type (English)", "prompt": "详细的图片生成提示词", "aspectRatio": "${config.aspectRatio}" }
  ]
}`
}

function buildEcommerceAiWritePrompt(platform: string, language: string): string {
  const languageNames: Record<string, string> = {
    zh: '中文', en: '英文', ja: '日文'
  }
  return `你是电商商品卖点撰写专家。请根据提供的商品图片，生成3-5条简洁有力的商品卖点描述。

要求：
1. 每条卖点一行，不要编号
2. 使用${languageNames[language] || '中文'}
3. 适合${platform}平台的风格
4. 突出产品核心优势和差异化卖点
5. 语言简洁有力，每条不超过30字

请直接输出卖点，不要包含任何其他文字。`
}
```

- [ ] **Step 2: Update callThirdPartyAgentApi signature and logic**

Update the `callThirdPartyAgentApi` function signature to accept ecommerce config:

```typescript
export async function callThirdPartyAgentApi(
  inputText: string,
  imageData?: string,
  templateCategory?: string,
  ecommerceConfig?: {
    platform: string
    market: string
    language: string
    aspectRatio: string
    sellingPoints: string
    setStructure: string
  },
  productImage?: string,
  ecommerceAiWrite?: boolean,
  ecommercePlatform?: string,
  ecommerceLanguage?: string
): Promise<string>
```

In the function body, replace the system prompt construction:

```typescript
// Handle ecommerce AI write mode
if (ecommerceAiWrite) {
  const systemPrompt = buildEcommerceAiWritePrompt(ecommercePlatform || 'amazon', ecommerceLanguage || 'zh')
  // Build request with this system prompt instead
  const request = buildAgentRequest(API_FORMAT, API_MODEL, inputText, imageData, templateCategory)
  // Override the system prompt in the request
  if (API_FORMAT === 'anthropic_messages') {
    request.system = systemPrompt
  } else {
    // For chat_completions, the system prompt is prepended to the user message
    const userMsg = request.messages?.[0]?.content
    if (typeof userMsg === 'string') {
      request.messages[0].content = systemPrompt + '\n\n' + userMsg
    }
  }
  // ... rest of the fetch logic stays the same
}
```

And for the main ecommerce generation:

```typescript
// Use ecommerce system prompt if config is provided
const isEcommerce = templateCategory === 'ecommerce' && ecommerceConfig
const hasImages = !!(imageData || productImage)
const systemPrompt = isEcommerce
  ? buildEcommerceSystemPrompt(ecommerceConfig!, hasImages)
  : buildAgentSystemPrompt(templateCategory || 'ecommerce', !!imageData)
```

Then update `buildAgentRequest` to handle multiple product images. For Anthropic format, add each product image as a separate image content block before the text. For OpenAI format, add each as an `image_url` content block.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/lib/vision-proxy.ts
git commit -m "feat: add ecommerce system prompt builders to web-app vision proxy"
```

---

### Task 15: Update web-app API route for ecommerce fields

**Files:**
- Modify: `packages/web-app/app/api/vision/generate/route.ts`

- [ ] **Step 1: Extend request body type**

Update the inline body type to include ecommerce fields:

```typescript
let body: {
  image?: string
  mode?: string
  inputText?: string
  imageData?: string
  templateCategory?: string
  ecommerceConfig?: {
    platform: string
    market: string
    language: string
    aspectRatio: string
    sellingPoints: string
    setStructure: string
  }
  productImage?: string
  ecommerceAiWrite?: boolean
  ecommercePlatform?: string
  ecommerceLanguage?: string
}
```

- [ ] **Step 2: Pass ecommerce fields to callThirdPartyAgentApi**

Find the line that calls `callThirdPartyAgentApi` in the agent mode section. Update it from:

```typescript
const prompt = await callThirdPartyAgentApi(body.inputText!, body.imageData, body.templateCategory)
```

To:

```typescript
const prompt = await callThirdPartyAgentApi(
  body.inputText!,
  body.imageData,
  body.templateCategory,
  body.ecommerceConfig,
  body.productImage,
  body.ecommerceAiWrite,
  body.ecommercePlatform,
  body.ecommerceLanguage
)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/api/vision/generate/route.ts
git commit -m "feat: accept ecommerce config and product images in web-app API"
```

---

### Task 16: End-to-end verification

**Files:**
- No file changes

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run dev build**

Run: `npm run dev`
Expected: Build succeeds without errors

- [ ] **Step 3: Manual smoke test**

1. Load extension from `packages/extension/dist/` in Chrome
2. Navigate to a supported platform
3. Open dropdown → click "Agent" → verify "电商套图" is selected by default
4. Verify EcommercePanel renders with all sections (image upload, selects, textarea, structure toggle, generate button)
5. Upload 1-3 product images → verify grid updates
6. Change platform/market/language/ratio → verify dropdowns update
7. Click "AI帮写" (with image uploaded) → verify selling points are generated
8. Click generate → verify structured result cards appear
9. Copy a prompt → verify clipboard
10. Save a prompt → verify category dialog appears
11. Open sidepanel → repeat steps 3-10 for EcommerceView

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
