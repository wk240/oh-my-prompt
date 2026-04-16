# Requirements: Lovart Prompt Injector

**Defined:** 2026-04-16
**Core Value:** 一键插入预设提示词，提升Lovart平台创作效率

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Functionality

- [ ] **CORE-01**: 用户可在Lovart输入框旁看到下拉菜单按钮
- [ ] **CORE-02**: 用户可通过下拉菜单选择预设提示词
- [ ] **CORE-03**: 用户选择提示词后可一键插入到Lovart输入框
- [ ] **CORE-04**: Lovart平台识别插入的提示词（submit按钮可用）

### Prompt Management

- [ ] **MGMT-01**: 用户可按用途分类管理提示词模板
- [ ] **MGMT-02**: 用户可新增提示词（内容、所属分类）
- [ ] **MGMT-03**: 用户可编辑已有提示词内容
- [ ] **MGMT-04**: 用户可删除提示词
- [ ] **MGMT-05**: 用户可新增分类
- [ ] **MGMT-06**: 用户可删除分类（提示词移至默认分类）

### Data Persistence

- [ ] **DATA-01**: 提示词数据本地持久化存储
- [ ] **DATA-02**: 用户可导出提示词数据为JSON文件
- [ ] **DATA-03**: 用户可导入JSON文件恢复提示词数据
- [ ] **DATA-04**: 导入时验证JSON格式，无效数据提示用户

### Extension Behavior

- [ ] **EXT-01**: 扩展仅在Lovart平台页面激活
- [ ] **EXT-02**: Lovart页面样式不受扩展影响（Shadow DOM隔离）
- [ ] **EXT-03**: 下拉菜单样式美观且与Lovart风格协调
- [ ] **EXT-04**: 扩展图标显示在浏览器工具栏

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced UX

- **UX-01**: 用户可搜索/过滤提示词列表
- **UX-02**: 用户可收藏/固定常用提示词
- **UX-03**: 用户可使用键盘快捷键触发下拉菜单
- **UX-04**: 提示词支持模板变量（$variable占位符）

### Visual Enhancement

- **VIS-01**: 支持暗色模式
- **VIS-02**: 用户可拖拽排序分类和提示词

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 云端自动同步 | 需要后端服务，用户选择手动导入导出即可 |
| 多人/团队协作 | 个人使用场景，无协作需求 |
| Firefox支持 | 初期专注Chrome系，后续可扩展 |
| AI自动生成提示词 | API成本不可控，质量不稳定 |
| 提示词分享市场 | 需要内容审核和运营，超出MVP范围 |
| 实时协作编辑 | 个人本地工具，无需实时同步 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 2 | Pending |
| CORE-02 | Phase 2 | Pending |
| CORE-03 | Phase 2 | Pending |
| CORE-04 | Phase 2 | Pending |
| MGMT-01 | Phase 3 | Pending |
| MGMT-02 | Phase 3 | Pending |
| MGMT-03 | Phase 3 | Pending |
| MGMT-04 | Phase 3 | Pending |
| MGMT-05 | Phase 3 | Pending |
| MGMT-06 | Phase 3 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| DATA-04 | Phase 3 | Pending |
| EXT-01 | Phase 1 | Pending |
| EXT-02 | Phase 2 | Pending |
| EXT-03 | Phase 2 | Pending |
| EXT-04 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after initial definition*