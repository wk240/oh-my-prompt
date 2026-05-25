# Sidepanel EcommerceView 对齐实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Sidepanel EcommerceView 完全对齐 ContentScript EcommercePanel 的样式和功能

**Architecture:** 重构 EcommerceView.tsx，从 3图网格改为单图上传，从按钮切换改为卡片式结构选择，添加计数器 UI，从内嵌结果改为全屏结果视图，添加插入按钮

**Tech Stack:** React, TypeScript, CSS (index.css), Lucide icons

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/extension/src/sidepanel/views/EcommerceView.tsx` | 重构 | 主要改动文件 |
| `packages/extension/src/sidepanel/index.css` | 修改 | 新增 ecommerce-panel-* CSS 类名 |
| `packages/shared/types/agent.ts` | 无需改动 | EcommerceCustomCounts 已定义 |

---

### Task 1: 新增 CSS 类名（单图上传 + 卡片结构 + 计数器 + 结果视图）

**Files:**
- Modify: `packages/extension/src/sidepanel/index.css`

- [ ] **Step 1: 在 index.css 末尾添加新 CSS 类名**

```css
/* Ecommerce Panel Styles (aligned with ContentScript EcommercePanel) */

/* 单图上传区域 */
.ecommerce-panel-upload-area {
  width: 100%;
  min-height: 100px;
  border: 1.5px dashed #D4D4D4;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s;
  position: relative;
}

.ecommerce-panel-upload-area:hover {
  border-color: #7C3AED;
}

.ecommerce-panel-upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #64748B;
  font-size: 12px;
}

.ecommerce-panel-upload-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #F9FAFB;
  border-radius: 8px;
  width: 100%;
}

.ecommerce-panel-upload-thumb {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
}

.ecommerce-panel-upload-info {
  flex: 1;
  font-size: 12px;
  color: #171717;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ecommerce-panel-upload-remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FEE2E2;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #DC2626;
}

.ecommerce-panel-upload-remove:hover {
  background: #FECACA;
}

/* 套图结构卡片 */
.ecommerce-panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ecommerce-panel-label {
  font-size: 12px;
  font-weight: 500;
  color: #171717;
}

.ecommerce-panel-select-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
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
  padding: 10px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 12px;
  color: #171717;
  background: white;
  cursor: pointer;
  outline: none;
  appearance: auto;
}

.ecommerce-panel-select:focus {
  border-color: #7C3AED;
}

.ecommerce-panel-textarea-section {
  position: relative;
}

.ecommerce-panel-textarea {
  width: 100%;
  min-height: 88px;
  padding: 12px 14px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.ecommerce-panel-textarea:focus {
  border-color: #7C3AED;
}

.ecommerce-panel-ai-write-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  background: white;
  font-size: 12px;
  color: #7C3AED;
  cursor: pointer;
  transition: all 0.15s;
}

.ecommerce-panel-ai-write-btn:hover {
  background: #F3E8FF;
  border-color: #7C3AED;
}

.ecommerce-panel-ai-write-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 结构选择卡片 */
.ecommerce-panel-structure-card {
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 12px;
  background: white;
  cursor: pointer;
  transition: border-color 0.15s;
}

.ecommerce-panel-structure-card:hover {
  border-color: #D4D4D4;
}

.ecommerce-panel-structure-card.active {
  border: 2px solid #7C3AED;
  background: #F9FAFB;
}

