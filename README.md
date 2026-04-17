# Prompt-Script

一键插入预设提示词，提升创作效率。

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/Version-1.0.0-orange.svg)](https://github.com/yourname/prompt-script)

## 简介

Prompt-Script 是一个Chrome浏览器扩展，为AI设计/绘图平台提供一键提示词插入功能。

**核心价值：** 通过预设提示词模板，帮助用户快速构建高质量的创作指令，节省重复输入时间。

**主要功能：**
- 在输入框旁显示下拉菜单，一键选择预设提示词
- 支持分类管理，按用途组织提示词模板
- Popup管理界面，支持提示词增删改查
- JSON导入导出，数据备份和迁移
- Shadow DOM隔离，不影响页面原有样式

---

## 安装与开发

### 环境要求

- Node.js 18.x 或更高版本
- npm 或 pnpm
- Chrome/Edge/Brave 浏览器（Chromium系）

### 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/yourname/prompt-script.git
cd prompt-script

# 安装依赖
npm install

# 开发模式构建（带热更新）
npm run dev

# 生产模式构建
npm run build
```

### 加载扩展到Chrome

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目的 `dist` 目录（构建输出目录）

### 项目结构

```
prompt-script/
├── src/
│   ├── background/       # Service Worker (消息路由)
│   ├── content/          # Content Script (页面注入)
│   ├── popup/            # Popup管理界面 (React)
│   ├── hooks/            # React hooks
│   ├── lib/              # 工具库 (storage, import-export)
│   └── shared/           # 共享类型和常量
├── assets/               # 扩展图标
├── manifest.json         # 扩展配置 (Manifest V3)
└── package.json          # 项目配置
```

### 技术栈

- **TypeScript 5.x** - 类型安全
- **React 19.x** - Popup UI框架
- **Zustand 5.x** - 状态管理
- **Vite 6.x** - 构建工具
- **shadcn/ui** - UI组件库
- **Chrome Extension Manifest V3** - 扩展平台

---

## 使用说明

### 页面功能

#### 下拉菜单触发

在平台的输入框左侧，你会看到一个闪电图标按钮：

1. **触发按钮** - 点击闪电图标打开下拉菜单
2. **提示词选择** - 下拉菜单按分类分组显示提示词
3. **一键插入** - 点击提示词，内容插入到光标位置
4. **连续插入** - 菜单保持打开，支持连续插入多个提示词组合

#### 提示词显示格式

- 每个提示词显示 **名称** 和 **内容预览**（约50字符）
- 按分类分组，便于快速定位
- 预览截断使用省略号表示完整内容更长

### Popup管理界面

点击浏览器工具栏的扩展图标打开管理Popup。

#### 分类管理

- **左侧侧边栏** - 显示所有分类
- **切换分类** - 点击分类名称筛选提示词
- **添加分类** - 点击分类列表底部按钮
- **删除分类** - 点击分类三点菜单选择删除
  - 删除后提示词自动移至「默认分类」
  - 默认分类不可删除

#### 提示词管理

- **提示词列表** - 右侧显示当前分类的提示词卡片
- **添加提示词** - 点击底部「添加提示词」按钮
- **编辑提示词** - 点击卡片三点菜单选择「编辑」
- **删除提示词** - 点击三点菜单选择「删除」

#### 导入导出

- **导出图标** - 点击顶部导出图标，下载JSON文件
- **导入图标** - 点击顶部导入图标，选择JSON文件恢复数据
- 文件格式见下方「数据格式说明」

### 常见使用场景

1. **快速风格切换** - 预设不同风格提示词，一键切换
2. **技术参数组合** - 常用技术参数模板，组合插入
3. **创意灵感库** - 收藏优质提示词，随时调用

---

## 数据格式说明

### JSON结构

导出的JSON文件包含以下字段：

```json
{
  "version": "1.0.0",
  "categories": [
    {
      "id": "default",
      "name": "默认分类",
      "order": 0
    },
    {
      "id": "uuid-string",
      "name": "分类名称",
      "order": 1
    }
  ],
  "prompts": [
    {
      "id": "uuid-string",
      "name": "提示词名称",
      "content": "提示词完整内容",
      "categoryId": "分类ID"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | 数据格式版本，当前为 "1.0.0" |
| `categories` | array | 分类列表 |
| `categories[].id` | string | 分类唯一标识，"default" 为系统保留 |
| `categories[].name` | string | 分类显示名称 |
| `categories[].order` | number | 分类排序顺序 |
| `prompts` | array | 提示词列表 |
| `prompts[].id` | string | 提示词唯一标识（UUID） |
| `prompts[].name` | string | 提示词显示名称 |
| `prompts[].content` | string | 提示词完整内容（插入到输入框的文本） |
| `prompts[].categoryId` | string | 所属分类ID |

### 导入验证规则

导入JSON时会验证以下规则：

1. 必须包含 `version`、`categories`、`prompts` 字段
2. `categories` 必须包含 `id` 为 `"default"` 的分类
3. 每个提示词必须包含完整字段：`id`、`name`、`content`、`categoryId`
4. 每个分类必须包含完整字段：`id`、`name`、`order`

如验证失败，会显示具体错误提示，原有数据不受影响。

---

## 已知限制与FAQ

### 已知限制

1. **域名限制**
   - 扩展仅在支持的域名激活（如 `lovart.ai` 及其子域名）
   - 在其他网站不会显示下拉菜单功能

2. **存储容量**
   - 使用 `chrome.storage.local`，容量上限约10MB
   - 推荐提示词数量不超过500条以保证性能
   - 超过80%容量时会有警告提示

3. **浏览器兼容**
   - 仅支持Chromium系浏览器（Chrome、Edge、Brave）
   - 不支持Firefox（未来版本可能支持）

4. **数据同步**
   - 数据仅存储在本地浏览器
   - 不支持云端自动同步
   - 跨设备迁移需手动导出/导入JSON

### FAQ

**Q: 为什么在其他网站看不到闪电图标？**

A: 扩展仅在支持的平台页面激活，这是为了减少对其他网站的干扰和安全考虑。

**Q: 提示词插入后平台没有响应怎么办？**

A: 请确保选择提示词后submit按钮激活。如果仍有问题，尝试在输入框手动输入一些文字后再插入。

**Q: 如何备份我的提示词数据？**

A: 点击Popup顶部的导出图标，下载JSON文件保存。需要恢复时点击导入图标选择该文件。

**Q: 删除分类后提示词去哪了？**

A: 删除非默认分类时，该分类的提示词会自动移至「默认分类」。

**Q: 为什么无法删除「默认分类」？**

A: 默认分类是系统保留分类，用于接收其他删除分类的提示词，确保数据不丢失。

**Q: 导入JSON失败怎么办？**

A: 检查JSON格式是否正确：
- 包含 `version`、`categories`、`prompts` 三个字段
- `categories` 必须有 `id` 为 `"default"` 的分类
- 每个提示词和分类都有完整必要字段

---

## 许可证

MIT License - 可自由使用、修改和分发。

---

## 反馈与支持

如遇问题或有功能建议，请：
1. 在GitHub Issues提交反馈
2. 提供详细的错误描述和浏览器版本信息

**项目地址:** https://github.com/yourname/prompt-script