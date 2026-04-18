# TODO

## 接入 GitHub 开源 Prompt 数据源

**数据源**：
- [prompts.chat](https://prompts.chat/prompts?category=cmj1yryrn000vt5als6r4vbgn) - CSV 格式，157+ ChatGPT prompts
- [Awesome-Nano-Banana-Prompts](https://github.com/devanshug2307/Awesome-Nano-Banana-Prompts) - JSON 格式，900+ 图像生成 prompts

**详细说明**：见 `memory/reference_prompt-data-sources.md`

**实施步骤**：
1. 编写转换脚本 `scripts/convert-prompts.ts` 解析 CSV/JSON
2. 设计分类映射表，将原分类映射到本项目 Category
3. 转换数据并合并到 `built-in-data.ts` 或提供导入选项
4. 更新导入导出功能支持外部数据源格式

**状态**: pending