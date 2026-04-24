---
quick_id: 20260425-backup-warning
slug: backup-warning
description: 首次安装或没有检测到开启备份时，提醒用户选择备份文件夹，避免数据丢失风险
mode: quick
created: 2026-04-25
---

# Quick Task: 备份警告提示

## Goal

首次安装或没有检测到开启备份时，提醒用户选择备份文件夹，避免数据丢失风险。

## Context

### 现有代码分析

1. **BackupApp.tsx** (`src/popup/BackupApp.tsx`)
   - 已有 `!status.hasFolder` 时显示"选择文件夹以启用备份"
   - 但提示不够醒目，没有强调数据丢失风险
   - 有 `loadBackupDialog` 用于加载已有备份的对话框

2. **SyncStatus** (`src/lib/sync/sync-manager.ts:8-14`)
   ```ts
   interface SyncStatus {
     enabled: boolean
     hasFolder: boolean
     lastSyncTime?: number
     folderName?: string
   }
   ```

3. **StorageSchema** (`src/shared/types.ts`)
   - `settings.syncEnabled` 标记备份是否启用
   - 没有"首次打开"标记

### 用户需求

用户希望在：
- 首次安装时（没有备份设置）
- 或者没有检测到开启备份时
显示醒目的提醒，让用户选择备份文件夹。

## Plan

### Task 1: 添加备份警告提示对话框

**Files:**
- `src/popup/BackupApp.tsx`

**Action:**
1. 添加新的状态 `showBackupWarning` 控制警告对话框显示
2. 在 `loadStatus` 后检测：
   - `!hasFolder` 且 `(prompts.length > 0 || !syncEnabled)` → 显示警告
3. 创建醒目的警告对话框 UI：
   - 标题："数据安全提醒"
   - 内容：强调数据丢失风险（扩展卸载后数据会丢失）
   - 按钮："选择备份文件夹" + "稍后提醒"

**Verify:**
- `npm run build` 成功
- 打开 popup 时，如果没有备份设置，显示警告对话框
- 用户可以选择备份或跳过

**Done:**
- 警告对话框组件已添加
- 检测逻辑已实现
- UI 样式醒目（使用警告色）

### Task 2: 添加"不再提醒"选项

**Files:**
- `src/shared/types.ts` (添加 `dismissedBackupWarning` 到 SyncSettings)
- `src/lib/storage.ts` (更新 getDefaultSettings)
- `src/popup/BackupApp.tsx` (添加不再提醒逻辑)

**Action:**
1. 在 `SyncSettings` 中添加 `dismissedBackupWarning?: boolean`
2. 在警告对话框中添加"不再提醒"选项
3. 用户选择后存储到 settings

**Verify:**
- 点击"不再提醒"后，下次不再显示警告
- 设置已持久化

**Done:**
- 类型已更新
- 存储逻辑已实现
- UI 已添加"不再提醒"复选框