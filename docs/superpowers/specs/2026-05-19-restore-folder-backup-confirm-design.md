# 设计：文件夹已有备份恢复确认功能（含冲突处理）

> 创建日期: 2026-05-19
> 更新日期: 2026-05-19

## 背景

用户选择本地备份文件夹时，如果文件夹中已有备份数据（`omps-latest.json`），当前实现会直接启用备份，后续编辑会覆盖文件夹中的数据。用户希望在此场景下提示是否恢复文件夹数据，避免意外丢失已有备份。

此外，恢复时可能存在数据冲突（当前 chrome.storage 也有数据），需要提供"合并"或"替换"选项。

## 需求

### 基础需求
- 检测文件夹已有备份数据时，立即弹出恢复确认对话框
- 对话框显示：备份数量（提示词 + 分类）和备份时间
- 用户可选择"恢复"、"继续使用"或"重新选择文件夹"

### 冲突处理需求
- 检测当前 chrome.storage 是否有数据
- 恢复时如有冲突，提供"合并"或"替换"选项
- 合并策略：按 ID 去重，保留 updatedAt 最新版本
- 合并后显示结果（新增/更新数量）

## 设计

### 1. 两步决策流程

**第一步：主决策（RestoreDecisionModal）**
- 检测到已有备份数据时弹出
- 提供三个选项：恢复、继续使用、重新选择

**第二步：冲突处理（MergeConflictModal）**
- 仅当用户选择"恢复"且存在数据冲突时弹出
- 提供"合并（推荐）"和"替换"选项
- 合并后显示结果摘要

### 2. 组件架构

**新增组件：**
- `RestoreDecisionModal.tsx` — 第一步：恢复决策对话框
- `MergeConflictModal.tsx` — 第二步：合并/替换选择对话框

**修改组件：**
- `BackupSection.tsx` — 处理流程控制和状态管理

**新增逻辑：**
- `mergePromptData()` — 数据合并函数（按 ID + updatedAt）
- `getConflictInfo()` — 检测当前数据与备份数据冲突情况

**复用逻辑：**
- `restoreFromBackup()` — 恢复函数，扩展支持 `mode: 'replace' | 'merge'`
- `enableSync()` / `changeSyncFolder()` — 已返回 `existingBackup` 信息

### 3. 数据流

```
用户点击"选择备份文件夹" / "更换文件夹"
    ↓
handleEnableFolder() / handleChangeFolder() 调用 enableSync() / changeSyncFolder()
    ↓
函数检测文件夹已有数据，返回 { success, existingBackup }
    ↓
BackupSection 判断 existingBackup.hasBackup === true
    ↓
【第一步】打开 RestoreDecisionModal
    ↓
用户选择：
  ├─ "恢复备份数据" → 检测当前数据是否存在冲突
  │     ↓
  │   有冲突 → 【第二步】打开 MergeConflictModal
  │     ↓
  │   用户选择：
  │     ├─ "合并数据" → mergePromptData() → 更新 chrome.storage → 显示合并结果
  │     └─ "替换数据" → restoreFromBackup('replace') → 更新 chrome.storage → 显示成功
  │
  ├─ "继续使用此文件夹" → 关闭对话框 → 备份已启用（当前数据优先）
  │
  └─ "重新选择文件夹" → 关闭对话框 → 重置状态 → 允许重新选择
```

### 4. RestoreDecisionModal 组件

**Props：**
```typescript
interface RestoreDecisionModalProps {
  open: boolean
  onClose: () => void
  onRestore: () => void              // 用户选择恢复
  onContinue: () => void             // 用户选择继续使用
  onReselect: () => void             // 用户选择重新选择
  existingBackup: ExistingBackupInfo // { hasBackup, promptCount, categoryCount, temporaryPromptCount, backupTime }
}
```

**UI 布局：**
```
标题：此文件夹已有备份数据

正文：
  检测到 {promptCount} 条提示词和 {categoryCount} 个分类
  {temporaryPromptCount > 0 ? `以及 ${temporaryPromptCount} 条临时提示词` : ''}
  备份时间：{backupTime 格式化为 YYYY-MM-DD HH:mm}

按钮：
  [恢复备份数据] (主要按钮，蓝色)
  [继续使用此文件夹] (次要按钮，灰色)
  [重新选择文件夹] (次要按钮，灰色)
```

