# Phase 3: Data Management & Popup UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 03-data-management-popup-ui
**Areas discussed:** Popup布局结构, 提示词编辑方式, 导入导出交互, 空状态和边界处理

---

## Popup布局结构

| Option | Description | Selected |
|--------|-------------|----------|
| 左侧分类 + 右侧提示词 | 左侧固定宽度(~80px)显示分类列表，右侧(~220px)显示选中分类的提示词列表。符合UI-SPEC定义。 | ✓ |
| 顶部Tab导航 | 顶部显示分类标签页(tab-style)，下方显示该分类的提示词列表。适合分类数量少，但300px宽度下tab拥挤。 | |
| 单列表全提示词 | 一个列表展示所有提示词，每个提示词卡片顶部显示其分类名。无分类导航，不满足MGMT-01需求。 | |

**User's choice:** 左侧分类 + 右侧提示词 (Recommended)
**Notes:** 符合常见管理界面布局，匹配UI-SPEC定义

---

## 分类侧边栏视觉

| Option | Description | Selected |
|--------|-------------|----------|
| 纯文本分类名 | 分类名直接显示，无额外图标或标记。简洁，适合分类数量少(预期<10个)的场景。 | ✓ |
| 图标+分类名 | 每个分类名前显示小图标。增加视觉区分度，但图标设计复杂。 | |
| 选中状态高亮 | 选中分类高亮，其他分类淡色显示。这是标准侧边栏模式，已在纯文本方案中隐含。 | |

**User's choice:** 纯文本分类名 (Recommended)
**Notes:** 简洁方案，与UI-SPEC定义一致

---

## 提示词列表样式

| Option | Description | Selected |
|--------|-------------|----------|
| 卡片样式 | 每个提示词显示为卡片：顶部是名称，下方是内容预览(~50字符截断)。符合Phase 02下拉菜单的模式。 | ✓ |
| 紧凑列表 | 每行一个提示词名，点击展开显示内容。节省空间，但预览信息少，风格不一致。 | |
| 表格式双列 | 两列，左为名称右为内容预览。信息量大但300px宽度下显示紧张。 | |

**User's choice:** 卡片样式 (Recommended)
**Notes:** 与Phase 02下拉菜单保持视觉一致性

---

## 编辑触发方式

| Option | Description | Selected |
|--------|-------------|----------|
| 点击卡片或三点菜单 | 点击卡片任意位置进入编辑Dialog，三点菜单内「编辑」选项也进入编辑Dialog。简单直观，但可能误触发。 | |
| 仅三点菜单可进入编辑 | 点击卡片仅选中/高亮(不进入编辑)，三点菜单内「编辑」才是编辑入口。避免误触发。 | ✓ |
| 卡片显示编辑图标 | 卡片右侧显示小编辑图标，点击编辑图标或三点菜单内「编辑」进入编辑Dialog。图标明确，但占用空间。 | |

**User's choice:** 仅三点菜单可进入编辑
**Notes:** 用户偏好避免误触发编辑，编辑入口单一但明确

---

## 编辑Dialog按钮

| Option | Description | Selected |
|--------|-------------|----------|
| 保存 + 取消 | 编辑对话框底部两个按钮：左边「取消」(secondary)，右边「保存」(primary)。标准做法，符合AlertDialog模式。 | ✓ |
| 保存 + 取消 + 删除 | 底部三个按钮：取消、保存、删除。删除按钮使用destructive样式。但编辑界面放删除可能误操作。 | |

**User's choice:** 保存 + 取消 (Recommended)
**Notes:** 删除操作单独通过三点菜单触发，编辑界面专注于编辑功能

---

## 删除触发方式

| Option | Description | Selected |
|--------|-------------|----------|
| 三点菜单 + 确认Dialog | 每个卡片右侧显示「...」三点菜单图标，点击弹出DropdownMenu：编辑、删除选项。删除点击后弹出确认Dialog。 | ✓ |
| 编辑界面内放删除按钮 | 编辑对话框内除了保存/取消，还有一个「删除」按钮。编辑和删除在同一界面，可能误触删除。 | |
| 卡片上直接显示删除图标 | 卡片右侧直接显示小垃圾桶图标，点击弹出确认Dialog。图标明确，但占用卡片空间。 | |

**User's choice:** 三点菜单 + 确认Dialog (Recommended)
**Notes:** 符合UI-SPEC定义的DropdownMenu和AlertDialog模式

---

## 导入/导出按钮位置

| Option | Description | Selected |
|--------|-------------|----------|
| 底部固定按钮 | Popup底部固定显示导入/导出按钮(小图标+文字)。容易发现，符合DATA-02/03需求。 | |
| 顶部图标按钮 | 顶部标题栏右侧显示导入/导出图标按钮(无文字)。节省空间，但图标含义需用户猜测。 | ✓ |
| 三点菜单内选项 | 三点菜单内显示导入/导出选项。隐藏较深，不适合作为主要入口。 | |

**User's choice:** 顶部图标按钮
**Notes:** 用户偏好节省底部空间，图标需明确含义(下载/上传图标)

---

## 导入处理流程

| Option | Description | Selected |
|--------|-------------|----------|
| 选择文件→验证→保存 | 点击导入图标→触发Chrome文件选择器→用户选择JSON文件→解析JSON→格式验证→成功则保存并刷新列表，失败则显示Toast提示。 | ✓ |
| 导入确认Dialog | 点击导入图标→弹出AlertDialog询问"导入将覆盖现有数据，确认？"→确认后触发文件选择。增加确认步骤防止误操作。 | |
| 选择→验证→保存→成功Toast | 点击导入图标→弹出文件选择→导入成功后显示Toast"导入成功，共XX条提示词"。提供明确成功反馈。 | |

