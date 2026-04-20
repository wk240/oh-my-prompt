# 版本升级兼容方案设计

> 设计日期: 2026-04-20
> 目标: 确保 1.0 版本用户数据在版本升级后不被清空，并提供本地文件夹备份机制

## 一、数据分类定义

| 数据来源 | 存储位置 | 版本升级时行为 |
|---------|---------|---------------|
| built-in-data.ts | 初始化后写入 chrome.storage → **userData** | 完全不动，100% 保留 |
| resource-library/prompts.json | 随扩展打包 → **只读展示** | 直接更新静态文件，与用户数据无关 |

**核心原则:**
- userData = 用户所有数据（包括从 built-in 初始化的，用户可自由修改删除）
- 一旦有用户数据存在，初始化不再覆盖写入 built-in-data
- 资源库作为参考展示，用户可从中"导入"到 userData，本身不入库

## 二、数据结构设计

### StorageSchema

```typescript
interface StorageSchema {
  version: string              // 扩展版本，从 manifest 动态获取
  userData: {
    prompts: Prompt[]          // 用户所有提示词
    categories: Category[]     // 用户所有分类
  }
  settings: {
    showBuiltin: boolean       // 是否显示资源库参考
    syncEnabled: boolean       // 是否启用本地文件夹同步
    lastSyncTime?: number      // 最后同步时间戳
  }
  _migrationComplete?: boolean // 迁移完成标记，防止重复执行
}
```

### 版本号管理

- **单一来源**: 只用 manifest.json 的 version
- **代码读取**: `chrome.runtime.getManifest().version`
- **删除硬编码常量**: 移除 `EXTENSION_VERSION` 常量

## 三、初始化逻辑

```typescript
async function initializeStorage(): Promise<StorageSchema> {
  const existingData = await chrome.storage.local.get(STORAGE_KEY)

  // 有用户数据 → 不初始化，直接返回
  if (existingData[STORAGE_KEY]?.userData?.prompts?.length > 0) {
    return existingData[STORAGE_KEY]
  }

  // 首次安装 → 写入 built-in-data 作为初始 userData
  const currentVersion = chrome.runtime.getManifest().version
  const initialData: StorageSchema = {
    version: currentVersion,
    userData: {
      prompts: [...BUILT_IN_PROMPTS],
      categories: [...BUILT_IN_CATEGORIES]
    },
    settings: {
      showBuiltin: true,
      syncEnabled: false
    },
    _migrationComplete: true
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: initialData })
  return initialData
}
```

## 四、版本迁移机制

### 触发时机

- Service Worker 启动时
- Popup 打开时
- Content Script 需要数据时（通过消息请求）

### 迁移入口

```typescript
async function checkAndMigrate(): Promise<StorageSchema> {
  const currentVersion = chrome.runtime.getManifest().version
  const data = await storageManager.getData()

  // 首次安装（无数据）
  if (!data || !data.version) {
    return initializeStorage()
  }

  // 版本相同且迁移已完成
  if (data.version === currentVersion && data._migrationComplete) {
    return data
  }

  // 执行迁移
  return migrate(data, currentVersion)
}
```

### 迁移函数结构

```typescript
// src/lib/migrations/index.ts
interface MigrationStep {
  version: string
  handler: (data: any) => StorageSchema
}

const migrations: MigrationStep[] = [
  { version: '1.0', handler: migrateFromLegacy },  // 旧结构 → 新结构
  // 后续版本迁移在此添加...
]

async function migrate(oldData: any, targetVersion: string): Promise<StorageSchema> {
  const startVersion = oldData.version || '1.0'

  // 找出所有需要执行的迁移步骤
  const steps = migrations.filter(m =>
    semverCompare(m.version, startVersion) >= 0 &&
    semverCompare(m.version, targetVersion) < 0
  )

  // 依次执行迁移
  let data = oldData
  for (const step of steps) {
    data = step.handler(data)
  }

  // 更新版本号和迁移标记
  data.version = targetVersion
  data._migrationComplete = true

  await storageManager.saveData(data)
  return data
}
```

### 1.0 旧数据迁移

```typescript
function migrateFromLegacy(oldData: any): StorageSchema {
  // 旧结构: { prompts: [], categories: [], version: '1.0.0' }

  return {
    version: oldData.version,  // 临时保留，最终迁移会更新
    userData: {
      prompts: oldData.prompts || [],
      categories: oldData.categories || []
    },
    settings: {
      showBuiltin: true,
      syncEnabled: false
    },
    _migrationComplete: false  // 等待最终迁移完成
  }
}
```

## 五、本地文件夹同步机制

### 技术方案: File System Access API

用户授权文件夹后，扩展可持续读写本地文件。扩展卸载后文件仍存在。

### IndexedDB 存储句柄

`FileSystemDirectoryHandle` 无法存入 chrome.storage，必须用 IndexedDB。

```typescript
// 数据库名: 'oh-my-prompt-script-sync'
// 存储表: 'handles'
// 存储键: 'syncFolderHandle'

async function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('oh-my-prompt-script-sync', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('handles')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openSyncDB()
  await db.put('handles', handle, 'syncFolderHandle')
}

async function getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openSyncDB()
  const handle = await db.get('handles', 'syncFolderHandle')

  if (handle) {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      // 尝试请求权限
      const requested = await handle.requestPermission({ mode: 'readwrite' })
      if (requested !== 'granted') return null
    }
  }
  return handle
}
```

