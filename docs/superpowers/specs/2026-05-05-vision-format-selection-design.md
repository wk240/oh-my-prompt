# Vision格式选择功能设计

## 概述

用户可以选择将图片转提示词结果保存为"自然语言"或"JSON"格式。格式选择采用混合模式：全局默认设置 + Vision Modal中可切换。

## 背景

当前Vision功能自动将API返回结果保存到临时库，仅保存自然语言格式（`zh.prompt`和`en.prompt`）。用户在UI中可以切换查看两种格式，但保存的内容始终是自然语言。

API返回三种JSON结构：
- `zh_json` - 中文字段名（主体、动作姿态、光影氛围...）
- `en_json` - 英语字段名（subject, action_pose, lighting_atmosphere...）
- `json_prompt` - 通用英语字段名格式

## 需求

1. 用户可选择保存格式（自然语言或JSON）
2. 全局默认设置 + Vision Modal可切换
3. JSON格式保存核心提示词内容，不含多余元素
4. 双语分析说明（analysis）继续保存到description字段

## 设计

### 数据结构变更

#### StorageSchema.settings 扩展

```typescript
settings: {
  visionEnabled: boolean
  visionDefaultFormat: 'natural' | 'json'  // 新增：默认保存格式
  // ...其他设置
}
```

#### SaveTemporaryPromptPayload 扩展

```typescript
interface SaveTemporaryPromptPayload {
  name: string
  nameEn?: string
  content: string
  contentEn?: string
  description?: string
  descriptionEn?: string
  imageUrl?: string
  styleTags?: string[]
  format?: 'natural' | 'json'  // 新增：保存格式标记
}
```

### 存储内容对比

| 字段 | 自然语言格式 | JSON格式 |
|------|-------------|----------|
| content | `result.zh.prompt` | `JSON.stringify(result.zh_json)` |
| contentEn | `result.en.prompt` | `JSON.stringify(result.en_json)` |
| description | `result.zh.analysis` | `result.zh.analysis` |
| descriptionEn | `result.en.analysis` | `result.en.analysis` |
| name | `result.zh.title` | `result.zh.title` |
| nameEn | `result.en.title` | `result.en.title` |
| styleTags | `result.zh_style_tags` | `result.zh_style_tags` |
| format | `'natural'` | `'json'` |

**设计原则**：
- `content/contentEn` 始终存储"提示词"内容，只是格式不同
- `description/descriptionEn` 始终存储分析说明，两种格式都保留
- JSON格式只保存核心提示词（zh_json/en_json），不含title、style_tags等

### UI交互

Vision Modal底部已有格式切换按钮：
```
[中] [EN]  |  [自然语言] [JSON]  |  [复制]
```

交互逻辑：
1. Modal初始化时从`settings.visionDefaultFormat`读取默认值
2. 用户切换格式时，立即更新展示内容
3. 同步保存新格式到`settings.visionDefaultFormat`
4. 格式切换不影响已完成的任务（只影响新分析任务）

### 自动保存逻辑

`task-queue-manager.ts` 的 `autoSaveToTemporary` 方法：

```typescript
const format = useTaskQueueStore.getState().currentFormat // 或从settings读取

if (format === 'natural') {
  savePayload = {
    content: result.zh.prompt,
    contentEn: result.en.prompt,
    format: 'natural'
  }
} else {
  savePayload = {
    content: JSON.stringify(result.zh_json),
    contentEn: JSON.stringify(result.en_json),
    format: 'json'
  }
}

// description两种格式都保存
savePayload.description = result.zh.analysis
savePayload.descriptionEn = result.en.analysis
```

### 兼容性处理

读取临时库prompt时：
- 若`format === 'json'` → 解析JSON展示
- 若`format === 'natural'`或无format字段（旧数据）→ 直接展示content文本

## 模块改动清单

| 文件 | 改动内容 |
|------|----------|
| `src/shared/types.ts` | 1. `StorageSchema.settings` 新增 `visionDefaultFormat` 字段<br>2. `SaveTemporaryPromptPayload` 新增 `format` 字段 |
| `src/content/components/VisionModal.tsx` | 格式切换时同步保存到settings |
| `src/content/core/task-queue-manager.ts` | `autoSaveToTemporary` 根据format保存不同内容 |
| `src/lib/store.ts` | 初始化 `settings.visionDefaultFormat: 'natural'` 默认值 |

## 测试要点

1. 自然语言格式保存 → content为纯文本
2. JSON格式保存 → content为JSON字符串，可解析
3. 格式切换 → settings同步更新
4. 旧数据兼容 → 无format字段时按自然语言处理
5. 两种格式的description都正常保存analysis