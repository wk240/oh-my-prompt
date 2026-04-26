# 资源库提示词翻译计划 - 待完成部分

> **进度:** 已完成 193/639 (30.2%)

## 已完成分类 ✓ (10个)

| 分类 | 数量 | 状态 |
|------|------|------|
| nano-banana | 87 | ✓ 完成 |
| gpt-image | 27 | ✓ 完成 |
| anime-manga | 9 | ✓ 完成 |
| food-culinary | 10 | ✓ 完成 |
| character-design | 10 | ✓ 完成 |
| 3d-miniatures-dioramas | 9 | ✓ 完成 |
| fantasy-scifi | 10 | ✓ 完成 |
| urban-cityscapes | 10 | ✓ 完成 |
| architecture-interiors | 10 | ✓ 完成 |
| minimalist-icons | 7 | ✓ 完成 |
| misc | 4 | ✓ 完成 |

## 待完成分类 ○ (9个)

### 小型分类 (10-15条) - 优先

| 分类 | 待翻译 | 输入文件 | 状态 |
|------|--------|----------|------|
| nature-landscapes | 10 | translations/nature-landscapes-input.json | ○ 需修复JSON |
| logo-branding | 10 | translations/logo-branding-input.json | ○ 待翻译 |
| vintage-retro | 10 | translations/vintage-retro-input.json | ○ 待翻译 |
| cinematic-posters | 10 | translations/cinematic-posters-input.json | ○ 待翻译 |
| product-photography | 14 | translations/product-photography-input.json | ○ 待翻译 |
| sports-action | 15 | - | ○ 待准备输入 |

### 中型分类 (50-51条)

| 分类 | 待翻译 | 状态 |
|------|--------|------|
| portrait-photography | 50 | ○ 待准备输入 |
| fashion-photography | 51 | ○ 待准备输入 |

### 大型分类 (276条)

| 分类 | 待翻译 | 状态 |
|------|--------|------|
| prompts-chat-image | 276 | ○ 待准备输入 |

---

## 执行步骤

1. **修复 nature-landscapes.json** - JSON格式问题需修复
2. **翻译小分类** - logo-branding, vintage-retro, cinematic-posters, product-photography, sports-action
3. **准备中型分类输入** - portrait-photography, fashion-photography
4. **准备大型分类输入** - prompts-chat-image
5. **翻译中型分类**
6. **翻译大型分类**
7. **合并并提交**

## 备注

- 翻译规则: 保留 `{xxx}`, `[xxx]`, `<xxx>` 占位符
- JSON内容保持结构,仅翻译值
- 每批10条使用Agent并行翻译