.ecommerce-panel-structure-card-header {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.ecommerce-panel-structure-card-checkbox {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #E5E7EB;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: transparent;
  flex-shrink: 0;
}

.ecommerce-panel-structure-card-checkbox.checked {
  background: #7C3AED;
  border-color: #7C3AED;
  color: white;
}

.ecommerce-panel-structure-card-title {
  font-size: 13px;
  font-weight: 500;
  color: #171717;
}

.ecommerce-panel-structure-card-desc {
  font-size: 11px;
  color: #64748B;
  margin-top: 2px;
}

.ecommerce-panel-structure-card-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #E5E7EB;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 计数器 */
.ecommerce-panel-counter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ecommerce-panel-counter-label {
  font-size: 12px;
  font-weight: 500;
  color: #171717;
  min-width: 50px;
}

.ecommerce-panel-counter-desc {
  font-size: 11px;
  color: #64748B;
  flex: 1;
}

.ecommerce-panel-counter-ai-tag {
  padding: 2px 6px;
  background: #F3E8FF;
  color: #7C3AED;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.ecommerce-panel-counter-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.ecommerce-panel-counter-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E5E7EB;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  color: #171717;
}

.ecommerce-panel-counter-btn:hover:not(:disabled) {
  background: #F3E8FF;
  border-color: #7C3AED;
}

.ecommerce-panel-counter-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ecommerce-panel-counter-value {
  font-size: 13px;
  font-weight: 500;
  color: #171717;
  min-width: 20px;
  text-align: center;
}

/* 生成按钮 */
.ecommerce-panel-generate-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: #7C3AED;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.ecommerce-panel-generate-btn:hover:not(:disabled) {
  background: #6D28D9;
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
}

/* 错误提示 */
.ecommerce-panel-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 8px;
  font-size: 12px;
  color: #B91C1C;
}

/* 结果视图 */
.ecommerce-panel-result-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: white;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.ecommerce-panel-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #E5E7EB;
  background: white;
}

.ecommerce-panel-result-back-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #171717;
}

.ecommerce-panel-result-back-btn:hover {
  background: #F3E8FF;
  color: #7C3AED;
}

.ecommerce-panel-result-title {
  font-size: 14px;
  font-weight: 600;
  color: #171717;
}

.ecommerce-panel-result-count {
  font-size: 12px;
  color: #64748B;
  margin-left: auto;
}

.ecommerce-panel-result-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ecommerce-panel-result-card {
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 14px;
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
  padding: 3px 10px;
  background: #F3E8FF;
  color: #7C3AED;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.ecommerce-panel-result-text {
  font-size: 13px;
  line-height: 1.6;
  color: #404040;
  white-space: pre-wrap;
  word-break: break-word;
}

.ecommerce-panel-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.ecommerce-panel-action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  cursor: pointer;
  color: #64748B;
  transition: all 0.15s;
}

.ecommerce-panel-action-btn:hover {
  color: #7C3AED;
  border-color: #7C3AED;
}

.ecommerce-panel-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ecommerce-panel-insert-btn {
  color: #7C3AED;
}

.ecommerce-panel-result-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid #E5E7EB;
  background: white;
}

.ecommerce-panel-result-footer-btn-primary {
  flex: 1;
  padding: 10px 16px;
  background: #7C3AED;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.ecommerce-panel-result-footer-btn-primary:hover:not(:disabled) {
  background: #6D28D9;
}

.ecommerce-panel-result-footer-btn-primary:disabled {
  background: #D4D4D4;
  cursor: not-allowed;
}

.ecommerce-panel-result-footer-btn-secondary {
  flex: 1;
  padding: 10px 16px;
  background: white;
  color: #171717;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.ecommerce-panel-result-footer-btn-secondary:hover {
  background: #F9FAFB;
}
```

- [ ] **Step 2: Commit CSS changes**

```bash
git add packages/extension/src/sidepanel/index.css
git commit -m "style: add ecommerce-panel CSS classes for EcommerceView alignment"
```

---

### Task 2: 重构 EcommerceView 状态管理

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 移除旧状态，添加新状态**

找到状态定义区域（约 line 63-83），替换为：

```typescript
// Form state
const [productImage, setProductImage] = useState<string | null>(null)
const [productImageName, setProductImageName] = useState('')
const [platform, setPlatform] = useState<EcommercePlatform>('amazon')
const [market, setMarket] = useState<EcommerceMarket>('china')
const [language, setLanguage] = useState<EcommerceLanguage>('zh')
const [aspectRatio, setAspectRatio] = useState<EcommerceAspectRatio>('1:1')
const [sellingPoints, setSellingPoints] = useState('')
const [setStructure, setSetStructure] = useState<'smart' | 'custom'>('smart')
const [customCounts, setCustomCounts] = useState<EcommerceCustomCounts>({
  whiteBg: 1,
  scene: 2,
  sellingPoint: 2,
  other: 2,
})

