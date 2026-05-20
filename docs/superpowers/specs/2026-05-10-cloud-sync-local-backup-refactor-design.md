# 云端同步与本地备份重构设计

> **设计日期**: 2026-05-10
> **状态**: 待审阅

## 1. 需求总结

| 维度 | 决定 |
|------|------|
| **架构定位** | 云端为主，本地为辅（双重保险） |
| **触发时机** | 自动同步（每次数据变更） |
| **数据范围** | prompts + categories + temporaryPrompts（不含 API 配置） |
| **本地备份** | 云端同步时并行触发（双重保险） |
| **冲突策略** | 合并策略：云端覆盖相同ID，保留本地独有数据 |
| **实现方案** | 策略模式重构 |

---

## 2. 架构设计

### 2.1 核心接口

```typescript
// 同步策略接口
interface SyncStrategy {
  id: 'cloud' | 'local'
  name: string

  // 同步数据
  sync(data: FullBackupData): Promise<SyncResult>

  // 恢复数据
  restore(): Promise<FullBackupData | null>

  // 检测可用性
  isAvailable(): Promise<boolean>

  // 获取状态
  getStatus(): Promise<StrategyStatus>
}

interface SyncResult {
  success: boolean
  error?: 'NOT_LOGGED_IN' | 'NETWORK_ERROR' | 'PERMISSION_DENIED' | 'SYNC_FAILED' | 'INVALID_DATA'
  syncedAt?: number
  promptsCount?: number
  categoriesCount?: number
  temporaryPromptsCount?: number
}

interface StrategyStatus {
  enabled: boolean
  lastSyncTime?: number
  error?: string
}
```

### 2.2 统一编排器

```typescript
class SyncOrchestrator {
  private cloudStrategy: CloudSyncStrategy
  private localStrategy: LocalSyncStrategy
  private storageManager: StorageManager

  /**
   * 触发同步（每次数据变更时调用）
   * 
   * 流程：
   * 1. 检测云端可用性
   * 2. 云端可用 → 并行执行云端+本地同步
   * 3. 云端不可用 → 仅执行本地同步，标记 pendingCloudSync
   */
  async triggerSync(data: FullBackupData): Promise<void>

  /**
   * 从云端下载并合并到本地
   * 
   * 合并策略：
   * - 相同ID：云端覆盖本地
   * - 云端有本地无：新增到本地
   * - 本地有云端无：保留本地，标记 pendingUpload
   */
  async downloadAndMerge(): Promise<MergeResult>

  /**
   * 上传本地独有数据到云端
   */
  async uploadLocalOnlyItems(): Promise<void>

  /**
   * 初始化同步（插件启动时）
   * 
   * 检测云端、本地、storage三方的数据状态，执行合并或恢复
   */
  async initialSync(): Promise<void>

  /**
   * 获取统一同步状态
   */
  getStatus(): Promise<UnifiedSyncStatus>
}
```

### 2.3 数据流

```
用户修改提示词
    ↓
store.saveToStorage()
    ↓
SyncOrchestrator.triggerSync()
    ↓
检测云端可用性
    ↓
┌─→ CloudSyncStrategy.sync() ─→ Supabase/Web App API
│       ↓
│   成功 → 更新 lastCloudSyncTime
│       ↓
└─→ LocalSyncStrategy.sync() ─→ 本地文件夹
        ↓
    更新 lastLocalSyncTime
    
云端不可用时：
    ↓
仅 LocalSyncStrategy.sync()
    ↓
标记 pendingCloudSync = true
```

---

## 3. 合并策略

### 3.1 合并逻辑

