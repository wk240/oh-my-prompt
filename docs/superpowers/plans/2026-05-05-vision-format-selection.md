# Vision格式选择功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户可选择保存自然语言或JSON格式的图片转提示词结果。

**Architecture:** 在settings中存储全局默认格式，VisionModal读取并同步格式切换，task-queue-manager根据格式保存不同内容。

**Tech Stack:** TypeScript, Chrome Extension, Zustand

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/shared/types.ts` | 类型定义：SyncSettings新增visionDefaultFormat，SaveTemporaryPromptPayload新增format |
| `src/lib/storage.ts` | 初始化默认值：visionDefaultFormat: 'natural' |
| `src/content/components/VisionModal.tsx` | UI：格式切换同步到settings |
| `src/content/core/task-queue-manager.ts` | 保存逻辑：根据format保存不同内容到content/contentEn |

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `src/shared/types.ts:39-40, 183-192`

- [ ] **Step 1: 在SyncSettings添加visionDefaultFormat字段**

在 `src/shared/types.ts` 第39-40行，在 `visionEnabled` 后添加 `visionDefaultFormat`：

```typescript
// SyncSettings 接口
export interface SyncSettings {
  showBuiltin: boolean
  syncEnabled: boolean
  lastSyncTime?: number
  hasUnsyncedChanges?: boolean
  dismissedBackupWarning?: boolean
  resourceLanguage?: 'zh' | 'en'
  visionEnabled?: boolean
  visionDefaultFormat?: 'natural' | 'json' // 新增：Vision默认保存格式
}
```

- [ ] **Step 2: 在SaveTemporaryPromptPayload添加format字段**

在 `src/shared/types.ts` 第183-192行，在 `styleTags` 后添加 `format`：

```typescript
export interface SaveTemporaryPromptPayload {
  name: string
  nameEn?: string
  content: string
  contentEn?: string
  description?: string
  descriptionEn?: string
  imageUrl?: string
  styleTags?: string[]
  format?: 'natural' | 'json' // 新增：保存格式标记
}
```

- [ ] **Step 3: Commit类型定义变更**

```bash
git add src/shared/types.ts
git commit -m "$(cat <<'EOF'
feat(types): add visionDefaultFormat and format fields

- SyncSettings.visionDefaultFormat: global default format for Vision saves
- SaveTemporaryPromptPayload.format: format marker for saved prompts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 初始化默认值

**Files:**
- Modify: `src/lib/storage.ts:51-57`

- [ ] **Step 1: 在getDefaultSettings添加visionDefaultFormat默认值**

在 `src/lib/storage.ts` 第51-57行，在 `visionEnabled` 后添加：

```typescript
getDefaultSettings(): SyncSettings {
  return {
    showBuiltin: true,
    syncEnabled: false,
    visionEnabled: true,
    visionDefaultFormat: 'natural' // 新增：默认保存自然语言格式
  }
}
```

- [ ] **Step 2: Commit默认值变更**

```bash
git add src/lib/storage.ts
git commit -m "$(cat <<'EOF'
feat(storage): add default visionDefaultFormat: natural

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: VisionModal格式切换同步

**Files:**
- Modify: `src/content/components/VisionModal.tsx:87-90, 571-580`

- [ ] **Step 1: 添加useEffect读取settings中的默认格式**

在 `src/content/components/VisionModal.tsx` 第87-90行后，添加新的useEffect读取settings：

```typescript
// 现有的语言偏好读取 useEffect (第87-90行)
useEffect(() => {
  const pref = getStoredLanguagePreference()
  setLanguage(pref)
}, [])

