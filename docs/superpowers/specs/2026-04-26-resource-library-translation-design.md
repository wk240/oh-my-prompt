# 资源库提示词中英双语翻译设计

## 背景

当前资源库 (`src/data/resource-library/prompts.json`) 包含 639 个提示词：
- 114 个已有中英双语翻译（已完成）
- 525 个只有英文，缺少中文翻译

需要为这 525 个提示词添加中文翻译，使资源库支持完整的中英双语显示。

## 目标

- 完成所有 525 个英文提示词的中文翻译
- 翻译三个字段：名称、描述、提示词正文
- 保证翻译质量，保留占位符和特殊结构
- 支持分批处理、验证和回滚

## 翻译字段映射

| 字段处理 | 说明 |
|---------|------|
| `nameEn` → `name` | 英文名称翻译为中文 |
| `description` → `descriptionEn` | 现有英文描述移动到新字段 |
| (翻译) → `description` | 中文描述填入此字段 |
| `contentEn` → `content` | 英文提示词翻译为中文 |

**注意：** 当前 `description` 字段存的是英文，预处理时需要：
1. 将现有 `description` 内容移动到 `descriptionEn`
2. 翻译后的中文存入 `description`

## 类型定义更新

在 `src/shared/types.ts` 中添加：

```typescript
export interface ResourcePrompt extends Prompt {
  // 现有字段...
  descriptionEn?: string // 新增：英文描述
}
```

## 架构设计

### 执行流程

```
主进程
    ├── 1. 分析待翻译分类
    │       → 输出分类列表和数量
    ├── 2. 预处理数据
    │       → 将现有 description 移动到 descriptionEn
    ├── 3. 逐分类启动 Agent（串行）
    │       ├── Agent 接收 JSON 字符串
    │       ├── Agent 翻译三个字段
    │       └── Agent 返回 JSON 结果
    ├── 4. 保存临时文件
    │       → translations/{category}.json
    ├── 5. 自动验证
    │       ├── 占位符检查
    │       ├── JSON 结构检查
    │       └── 漏译检查
    ├── 6. 验证通过则合并到 prompts.json
    └── 7. 最终提交
```

### 目录结构

```
src/data/resource-library/
├── prompts.json              # 主数据文件
├── prompts-backup.json       # 备份文件

translations/                 # 临时翻译目录（执行时创建）
├── gpt-image.json           # 各分类翻译结果
├── character-design.json
├── ...
└── failed.json              # 失败记录
```

## Agent 设计

### 输入格式

每个 Agent 收到的 JSON 字符串：

```json
{
  "category": "character-design",
  "prompts": [
    {
      "id": "abc123",
      "categoryId": "character-design",
      "nameEn": "Hero Character",
      "descriptionEn": "A heroic character design prompt for fantasy settings.",
      "contentEn": "Create a hero character with {Style} and {Setting}..."
    }
  ]
}
```

### 输出格式

Agent 返回的 JSON 结果：

```json
{
  "translations": [
    {
      "id": "abc123",
      "categoryId": "character-design",
      "name": "英雄角色",
      "description": "奇幻场景的英雄角色设计提示词。",
      "content": "创建一个英雄角色，风格为 {Style}，设定为 {Setting}...",
      "nameEn": "Hero Character",
      "descriptionEn": "A heroic character design prompt for fantasy settings.",
      "contentEn": "Create a hero character with {Style} and {Setting}..."
    }
  ]
}
```

### Agent Prompt 指导要点

1. **保留占位符：** `{xxx}`、`[xxx]`、`<xxx>` 必须原样保留，不翻译
2. **术语一致性：** 同一分类内保持术语翻译一致
3. **JSON 结构：** 输出必须是有效的 JSON
4. **字段完整：** 返回所有字段，包括英文原文
5. **无漏译：** 所有三个字段都必须有中文翻译

## 验证规则

### 占位符检查

检测以下模式是否在翻译结果中保留：
- `{Brand Name}`、`{variable}`
- `[CITY]`、`[placeholder]`
- `<placeholder>`

验证方法：英文版中的占位符数量 == 中文版中的占位符数量

### JSON 结构检查

- 所有必需字段存在：`id`、`name`、`content`、`nameEn`、`contentEn`
- JSON 语法正确（可解析）
- 数量一致：输入提示词数 == 输出翻译数

### 漏译检查

检测中文翻译中残留的完整英文句子（可选）：
- 中文名称/描述不应全是英文
- 提示词正文应有足够的中文内容

## 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| Agent 翻译失败 | 记录到 `failed.json`，可手动重试 |
| 验证失败 | 保留临时文件，人工审核 |
| 中断恢复 | 检查 `translations/` 目录判断已完成分类 |

## 执行策略

### 分类优先级

按提示词数量排序，先处理小分类：
1. 便于快速验证流程
2. 复杂分类放在后面，已有经验参考

### 串行执行

- 一个 Agent 完成后再启动下一个
- 避免并发写入冲突
- 便于观察和调试每个分类

### 进度追踪

每个分类完成后输出：
- 分类名称
- 提示词数量
- 验证结果（通过/失败）
- 累计进度

## 数据预处理

在翻译开始前，需要预处理 `prompts.json`：

```python
for prompt in prompts:
    # 将现有英文 description 移动到 descriptionEn
    if prompt.get('description') and not any('一' <= c <= '鿿' for c in prompt['description']):
        prompt['descriptionEn'] = prompt['description']
        prompt['description'] = None  # 清空，等待翻译
```

## 完成标志

- 所有待翻译分类都有对应的临时文件
- 所有验证规则通过
- `prompts.json` 已合并所有翻译结果
- Git 提交包含完整变更