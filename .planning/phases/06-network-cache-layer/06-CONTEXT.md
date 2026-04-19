# Phase 6: Network Cache Layer - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

网络提示词自动缓存管理，支持24小时TTL过期检查和离线访问fallback。缓存数据与本地提示词数据分离存储，通过独立消息类型访问。

**In scope:**
- NetworkCacheManager类实现（TTL支持）
- 缓存数据结构：NetworkPrompt[] + ProviderCategory[] + fetchTimestamp
- Service Worker缓存读写消息handler（GET_NETWORK_CACHE、SET_NETWORK_CACHE）
- TTL过期检查（读取时验证，过期返回空）
- 网络请求失败时fallback到缓存数据
- 独立存储键`network_cache_data`

**Out of scope:**
- UI显示缓存状态/时间戳（Phase 7）
- 用户手动刷新缓存按钮（Phase 7+ 增强功能）
- 多数据源缓存管理（单一Nano Banana数据源）
- 缓存自动后台同步（用户手动触发fetch）

</domain>

<decisions>
## Implementation Decisions

### 缓存数据结构
- **D-01:** 缓存存储键命名为`network_cache_data`，与现有`prompt_script_data`分离
- **D-02:** 缓存数据包含完整结构：NetworkPrompt[]数组、ProviderCategory[]分类、fetchTimestamp（ISO 8601格式）
- **D-03:** fetchTimestamp使用ISO字符串格式（如`2026-04-19T12:00:00Z`），便于显示和比较

### TTL过期逻辑
- **D-04:** TTL值为24小时（86,400,000毫秒），符合NET-04需求
- **D-05:** 过期检查时机：读取缓存时验证（on read），过期返回空数据触发重新fetch
- **D-06:** 过期判断逻辑：当前时间 - fetchTimestamp > TTL → 过期

### 离线场景处理
- **D-07:** 网络请求策略：Network-first，失败后fallback到缓存
- **D-08:** 不使用navigator.onLine检测（不可靠），依赖fetch失败判断离线状态
- **D-09:** 缓存为空且网络失败时返回错误响应，UI显示相应提示

### Claude's Discretion
- NetworkCacheManager类实现细节（singleton或普通类）
- 缓存消息类型命名（GET_NETWORK_CACHE、SET_NETWORK_CACHE等）
- 过期缓存的清理策略（立即删除或保留等待网络恢复）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 类型定义
- `src/shared/types.ts` — NetworkPrompt、ProviderCategory类型定义（Phase 5已定义）
- `src/shared/messages.ts` — MessageType enum，消息响应格式MessageResponse

### Service Worker模式
- `src/background/service-worker.ts` — FETCH_NETWORK_PROMPTS handler实现参考，消息分发switch-case结构
- `src/lib/storage.ts` — StorageManager singleton模式参考，chrome.storage.local操作模式

### 存储约束
- `src/shared/constants.ts` — STORAGE_KEY定义模式，添加NETWORK_CACHE_KEY常量
- `.planning/PROJECT.md` — chrome.storage.local容量限制（10MB）

### 需求背景
- `.planning/REQUIREMENTS.md` — NET-04需求详情（24小时缓存TTL）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StorageManager.getInstance()`: Singleton模式，NetworkCacheManager可采用类似设计
- `MessageType.FETCH_NETWORK_PROMPTS`: 已实现的网络请求handler，缓存逻辑在此基础上扩展
- `NanoBananaProvider`: parse()返回NetworkPrompt[]，getCategories()返回ProviderCategory[]
- `chrome.storage.local`: 存储API已验证，checkStorageQuota()工具可复用

### Established Patterns
- Service Worker消息分发: switch-case结构处理不同MessageType
- 异步响应模式: `return true` + sendResponse callback
- 错误响应格式: `{ success: false, error: string }`统一格式
- 存储操作: chrome.storage.local.get/set，try-catch错误处理

### Integration Points
- Service Worker: 添加GET_NETWORK_CACHE、SET_NETWORK_CACHE消息类型handler
- 消息类型: 在`src/shared/messages.ts`添加缓存相关MessageType
- 常量定义: 在`src/shared/constants.ts`添加NETWORK_CACHE_KEY和CACHE_TTL_MS
- FETCH_NETWORK_PROMPTS handler: 修改为成功后自动写入缓存

</code_context>

<specifics>
## Specific Ideas

- 缓存写入时机：FETCH_NETWORK_PROMPTS成功后自动调用缓存保存
- TTL检查函数：isCacheExpired(fetchTimestamp) → boolean
- 缓存响应包含isFromCache标志，便于UI区分数据来源

</specifics>

<deferred>
## Deferred Ideas

- 用户手动刷新缓存按钮（Phase 7+ UI增强）
- 缓存状态UI显示（Phase 7实现）
- 多数据源缓存管理（单一数据源优先）
- 缓存自动后台同步（用户手动触发）

</deferred>

---

*Phase: 06-network-cache-layer*
*Context gathered: 2026-04-19*