// UI state
const [isAiWriting, setIsAiWriting] = useState(false)
const [isLoading, setIsLoading] = useState(false)
const [viewMode, setViewMode] = useState<'form' | 'result'>('form')
const [result, setResult] = useState<EcommerceGenerateResult | null>(null)
const [error, setError] = useState<string | null>(null)
const [errorAction, setErrorAction] = useState<'settings' | null>(null)
const [hasConfig, setHasConfig] = useState<boolean | null>(null)
const [showSaveDialog, setShowSaveDialog] = useState(false)
const [savePromptIndex, setSavePromptIndex] = useState<number | null>(null)
const [toastMessage, setToastMessage] = useState<string | null>(null)

// Refs
const fileInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: 移除 MAX_IMAGES 常量和 fileInputRefs**

删除以下代码：
- `const MAX_IMAGES = 3` (约 line 53)
- `const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null])` (约 line 83)

- [ ] **Step 3: Commit state changes**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "refactor: update EcommerceView state management for alignment"
```

---

### Task 3: 重构图片上传处理函数

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 替换 handleImageUpload 函数**

找到 `handleImageUpload` 函数（约 line 133-164），替换为：

```typescript
// Handle product image upload
const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    showToast('请上传图片文件')
    return
  }

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024
  if (file.size > MAX_IMAGE_SIZE) {
    showToast('图片大小不能超过 5MB')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    setProductImage(e.target?.result as string)
    setProductImageName(file.name)
  }
  reader.onerror = () => showToast('图片读取失败')
  reader.readAsDataURL(file)
}, [showToast])

const handleRemoveImage = useCallback(() => {
  setProductImage(null)
  setProductImageName('')
  if (fileInputRef.current) {
    fileInputRef.current.value = ''
  }
}, [])
```

- [ ] **Step 2: 更新 handleAiWrite 函数使用 productImage**

找到 `handleAiWrite` 函数（约 line 179-206），将 `productImages[0]` 改为 `productImage`：

```typescript
const handleAiWrite = useCallback(async () => {
  if (isAiWriting || !productImage) return
  setIsAiWriting(true)
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.AGENT_ECOMMERCE_AI_WRITE,
      payload: {
        imageData: productImage,
        platform,
        language,
      },
    })
    // ... rest unchanged
  }
}, [isAiWriting, productImage, platform, language, showToast])
```

- [ ] **Step 3: Commit image upload changes**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "refactor: replace 3-image grid with single image upload in EcommerceView"
```

---

### Task 4: 添加计数器调整函数

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 在 handleAiWrite 之后添加 adjustCount 函数**

```typescript
// Custom counts adjustment
const adjustCount = useCallback((key: keyof EcommerceCustomCounts, delta: number) => {
  setCustomCounts(prev => ({
    ...prev,
    [key]: Math.max(0, Math.min(10, prev[key] + delta)),
  }))
}, [])
```

- [ ] **Step 2: 添加 counterRows 配置**

```typescript
// Counter row configuration
const counterRows: Array<{ key: keyof EcommerceCustomCounts; label: string; desc: string; aiTag?: boolean }> = [
  { key: 'whiteBg', label: '白底图', desc: '纯白背景商品图' },
  { key: 'scene', label: '场景图', desc: '生活场景展示', aiTag: true },
  { key: 'sellingPoint', label: '卖点图', desc: '核心卖点展示', aiTag: true },
  { key: 'other', label: '其他图', desc: '细节/对比/尺寸等' },
]
```

