# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2026-04-27

### Added / 新增
- **[EN]** Content hash deduplication for backup history to prevent duplicate backups
- **[CN]** 备份历史添加内容哈希去重，防止重复备份

### Fixed / 修复
- **[EN]** Thumbnail loss when switching between user data and resource library
- **[CN]** 切换用户数据和资源库时缩略图丢失
- **[EN]** Unwanted backup trigger on language toggle
- **[CN]** 语言切换时意外触发备份
- **[EN]** Removed beforeunload handler that caused errors on page close
- **[CN]** 移除导致页面关闭错误的 beforeunload 处理器

## [1.2.0] - 2026-04-27

### Added / 新增

#### Bilingual Support / 双语支持
- **[EN]** Added Chinese/English bilingual support for built-in prompts and resource library
- **[CN]** 新增内置提示词和资源库的中英双语支持，支持一键切换语言

#### Prompt Image Feature / 提示词图片功能
- **[EN]** Added image upload/edit support for user prompts (60x40 thumbnail preview)
- **[CN]** 新增用户提示词图片上传/编辑功能，支持 60x40 缩略图预览
- **[EN]** Added prompt preview modal triggered by thumbnail click
- **[CN]** 新增缩略图点击触发提示词预览模态框
- **[EN]** Integrated image support with local folder backup sync
- **[CN]** 图片支持与本地文件夹备份同步集成

#### Resource Library Enhancement / 资源库增强
- **[EN]** Added 276 prompts from prompts.chat (online resource library)
- **[CN]** 新增来自 prompts.chat 的 276 个提示词（在线资源库）
- **[EN]** Completed full Chinese translation for all resource library prompts (639 prompts, 100%)
- **[CN]** 完成资源库全部提示词的中译（639 个提示词，100%覆盖率）

### Changed / 变更

#### Performance Optimization / 性能优化
- **[EN]** Added debounce to storage operations for batched writes, reducing I/O overhead
- **[CN]** 存储操作添加 debounce，批量写入减少 I/O 开销
- **[EN]** Optimized thumbnail batch loading with lazy loading and queue mechanism
- **[CN]** 优化缩略图批量加载，采用懒加载和队列机制
- **[EN]** Extracted Portal styles as constant to avoid repeated generation
- **[CN]** Portal 样式提取为常量，避免重复生成
- **[EN]** Memoized helper methods with useCallback to prevent unnecessary re-renders
- **[CN]** 辅助方法使用 useCallback 记忆化，防止不必要的重渲染
- **[EN]** Consolidated modal states in DropdownContainer for better state management
- **[CN]** DropdownContainer 中整合模态框状态，优化状态管理
- **[EN]** Resolved memory leak and race condition in prompt edit modal image handling
- **[CN]** 解决提示词编辑模态框图片处理的内存泄漏和竞态条件

#### UI Improvements / UI 改进
- **[EN]** Added hover preview for user prompt thumbnails
- **[CN]** 新增用户提示词缩略图的 hover 预览
- **[EN]** Added global language switch in resource library header and preview modal
- **[CN]** 资源库顶部和预览模态框新增全局语言切换
- **[EN]** Changed language toggle button from black to white for better visibility
- **[CN]** 语言切换按钮从黑色改为白色，提升可见性
- **[EN]** Shortened language toggle text from ENG to EN
- **[CN]** 语言切换文字从 ENG 缩短为 EN

### Fixed / 修复
- **[EN]** Added global mouse tracking as tooltip close fallback
- **[CN]** 新增全局鼠标追踪作为 tooltip 关闭的兜底方案
- **[EN]** Fixed bilingual data preservation when opening prompt detail modal
- **[CN]** 修复打开提示词详情模态框时双语数据丢失问题
- **[EN]** Fixed image transfer cross-origin issue with plain array instead of ArrayBuffer
- **[CN]** 使用普通数组替代 ArrayBuffer 解决图片传输跨域问题
- **[EN]** Fixed promise leakage and beforeunload async issues in sync manager
- **[CN]** 同步管理器中的 promise 泄漏和 beforeunload 异步问题修复

## [1.1.5] - 2026-04-25

### Fixed / 修复
- **[EN]** Support version extraction from arbitrary tag formats
- **[CN]** 支持从任意 tag 格式提取版本号
- **[EN]** Expanded update notification display area for bilingual text
- **[CN]** 扩展更新说明显示区域，支持中英双语完整展示
- **[EN]** Auto-restore folder permission after extension update
- **[CN]** 扩展更新后自动恢复文件夹权限，无需重新选择

## [1.1.4] - 2026-04-25

### Added / 新增
- **[EN]** Local folder auto-backup feature (File System Access API)
- **[CN]** 新增文件夹自动备份功能（File System Access API）
- **[EN]** Version history management and restore from any backup version
- **[CN]** 支持版本历史管理和从任意备份版本恢复
- **[EN]** Unsynced notification and backup warning reminders
- **[CN]** 新增未同步提示和备份警告提醒

### Changed / 变更
- **[EN]** Optimized popup UI with Chinese/English bilingual toggle
- **[CN]** 优化 popup 界面，支持中英双语切换
- **[EN]** Improved version check logic with GitHub Release API
- **[CN]** 改进版本检查逻辑，支持 GitHub Release API

### Fixed / 修复
- **[EN]** Fixed permission loss issue, auto-restore folder access after update
- **[CN]** 修复权限丢失问题，更新后自动恢复文件夹访问权限

## [1.1.3] - 2026-04-24

### Added
- 新增文件夹自动备份功能（File System Access API）
- 支持版本历史管理和从任意备份版本恢复
- 新增未同步提示和备份警告提醒

### Changed
- 优化 popup 界面，支持中英双语切换
- 改进版本检查逻辑，支持 GitHub Release API

### Fixed
- 修复权限丢失问题，更新后自动恢复文件夹访问权限