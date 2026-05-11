# 首页与 Dashboard 整合 + SEO 优化设计文档

日期: 2026-05-12
状态: 待实施

---

## 概述

将 Oh My Prompt 的首页（Landing Page）与 Dashboard 整合为统一体验，同时完成 SEO 优化。核心思路：首页根据登录状态动态显示内容，未登录用户看到营销页+文档入口+登录按钮，登录后首页变成提示词管理界面。支持深色/浅色主题切换。

---

## 整合方案

### 核心逻辑

```
/  → 动态渲染
     → 未登录：营销页 + 文档入口 + 登录按钮
     → 已登录：提示词管理界面（导航：首页、文档、订阅、备份、团队）
```

URL 结构：
```
/                    → 动态首页（根据登录状态）
/docs                → 文档列表页（公开）
/docs/[slug]         → 单篇文档（公开）
/subscription        → 订阅管理（登录后）
/backup              → 备份数据（登录后）
/team                → 团队管理（登录后）
```

删除：
```
/dashboard/*         → 功能合并到独立路由（/backup, /team, /subscription）
```

---

## 第一部分：首页整合设计

### 1.1 未登录首页

**Header：**
- Logo "Oh My Prompt"
- 导航：首页 | 文档 | 订阅
- 登录按钮（右侧）
- 主题切换按钮

**内容区块：**
- Hero：产品核心价值 + 下载插件按钮
- 特性简介：3 个核心功能卡片
- 定价方案：Free / Pro / Team
- Footer：版权 + 隐私/条款链接

### 1.2 已登录首页

**Header：**
- Logo "Oh My Prompt"
- 导航：首页 | 文档 | 订阅 | 备份 | 团队
- 用户邮箱 + 登出按钮
- 主题切换按钮

**内容区块：**
- 提示词列表（主功能）
- 分类筛选
- 新建/编辑/删除操作
- 同步状态

### 1.3 主题切换

- 默认：深色模式（现有 Landing Page 风格）
- 支持：浅色模式（白色背景，柔和配色）
- 切换按钮：Header 右侧，显示图标 + 文字
- 状态持久化：localStorage 或 Supabase 用户偏好

---

## 第二部分：设计系统

### 2.1 颜色体系

**深色模式：**
```
surface: #0a0a0a（背景）
surface-container-low: #1a1a1a（卡片）
surface-container-highest: #262626（按钮背景）
on-background: #ffffff（主文字）
on-surface-variant: #a3a3a3（次要文字）
primary: #81ecff（强调色）
secondary: #a78bfa（紫色）
tertiary: #f472b6（粉色）
```

**浅色模式：**
```
surface: #ffffff（背景）
surface-container: #f5f5f5（卡片）
surface-container-highest: #e5e5e5（按钮背景）
on-background: #171717（主文字）
on-surface-variant: #64748b（次要文字）
primary/secondary/tertiary: 同深色模式
```

### 2.2 组件

保持统一风格：
- glass-panel：磨砂玻璃效果（Header）
- ghost-border：半透明边框（按钮、卡片）
- btn-primary-gradient：渐变按钮
- glow-primary：发光效果

---

## 第三部分：文档页面

### 3.1 页面结构

```
app/docs/
├── page.tsx          → 文档列表页
├── [slug]/page.tsx   → 单篇文档渲染
└── content/          → Markdown 文件
    ├── getting-started.md
    ├── platform-support.md
    ├── vision-api.md
    ├── import-export.md
    └── faq.md
```

### 3.2 文档页面设计

- Header 与首页相同
- 内容区域：卡片布局
- 支持深色/浅色主题

### 3.3 文档内容

| 文档 | slug |
|------|------|
| 快速开始 | getting-started |
| 平台支持 | platform-support |
| 图片转提示词 | vision-api |
| 数据管理 | import-export |
| 常见问题 | faq |

---

## 第四部分：SEO 优化

### 4.1 Landing Page SEO（未登录首页）

**OpenGraph：**
```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://ohmyprompt.com" />
<meta property="og:title" content="Oh My Prompt - 一键插入AI提示词" />
<meta property="og:description" content="告别复制粘贴，在AI平台输入框旁一键插入提示词。" />
<meta property="og:image" content="https://ohmyprompt.com/og-image.png" />
```

**Twitter Cards：**
```html
<meta name="twitter:card" content="summary_large_image" />
```

**JSON-LD：**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Oh My Prompt",
  "applicationCategory": "BrowserExtension",
  "operatingSystem": "Chrome, Edge, Brave",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "downloadUrl": "https://github.com/wk240/oh-my-prompt/releases/latest"
}
```

### 4.2 sitemap.xml

动态生成，包含：`/`, `/docs`, `/docs/[slug]`

### 4.3 robots.txt

```txt
User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://ohmyprompt.com/sitemap.xml
```

---

## 第五部分：实施顺序

1. **主题切换基础设施** - Tailwind dark mode 配置，CSS 变量
2. **统一 Header 组件** - 支持登录状态切换 + 主题切换
3. **首页动态渲染** - 修改 `page.tsx`
4. **提示词管理界面** - 登录后首页内容
5. **路由重构** - `/backup`, `/team`, `/subscription` 独立路由
6. **删除 /dashboard** - 清理旧路由
7. **文档页面** - `/docs` 路由
8. **SEO meta** - OpenGraph, JSON-LD
9. **sitemap + robots.txt**
10. **og-image**

---

## 待确认事项

1. **部署域名** - 需要确认实际域名
2. **og-image** - 1200x630px 分享图片

---

## 技术依赖

- `gray-matter` - Markdown frontmatter 解析
- `marked` 或 `next-mdx-remote` - Markdown 渲染

---

## 验收标准

- [ ] 深色/浅色主题切换正常工作
- [ ] Header 组件统一，根据登录状态切换导航
- [ ] `/` 页面未登录显示营销页
- [ ] `/` 页面登录后显示提示词管理界面
- [ ] 导航：首页、文档、订阅、备份、团队
- [ ] `/docs` 和 `/docs/[slug]` 可访问
- [ ] Landing Page 包含 SEO meta
- [ ] sitemap.xml 和 robots.txt 存在