```typescript
interface MergeResult {
  data: FullBackupData          // 合并后的数据
  localOnlyItems: {             // 本地独有数据
    prompts: Prompt[]
    categories: Category[]
    temporaryPrompts: Prompt[]
  }
}

async function downloadAndMerge(): Promise<MergeResult> {
  const cloudData = await this.cloudStrategy.restore()
  const localData = await this.getLocalData()

  if (!cloudData) {
    // 云端空 → 直接使用本地
    return {
      data: localData,
      localOnlyItems: { prompts: [], categories: [], temporaryPrompts: [] }
    }
  }

  // 合并：云端优先，保留本地独有
  const mergedPrompts = this.mergeById(cloudData.prompts, localData.prompts)
  const mergedCategories = this.mergeById(cloudData.categories, localData.categories)
  const mergedTemporaryPrompts = this.mergeById(cloudData.temporaryPrompts, localData.temporaryPrompts)

  // 找出本地独有数据
  const localOnlyPrompts = localData.prompts.filter(p =>
    !cloudData.prompts.find(cp => cp.id === p.id)
  )
  const localOnlyCategories = localData.categories.filter(c =>
    !cloudData.categories.find(cc => cc.id === c.id)
  )
  const localOnlyTemporaryPrompts = localData.temporaryPrompts.filter(p =>
    !cloudData.temporaryPrompts.find(cp => cp.id === p.id)
  )

  // 应用合并数据到 storage
  await this.storageManager.updateUserData({
    prompts: mergedPrompts,
    categories: mergedCategories
  })
  await this.storageManager.updateTemporaryPrompts(mergedTemporaryPrompts)

  // 更新状态
  const hasLocalOnlyData = localOnlyPrompts.length > 0 ||
    localOnlyCategories.length > 0 ||
    localOnlyTemporaryPrompts.length > 0

  if (hasLocalOnlyData) {
    await this.updateSyncStatus({
      pendingUpload: true,
      localOnlyItems: {
        promptIds: localOnlyPrompts.map(p => p.id),
        categoryIds: localOnlyCategories.map(c => c.id),
        temporaryPromptIds: localOnlyTemporaryPrompts.map(p => p.id)
      }
    })
  }

  return {
    data: {
      prompts: mergedPrompts,
      categories: mergedCategories,
      temporaryPrompts: mergedTemporaryPrompts
    },
    localOnlyItems: {
      prompts: localOnlyPrompts,
      categories: localOnlyCategories,
      temporaryPrompts: localOnlyTemporaryPrompts
    }
  }
}

/**
 * 合并函数：云端优先，保留本地独有
 * 
 * @param cloud - 云端数据
 * @param local - 本地数据
 * @returns 合并后的数组
 */
function mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
  const merged = new Map<string, T>()

  // 云端数据优先（相同ID时覆盖本地）
  for (const item of cloud) {
    merged.set(item.id, item)
  }

  // 本地独有数据保留（云端没有的）
  for (const item of local) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item)
    }
  }

  return Array.from(merged.values())
}
```

### 3.2 本地独有数据上传

```typescript
async uploadLocalOnlyItems(): Promise<void> {
  const status = await this.getSyncStatus()

  if (!status.pendingUpload) {
    return
  }

  const localData = await this.getLocalData()

  // 筛选本地独有数据
  const localOnlyPrompts = localData.prompts.filter(p =>
    status.localOnlyItems.promptIds.includes(p.id)
  )
  const localOnlyCategories = localData.categories.filter(c =>
    status.localOnlyItems.categoryIds.includes(c.id)
  )
  const localOnlyTemporaryPrompts = localData.temporaryPrompts.filter(p =>
    status.localOnlyItems.temporaryPromptIds.includes(p.id)
  )

  // 上传到云端（追加，不覆盖云端已有数据）
  const result = await this.cloudStrategy.upload({
    prompts: localOnlyPrompts,
    categories: localOnlyCategories,
    temporaryPrompts: localOnlyTemporaryPrompts,
    timestamp: Date.now()
  })

  if (result.success) {
    // 清除 pendingUpload 标记
    await this.updateSyncStatus({
      pendingUpload: false,
      localOnlyItems: {
        promptIds: [],
        categoryIds: [],
        temporaryPromptIds: []
      }
    })
  }
}
```