- [ ] **Step 3: Commit counter functions**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "feat: add custom counts counter functions to EcommerceView"
```

---

### Task 5: 更新 handleGenerate 函数

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 更新 handleGenerate 使用 productImage 和 customCounts**

找到 `handleGenerate` 函数（约 line 219-301），修改：

```typescript
const handleGenerate = useCallback(async () => {
  if (isLoading) return
  setIsLoading(true)
  setError(null)
  setErrorAction(null)
  setResult(null)
  setViewMode('form')

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.AGENT_GENERATE,
      payload: {
        inputText: sellingPoints,
        productImage: productImage || undefined,
        templateCategory: 'ecommerce',
        ecommerceConfig: buildEcommerceConfig(),
      },
    })
    // ... parsing logic unchanged
    
    if (parsedResult) {
      setResult(parsedResult)
      setViewMode('result')  // 切换到结果视图
    } else {
      setError('生成结果为空')
    }
  } catch (err) {
    // error handling unchanged
  } finally {
    setIsLoading(false)
  }
}, [isLoading, sellingPoints, productImage, buildEcommerceConfig, aspectRatio])
```

- [ ] **Step 2: 更新 buildEcommerceConfig 包含 customCounts**

```typescript
const buildEcommerceConfig = useCallback((): EcommerceConfig => ({
  platform,
  market,
  language,
  aspectRatio,
  sellingPoints,
  setStructure,
  customCounts: setStructure === 'custom' ? customCounts : undefined,
}), [platform, market, language, aspectRatio, sellingPoints, setStructure, customCounts])
```

- [ ] **Step 3: Commit generate function changes**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "refactor: update handleGenerate to use productImage and customCounts"
```

---

### Task 6: 添加插入按钮处理函数

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 在 handleSaveConfirm 后添加 handleInsert 函数**

```typescript
// Handle insert - copy to clipboard and show toast
const handleInsert = useCallback((text: string) => {
  navigator.clipboard.writeText(text)
  showToast('已复制，请在输入框中粘贴')
}, [showToast])
```

- [ ] **Step 2: 添加 handleBackToForm 和 handleRegenerate 函数**

```typescript
// Handle back to form
const handleBackToForm = useCallback(() => {
  setViewMode('form')
}, [])

// Handle regenerate: go back to form and auto-trigger
const handleRegenerate = useCallback(() => {
  setViewMode('form')
  setResult(null)
  setTimeout(() => handleGenerate(), 0)
}, [handleGenerate])
```

- [ ] **Step 3: Commit insert and navigation functions**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "feat: add insert, backToForm and regenerate handlers to EcommerceView"
```

---

### Task 7: 重构 UI 渲染 - 表单视图

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 替换商品图片上传 UI**

找到商品图片上传 section（约 line 386-426），替换为：

```tsx
{/* Product Image Upload - single image */}
<div className="ecommerce-panel-section">
  <label className="ecommerce-panel-label">
    商品原图<span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
  </label>
  {productImage ? (
    <div className="ecommerce-panel-upload-area" style={{ borderStyle: 'solid', borderColor: '#E5E7EB' }}>
      <div className="ecommerce-panel-upload-preview">
        <img src={productImage} alt="商品图" className="ecommerce-panel-upload-thumb" />
        <span className="ecommerce-panel-upload-info">{productImageName}</span>
        <button className="ecommerce-panel-upload-remove" onClick={handleRemoveImage} aria-label="移除图片">
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  ) : (
    <div className="ecommerce-panel-upload-area" onClick={() => fileInputRef.current?.click()}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ display: 'none' }}
        disabled={isLoading}
      />
      <div className="ecommerce-panel-upload-placeholder">
        <Upload style={{ width: 18, height: 18 }} />
        <span>上传商品原图（5MB以内）</span>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 2: 替换套图结构选择 UI**

找到套图结构 section（约 line 528-546），替换为：

