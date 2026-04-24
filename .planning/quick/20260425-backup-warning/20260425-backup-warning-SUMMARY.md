---
status: complete
quick_id: 20260425-backup-warning
slug: backup-warning
description: 首次安装或没有检测到开启备份时，提醒用户选择备份文件夹，避免数据丢失风险
mode: quick
created: 2026-04-25
---

# Summary: 备份警告提示（修正位置）

## Changes Made

警告提示现在显示在首页（Lovart 页面注入的下拉菜单），而不是备份页面。

### 1. src/shared/types.ts
- `SyncSettings` 添加 `dismissedBackupWarning?: boolean` 字段

### 2. src/shared/messages.ts
- 添加 `DISMISS_BACKUP_WARNING` 消息类型

### 3. src/lib/sync/sync-manager.ts
- `SyncStatus` 添加 `dismissedBackupWarning` 字段
- `getSyncStatus()` 返回该字段

### 4. src/background/service-worker.ts
- 添加 `DISMISS_BACKUP_WARNING` 消息处理，更新 settings

### 5. src/content/components/DropdownContainer.tsx
- 添加首次备份警告状态：`showFirstBackupWarning`, `backupWarningPromptCount`, `dontShowBackupWarning`
- 在 dropdown 打开时检测：用户有提示词且未设置备份 → 显示警告
- 添加醒目的橙色警告 banner（带 AlertTriangle 图标）
- 显示提示词数量和风险说明
- "设置备份" + "稍后" + "不再提醒" 选项

### 6. src/popup/BackupApp.tsx
- 恢复到原始状态（移除之前错误添加的警告对话框）

## User Flow

1. 用户在 Lovart 页面点击下拉菜单图标
2. 系统检测：`!hasFolder && prompts.length > 0 && !dismissedBackupWarning`
3. 显示橙色警告 banner
4. 用户选择：
   - "设置备份" → 打开备份页面
   - "稍后" → 关闭警告
   - "不再提醒" → 存储 preference

## Files Changed

- src/shared/types.ts
- src/shared/messages.ts
- src/lib/sync/sync-manager.ts
- src/background/service-worker.ts
- src/content/components/DropdownContainer.tsx
- src/popup/BackupApp.tsx

## Verification

- `npm run build` 成功
- UI 显示醒目的橙色警告 banner（在首页下拉菜单）