---

## 4. 状态管理

### 4.1 统一同步状态

```typescript
interface UnifiedSyncStatus {
  // 云端状态
  cloudEnabled: boolean
  cloudLoggedIn: boolean
  lastCloudSyncTime?: number
  cloudError?: string

  // 本地状态
  localEnabled: boolean
  lastLocalSyncTime?: number
  localError?: string
  folderName?: string
  permissionStatus?: 'granted' | 'prompt' | 'denied'

  // 整体状态
  hasUnsyncedChanges: boolean

  // 新增：云端同步待重试
  pendingCloudSync: boolean

  // 新增：本地独有数据待上传
  pendingUpload: boolean
  localOnlyItems: {
    promptIds: string[]
    categoryIds: string[]
    temporaryPromptIds: string[]
  }
}
```

### 4.2 Storage Schema 更新

```typescript
interface Settings {
  // ...existing fields

  // 云端同步状态
  lastCloudSyncTime?: number
  cloudLoggedIn?: boolean

  // 本地备份状态（保持）
  lastSyncTime?: number  // 改名为 lastLocalSyncTime
  syncEnabled: boolean
  hasUnsyncedChanges: boolean

  // 新增
  pendingCloudSync?: boolean
  pendingUpload?: boolean
  localOnlyItems?: {
    promptIds: string[]
    categoryIds: string[]
    temporaryPromptIds: string[]
  }
}
```

---

## 5. 错误处理与离线场景

### 5.1 错误分类

| 错误类型 | 处理策略 |
|----------|----------|
| `NOT_LOGGED_IN` | 提示登录，仅执行本地备份，标记 `pendingCloudSync` |
| `NETWORK_ERROR` | 仅本地备份，下次触发时自动重试云端 |
| `PERMISSION_DENIED` | 本地文件夹权限丢失，触发 permission restore 流程 |
| `SYNC_FAILED` | API 返回错误，记录错误日志，仅本地备份 |

### 5.2 离线检测

```typescript
async triggerSync(data: FullBackupData): Promise<void> {
  // 检测云端可用性（网络 + 登录状态）
  const cloudAvailable = await this.cloudStrategy.isAvailable()

  if (!cloudAvailable) {
    // 离线或未登录 → 仅本地备份
    await this.localStrategy.sync(data)
    await this.updateSyncStatus({
      lastLocalSyncTime: Date.now(),
      hasUnsyncedChanges: true,
      pendingCloudSync: true
    })
    return
  }

  // 在线且已登录 → 并行执行云端+本地
  const [cloudResult, localResult] = await Promise.all([
    this.cloudStrategy.sync(data),
    this.localStrategy.sync(data)
  ])

  if (cloudResult.success) {
    await this.updateSyncStatus({
      lastCloudSyncTime: Date.now(),
      lastLocalSyncTime: Date.now(),
      hasUnsyncedChanges: false,
      pendingCloudSync: false
    })
  } else {
    // 云端失败但本地成功 → 标记待同步
    await this.updateSyncStatus({
      lastLocalSyncTime: Date.now(),
      hasUnsyncedChanges: true,
      pendingCloudSync: true,
      cloudError: cloudResult.error
    })
  }
}
```

---

## 6. UI 设计

### 6.1 Tab 结构调整

| 旧结构 | 新结构 |
|--------|--------|
| 云端同步 | **同步与备份**（合并） |
| 本地备份 | （合并到上面） |
| AI识图 | AI识图 |
| 导入导出 | 导入导出 |

### 6.2 UnifiedSyncSection 布局