```tsx
{/* Structure Config: Smart vs Custom */}
<div className="ecommerce-panel-section">
  <label className="ecommerce-panel-label">套图结构</label>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {/* Smart card */}
    <div
      className={`ecommerce-panel-structure-card ${setStructure === 'smart' ? 'active' : ''}`}
      onClick={() => setSetStructure('smart')}
    >
      <div className="ecommerce-panel-structure-card-header">
        <div className={`ecommerce-panel-structure-card-checkbox ${setStructure === 'smart' ? 'checked' : ''}`}>
          ✓
        </div>
        <div>
          <div className="ecommerce-panel-structure-card-title">智能配图</div>
          <div className="ecommerce-panel-structure-card-desc">AI 自动规划套图数量与类型</div>
        </div>
      </div>
    </div>

    {/* Custom card */}
    <div
      className={`ecommerce-panel-structure-card ${setStructure === 'custom' ? 'active' : ''}`}
      onClick={() => setSetStructure('custom')}
    >
      <div className="ecommerce-panel-structure-card-header">
        <div className={`ecommerce-panel-structure-card-checkbox ${setStructure === 'custom' ? 'checked' : ''}`}>
          ✓
        </div>
        <div>
          <div className="ecommerce-panel-structure-card-title">自定义配图</div>
          <div className="ecommerce-panel-structure-card-desc">手动设置各类型图片数量</div>
        </div>
      </div>
      {setStructure === 'custom' && (
        <div className="ecommerce-panel-structure-card-body">
          {counterRows.map(row => (
            <div key={row.key} className="ecommerce-panel-counter-row">
              <span className="ecommerce-panel-counter-label">{row.label}</span>
              <span className="ecommerce-panel-counter-desc">{row.desc}</span>
              {row.aiTag && <span className="ecommerce-panel-counter-ai-tag">AI</span>}
              <div className="ecommerce-panel-counter-controls">
                <button
                  className="ecommerce-panel-counter-btn"
                  onClick={(e) => { e.stopPropagation(); adjustCount(row.key, -1) }}
                  disabled={customCounts[row.key] <= 0}
                >
                  -
                </button>
                <span className="ecommerce-panel-counter-value">{customCounts[row.key]}</span>
                <button
                  className="ecommerce-panel-counter-btn"
                  onClick={(e) => { e.stopPropagation(); adjustCount(row.key, 1) }}
                  disabled={customCounts[row.key] >= 10}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 3: Commit form UI changes**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "refactor: replace form UI with card-style structure and single image upload"
```

---

### Task 8: 重构 UI 渲染 - 结果视图

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 添加 ArrowLeft 和 ArrowUpRight 导入**

更新 imports：

```typescript
import { Sparkles, Loader2, AlertTriangle, Copy, Bookmark, RefreshCw, X, Upload, Settings, LogIn, ArrowLeft, ArrowUpRight } from 'lucide-react'
```

- [ ] **Step 2: 替换结果显示为全屏结果视图**

找到结果 section（约 line 589-631），替换为：

```tsx
{/* Result View - full-screen overlay */}
{viewMode === 'result' && result && (
  <div className="ecommerce-panel-result-view">
    {/* Header */}
    <div className="ecommerce-panel-result-header">
      <button className="ecommerce-panel-result-back-btn" onClick={handleBackToForm}>
        <ArrowLeft style={{ width: 16, height: 16 }} />
      </button>
      <span className="ecommerce-panel-result-title">套图生成结果</span>
      <span className="ecommerce-panel-result-count">
        共 {result.prompts.length} 张
      </span>
    </div>

    {/* Body: prompt cards */}
    <div className="ecommerce-panel-result-body">
      {result.prompts.map((p, i) => (
        <div key={i} className="ecommerce-panel-result-card">
          <div className="ecommerce-panel-result-card-header">
            <span className="ecommerce-panel-result-type-tag">{p.type}</span>
            <span style={{ fontSize: 11, color: '#A3A3A3' }}>{p.aspectRatio}</span>
          </div>
          <div className="ecommerce-panel-result-text">{p.prompt}</div>
          <div className="ecommerce-panel-result-actions">
            <button className="ecommerce-panel-action-btn ecommerce-panel-insert-btn" onClick={() => handleInsert(p.prompt)} title="插入">
              <ArrowUpRight style={{ width: 14, height: 14 }} />
            </button>
            <button className="ecommerce-panel-action-btn" onClick={() => handleCopy(p.prompt)} title="复制">
              <Copy style={{ width: 14, height: 14 }} />
            </button>
            <button className="ecommerce-panel-action-btn" onClick={() => handleSavePrompt(i)} title="保存到库">
              <Bookmark style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      ))}
    </div>

    {/* Footer */}
    <div className="ecommerce-panel-result-footer">
      <button className="ecommerce-panel-result-footer-btn-secondary" onClick={handleCopyAll}>
        复制全部
      </button>
      <button className="ecommerce-panel-result-footer-btn-primary" onClick={handleRegenerate} disabled={isLoading}>
        {isLoading ? '重新生成中...' : '重新生成'}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: 更新 isGenerateDisabled 条件**

```typescript
const isGenerateDisabled = !sellingPoints.trim() || isLoading
```

- [ ] **Step 4: Commit result view changes**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "refactor: replace inline result with full-screen result view in EcommerceView"
```

