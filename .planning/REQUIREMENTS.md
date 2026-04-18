# Requirements: v1.1.0 网络提示词数据源接入

**Milestone:** v1.1.0
**Created:** 2026-04-19
**Status:** Active

---

## v1 Requirements (This Milestone)

### 网络浏览

- [ ] **NET-01**: 用户可搜索网络提示词内容/标题
- [ ] **NET-02**: 用户可预览网络提示词完整内容
- [ ] **NET-03**: 用户可收藏网络提示词到本地存储（选择目标分类）

### 离线缓存

- [ ] **NET-04**: 网络提示词自动缓存24小时，离线状态下可访问已缓存数据

### 数据源架构

- [ ] **NET-05**: 提供可扩展的DataSourceProvider接口，便于接入更多数据源
- [ ] **NET-06**: 优先接入Nano Banana数据源（900+图像生成提示词）

---

## Future Requirements (Deferred)

### 网络浏览增强

- [ ] 分类浏览 — 按源分类导航网络提示词
- [ ] 分页显示 — 大数据集分页加载（50条/页）
- [ ] 一键插入 — 直接插入网络提示词，无需先收藏

### 离线增强

- [ ] 刷新数据 — 手动刷新按钮拉取最新数据
- [ ] 同步状态 — UI显示上次同步时间戳
- [ ] 离线检测 — 检测离线状态，显示相应提示信息

### 数据源扩展

- [ ] prompts.chat数据源 — 接入ChatGPT角色扮演提示词（Lovart相关性低，优先级低）
- [ ] 自定义数据源 — 用户可配置自定义数据源URL

---

## Out of Scope

- 自动后台同步 — 用户手动触发，避免不必要的网络请求
- 多人协作/分享 — 个人本地使用场景
- 云端存储 — 无后端，纯客户端实现
- 预览图片 — 外部图片URL在扩展上下文可能无法加载
- prompts.chat数据源 — ChatGPT对话提示词不适用于Lovart图像生成场景
- 账号/认证系统 — 无后端，纯客户端

---

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| NET-01 | Phase 8 | — | Pending |
| NET-02 | Phase 7 | — | Pending |
| NET-03 | Phase 8 | — | Pending |
| NET-04 | Phase 6 | — | Pending |
| NET-05 | Phase 5 | — | Pending |
| NET-06 | Phase 5 | — | Pending |

---

## Requirement Quality Notes

- **NET-01**: 搜索范围包括标题和内容，支持简单子串匹配
- **NET-02**: 预览显示完整提示词文本，包含来源信息
- **NET-03**: 收藏时需选择目标本地分类，可新建分类
- **NET-04**: 缓存存储在chrome.storage.local，TTL=24小时
- **NET-05**: Provider接口包含fetch、parse、getCategories方法
- **NET-06**: Nano Banana数据源URL: https://raw.githubusercontent.com/.../README.md

---

*Requirements defined: 2026-04-19*
*Roadmap created: 2026-04-19*
*Ready for execution: yes*