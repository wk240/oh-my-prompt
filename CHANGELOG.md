# Changelog

All notable changes to this project will be documented in this file.

## [2.0.2] - 2026-06-27

本次更新重点增强提示词图片的云端同步、恢复和清理链路，并修复团队资源库、临时提示词删除、登录后同步等稳定性问题。

### Added / 新增
- **[CN]** 新增提示词图片元数据合同、哈希与合并能力，支持图片信息在本地备份和云同步中可靠流转
- **[EN]** Added prompt image metadata contracts, hashing, and merge support for reliable local backup and cloud sync
- **[CN]** 新增图片资产服务和云端图片客户端，支持图片标准化为 WebP、上传、下载和恢复校验
- **[EN]** Added image asset service and cloud image client with WebP normalization, upload, download, and restore validation
- **[CN]** 新增云端图片缺失恢复队列，可在元数据同步后通过 service worker 异步恢复可见图片
- **[EN]** Added cloud-backed missing image restore queue with service worker based async recovery after metadata sync
- **[CN]** 新增图片恢复前的本地文件夹授权提示，降低恢复失败概率
- **[EN]** Added local folder permission prompt before image restore to reduce restore failures

### Fixed / 修复
- **[CN]** 修复临时提示词无法删除的问题
- **[EN]** Fixed temporary prompt deletion being blocked
- **[CN]** 修复团队资源库选择器和团队创建相关 Web App 集成问题
- **[EN]** Fixed team library selector and team creation related web app integration issues
- **[CN]** 修复登录后同步加固、缺失分类修复和云同步失败提示问题
- **[EN]** Hardened sync after login, repaired missing local categories, and surfaced cloud sync failures
- **[CN]** 修复图片元数据在本地备份、恢复、后台同步和冲突合并中的丢失问题
- **[EN]** Fixed image metadata loss across local backups, restore, background sync, and conflict merges
- **[CN]** 修复图片恢复队列状态、重试退避、过期重试和非阻塞入队逻辑
- **[EN]** Fixed image restore queue status, retry backoff, stale retries, and non-blocking enqueue behavior
- **[CN]** 修复图片删除、批量删除和重试排空过程中的资产清理竞态
- **[EN]** Fixed asset cleanup races during image deletion, bulk deletion, and retry drains
- **[CN]** 收紧图片悬浮提示词按钮的命中区域，避免误触
- **[EN]** Constrained the image hover prompt button hit test to avoid accidental triggers

### Changed / 变更
- **[CN]** 更新 Web App 子模块，包含图片路由鉴权、上传、同步元数据和测试接线相关调整
- **[EN]** Updated the web app submodule for image route auth, upload, sync metadata, and test wiring changes
- **[CN]** 增强图片资产生命周期在扩展 UI、同步策略和云端回退路径中的一致性
- **[EN]** Improved image asset lifecycle consistency across extension UI, sync strategies, and cloud fallback paths

### Docs / 文档
- **[CN]** 补充提示词图片云端恢复、资产存储、云端回退和 Agent 演示说明
- **[EN]** Documented prompt image cloud restore, asset storage, cloud fallback, and Agent demo notes

### Tests / 测试
- **[CN]** 补充图片恢复异步 worker、消息处理和云端图片哈希不匹配场景测试
- **[EN]** Added tests for image restore async workers, worker messages, and cloud image hash mismatch cases

## [2.0.1] - 2026-05-26

这是 v2.0 大版本后的首个修复版本。v2.0 引入了云同步、账号登录、官方 API 额度、会员能力和团队协作等商业化基础能力；本次更新主要补齐免费额度引导、优化账号额度展示，并修复登录回调和内容脚本注入稳定性问题。

### Added / 新增
- 增加免费官方 API 试用额度展示
- 在登录状态中暴露官方 API 额度信息
- 引导免费额度用户完成升级

### Fixed / 修复
- 修复 OAuth 回调后页面未自动关闭的问题
- 提升内容脚本注入稳定性
- 修复账号卡片中官方额度展示不准确的问题
- 修复权限恢复后图片加载偶发失败的问题
- 修复官方额度降级兜底逻辑

### Changed / 变更
- 更新 Web App 子模块，包含登录、额度和配额相关调整
- 对齐同步集成测试中的状态预期