**User's choice:** 选择文件→验证→保存 (Recommended)
**Notes:** 标准流程，失败时Toast提示符合UI-SPEC定义

---

## 导出JSON格式

| Option | Description | Selected |
|--------|-------------|----------|
| StorageSchema格式 | 导出JSON文件结构包含prompts数组、categories数组、version字段。与StorageSchema定义一致，便于导入恢复。 | ✓ |
| 仅提示词数组 | 导出JSON仅包含prompts数组(无categories)。更简单但导入时分类信息丢失，不符合MGMT-01需求。 | |
| StorageSchema + metadata | 导出JSON包含额外metadata(导出时间、提示词数量)。提供更多信息但导入时需忽略metadata。 | |

**User's choice:** StorageSchema格式 (Recommended)
**Notes:** 标准格式，与types.ts定义一致

---

## 导出触发流程

| Option | Description | Selected |
|--------|-------------|----------|
| 直接下载 | 点击导出图标→直接触发Chrome下载API→文件自动保存到用户默认下载目录。最简单高效。 | ✓ |
| 确认Dialog后下载 | 点击导出图标→弹出确认Dialog"确认导出？"→确认后下载。增加不必要的确认步骤。 | |
| 下载 + 成功Toast | 点击导出图标→成功下载后显示Toast"导出成功"。提供明确成功反馈。 | |

**User's choice:** 直接下载 (Recommended)
**Notes:** 标准做法，无需用户干预

---

## 空状态显示

| Option | Description | Selected |
|--------|-------------|----------|
| 插图+提示文字+添加按钮 | 右侧显示空状态插图+文字"暂无提示词，点击下方「添加提示词」创建第一个模板"，底部显示「添加提示词」按钮。 | ✓ |
| 纯文字+添加按钮 | 右侧显示文字"暂无提示词"，无插图，底部显示「添加提示词」按钮。更简洁但视觉引导弱。 | |
| 文字+分类创建引导 | 右侧显示文字"暂无提示词"，左侧分类列表显示提示"先创建分类"。引导用户先创建分类再添加提示词。 | |

**User's choice:** 插图+提示文字+添加按钮 (Recommended)
**Notes:** 符合UI-SPEC定义的EmptyState文案和primary CTA

---

## 添加提示词按钮位置

| Option | Description | Selected |
|--------|-------------|----------|
| 底部固定按钮 | 「添加提示词」按钮固定在Popup底部，始终可见。符合UI-SPEC定义的primary CTA位置。 | ✓ |
| 列表顶部按钮 | 「添加提示词」按钮在右侧提示词列表顶部，仅在提示词列表内显示。空间紧凑，但空状态时按钮位置不明确。 | |
| 顶部图标按钮 | 顶部标题栏右侧显示添加图标按钮。节省空间但primary CTA不应隐藏。 | |

**User's choice:** 底部固定按钮 (Recommended)
**Notes:** 符合UI-SPEC定义的primary CTA位置

---

## 添加分类按钮位置

| Option | Description | Selected |
|--------|-------------|----------|
| 分类列表底部按钮 | 左侧分类列表底部显示「+添加分类」按钮。点击后弹出添加Dialog。按钮位置靠近分类列表，逻辑合理。 | ✓ |
| 分类列表顶部按钮 | 分类列表顶部显示「+添加分类」按钮。位置明显但可能与列表内容混淆。 | |
| 三点菜单内选项 | 三点菜单内显示「添加分类」选项。隐藏较深，不适合作为主要入口。 | |

**User's choice:** 分类列表底部按钮 (Recommended)
**Notes:** 逻辑位置合理，靠近分类列表

---

## 删除最后分类处理

| Option | Description | Selected |
|--------|-------------|----------|
| 提示词移至默认分类 | 删除最后一个分类时，该分类下的提示词移至"默认分类"。删除后自动选中新默认分类。符合MGMT-06需求。 | ✓ |
| 提示词跟随删除 | 删除最后一个分类时，弹出确认Dialog"删除此分类将同时删除其下所有提示词"。提示词跟随分类一起删除。 | |
| 禁止删除最后一个分类 | 禁止删除最后一个分类，三点菜单内删除选项隐藏或禁用。限制用户操作自由度。 | |

**User's choice:** 提示词移至默认分类 (Recommended)
**Notes:** 符合MGMT-06需求，保护数据

---

## 默认分类管理

| Option | Description | Selected |
|--------|-------------|----------|
| 系统预创建，不可删除 | 系统预创建一个名为"默认"的分类(id: "default")，不可删除、不可编辑名称。新提示词默认归属于此分类。 | ✓ |
| 预创建，可编辑名称 | 系统预创建"默认"分类，但用户可编辑其名称(如改为"未分类")，不可删除。提供个性化但可能偏离语义。 | |
| 不预创建，删除时询问 | 不预创建默认分类，删除最后一个分类时弹出Dialog询问提示词归属。流程复杂，增加用户负担。 | |

**User's choice:** 系统预创建，不可删除 (Recommended)
**Notes:** 符合MGMT-06需求，保证删除其他分类时有接收目标

---

## Claude's Discretion

[List areas where user said "you decide" or deferred to Claude]

- 卡片hover/active状态样式 — 遵循shadcn/ui默认交互状态
- Toast持续时间 — 标准3-4秒自动消失
- 确认Dialog文案 — 遵循UI-SPEC定义的Delete确认文案
- ScrollArea滚动行为 — 遵循shadcn/ui ScrollArea默认行为
- 分类列表滚动 — 分类数量超过可视区域时启用滚动

---

## Deferred Ideas

[Ideas mentioned during discussion that were noted for future phases]

None — discussion stayed within phase scope.