```
┌─────────────────────────────────────────────────┐
│ 同步与备份                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ 云端同步                          [状态指示] │ │
│ │ ─────────────────────────────────────────── │ │
│ │                                              │ │
│ │ [user@email.com] | Pro 用户 | [退出]         │ │
│ │ 上次同步：2026-05-10 14:30                   │ │
│ │                                              │ │
│ │ [手动同步] [从云端恢复]                       │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ 本地备份                          [状态指示] │ │
│ │ ─────────────────────────────────────────── │ │
│ │                                              │ │
│ │ 文件夹：/Users/xxx/omp-backup                │ │
│ │ 上次备份：2026-05-10 14:30                   │ │
│ │                                              │ │
│ │ [更换文件夹] [从本地恢复]                     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ⚠️ 本地有 3 个提示词未上传到云端 [立即上传]     │
│                                                 │
│ 提示：云端同步自动触发，本地备份作为双重保险     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 6.3 状态指示器

| 状态 | 云端颜色 | 本地颜色 |
|------|----------|----------|
| 已同步/正常 | 绿色 ✓ | 绿色 ✓ |
| 待同步（云端失败） | 黄色 ⏳ | 黄色 ⏳ |
| 待上传（本地独有数据） | 黄色 ⚠️ | - |
| 失败/权限丢失 | 红色 ❌ | 红色 ❌ |
| 未登录/未启用 | 灰色 | 灰色 |

### 6.4 下载完成提示（有本地独有数据时）

```
┌─────────────────────────────────────────────────┐
│ 同步完成                                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ ✓ 从云端下载 45 个提示词                         │
│                                                 │
│ ⚠️ 本地有 3 个提示词未上传到云端：               │
│   - "我的自定义提示词1"                          │
│   - "工作流模板"                                 │
│   - "测试用的提示词"                             │
│                                                 │
│ [立即上传] [稍后处理]                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 7. 数据库结构更新

### 7.1 新增 temporary_prompts 表

```sql
CREATE TABLE IF NOT EXISTS public.temporary_prompts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  content TEXT,
  content_en TEXT,
  category_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.temporary_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage own temporary prompts
CREATE POLICY "Users can manage own temporary prompts"
  ON public.temporary_prompts FOR ALL
  USING (auth.uid() = user_id);
```

### 7.2 扩展 user_sync_status 表

```sql
ALTER TABLE public.user_sync_status
ADD COLUMN IF NOT EXISTS last_local_sync_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pending_cloud_sync BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pending_upload BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS local_only_prompt_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS local_only_category_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS local_only_temporary_prompt_ids TEXT[] DEFAULT '{}';
```

### 7.3 API 变动

| API | 变动 |
|-----|------|
| `/api/sync/upload` | 增加 `temporaryPrompts` 字段处理 |
| `/api/sync/download` | 返回增加 `temporaryPrompts` |
| `/api/sync/status` | 返回增加 `pendingCloudSync`, `pendingUpload`, `localOnlyItems` |

---

## 8. 文件结构

### 8.1 新增文件

| 文件 | 作用 |
|------|------|
| `sync/orchestrator.ts` | 统一同步编排器 |
| `sync/strategies/base.ts` | SyncStrategy 接口定义 |
| `sync/strategies/cloud.ts` | 云端同步策略 |
| `sync/strategies/local.ts` | 本地同步策略 |
| `sync/types.ts` | 统一类型定义 |
| `sidepanel/settings/UnifiedSyncSection.tsx` | 合并后的同步 UI |

### 8.2 重构文件

| 文件 | 处理方式 |
|------|----------|
| `sync-manager.ts` | 重构为 `orchestrator.ts` |
| `cloud-sync-service.ts` | 作为 `CloudSyncStrategy` 的内部实现 |
| `file-sync.ts` | 作为 `LocalSyncStrategy` 的内部实现 |
| `CloudSyncSection.tsx` | 合并到 `UnifiedSyncSection.tsx` |
| `BackupSection.tsx` | 合并到 `UnifiedSyncSection.tsx` |

---

## 9. 迁移路径

### Phase 1: 基础架构重构

1. 创建 `SyncStrategy` 接口和基类
2. 将 `file-sync.ts` 包装为 `LocalSyncStrategy`
3. 将 `cloud-sync-service.ts` 包装为 `CloudSyncStrategy`
4. 创建 `SyncOrchestrator`