## [2.0.0] - 2026-05-25

### Added / 新增
- **[EN]** Commercial MVP foundation with cloud sync, auth integration, and membership-gated capabilities
- **[CN]** 商业化 MVP 基础能力：云同步、登录集成和会员权限控制
- **[EN]** Team collaboration flows, including team libraries and prompt sharing from sidepanel/content UI
- **[CN]** 团队协作流程，包括团队资源库以及从侧边栏/内容脚本分享提示词
- **[EN]** Agent and ecommerce writing workflows with multi-image reference support and structured results
- **[CN]** Agent 与电商文案工作流，支持多参考图和结构化结果
- **[EN]** RunningHub platform support and broader rich-editor insertion coverage
- **[CN]** 新增 RunningHub 平台支持，并扩大富文本编辑器插入覆盖范围
- **[EN]** Official Vision/API provider integration with quota and subscription-aware UI states
- **[CN]** 官方 Vision/API 服务集成，支持额度和订阅状态感知 UI

### Fixed / 修复
- **[EN]** OAuth callback, auth state hydration, and extension/web session sync reliability
- **[CN]** OAuth 回调、登录状态水合以及扩展/Web 会话同步可靠性
- **[EN]** Durable cloud sync race conditions, duplicate merge behavior, and backup status consistency
- **[CN]** 云同步持久化竞态、重复合并行为以及备份状态一致性
- **[EN]** Rich editor multiline insertion, fallback paste paths, and one-click Agent insertion
- **[CN]** 富文本多行插入、降级粘贴路径以及 Agent 一键插入
- **[EN]** Team library/share styling, login detection, and post-share sync behavior
- **[CN]** 团队资源库/分享样式、登录检测以及分享后的同步行为
- **[EN]** Release scripts for the monorepo extension package layout
- **[CN]** 发布脚本适配 monorepo 下的扩展包目录结构

### Changed / 变更
- **[EN]** Reworked sync architecture around orchestrated cloud/local strategies with durable guards
- **[CN]** 围绕统一编排的云端/本地策略和持久化保护重构同步架构
- **[EN]** Replaced the Vision tab with the Mine account/API management view
- **[CN]** 使用「我的」账户/API 管理页替代原 Vision 标签页
- **[EN]** Simplified cloud sync login and backup UX with clearer status and recovery flows
- **[CN]** 简化云同步登录与备份体验，提供更清晰的状态和恢复流程
- **[EN]** Updated web app submodule across auth, subscription, team, and sync API support
- **[CN]** 持续更新 Web App 子模块，覆盖登录、订阅、团队和同步 API 支持

## [1.4.0] - 2026-05-08

### Added / 新增
- **[EN]** Release skill for GitHub release workflow automation
- **[CN]** 发布技能自动化 GitHub Release 流程
- **[EN]** Release notes preview step before version bump
- **[CN]** 版本升级前预览发布说明
- **[EN]** Copy button for prompt content
- **[CN]** 提示词内容一键复制按钮
- **[EN]** Sidepanel settings navigation
- **[CN]** Sidepanel 设置页面导航

### Fixed / 修复
- **[EN]** Pre-cache folder handle on dropdown mount to preserve user gesture
- **[CN]** 下拉菜单挂载时预缓存文件夹句柄以保留用户手势
- **[EN]** Sync restored data to latest backup file after restore
- **[CN]** 恢复后同步数据到最新备份文件
- **[EN]** UI text clarity for backup and vision features
- **[CN]** 备份和 Vision 功能 UI 文字清晰度改进
- **[EN]** Sidepanel settings layout
- **[CN]** Sidepanel 设置页面布局

### Changed / 变更
- **[EN]** Removed deprecated popup pages and OPEN_*_PAGE message handlers
- **[CN]** 移除废弃的 popup 页面和 OPEN_*_PAGE 消息处理器
- **[EN]** Simplified SidePanelApp to view switcher pattern
- **[CN]** SidePanelApp 简化为视图切换器模式

## [1.3.4] - 2026-05-07

### Fixed / 修复
- **[EN]** Gesture-preserving permission request using offscreen document
- **[CN]** 使用 offscreen 文档保持用户手势权限请求

