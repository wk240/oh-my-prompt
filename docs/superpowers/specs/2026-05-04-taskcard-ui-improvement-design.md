# TaskCard UI 改进设计

## Overview

**Feature:** BatchProgressPanel 中 TaskCard 的 UI 改进 + 自动保存到临时库

**Core Value:** 提升批量识别结果的可读性和操作效率，减少用户操作成本

---

## 设计决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 自动保存 | 任务成功后自动保存 | 无需手动操作，结果直接可用 |
| 折叠状态 | 无折叠 | 成功任务直接展示完整内容，减少操作成本 |
| 保存状态指示 | "已保存到临时库" | 明确告知用户保存位置 |
| 复制按钮位置 | 底部右对齐 | 与语言/格式切换同行，布局清晰 |
| 操作按钮形式 | 文字按钮 | 清晰易懂，可读性好 |
| 面板宽度 | 保持 400px | 平衡可读性和屏幕占用 |

---

## UI 设计

### 成功状态 (直接展示完整内容)

```
┌─────────────────────────────────────────────────┐
│ [缩略图 60x60] ✓ 完成  已保存到临时库    [移除] │
├─────────────────────────────────────────────────┤
│ Prompt 区域 (全宽，min-height: 100px)           │
│ ┌─────────────────────────────────────────────┐ │
│ │ Fashion portrait photography, elegant       │ │
│ │ woman in silk dress, soft natural lighting │ │
│ │ ...                                         │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ [中/EN] [自然/JSON]                    [复制]   │
└─────────────────────────────────────────────────┘
```

### 失败状态 (紧凑布局)

```
┌─────────────────────────────────────────────────┐
│ [缩略图] ✗ 失败  网络超时      [重试] [移除]   │
└─────────────────────────────────────────────────┘
```

### 进行中状态 (紧凑布局)

```
┌─────────────────────────────────────────────────┐
│ [缩略图] ⟳ 分析中... [进度条]         [移除]   │
└─────────────────────────────────────────────────┘
```

---

## 组件结构

### TaskCard 布局变化

| 元素 | 原设计 | 新设计 |
|------|--------|--------|
| 缩略图 | 80x80 | 60x60 |
| 折叠/展开 | 有 | 无 (成功任务直接展示) |
| 操作按钮 | 图标按钮 24px | 文字按钮 |
| 复制按钮 | Prompt 区域内右下角 | 底部右对齐 |
| Prompt 区域 | max-height: 100px | min-height: 100px，全宽展示 |

### 按钮设计

| 按钮 | 样式 | 位置 |
|------|------|------|
| 复制 | `border: #171717, bg: #fff, font-weight: 500` | 底部右对齐 |
| 移除 | `border: #e5e5e5, bg: transparent, color: #666` | 顶部右对齐 |
| 重试 | `border: #22c55e, bg: transparent, color: #22c55e` | 失败状态 |

---

## 自动保存功能

### 触发时机

任务状态变为 `success` 时自动调用 `SAVE_TEMPORARY_PROMPT`

### 保存内容

```typescript
{
  name: task.result.zh.title || generatePromptName(task.result.zh.prompt),
  nameEn: task.result.en.title,
  content: task.result.zh.prompt,
  contentEn: task.result.en.prompt,
  description: task.result.zh.analysis,
  descriptionEn: task.result.en.analysis,
  imageUrl: task.imageUrl,
  styleTags: task.result.zh_style_tags
}
```

### 保存状态显示

- 成功后显示绿色文字："已保存到临时库"
- 保存失败时显示："保存失败"（红色）

---

## 实现要点

### TaskCard.tsx 修改

1. **移除折叠/展开逻辑**
   - 删除 `expandedTaskId` 状态
   - 删除 `isExpanded` 判断
   - 成功任务直接渲染完整布局

2. **布局重构**
   - 顶部：缩略图 + 状态 + 移除按钮
   - 中间：Prompt 全宽展示区
   - 底部：语言/格式切换 + 复制按钮

3. **按钮改为文字形式**
   - 使用 `<button>` + 文字，而非图标

4. **添加保存状态字段**
   - `savedToTemporary: boolean`
   - `saveError?: string`

### task-queue-manager.ts 修改

1. **任务成功后自动保存**
   - 在 `executeTask` 成功分支调用 `SAVE_TEMPORARY_PROMPT`
   - 更新 task 的 `savedToTemporary` 状态

2. **保存失败处理**
   - 记录 `saveError`
   - UI 显示保存失败提示

### task-queue-store.ts 修改

1. **扩展 QueueTask 类型**
   ```typescript
   interface QueueTask {
     // ...existing fields
     savedToTemporary?: boolean
     saveError?: string
   }
   ```

---

## 样式更新

### getBatchPanelStyles() 新增样式

```css
/* 文字按钮基础样式 */
.text-btn {
  padding: 6px 10px;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.text-btn:hover {
  background: #f8f8f8;
}

/* 复制按钮 (主要操作) */
.copy-btn-main {
  padding: 8px 16px;
  border: 1px solid #171717;
  background: #fff;
  color: #171717;
}

/* 重试按钮 */
.retry-btn {
  border: 1px solid #22c55e;
  color: #22c55e;
}

/* 保存状态 */
.save-status {
  font-size: 12px;
  color: #22c55e;
}

.save-status.error {
  color: #ef4444;
}
```

---

## 用户流程

### 批量识别流程

```
用户点击图片悬浮按钮
    ↓
任务添加到队列，BatchProgressPanel 显示
    ↓
任务开始执行，显示"分析中..."
    ↓
任务成功
    ↓
自动保存到临时库
    ↓
显示完整 Prompt + "已保存到临时库"
    ↓
用户可直接复制或切换语言/格式
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| Vision API 失败 | 显示失败状态 + 重试按钮 |
| 自动保存失败 | 显示"保存失败"，Prompt 仍可复制 |
| 复制失败 | Toast 提示"复制失败" |