// 新增：读取settings中的默认格式
useEffect(() => {
  chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE }, (response) => {
    if (response?.success && response.data?.settings?.visionDefaultFormat) {
      setFormat(response.data.settings.visionDefaultFormat)
    }
  })
}, [])
```

需要导入MessageType：
```typescript
import { MessageType } from '@/shared/messages'
```

- [ ] **Step 2: 修改setFormat处理函数，同步保存到settings**

在第65-68行的format state附近，添加format切换处理函数：

```typescript
// 格式切换处理函数
const handleFormatChange = useCallback((newFormat: FormatType) => {
  setFormat(newFormat)
  // 同步保存到settings
  chrome.runtime.sendMessage({
    type: MessageType.SET_SETTINGS_ONLY,
    payload: { settings: { visionDefaultFormat: newFormat } }
  })
}, [])
```

需要添加 `useCallback` 导入（已有 `useCallback` in line 1）。

- [ ] **Step 3: 更新格式切换按钮onClick**

修改第572-580行的onClick，使用新的handleFormatChange：

```typescript
<button
  className={`toggle-btn ${format === 'natural' ? 'active' : ''}`}
  onClick={() => handleFormatChange('natural')}
>
  自然语言
</button>
<button
  className={`toggle-btn ${format === 'json' ? 'active' : ''}`}
  onClick={() => handleFormatChange('json')}
>
  JSON
</button>
```

- [ ] **Step 4: Commit VisionModal变更**

```bash
git add src/content/components/VisionModal.tsx
git commit -m "$(cat <<'EOF'
feat(VisionModal): sync format toggle to settings

- Read visionDefaultFormat from settings on mount
- Sync format changes via SET_SETTINGS_ONLY message

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: TaskQueueManager保存逻辑

**Files:**
- Modify: `src/content/core/task-queue-manager.ts:340-378`

- [ ] **Step 1: 在autoSaveToTemporary获取当前格式**

修改 `src/content/core/task-queue-manager.ts` 第342行，添加获取格式逻辑：

```typescript
private async autoSaveToTemporary(taskId: string, result: VisionApiResultData, imageUrl: string): Promise<void> {
  const store = useTaskQueueStore.getState()

  try {
    // 获取当前格式设置（默认natural）
    const settingsResponse = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
    const format = settingsResponse?.data?.settings?.visionDefaultFormat || 'natural'

    const promptName = generatePromptName(result.zh.prompt, result.zh.title)
    const promptNameEn = generatePromptName(result.en.prompt, result.en.title)

    // 根据格式构建content
    const content = format === 'json'
      ? JSON.stringify(result.zh_json || result.json_prompt)
      : result.zh.prompt

    const contentEn = format === 'json'
      ? JSON.stringify(result.en_json || result.json_prompt)
      : result.en.prompt

    const savePayload: SaveTemporaryPromptPayload = {
      name: promptName,
      nameEn: promptNameEn,
      content,
      contentEn,
      description: result.zh.analysis,
      descriptionEn: result.en.analysis,
      imageUrl: imageUrl,
      styleTags: result.zh_style_tags,
      format // 保存格式标记
    }
```

需要导入MessageType：
```typescript
import { MessageType } from '@/shared/messages'
```

- [ ] **Step 2: Commit TaskQueueManager变更**

```bash
git add src/content/core/task-queue-manager.ts
git commit -m "$(cat <<'EOF'
feat(task-queue): save content based on format setting

- Read visionDefaultFormat from settings before save
- JSON format: stringify zh_json/en_json
- Natural format: use zh.prompt/en.prompt
- Add format field to saved payload

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 验证与测试

- [ ] **Step 1: 运行TypeScript检查**

```bash
npx tsc --noEmit
```

Expected: 无错误输出

- [ ] **Step 2: 本地测试流程**

1. `npm run dev` 启动开发服务器
2. 加载扩展到Chrome
3. 触发Vision功能（图片转提示词）
4. 验证：
   - 默认格式为自然语言
   - 切换JSON格式后，新任务保存JSON
   - 切换后settings同步更新
   - 临时库prompt显示正确格式

- [ ] **Step 3: Commit最终验证**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test: verify vision format selection feature

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 自检清单

- [ ] Spec覆盖：每个设计要求都有对应Task
- [ ] 无占位符：所有代码完整，无TBD/TODO
- [ ] 类型一致：visionDefaultFormat在各处使用相同类型定义
- [ ] 默认值：'natural'为默认值，兼容旧数据（无format字段视为natural）