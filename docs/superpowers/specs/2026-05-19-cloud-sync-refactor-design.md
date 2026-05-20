# 云端同步重构设计：iCloud 风格透明备份系统

**日期**：2026-05-19
**目标**：让备份完全透明自动化，用户只需看到"数据是否安全"，无需手动触发或理解复杂状态

---

## 1. 核心架构

### 1.1 数据流设计

```
数据变更 → 立即自动备份 → 云端 + 本地并行 (Promise.all) → 失败自动重试
```

**简化逻辑**：
- 每次数据变更后自动触发备份，无需用户干预
- 备份完全透明，用户不感知"触发"动作
- 云端和本地并行备份，互不依赖
- 备份失败时自动重试（指数退避：1s → 5s → 30s → 5min）
- 用户可关闭其中一个备份方式（仅云端 / 仅本地）

### 1.2 状态模型（去掉顶层抽象，只保留两行独立状态）

```typescript
// 不再需要顶层 BackupStatus 类型
// 用户看到的永远是两行独立状态，不关心整体是 secure/partial/error

// 状态存储结构
interface BackupStatusStorage {
  cloud: {
    enabled: boolean       // 是否启用云端备份
    loggedIn: boolean      // 是否已登录
    lastSyncTime: number | null  // 上次成功备份时间戳
    syncing: boolean       // 当前是否正在同步中
    error: string | null   // 失败原因（用于错误提示）
    retryCount: number     // 连续失败次数（用于显示重试状态）
  }
  local: {
    enabled: boolean       // 是否启用本地备份
    folderName: string | null
    lastSyncTime: number | null
    syncing: boolean
    error: string | null
    retryCount: number
    permissionStatus: 'granted' | 'prompt' | 'denied'
  }
}
```

**去掉的字段**：
- `pendingChanges`：备份是立即执行的，没有"待备份"数据
- 顶层 `BackupStatus` 类型：用户只关心"云端 OK？"和"本地 OK？"，不关心整体抽象状态
```

---

## 2. UI 界面设计

### 2.1 统一备份区块（去掉手动触发按钮）

```
┌─────────────────────────────────────┐
│ 🔄 数据备份                          │
│ ──────────────────────────────────  │
│                                     │
│ ☁️ 云端 ✅ 已同步 · 刚刚             │
│ 💾 本地 ✅ 已备份 · 刚刚             │
│                                     │
│ [更多选项 ▼]                         │
└─────────────────────────────────────┘
```

**状态指示（分行显示，无手动按钮）**：
- 云端行：
  - `✅ 已同步 · 刚刚` — 成功，时间戳实时更新
  - `🔄 同步中...` — 正在备份
  - `⏳ 等待重试 (第2次)` — 失败后自动重试
  - `⚠️ 未登录` — 需要用户操作
  - `🔴 备份失败 · 点击查看` — 连续失败，需要用户干预
- 本地行：
  - `✅ 已备份 · 刚刚`
  - `🔄 备份中...`
  - `⚠️ 未配置文件夹`
  - `🔴 权限丢失 · 点击修复`

**去掉"立即备份"按钮的原因**：
- 备份是自动透明的，用户不需要手动触发
- 如果用户看到"立即备份"按钮，会产生疑虑："是不是自动备份不可靠？"
- iCloud 风格：用户只关心状态，不关心触发动作

### 2.2 更多选项（折叠）

```
┌─────────────────────────────────────┐
│ ☁️ 云端备份                          │
│ ──────────────────────────────────  │
│ 状态：已登录        [退出登录]       │
│                                     │
│ 💾 本地备份                          │
│ ──────────────────────────────────  │
│ 文件夹：omps-backup                  │
│ [更换文件夹]  [查看历史]             │
│                                     │
│ ──────────────────────────────────  │
│ 🔄 多设备同步                        │
│ ──────────────────────────────────  │
│ [合并云端数据]  [查看差异]           │
│                                     │
│ ⚠️ 应急导出                          │
│ ──────────────────────────────────  │
│ [导出所有数据到文件]                 │
│ (当备份全部失败时的应急方案)         │
└─────────────────────────────────────┘
```

**新增功能**：
- **合并云端数据**：双向同步，不是单向覆盖
- **查看差异**：预览云端和本地的数据差异
- **应急导出**：当所有备份都失败时，提供手动导出选项

---

## 3. 实现细节

### 3.1 备份触发逻辑

**复用现有 SyncOrchestrator.triggerSync()**：

```typescript
// service-worker.ts SET_STORAGE handler
storageManager.saveData(mergedData)
  .then(() => {
    const backupData = {
      prompts: savedData.userData.prompts,
      categories: savedData.userData.categories,
      temporaryPrompts: savedData.temporaryPrompts || [],
      timestamp: Date.now()
    }
    return syncOrchestrator.triggerSync(backupData)
  })
  .then(result => {
    updateBackupStatus(result)
    sendResponse({ success: true })
  })