**交互逻辑：**
- 点击"恢复备份数据" → 调用 `onRestore()` → 继续检测冲突
- 点击"继续使用此文件夹" → 调用 `onContinue()` → 关闭对话框，备份已启用
- 点击"重新选择文件夹" → 调用 `onReselect()` → 关闭对话框，重置状态

### 5. MergeConflictModal 组件

**Props：**
```typescript
interface MergeConflictModalProps {
  open: boolean
  onClose: () => void
  currentData: { promptCount: number; categoryCount: number }
  backupData: { promptCount: number; categoryCount: number; backupTime: string }
  onMerge: () => Promise<MergeResult>
  onReplace: () => Promise<{ success: boolean; error?: string }>
}

interface MergeResult {
  success: boolean
  addedCount: number      // 新增的提示词数量
  updatedCount: number    // 更新的提示词数量
  addedCategories: number // 新增的分类数量
  error?: string
}
```

**状态：**
- `processing: boolean` — 处理进行中
- `mergeResult: MergeResult | null` — 合并结果（用于显示摘要）
- `showResult: boolean` — 是否显示结果摘要
- `error: string | null` — 错误消息

**UI 布局（选择阶段）：**
```
标题：数据冲突处理

正文：
  当前数据：{currentData.promptCount} 条提示词，{currentData.categoryCount} 个分类
  备份数据：{backupData.promptCount} 条提示词，{backupData.categoryCount} 个分类
  备份时间：{backupData.backupTime}

  ⚠️ 请选择恢复方式：
  • 合并数据：保留双方数据，相同ID保留最新版本
  • 替换数据：用备份数据完全替换当前数据

按钮：
  [合并数据（推荐）] (主要按钮，蓝色)
  [替换数据] (次要按钮，红色警告样式)
```

**UI 布局（结果阶段 - 仅合并成功后）：**
```
标题：合并完成

正文：
  ✅ 新增 {addedCount} 条提示词
  ✅ 新增 {addedCategories} 个分类
  ✅ 更新 {updatedCount} 条提示词（保留最新修改）

按钮：
  [确定]
```

**交互逻辑：**
- 点击"合并数据" → `processing=true` → `onMerge()` → 成功则显示结果，失败则显示错误
- 点击"替换数据" → `processing=true` → `onReplace()` → 成功则关闭并显示成功消息，失败则显示错误
- 点击结果阶段的"确定" → 关闭对话框
- `processing` 时禁用按钮，显示加载状态

### 6. BackupSection 修改

**新增状态：**
```typescript
// 第一步对话框
const decisionModalOpen = useState(false)
const existingBackup = useState<ExistingBackupInfo | null>(null)

// 第二步对话框（冲突处理）
const conflictModalOpen = useState(false)
const currentDataInfo = useState<{ promptCount: number; categoryCount: number } | null>(null)
const backupDataInfo = useState<{ promptCount: number; categoryCount: number; backupTime: string } | null>(null)
```

**新增：获取当前数据信息**
```typescript
const getCurrentDataInfo = async (): Promise<{ promptCount: number; categoryCount: number }> => {
  const storage = await chrome.storage.local.get(STORAGE_KEY)
  const data = storage[STORAGE_KEY]?.userData
  return {
    promptCount: data?.prompts?.length || 0,
    categoryCount: data?.categories?.length || 0,
  }
}
```

**修改 handleEnableFolder()：**
```typescript
const handleEnableFolder = async () => {
  setLoading(true)
  setError(null)
  setSuccess(null)

  try {
    const result = await enableSync()
    if (result.success) {
      if (result.existingBackup?.hasBackup) {
        // 有备份数据，打开第一步对话框
        setExistingBackup(result.existingBackup)
        setDecisionModalOpen(true)
      } else {
        setSuccess('备份已启用')
      }
      await loadBackupStatus()
    } else {
      setError(result.error || '选择文件夹失败')
    }
  } catch (err) {
    setError('选择文件夹失败')
  } finally {
    setLoading(false)
  }
}
```

**修改 handleChangeFolder()：**
```typescript
const handleChangeFolder = async () => {
  setLoading(true)
  setError(null)
  setSuccess(null)

  try {
    const result = await changeSyncFolder()
    if (result.success) {
      if (result.existingBackup?.hasBackup) {
        setExistingBackup(result.existingBackup)
        setDecisionModalOpen(true)
      } else {
        setSuccess('文件夹已更换')
      }
      await loadBackupStatus()
    } else {
      setError(result.error || '更换文件夹失败')
    }
  } catch (err) {
    setError('更换文件夹失败')
  } finally {
    setLoading(false)
  }
}
```