### Phase 2: 流程整合

1. 替换 `sync-manager.ts` 的调用为 `orchestrator`
2. 统一状态管理到 `UnifiedSyncStatus`
3. 更新 `StorageManager.updateSettings` 适配新状态结构

### Phase 3: 数据库更新

1. 创建 `temporary_prompts` 表
2. 扩展 `user_sync_status` 表字段
3. 更新 Web App API

### Phase 4: UI 合并

1. 创建 `UnifiedSyncSection` 组件
2. 更新 `SettingsView` Tab 结构
3. 添加本地独有数据提示 UI

### Phase 5: 测试与验证

1. 测试云端登录/登出流程
2. 测试自动同步触发
3. 测试合并逻辑（下载+保留本地独有）
4. 测试本地独有数据上传
5. 测试离线场景
6. 测试首次启动数据迁移

---

## 10. 首次启动迁移

### 10.1 迁移场景

| 场景 | 处理方式 |
|------|----------|
| 用户已有本地备份 | 检测后提示"是否同步到云端" |
| 用户已有云端数据 | 自动下载云端数据到本地 |
| 两边都有数据 | 执行合并逻辑 |
| 两边都无数据 | 正常启动，等待用户创建数据 |

### 10.2 迁移流程

```typescript
async initialSync(): Promise<void> {
  // 1. 检测云端登录状态
  const cloudAvailable = await this.cloudStrategy.isAvailable()
  const cloudData = cloudAvailable ? await this.cloudStrategy.restore() : null

  // 2. 检测本地备份
  const localData = await this.localStrategy.restore()

  // 3. 检测 chrome.storage 本地数据
  const storageData = await this.storageManager.getData()

  // 4. 数据优先级决策
  if (cloudData && storageData.userData.prompts.length === 0) {
    // 云端有数据，本地空 → 恢复云端数据
    await this.applyData(cloudData)
    await this.updateSyncStatus({ initialized: true })
    return
  }

  if (localData && storageData.userData.prompts.length === 0) {
    // 本地有数据，storage 空 → 恢复本地数据
    await this.applyData(localData)
    await this.updateSyncStatus({
      initialized: true,
      pendingCloudSync: cloudAvailable  // 如果云端可用，标记待同步
    })
    return
  }

  if (cloudData && localData && storageData.userData.prompts.length > 0) {
    // 三方都有数据 → 执行合并
    const mergeResult = await this.downloadAndMerge()

    // 如果有本地独有数据，提示用户
    if (mergeResult.localOnlyItems.prompts.length > 0) {
      // UI 显示提示："本地有数据未上传，是否立即上传？"
    }
  }

  await this.updateSyncStatus({ initialized: true })
}
```

### 10.3 首次启动 UI

```
┌─────────────────────────────────────────────────┐
│ 数据同步                                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ 检测到您已有本地备份：                           │
│   - 45 个提示词                                  │
│   - 12 个分类                                    │
│   - 备份时间：2026-05-08                         │
│                                                 │
│ 是否同步到云端？                                 │
│                                                 │
│ [同步到云端] [暂时保留本地]                      │
│                                                 │
│ 注：同步后云端将成为主数据源，本地仍保留备份     │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 11. 测试清单

- [ ] 云端登录/登出流程正常
- [ ] 创建提示词后自动触发云端同步
- [ ] 修改提示词后自动触发云端同步
- [ ] 删除提示词后自动触发云端同步
- [ ] 云端同步失败时自动回退到本地备份
- [ ] 离线时仅执行本地备份
- [ ] 从云端恢复后合并逻辑正确（云端覆盖相同ID）
- [ ] 本地独有数据正确识别并提示
- [ ] "立即上传"按钮上传本地独有数据
- [ ] 首次启动时数据迁移正确
- [ ] 本地文件夹权限丢失时 UI 显示正确
- [ ] Web App API 正确处理 temporaryPrompts