---

### Task 9: 更新选择器类名

**Files:**
- Modify: `packages/extension/src/sidepanel/views/EcommerceView.tsx`

- [ ] **Step 1: 替换所有 ecommerce-* 类名为 ecommerce-panel-***

需要替换的类名：
- `ecommerce-view` → `ecommerce-view` (保留)
- `ecommerce-section` → `ecommerce-panel-section`
- `ecommerce-label` → `ecommerce-panel-label`
- `ecommerce-select-row` → `ecommerce-panel-select-row`
- `ecommerce-select-wrapper` → `ecommerce-panel-select-wrapper`
- `ecommerce-select-label` → `ecommerce-panel-select-label`
- `ecommerce-select` → `ecommerce-panel-select`
- `ecommerce-textarea-section` → `ecommerce-panel-textarea-section`
- `ecommerce-textarea` → `ecommerce-panel-textarea`
- `ecommerce-ai-write-btn` → `ecommerce-panel-ai-write-btn`
- `ecommerce-generate-btn` → `ecommerce-panel-generate-btn`
- `ecommerce-spinner` → `ecommerce-panel-spinner`
- `ecommerce-error-banner` → 删除（改用 `ecommerce-panel-error`）

- [ ] **Step 2: Commit class name changes**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx
git commit -m "style: update CSS class names to ecommerce-panel-* pattern"
```

---

### Task 10: TypeScript 类型检查

**Files:**
- Check: TypeScript compilation

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
cd packages/extension && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: 如有类型错误，修复后重新检查**

如果出现错误，检查：
- `EcommerceCustomCounts` 类型是否正确导入
- `customCounts` 字段是否正确传递给 `buildEcommerceConfig`
- `viewMode` 状态类型是否正确

---

### Task 11: 功能验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 在浏览器中验证功能**

1. 打开 Sidepanel → Agent → 电商套图
2. 验证单图上传 UI 正常显示
3. 上传一张商品图片，验证预览和删除功能
4. 验证卡片式结构选择（智能配图/自定义配图）
5. 切换到自定义配图，验证计数器 +/- 功能
6. 输入卖点描述，点击生成
7. 验证全屏结果视图显示
8. 验证插入按钮（点击后复制并显示 toast）
9. 验证返回按钮（返回表单并保留配置）
10. 验证重新生成功能

---

### Task 12: 最终提交

- [ ] **Step 1: 确认所有改动**

```bash
git status
git diff packages/extension/src/sidepanel/views/EcommerceView.tsx
git diff packages/extension/src/sidepanel/index.css
```

- [ ] **Step 2: 合并提交**

```bash
git add packages/extension/src/sidepanel/views/EcommerceView.tsx packages/extension/src/sidepanel/index.css
git commit -m "feat: align EcommerceView with EcommercePanel style and functionality

- Replace 3-image grid with single image upload
- Add card-style structure selection with checkbox
- Add custom counts counter UI (whiteBg/scene/sellingPoint/other)
- Replace inline result with full-screen result view
- Add insert button with clipboard copy + toast
- Update CSS class names to ecommerce-panel-* pattern

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```