## [1.3.3] - 2026-05-06

### Added / 新增
- **[EN]** Chrome user gesture requirements documentation (docs/chrome-user-gesture.md)
- **[CN]** Chrome 用户手势要求技术文档
- **[EN]** Sidepanel permission denied warning banner
- **[CN]** Sidepanel 权限拒绝警告提示条

### Fixed / 修复
- **[EN]** Folder permission auto-restore with gesture-preserving sidePanel.open()
- **[CN]** 文件夹权限自动恢复（手势保留的 sidePanel.open() 调用）
- **[EN]** Cached handle approach for cross-origin permission restore
- **[CN]** 缓存句柄方案解决跨域权限恢复
- **[EN]** Use offscreen document for gesture-preserving permission request
- **[CN]** 使用 offscreen document 实现手势保留的权限请求

## [1.3.2] - 2026-05-01

### Added / 新增
- **[EN]** Offscreen Document API for file system operations (cross-origin fix)
- **[CN]** Offscreen Document API 用于文件系统操作（跨域修复）
- **[EN]** Retry mechanism for extension reload race condition
- **[CN]** 扩展重载竞态条件的重试机制
- **[EN]** Vision feature toggle in settings
- **[CN]** 设置页 Vision 功能开关
- **[EN]** Encrypted API config backup
- **[CN]** API 配置加密备份

### Fixed / 修复
- **[EN]** Update check UX improvements
- **[CN]** 更新检查 UX 优化

## [1.3.1] - 2026-04-29

### Added / 新增
- **[EN]** New platforms: Kimi, 星流 (Lexical editor support)
- **[CN]** 新平台支持：Kimi、星流（Lexical 编辑器）
- **[EN]** Sidepanel universal input detection (works on any page with input)
- **[CN]** Sidepanel 通用输入检测（任何有输入框的页面都能工作）
- **[EN]** Sidepanel storage change detection and auto-sync
- **[CN]** Sidepanel 存储变更检测和自动同步

### Changed / 变更
- **[EN]** Vision modal UI: format selection, resave button, layout improvements
- **[CN]** Vision 模态框 UI：格式选择、重新保存按钮、布局优化
- **[EN]** Prompt edit modal: auto-stick preview to viewport edge
- **[CN]** 提示词编辑模态框：预览自动贴合视口边缘
- **[EN]** Settings UI: reordered items (local backup first, vision API second)
- **[CN]** 设置 UI：重排序（本地备份优先，Vision API 其次）
- **[EN]** Temporary library included in local folder backup
- **[CN]** 临时库纳入本地文件夹备份

### Fixed / 修复
- **[EN]** Single prompt deletion in temporary library
- **[CN]** 临时库单条提示词删除修复
- **[EN]** Pinterest image detection for hover button
- **[CN]** Hover 按钮 Pinterest 图片检测改进
- **[EN]** Trigger button icon, VisionModal spacing, language toggle borders
- **[CN]** 触发按钮图标、VisionModal 间距、语言切换边框样式修正

## [1.3.0] - 2026-04-28

### Added / 新增
- **[EN]** Multi-platform support: Lovart, ChatGPT, Claude.ai, Gemini, LibLib, 即梦
- **[CN]** 多平台支持：Lovart、ChatGPT、Claude.ai、Gemini、LibLib、即梦
- **[EN]** Vision API integration: right-click any image to generate prompt via AI
- **[CN]** Vision API 集成：右键任意图片，AI 分析生成提示词
- **[EN]** Image-to-prompt workflow with Claude Vision / GPT-4V support
- **[CN]** 图片转提示词流程，支持 Claude Vision / GPT-4V
- **[EN]** API key management in popup settings
- **[CN]** Popup 设置页管理 API 密钥
- **[EN]** Clipboard fallback for non-supported pages
- **[CN]** 非支持页面自动复制到剪贴板

### Fixed / 修复
- **[EN]** Sidepanel universal input detection (works on any page with input)
- **[CN]** Sidepanel 通用输入检测（任何有输入框的页面都能工作）
- **[EN]** Storage change detection and auto-sync for sidepanel
- **[CN]** Sidepanel 存储变更检测和自动同步

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