```

**triggerSync 改造**：
- 去除 pendingUpload、localOnlyItems 等复杂状态
- 直接返回云端/本地各自的成功/失败状态

### 3.2 UI 组件结构

```
packages/extension/src/sidepanel/settings/
├── BackupSection.tsx        # 统一备份区块（替代 UnifiedSyncSection）
├── BackupStatusRow.tsx      # 状态行组件（云端/本地各一行）
├── BackupMoreOptions.tsx    # 折叠的更多选项
└── BackupHistoryModal.tsx   # 备份历史弹窗
```

### 3.3 BackupSection 核心结构

```typescript
function BackupSection() {
  const [status, setStatus] = useState<BackupStatusStorage | null>(null)

  useEffect(() => {
    loadBackupStatus().then(setStatus)
  }, [])

  // 监听备份完成事件，刷新状态
  useEffect(() => {
    const listener = (msg) => {
      if (msg.type === 'BACKUP_COMPLETE') {
        loadBackupStatus().then(setStatus)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  return (
    <div className="backup-section">
      <BackupStatusRow type="cloud" status={status?.cloud} />
      <BackupStatusRow type="local" status={status?.local} />

      <Button onClick={handleImmediateBackup}>立即备份</Button>
      <Collapsible title="更多选项">
        <BackupMoreOptions status={status} />
      </Collapsible>
    </div>
  )
}
```

---

## 4. 数据一致性策略

### 4.1 备份失败处理与用户告知

```
云端失败 → 自动重试（指数退避） → 连续失败3次后提示用户干预
本地失败 → 自动重试 → 连续失败后提示用户修复权限或更换文件夹

两方都失败：
  → 显示醒目红色警告："数据仅存在于本地存储，扩展卸载后将丢失"
  → 自动提供"应急导出"按钮，让用户手动保存数据
  → 每次数据变更后继续尝试备份
```

**用户告知层级**：
1. **正在备份**：显示 `🔄 同步中...`，时间戳暂时不更新
2. **单次失败**：静默重试，不打扰用户
3. **连续失败**：显示 `⏳ 等待重试 (第N次)`，让用户知道系统在努力
4. **需要干预**：显示 `🔴 备份失败 · 点击查看`，提供修复建议
5. **严重风险**（两方都失败）：醒目警告 + 应急导出选项

### 4.2 合并策略（真正的多设备同步）

**原则**：用合并代替替换，支持真正的多设备同步。

```
用户点击"合并云端数据"：
  1. 获取云端数据
  2. 与本地数据对比（按 prompt.id 匹配）
  3. 合并规则：
     - 本地有、云端无 → 上传到云端
     - 云端有、本地无 → 下载到本地
     - 两边都有 → 比较 updatedAt，保留最新版本
     - 两边都有但 updatedAt 相同 → 保留修改内容更多的版本
  4. 显示预览：
     "云端有 23 条，本地有 18 条，合并后将有 25 条"
     "3 条将更新为最新版本，2 条新增到本地"
  5. 用户确认后执行合并
```

**预览界面**：
```
┌─────────────────────────────────────┐
│ 🔄 合并预览                          │
│ ──────────────────────────────────  │
│ 云端：23 条 prompts                  │
│ 本地：18 条 prompts                  │
│ 合并后：25 条                        │
│                                     │
│ 变更明细：                           │
│ • 新增 2 条到本地                    │
│ • 更新 3 条为最新版本                │
│ • 上传 5 条到云端                    │
│                                     │
│ [确认合并]  [取消]                   │
└─────────────────────────────────────┘
```

**冲突处理**（相同 ID，两边都修改过）：
```
┌─────────────────────────────────────┐
│ ⚠️ 冲突：prompt "设计风格"           │
│ ──────────────────────────────────  │
│ 云端版本（修改于 5月15日）：          │
│ "简洁现代风格..."                    │
│                                     │
│ 本地版本（修改于 5月18日）：          │
│ "极简主义风格..."                    │
│                                     │
│ [保留云端版本]  [保留本地版本]        │
│ [保留两者（创建副本）]               │
└─────────────────────────────────────┘
```

---

## 5. 迁移计划

### 5.1 需要保留的模块

```
✅ 保留：
- SyncOrchestrator.triggerSync() → 改造为自动重试逻辑
- CloudSyncStrategy → 复用
- LocalSyncStrategy → 复用
- Offscreen 文件操作 → 完全保留
- IndexedDB 文件夹 handle 存储 → 宍全保留
- Auth OAuth 流程 → 完全保留
```

### 5.2 需要删除的模块

```
❌ 删除：
- UnifiedSyncSection.tsx → 替换为 BackupSection.tsx
- "立即备份"按钮 → 完全去掉
- SyncOrchestrator.downloadAndMerge() → 替换为双向合并逻辑
- SyncOrchestrator.uploadLocalOnlyItems() → 不再需要（合并逻辑处理）
- syncStatus.pendingUpload / localOnlyItems → 简化删除
- BackupStatus 类型 → 去掉顶层抽象状态
- pendingChanges 字段 → 去掉
```

### 5.3 需要改造的模块

```
🔄 改造：
- sync-manager.ts triggerSync → 添加自动重试逻辑（指数退避）
- service-worker.ts SET_STORAGE → 自动调用 triggerSync（用户无感知）
- StorageSchema.settings → 合并为 BackupStatusStorage（去掉 pendingChanges）
- MessageType → 添加 BACKUP_PROGRESS / BACKUP_RETRY 消息类型
- 合并逻辑 → 新增双向合并 + 冲突检测 + 预览功能
- 应急导出 → 新增功能
```

### 5.4 迁移步骤

**Phase 1：核心架构改造**
1. 去掉 `BackupStatus` 类型，只保留两行独立状态
2. 去掉 `pendingChanges` 字段
3. `BackupStatusStorage` 添加 `syncing` / `retryCount` 字段
4. 简化 `SyncOrchestrator.triggerSync()` 返回值
5. 添加自动重试逻辑（指数退避：1s → 5s → 30s → 5min）
6. 添加 `MessageType.BACKUP_PROGRESS` / `BACKUP_RETRY`
7. 数据迁移脚本（合并现有 syncStatus + settings）

**Phase 2：UI 重构**
1. 创建 `BackupSection.tsx` 替换 `UnifiedSyncSection.tsx`
2. **去掉"立即备份"按钮**
3. 创建 `BackupStatusRow.tsx` 状态行组件（支持"同步中"/"等待重试"状态）
4. 创建 `BackupMoreOptions.tsx` 折叠选项
5. 创建 `MergePreviewModal.tsx` 合并预览弹窗
6. 创建 `ConflictResolutionModal.tsx` 冲突解决弹窗
7. 创建 `EmergencyExport.tsx` 应急导出功能

**Phase 3：合并逻辑实现**
1. 实现双向合并算法
2. 实现 ID 匹配 + updatedAt 比较
3. 实现冲突检测与解决界面
4. 实现合并预览（显示变更明细）

**Phase 4：测试验证**
1. 测试自动备份触发（编辑 → 自动备份 → 时间戳更新）
2. 测试备份失败 → 自动重试 → 用户干预
3. 测试两方都失败 → 警告显示 → 应急导出
4. 测试多设备合并（云端 + 本地 → 合并预览 → 确认）
5. 测试冲突解决（相同 ID 两边修改）
6. 测试云端登录/退出
7. 测试本地文件夹更换/权限修复

---

## 6. 回滚计划

**风险点**：合并逻辑可能导致数据丢失或重复

**回滚方案**：
```typescript
// 合并前创建本地数据快照
const localSnapshot = await chrome.storage.local.get('prompt_script_data')
await chrome.storage.local.set({
  _backupSnapshot: {
    data: localSnapshot,
    timestamp: Date.now(),
    reason: 'pre-merge'
  }
})

// 如果检测到回滚标志，恢复快照
if (await needsRollback()) {
  const snapshot = await chrome.storage.local.get('_backupSnapshot')
  await chrome.storage.local.set(snapshot.data)
  await chrome.storage.local.remove('_backupSnapshot')
}
```

---

## 7. 成功标准

1. **完全透明**：用户编辑后自动备份，无需任何手动操作
2. **状态清晰**：一眼看出云端和本地是否已备份（"同步中"/"等待重试"/"失败"）
3. **时间戳实时**：备份成功后时间戳立刻更新为"刚刚"
4. **失败有兜底**：连续失败后提供用户干预建议；两方都失败时提供应急导出
5. **真正的同步**：多设备间用合并代替覆盖，保留最新版本
6. **冲突可视化**：相同数据两边修改时，让用户选择保留哪个版本
7. **数据安全**：用户明确知道数据存储位置和风险