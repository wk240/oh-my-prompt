# Phase 5: Provider Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 05-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 05-provider-foundation
**Areas discussed:** Provider接口设计, 网络请求策略, 网络提示词类型设计

---

## Provider接口设计

| Option | Description | Selected |
|--------|-------------|----------|
| 基础三方法 | fetch()、parse()、getCategories()三个方法。简洁，后续按需扩展 | ✓ |
| 增加元信息方法 | 增加getSourceInfo()返回数据源元信息（名称、URL、更新时间） | |
| 完整错误处理 | 增加retryPolicy配置、onError回调、isHealthy()健康检查 | |

**User's choice:** 基础三方法（推荐）
**Notes:** 保持接口最小化，后续Phase可按需扩展

---

## 网络请求策略

### 请求方式

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Raw URL | 直接请求GitHub raw文件URL，获取Markdown内容。简单可靠，无需API密钥 | ✓ |
| GitHub API方式 | 使用GitHub API，可获取更多元数据但受速率限制（60次/小时无认证） | |
| 自定义URL支持 | 请求用户自定义URL，支持私有数据源，需处理跨域和安全验证 | |

**User's choice:** GitHub Raw URL（推荐）

### 超时值

| Option | Description | Selected |
|--------|-------------|----------|
| 无超时限制 | 不设超时，依赖浏览器默认行为 | |
| 10秒超时 | 失败返回错误。用户感知良好，适合实时请求场景 | ✓ |
| 30秒超时 | 容忍慢网络，但用户等待时间长 | |

**User's choice:** 10秒超时（推荐）

---

## 网络提示词类型设计

| Option | Description | Selected |
|--------|-------------|----------|
| 继承Prompt类型 | NetworkPrompt继承Prompt，增加sourceProvider、sourceCategory、previewImage可选字段。收藏时可无缝转换 | ✓ |
| 独立类型 | NetworkPrompt与Prompt完全分离。收藏时需手动复制字段 | |
| 合并为单一类型 | 用source字段区分本地/网络。简洁但混合了不同来源的数据 | |

**User's choice:** 继承Prompt类型（推荐）

### 预览图片字段

| Option | Description | Selected |
|--------|-------------|----------|
| 不包含 | 不包含previewImage字段，避免CSP图片加载问题 | |
| 包含但可能不显示 | 包含previewImage字段，为未来扩展保留数据 | |
| 延后到Phase 7 | 包含previewImage字段存储URL，显示逻辑在Phase 7实现 | ✓ |

**User's choice:** 延后到Phase 7（推荐）
**Notes:** 包含图片，需要解决图片预览问题，但实现延后

---

## Claude's Discretion

- Markdown解析的具体正则规则
- Service Worker请求失败时的响应格式细节
- NetworkPrompt字段的命名风格

---

## Deferred Ideas

- 图片预览实现 → Phase 7
- 重试逻辑/错误回调扩展 → 按需添加
- 多Provider管理器 → 后续扩展时设计

---

*Discussion completed: 2026-04-19*