**新增：第一步对话框回调**
```typescript
const handleDecisionRestore = async () => {
  // 获取当前数据信息
  const currentInfo = await getCurrentDataInfo()

  // 检测是否存在冲突（当前有数据且与备份不同）
  if (currentInfo.promptCount > 0 || currentInfo.categoryCount > 0) {
    // 有冲突，打开第二步对话框
    setCurrentDataInfo(currentInfo)
    setBackupDataInfo({
      promptCount: existingBackup!.promptCount,
      categoryCount: existingBackup!.categoryCount,
      backupTime: existingBackup!.backupTime,
    })
    setDecisionModalOpen(false)
    setConflictModalOpen(true)
  } else {
    // 无冲突，直接恢复
    const result = await restoreFromBackup(BACKUP_FILE_NAME, false, 'replace')
    if (result.success) {
      setDecisionModalOpen(false)
      setExistingBackup(null)
      setSuccess('数据已恢复')
      await loadBackupStatus()
    } else {
      setError(result.error || '恢复失败')
    }
  }
}

const handleDecisionContinue = () => {
  setDecisionModalOpen(false)
  setExistingBackup(null)
  setSuccess('备份已启用，当前数据优先')
}

const handleDecisionReselect = () => {
  setDecisionModalOpen(false)
  setExistingBackup(null)
  // 不设置 success，允许用户重新选择
}
```

**新增：第二步对话框回调**
```typescript
const handleMergeData = async (): Promise<MergeResult> => {
  const result = await restoreFromBackup(BACKUP_FILE_NAME, false, 'merge')
  if (result.success) {
    setSuccess(`合并完成：新增 ${result.addedCount} 条，更新 ${result.updatedCount} 条`)
    await loadBackupStatus()
  }
  return {
    success: result.success,
    addedCount: result.addedCount || 0,
    updatedCount: result.updatedCount || 0,
    addedCategories: result.addedCategories || 0,
    error: result.error,
  }
}

const handleReplaceData = async (): Promise<{ success: boolean; error?: string }> => {
  const result = await restoreFromBackup(BACKUP_FILE_NAME, false, 'replace')
  if (result.success) {
    setConflictModalOpen(false)
    setSuccess('数据已恢复')
    await loadBackupStatus()
  }
  return result
}

const handleConflictClose = () => {
  setConflictModalOpen(false)
  setCurrentDataInfo(null)
  setBackupDataInfo(null)
  setExistingBackup(null)
}
```

### 7. 合并逻辑实现

**新增文件：`packages/extension/src/lib/sync/merge-data.ts`**

```typescript
import type { Prompt, Category } from '@oh-my-prompt/shared/types'

interface MergeableItem {
  id: string
  updatedAt?: string
}

/**
 * 按 ID 合并两个列表，保留 updatedAt 最新的版本
 */
function mergeById<T extends MergeableItem>(currentList: T[], backupList: T[]): T[] {
  const map = new Map<string, T>()

  // 先添加当前数据
  currentList.forEach(item => map.set(item.id, item))

  // 合并备份数据
  backupList.forEach(backupItem => {
    const currentItem = map.get(backupItem.id)
    if (!currentItem) {
      // 新数据，直接添加
      map.set(backupItem.id, backupItem)
    } else if (backupItem.updatedAt && currentItem.updatedAt) {
      // 都有 updatedAt，比较时间
      if (new Date(backupItem.updatedAt) > new Date(currentItem.updatedAt)) {
        map.set(backupItem.id, backupItem)
      }
    } else if (backupItem.updatedAt && !currentItem.updatedAt) {
      // 备份有 updatedAt，当前没有，优先备份
      map.set(backupItem.id, backupItem)
    }
    // else: 当前版本更新或无时间戳，保留当前
  })

  return Array.from(map.values())
}

/**
 * 合并提示词和分类数据
 */
export function mergePromptData(
  currentPrompts: Prompt[],
  backupPrompts: Prompt[],
  currentCategories: Category[],
  backupCategories: Category[]
): {
  prompts: Prompt[]
  categories: Category[]
  addedPrompts: number
  updatedPrompts: number
  addedCategories: number
} {
  const mergedPrompts = mergeById(currentPrompts, backupPrompts)
  const mergedCategories = mergeById(currentCategories, backupCategories)

  // 统计新增和更新数量
  const currentPromptIds = new Set(currentPrompts.map(p => p.id))
  const addedPrompts = mergedPrompts.filter(p => !currentPromptIds.has(p.id)).length
  const updatedPrompts = mergedPrompts.length - currentPrompts.length - addedPrompts

  const currentCategoryIds = new Set(currentCategories.map(c => c.id))
  const addedCategories = mergedCategories.filter(c => !currentCategoryIds.has(c.id)).length

  return {
    prompts: mergedPrompts,
    categories: mergedCategories,
    addedPrompts,
    updatedPrompts: Math.max(0, updatedPrompts), // 确保不为负
    addedCategories,
  }
}
```