### 同步文件格式

```
用户选择的文件夹/
├── user-prompts.json    # 用户数据
└── .sync-meta.json      # 同步元数据（可选）
```

**user-prompts.json:**
```json
{
  "version": 1,
  "prompts": [...],
  "categories": [...],
  "exportedAt": 1713525600000
}
```

### 读写函数

```typescript
async function syncToLocalFolder(
  data: StorageSchema['userData'],
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const fileHandle = await handle.getFileHandle('user-prompts.json', { create: true })
  const writable = await fileHandle.createWritable()

  await writable.write(JSON.stringify({
    version: 1,
    prompts: data.prompts,
    categories: data.categories,
    exportedAt: Date.now()
  }, null, 2))

  await writable.close()
}

async function readFromLocalFolder(
  handle: FileSystemDirectoryHandle
): Promise<{ prompts: Prompt[], categories: Category[] } | null> {
  try {
    const fileHandle = await handle.getFileHandle('user-prompts.json')
    const file = await fileHandle.getFile()
    const content = await file.text()
    const parsed = JSON.parse(content)

    if (!parsed.prompts || !parsed.categories) {
      console.warn('[Oh My Prompt Script] Invalid local file format')
      return null
    }

    return { prompts: parsed.prompts, categories: parsed.categories }
  } catch {
    return null
  }
}
```

### 首次启动同步流程

```typescript
async function initialSync(): Promise<void> {
  const handle = await getFolderHandle()

  if (!handle) {
    // 无已授权文件夹 → 静默继续，等待用户在设置中配置
    return
  }

  const localData = await readFromLocalFolder(handle)
  const storageData = await storageManager.getData()

  // 本地有数据，chrome.storage 空 → 从本地恢复
  if (localData && storageData.userData.prompts.length === 0) {
    await storageManager.saveData({
      ...storageData,
      userData: localData
    })
    console.log('[Oh My Prompt Script] Restored from local folder')
    return
  }

  // 双方都有数据 → 优先使用 chrome.storage，同步到本地
  if (localData && storageData.userData.prompts.length > 0) {
    await syncToLocalFolder(storageData.userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })
  }
}
```

### 数据变更同步触发

```typescript
// 在 store.ts 的每次 CRUD 操作后调用
async function triggerSync(): Promise<void> {
  const data = await storageManager.getData()

  if (!data.settings?.syncEnabled) return

  const handle = await getFolderHandle()
  if (!handle) {
    await storageManager.updateSettings({ syncEnabled: false })
    notifySyncError('文件夹权限已失效，请重新授权')
    return
  }

  try {
    await syncToLocalFolder(data.userData, handle)
    await storageManager.updateSettings({ lastSyncTime: Date.now() })
  } catch (e) {
    notifySyncError('同步失败')
  }
}
```

## 六、异常场景处理

| 场景 | 处理策略 |
|-----|---------|
| 文件夹权限失效 | syncEnabled → false，UI 显示警告横幅 |
| 本地文件损坏/格式错误 | 跳过读取，使用 chrome.storage 数据，日志警告 |
| chrome.storage 意外清空 | 从本地文件恢复（若 syncEnabled 且文件存在） |
| 用户删除本地文件 | 下次同步时重新创建 |
| 写入失败（磁盘满/权限） | 显示错误通知，数据仍保存在 chrome.storage |

## 七、设置界面同步配置

```
┌─────────────────────────────────────┐
│  本地备份同步                        │
├─────────────────────────────────────┤
│  ☑ 启用自动同步                      │
│                                      │
│  备份文件夹：D:\我的提示词备份        │
│  [更改文件夹]                        │
│                                      │
│  最后同步：2025-04-20 14:30          │
│  [立即同步]                          │
│                                      │
│  ⚠️ 提示：数据变更时自动同步到本地   │
│     扩展卸载后数据仍可从此文件夹恢复 │
└─────────────────────────────────────┘
```

## 八、文件结构变更

**新增文件:**
```
src/lib/migrations/
  index.ts          # 迁移管理器
  v1.0.ts           # 1.0 → 新结构迁移
src/lib/sync/
  indexeddb.ts      # IndexedDB 句柄存储
  file-sync.ts      # 文件读写同步
  sync-manager.ts   # 同步触发管理
```

**修改文件:**
```
src/shared/types.ts         # StorageSchema 重构
src/shared/constants.ts     # 移除 EXTENSION_VERSION 常量
src/lib/storage.ts          # 初始化逻辑重构
src/lib/store.ts            # CRUD 后触发同步
src/popup/App.tsx           # 设置界面新增同步配置
```

## 九、实现优先级

1. **P0 - 核心迁移**: 数据结构重构 + 1.0 迁移函数
2. **P0 - 初始化**: 检测已有数据逻辑
3. **P1 - 本地同步**: IndexedDB + File Sync API 实现
4. **P1 - 设置界面**: 同步配置 UI
5. **P2 - 异常处理**: 完善错误提示和恢复机制