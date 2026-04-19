# Phase 6: Network Cache Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 06-network-cache-layer
**Areas discussed:** Cache structure, TTL logic, Offline handling, Storage key naming

---

## Cache Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Full (prompts + categories + timestamp) | 缓存NetworkPrompt[]数组、ProviderCategory[]分类、fetchTimestamp。完整缓存，便于Phase 7按分类浏览 | ✓ |
| Minimal (prompts + timestamp) | 仅缓存NetworkPrompt[]数组 + fetchTimestamp。更小存储占用，分类可从Provider实时获取 | |

**User's choice:** Full (prompts + categories + timestamp)
**Notes:** Recommended approach selected — complete cache structure for Phase 7 browsing

---

## TTL Logic

| Option | Description | Selected |
|--------|-------------|----------|
| On read (check before return) | 读取时检查TTL，过期返回空/错误，触发重新fetch。简单可靠，确保数据新鲜 | ✓ |
| On write (set TTL, no read check) | 写入时设置24h TTL，读取时不检查。更快读取，但可能返回过期数据（适合离线场景） | |

**User's choice:** On read (check before return)
**Notes:** Recommended approach selected — ensures data freshness with simple implementation

---

## Offline Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Network-first, fallback to cache | 先尝试网络fetch，失败后fallback到缓存。适合自动缓存场景，用户无感知 | ✓ |
| Check navigator.onLine first | 检查navigator.onLine，离线时直接返回缓存。显式控制，但navigator.onLine不可靠 | |
| Background fetch with cache-first policy | 使用缓存serviceworker检测网络状态并决定策略。最可靠，但实现复杂 | |

**User's choice:** Network-first, fallback to cache
**Notes:** Recommended approach selected — seamless user experience, reliable offline fallback

---

## Timestamp Format

| Option | Description | Selected |
|--------|-------------|----------|
| ISO string | 格式：ISO 8601 (e.g., '2026-04-19T12:00:00Z')。标准格式，易于显示和比较 | ✓ |
| Epoch milliseconds | 格式：Unix timestamp毫秒数 (e.g., 1713523200000)。易于计算TTL差值，但显示需转换 | |

**User's choice:** ISO string
**Notes:** Recommended approach selected — standard format for display and comparison

---

## Storage Key Naming

| Option | Description | Selected |
|--------|-------------|----------|
| network_cache_data | 新缓存存储键，与现有prompt_script_data分离。避免与本地提示词数据混用，结构清晰 | ✓ |
| Merge with prompt_script_data | 复用现有键，在StorageSchema中增加networkCache字段。单键管理，但结构复杂 | |

**User's choice:** network_cache_data
**Notes:** Recommended approach selected — separate storage key for clean architecture

---

## Claude's Discretion

- NetworkCacheManager类实现细节（singleton或普通类）
- 缓存消息类型命名（GET_NETWORK_CACHE、SET_NETWORK_CACHE等）
- 过期缓存的清理策略（立即删除或保留等待网络恢复）

---

## Deferred Ideas

- 用户手动刷新缓存按钮（Phase 7+ UI增强）
- 缓存状态UI显示（Phase 7实现）
- 多数据源缓存管理（单一数据源优先）
- 缓存自动后台同步（用户手动触发）