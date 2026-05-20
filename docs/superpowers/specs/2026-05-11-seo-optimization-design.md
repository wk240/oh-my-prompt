# SEO 优化设计文档

日期: 2026-05-11
状态: 待实施

---

## 概述

为 Oh My Prompt 工具站进行 SEO 优化，保持简洁，不做内容农场。只补充必要的 SEO 元素和核心使用文档。

---

## 范围

### 包含
- Landing Page SEO meta 增强（OpenGraph、Twitter Cards、JSON-LD）
- sitemap.xml 生成
- robots.txt 配置
- 文档页面（`/docs` + 3-5 篇核心教程）

### 不包含
- 博客系统
- 产品介绍页（`/features`）
- 模板库页面
- 分类筛选、标签系统

---

## URL 结构

```
/                    → Landing Page（增强 SEO）
/docs                → 文档列表页
/docs/[slug]         → 单篇文档
```

---

## 第一部分：Landing Page SEO 增强

### 1.1 OpenGraph Meta

用于微信、Facebook、LinkedIn 等社交媒体分享时显示卡片。

```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://ohmyprompt.com" />
<meta property="og:title" content="Oh My Prompt - 一键插入AI提示词" />
<meta property="og:description" content="告别复制粘贴，在AI平台输入框旁直接管理、选择、插入你的专属提示词库。" />
<meta property="og:image" content="https://ohmyprompt.com/og-image.png" />
<meta property="og:locale" content="zh_CN" />
```

**图片规格：** 1200x630px，PNG/JPG，存放在 `public/og-image.png`

### 1.2 Twitter Cards Meta

用于 Twitter 分享时显示卡片。

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="https://ohmyprompt.com" />
<meta name="twitter:title" content="Oh My Prompt - 一键插入AI提示词" />
<meta name="twitter:description" content="告别复制粘贴，在AI平台输入框旁直接管理、选择、插入你的专属提示词库。" />
<meta name="twitter:image" content="https://ohmyprompt.com/og-image.png" />
```

### 1.3 JSON-LD 结构化数据

用于搜索引擎理解产品信息。

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Oh My Prompt",
  "applicationCategory": "BrowserExtension",
  "operatingSystem": "Chrome, Edge, Brave",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "description": "Chrome浏览器插件，在AI平台输入框旁一键插入预设提示词模板。",
  "screenshot": "https://ohmyprompt.com/assets/eg1.gif",
  "downloadUrl": "https://github.com/wk240/oh-my-prompt/releases/latest"
}
```

### 1.4 实现位置

在 `packages/web-app/app/layout.tsx` 的 `metadata` 对象中配置。

---

## 第二部分：sitemap.xml

### 2.1 内容

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ohmyprompt.com</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://ohmyprompt.com/docs</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://ohmyprompt.com/docs/getting-started</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <!-- 其他文档页面 -->
</urlset>
```

### 2.2 实现方式

使用 Next.js 内置的 `sitemap.ts` 或手动生成静态文件 `public/sitemap.xml`。

---

## 第三部分：robots.txt

```txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/
Disallow: /auth/

Sitemap: https://ohmyprompt.com/sitemap.xml
```

存放位置：`packages/web-app/public/robots.txt`

---

## 第四部分：文档页面

### 4.1 页面结构

```
app/docs/
├── page.tsx          → 文档列表页
├── layout.tsx        → 文档布局（可选，共用导航）
├── [slug]/page.tsx   → 单篇文档渲染
└── content/          → Markdown 文件存放目录
    ├── getting-started.md
    ├── platform-support.md
    ├── vision-api.md
    ├── import-export.md
    └── faq.md
```

### 4.2 文档列表（初步）

| 文档 | slug | 内容 |
|------|------|------|
| 快速开始 | getting-started | 安装插件、首次配置 |
| 平台支持 | platform-support | 支持哪些 AI 平台、如何适配 |
| 图片转提示词 | vision-api | Vision API 配置和使用 |
| 数据管理 | import-export | 导入导出、备份恢复 |
| 常见问题 | faq | FAQ |

### 4.3 Markdown 文件格式

```markdown
---
title: 快速开始
description: 安装 Oh My Prompt 插件并完成首次配置
slug: getting-started
---

## 安装插件

...

## 首次配置

...
```

### 4.4 技术实现

- 使用 `gray-matter` 解析 Markdown frontmatter
- 使用 `next-mdx-remote` 或 `marked` 渲染内容
- 动态路由 `generateStaticParams()` 预渲染所有文档
- 每个 doc 生成独立的 SEO meta（title、description、OpenGraph）

### 4.5 文档 SEO

每篇文档自动生成：
- `<title>` - 来自 frontmatter.title
- `<meta name="description">` - 来自 frontmatter.description
- OpenGraph meta - 使用文档标题和描述

---

## 第五部分：实施顺序

1. **robots.txt** - 最简单，直接创建静态文件
2. **Landing Page SEO meta** - 修改 layout.tsx
3. **og-image.png** - 设计并生成社交分享图片
4. **sitemap.xml** - 实现 sitemap 生成
5. **文档页面** - 创建 app/docs 目录结构和基础页面
6. **编写文档内容** - 编写 3-5 篇核心教程的 Markdown 文件

---

## 技术依赖

新增 npm 包：
- `gray-matter` - 解析 Markdown frontmatter
- `marked` 或 `next-mdx-remote` - Markdown 渲染

---

## 待确认事项

1. **部署域名** - SEO meta 中的 URL 需要确认实际部署域名（文档中假设为 `ohmyprompt.com`，实施前需要替换为真实域名）
2. **og-image 设计** - 1200x630px 的社交分享图片，需要用户提供或由我协助生成一个简单的版本

---

## 验收标准

- [ ] Landing Page 包含完整的 OpenGraph、Twitter Cards、JSON-LD meta
- [ ] robots.txt 存在并正确配置
- [ ] sitemap.xml 存在并包含所有公开页面
- [ ] og-image.png 存在且尺寸正确
- [ ] `/docs` 页面可访问，显示文档列表
- [ ] `/docs/[slug]` 可访问，正确渲染 Markdown 内容
- [ ] 每篇文档有独立的 SEO meta