### 8. restoreFromBackup 修改

**修改文件：`packages/extension/src/lib/sync/local-sync.ts`**

```typescript
export async function restoreFromBackup(
  fileName: string,
  backupFirst: boolean,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{
  success: boolean
  error?: string
  addedCount?: number
  updatedCount?: number
  addedCategories?: number
}> {
  try {
    const backupData = await readBackupFile(fileName)
    if (!backupData) {
      return { success: false, error: '备份文件不存在' }
    }

    if (mode === 'replace') {
      // 直接替换
      await chrome.storage.local.set({ [STORAGE_KEY]: backupData })
      return { success: true }
    }

    if (mode === 'merge') {
      // 获取当前数据
      const currentStorage = await chrome.storage.local.get(STORAGE_KEY)
      const currentData = currentStorage[STORAGE_KEY]?.userData || { prompts: [], categories: [] }
      const backupUserData = backupData.userData || { prompts: [], categories: [] }

      // 合并数据
      const merged = mergePromptData(
        currentData.prompts,
        backupUserData.prompts,
        currentData.categories,
        backupUserData.categories
      )

      // 保存合并后的数据
      const mergedStorage = {
        ...backupData,
        userData: {
          prompts: merged.prompts,
          categories: merged.categories,
        },
      }
      await chrome.storage.local.set({ [STORAGE_KEY]: mergedStorage })

      return {
        success: true,
        addedCount: merged.addedPrompts,
        updatedCount: merged.updatedPrompts,
        addedCategories: merged.addedCategories,
      }
    }

    return { success: false, error: '未知的恢复模式' }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

### 9. 错误处理与边界情况

**错误场景：**
1. **恢复失败** — 在对应 Modal 内显示错误消息，用户可重试或关闭
2. **合并失败** — 显示错误，用户可选择替换或取消
3. **备份时间为空** — 旧格式备份没有 `backupTime` → 显示"备份时间：未知"
4. **临时库数量为0** — 不显示临时提示词行

**边界情况：**
1. **当前数据为空** — 无冲突，直接恢复（跳过第二步）
2. **备份数据为空但有文件** — 第一步显示"0 条提示词"，用户自行判断
3. **相同 ID 但 updatedAt 相同** — 保留当前数据（用户当前会话优先）
4. **并发操作** — `loading` 状态禁用"选择文件夹"按钮，防止并发
5. **用户中途关闭对话框** — 允许关闭，不强制完成流程

### 10. 交互细节优化

**加载状态：**
- 第一步对话框无加载状态（立即响应）
- 第二步对话框按钮显示加载图标 + 文案变为"处理中..."

**成功反馈：**
- 合并成功：显示结果摘要 Modal，用户点击"确定"关闭
- 替换成功：关闭 Modal，在 BackupSection 显示成功消息
- 继续使用：关闭 Modal，显示"备份已启用"消息

**文案规范：**
- 时间格式：`YYYY-MM-DD HH:mm` 或相对时间"3天前"
- 数量显示：超过 100 显示"100+"
- 临时提示词：单独一行"以及 X 条临时提示词"

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/extension/src/sidepanel/settings/RestoreDecisionModal.tsx` | 新增 | 第一步：恢复决策对话框 |
| `packages/extension/src/sidepanel/settings/MergeConflictModal.tsx` | 新增 | 第二步：合并/替换选择对话框 |
| `packages/extension/src/sidepanel/settings/BackupSection.tsx` | 修改 | 添加状态管理、流程控制、回调函数 |
| `packages/extension/src/lib/sync/merge-data.ts` | 新增 | 数据合并逻辑 |
| `packages/extension/src/lib/sync/local-sync.ts` | 修改 | `restoreFromBackup` 支持 merge 模式 |

## 实现优先级

1. **Phase 1（基础功能）**：RestoreDecisionModal + 基础恢复流程
2. **Phase 2（冲突处理）**：MergeConflictModal + 合并逻辑
3. **Phase 3（优化）**：结果摘要显示、文案优化、加载状态