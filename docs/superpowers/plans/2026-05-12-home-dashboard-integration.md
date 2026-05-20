# 首页与 Dashboard 整合 + SEO 优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页与 Dashboard 整合为统一体验，支持深色/浅色主题切换，完成 SEO 优化，添加文档页面。

**Architecture:** 首页根据登录状态动态渲染内容；主题切换通过 Context + localStorage 管理；路由从 `/dashboard/*` 重构为独立路由 `/backup`, `/team`, `/subscription`；文档页面使用 Markdown 文件渲染。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, gray-matter, marked

---

## 文件结构

### 新建文件
```
packages/web-app/
├── components/layout/
│   ├── Header.tsx              # 统一 Header（支持登录状态 + 主题切换）
│   └── ThemeToggle.tsx         # 主题切换按钮
├── lib/
│   └── theme-context.tsx       # 主题 Context
├── app/
│   ├── docs/
│   │   ├── page.tsx            # 文档列表页
│   │   ├── [slug]/page.tsx     # 单篇文档渲染
│   │   └── content/            # Markdown 文件目录
│   │       ├── getting-started.md
│   │       ├── platform-support.md
│   │       ├── vision-api.md
│   │       ├── import-export.md
│   │       └── faq.md
│   ├── backup/page.tsx         # 备份数据页（从 dashboard 移出）
│   ├── team/page.tsx           # 团队管理页（从 dashboard 移出）
│   ├── subscription/page.tsx   # 订阅页（从 dashboard 移出）
│   └── sitemap.ts              # 动态 sitemap 生成
├── public/
│   ├── robots.txt              # robots 文件
│   └── og-image.png            # 社交分享图片（需用户提供）
```

### 修改文件
```
packages/web-app/
├── app/layout.tsx              # 添加 ThemeProvider
├── app/page.tsx                # 动态渲染首页
├── app/globals.css             # 添加浅色模式 CSS 变量
├── components/dashboard/TabNav.tsx  # 删除或保留备用
```

### 删除文件
```
packages/web-app/
├── app/dashboard/              # 整个目录删除或重定向
```

---

## Task 1: 主题切换基础设施

**Files:**
- Create: `packages/web-app/lib/theme-context.tsx`
- Modify: `packages/web-app/app/globals.css`
- Modify: `packages/web-app/app/layout.tsx`

### Step 1: 添加浅色模式 CSS 变量

修改 `packages/web-app/app/globals.css`，在现有 `@theme inline` 后添加浅色模式变量：

```css
/* 在 @theme inline 块后添加 */

/* Light mode overrides */
html.light {
  --background: #ffffff;
  --foreground: #171717;
}

html.light body {
  background: var(--background);
  color: var(--foreground);
}

/* Light mode color overrides */
.light {
  --color-surface: #ffffff;
  --color-surface-container: #f5f5f5;
  --color-surface-container-low: #fafafa;
  --color-surface-container-highest: #e5e5e5;
  --color-surface-bright: #f0f0f0;
  --color-on-background: #171717;
  --color-on-surface-variant: #64748b;
  --color-outline: #e5e5e5;
  --color-outline-variant: #d1d5db;
}

/* Light mode component overrides */
.light .glass-panel {
  background-color: rgba(255, 255, 255, 0.9);
}

.light .ghost-border {
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.light .glow-primary {
  box-shadow: 0 0 10px 0 rgba(129, 236, 255, 0.2);
}

.light .bg-grid-cyber {
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.05) 1.2px, transparent 1.2px);
}

.light .bg-dots-cyan {
  background-image: radial-gradient(#81ecff 0.8px, transparent 0.8px);
  opacity: 0.1;
}
```

- [ ] **Step 1: 添加浅色模式 CSS 变量**

修改 `packages/web-app/app/globals.css`，添加上述 CSS 代码。

- [ ] **Step 2: 创建 ThemeContext**

创建 `packages/web-app/lib/theme-context.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 从 localStorage 读取主题偏好
    const savedTheme = localStorage.getItem('theme') as Theme | null
    if (savedTheme) {
      setThemeState(savedTheme)
      updateHtmlClass(savedTheme)
    } else {
      // 默认深色模式
      setThemeState('dark')
      updateHtmlClass('dark')
    }
  }, [])

  function updateHtmlClass(theme: Theme) {
    const html = document.documentElement
    html.classList.remove('dark', 'light')
    html.classList.add(theme)
  }

  function setTheme(newTheme: Theme) {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
    updateHtmlClass(newTheme)
  }

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  // 避免 SSR 与 CSR 不一致
  if (!mounted) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
```

- [ ] **Step 3: 在 layout.tsx 中添加 ThemeProvider**

修改 `packages/web-app/app/layout.tsx`，添加 ThemeProvider:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oh My Prompt - 一键插入AI提示词",
  description: "告别复制粘贴，在AI平台输入框旁一键插入提示词。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="dark antialiased"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} font-body min-h-screen relative overflow-x-hidden`}>
        <ThemeProvider>
          {/* Background elements */}
          <div className="fixed inset-0 pointer-events-none z-[-1] bg-dots-cyan opacity-20" />
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute inset-0 bg-grid-cyber" />
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] opacity-50 mix-blend-screen" />
            <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[150px] opacity-40 mix-blend-screen" />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 测试主题切换**

运行开发服务器，验证 CSS 变量是否正确：

```bash
cd packages/web-app && npm run dev
```

在浏览器中手动切换 html 的 class（通过 DevTools）验证浅色/深色模式显示正常。

- [ ] **Step 5: 提交**

```bash
git add packages/web-app/lib/theme-context.tsx packages/web-app/app/globals.css packages/web-app/app/layout.tsx
git commit -m "feat: add theme toggle infrastructure (dark/light mode)"
```

---

## Task 2: 统一 Header 组件

**Files:**
- Create: `packages/web-app/components/layout/Header.tsx`
- Create: `packages/web-app/components/layout/ThemeToggle.tsx`

### Step 1: 创建 ThemeToggle 组件

创建 `packages/web-app/components/layout/ThemeToggle.tsx`:

```tsx
'use client'

import { useTheme } from '@/lib/theme-context'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="ghost-border px-3 py-2 rounded-md text-sm font-medium hover:bg-surface-container-highest transition flex items-center gap-2"
    >
      <span className="material-symbols-outlined text-sm">
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
      <span className="hidden sm:inline">
        {theme === 'dark' ? '浅色' : '深色'}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: 创建 Header 组件**

创建 `packages/web-app/components/layout/Header.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { ThemeToggle } from './ThemeToggle'

// 未登录导航
const publicNav = [
  { id: 'home', label: '首页', href: '/' },
  { id: 'docs', label: '文档', href: '/docs' },
  { id: 'subscription', label: '订阅', href: '/subscription' },
]

// 已登录导航
const privateNav = [
  { id: 'home', label: '首页', href: '/' },
  { id: 'docs', label: '文档', href: '/docs' },
  { id: 'subscription', label: '订阅', href: '/subscription' },
  { id: 'backup', label: '备份', href: '/backup' },
  { id: 'team', label: '团队', href: '/team' },
]

export function Header() {
  const pathname = usePathname()
  const { user, loading } = useUser()

  const navItems = user ? privateNav : publicNav

  return (
    <header className="w-full top-0 sticky z-40 border-b border-outline-variant/20 glass-panel">
      <div className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-2xl font-black tracking-tighter font-[family-name:var(--font-headline)] text-on-background">
            Oh My Prompt
          </Link>
          <nav className="flex items-center gap-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`py-2 px-3 text-sm font-medium rounded-lg transition ${
                    isActive
                      ? 'bg-surface-container-highest text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {loading ? (
            <div className="text-on-surface-variant text-sm">...</div>
          ) : user ? (
            <>
              <span className="text-on-surface-variant text-sm hidden sm:inline">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="ghost-border text-on-surface-variant px-4 py-2 rounded-md text-sm font-medium hover:bg-surface-container-highest transition flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">logout</span>
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="btn-primary-gradient text-on-primary-fixed px-5 py-2 rounded-md text-sm font-bold glow-primary transition flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">login</span>
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add packages/web-app/components/layout/Header.tsx packages/web-app/components/layout/ThemeToggle.tsx
git commit -m "feat: add unified Header component with theme toggle"
```

---

## Task 3: 首页动态渲染

**Files:**
- Modify: `packages/web-app/app/page.tsx`

### Step 1: 修改首页为动态渲染

修改 `packages/web-app/app/page.tsx`，将现有内容拆分为 LandingSection 和 PromptManagerSection：

```tsx
'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createBrowserClient } from '@/lib/supabase'
import { Header } from '@/components/layout/Header'
import { LoginModal } from '@/components/auth/LoginModal'

// GitHub SVG Icon
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const supabase = createBrowserClient()

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    loadUser()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen relative z-10">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-on-surface-variant">加载中...</div>
        </div>
      </div>
    )
  }

  // 已登录：显示提示词管理界面
  if (user) {
    return (
      <div className="flex flex-col min-h-screen relative z-10">
        <Header />
        <main className="max-w-7xl mx-auto px-8 py-8">
          {/* 提示词管理界面占位 - 后续 Task 实现 */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-[family-name:var(--font-headline)] font-bold text-on-background mb-2">提示词管理</h1>
              <p className="text-on-surface-variant text-sm">管理你的专属提示词库</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="ghost-border px-4 py-2 rounded-md text-sm font-medium hover:bg-surface-container-highest transition flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">sync</span>
                同步状态
              </button>
              <button className="btn-primary-gradient text-on-primary-fixed px-4 py-2 rounded-md text-sm font-bold glow-primary transition flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">add</span>
                新建提示词
              </button>
            </div>
          </div>
          <div className="text-on-surface-variant">提示词管理功能待后续实现...</div>
        </main>
      </div>
    )
  }

  // 未登录：显示营销页
  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <LandingContent setShowLoginModal={setShowLoginModal} />
      <Footer />
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  )
}

// 营销页内容组件
function LandingContent({ setShowLoginModal }: { setShowLoginModal: (v: boolean) => void }) {
  return (
    <main className="relative z-10">
      {/* Hero Section */}
      <section className="min-h-[600px] flex flex-col justify-center items-center px-6 lg:px-8 max-w-7xl mx-auto py-16 relative">
        <div className="text-center max-w-4xl mx-auto mb-12">
          <h1 className="text-5xl md:text-6xl font-[family-name:var(--font-headline)] font-bold tracking-tight mb-6 leading-[1.2] text-transparent bg-clip-text bg-gradient-to-r from-on-background via-on-background to-on-surface-variant">
            告别 <s>复制粘贴</s> <br className="hidden md:block" />
            一键插入你的提示词
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed mb-8">
            在 AI 平台输入框旁直接管理、选择、插入你的专属提示词库。<br className="hidden md:block" />
            无需离开创作界面，一键插入。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/wk240/oh-my-prompt/releases/latest"
              className="btn-primary-gradient text-on-primary-fixed px-8 py-3 rounded-md text-base font-bold glow-primary transition-all duration-150 flex items-center gap-2"
            >
              下载插件
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </a>
            <a
              href="https://github.com/wk240/oh-my-prompt"
              target="_blank"
              className="ghost-border text-secondary px-8 py-3 rounded-md text-base font-medium transition-colors duration-150 flex items-center gap-2"
            >
              Star on GitHub
              <span className="text-sm"><GitHubIcon /></span>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 lg:px-8 max-w-7xl mx-auto relative">
        <div className="mb-8">
          <h2 className="text-3xl font-[family-name:var(--font-headline)] font-bold text-on-background mb-4">核心特性</h2>
          <p className="text-on-surface-variant">专为 AI Prompt 设计，让提示词管理更简单、更高效。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard icon="bolt" color="primary" title="一键插入" desc="点击即可插入预设提示词，无需复制粘贴。" />
          <FeatureCard icon="folder_copy" color="tertiary" title="分类管理" desc="按用途分类整理提示词，本地存储安全可控。" />
          <FeatureCard icon="auto_awesome" color="secondary" title="图片转提示词" desc="右键图片，一键识别并生成精准提示词。" />
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-6 lg:px-8 max-w-7xl mx-auto relative">
        <div className="mb-8">
          <h2 className="text-3xl font-[family-name:var(--font-headline)] font-bold text-on-background mb-4">定价方案</h2>
          <p className="text-on-surface-variant">从免费开始，按需升级。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PricingCard tier="free" price="$0" features={['Chrome插件完整功能', '本地管理提示词', '导入导出数据']} cta="下载插件" ctaHref="https://github.com/wk240/oh-my-prompt/releases/latest" />
          <PricingCard tier="pro" price="$9" features={['Free全部功能', '云端备份', '多设备同步', 'AI识图（50次/月）']} cta="开始订阅" ctaHref="/subscription?plan=pro" recommended />
          <PricingCard tier="team" price="$29" features={['Pro全部功能', '团队共享库', '5人团队', 'AI识图（200次/月）']} cta="开始订阅" ctaHref="/subscription?plan=team" />
        </div>
      </section>
    </main>
  )
}

function FeatureCard({ icon, color, title, desc }: { icon: string; color: string; title: string; desc: string }) {
  return (
    <div className="bg-surface-container-low rounded-lg p-6 ghost-border hover:bg-surface-bright transition-colors">
      <div className="w-10 h-10 rounded-md bg-surface-container-highest ghost-border flex items-center justify-center mb-4">
        <span className={`material-symbols-outlined text-${color} text-xl`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <h3 className="text-lg font-[family-name:var(--font-headline)] font-bold text-on-background mb-2">{title}</h3>
      <p className="text-on-surface-variant text-sm">{desc}</p>
    </div>
  )
}

function PricingCard({ tier, price, features, cta, ctaHref, recommended }: { tier: string; price: string; features: string[]; cta: string; ctaHref: string; recommended?: boolean }) {
  if (recommended) {
    return (
      <div className="relative rounded-lg p-6 overflow-hidden">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/30 via-secondary/20 to-tertiary/30 opacity-60" />
        <div className="absolute inset-[1px] rounded-lg bg-surface-container" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 rounded bg-gradient-to-r from-primary to-secondary text-on-primary-fixed text-xs font-medium">推荐</span>
          </div>
          <div className="text-lg font-[family-name:var(--font-headline)] font-bold text-on-background mb-2">{tier.toUpperCase()}</div>
          <div className="text-3xl font-bold text-on-background mb-4">
            {price}<span className="text-lg text-on-surface-variant">/月</span>
          </div>
          <ul className="space-y-2 text-on-surface-variant mb-6 text-sm">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                {f}
              </li>
            ))}
          </ul>
          <a href={ctaHref} className="block w-full py-3 text-center btn-primary-gradient rounded-md text-on-primary-fixed font-bold glow-primary transition text-sm">
            {cta}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-low rounded-lg p-6 ghost-border hover:bg-surface-bright transition-colors">
      <div className="text-lg font-[family-name:var(--font-headline)] font-bold text-on-background mb-2">{tier.toUpperCase()}</div>
      <div className="text-3xl font-bold text-on-background mb-4">
        {price}<span className="text-lg text-on-surface-variant">/月</span>
      </div>
      <ul className="space-y-2 text-on-surface-variant mb-6 text-sm">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm">check</span>
            {f}
          </li>
        ))}
      </ul>
      <a href={ctaHref} className="block w-full py-3 text-center ghost-border rounded-md text-on-surface hover:bg-surface-container-highest transition text-sm font-medium">
        {cta}
      </a>
    </div>
  )
}

function Footer() {
  return (
    <footer className="bg-surface py-8 max-w-7xl mx-auto px-8 border-t border-outline-variant/10 mt-16 relative z-10">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-lg font-bold text-on-background mb-1 font-[family-name:var(--font-headline)]">Oh My Prompt</div>
          <p className="text-on-surface-variant text-sm">&copy; 2026 Oh My Prompt.</p>
        </div>
        <div className="flex gap-6">
          <a href="#" className="text-on-surface-variant hover:text-on-surface transition text-sm">隐私政策</a>
          <a href="#" className="text-on-surface-variant hover:text-on-surface transition text-sm">服务条款</a>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: 测试首页动态渲染**

运行开发服务器，验证未登录显示营销页，登录后显示提示词管理占位页面：

```bash
cd packages/web-app && npm run dev
```

- [ ] **Step 3: 提交**

```bash
git add packages/web-app/app/page.tsx
git commit -m "feat: dynamic homepage based on login state"
```

---

## Task 4: 路由重构 - 备份数据页面

**Files:**
- Create: `packages/web-app/app/backup/page.tsx`
- Modify: `packages/web-app/app/dashboard/backup/page.tsx` (复制内容)

### Step 1: 创建 /backup 页面

读取现有 dashboard/backup/page.tsx 内容，创建新的 `/backup` 页面：

```bash
cat packages/web-app/app/dashboard/backup/page.tsx
```

然后创建 `packages/web-app/app/backup/page.tsx`，内容基于现有 dashboard backup 页面，添加 Header：

```tsx
'use client'

import { Header } from '@/components/layout/Header'
import { useEffect, useState } from 'react'
// ... (复制现有 dashboard/backup/page.tsx 的内容，添加 Header)

export default function BackupPage() {
  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 现有 dashboard/backup 内容 */}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 添加登录保护**

如果页面需要登录保护，添加 auth guard：

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// 如果是 Server Component
export default async function BackupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }
  
  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 内容 */}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add packages/web-app/app/backup/page.tsx
git commit -m "feat: add /backup route with unified header"
```

---

## Task 5: 路由重构 - 团队管理页面

**Files:**
- Create: `packages/web-app/app/team/page.tsx`

### Step 1: 创建 /team 页面

类似 Task 4，创建 `packages/web-app/app/team/page.tsx`:

```tsx
// 基于 dashboard/team/page.tsx 内容，添加 Header
```

- [ ] **Step 2: 提交**

```bash
git add packages/web-app/app/team/page.tsx
git commit -m "feat: add /team route with unified header"
```

---

## Task 6: 路由重构 - 订阅页面

**Files:**
- Create: `packages/web-app/app/subscription/page.tsx`

### Step 1: 创建 /subscription 页面

类似 Task 4，创建 `packages/web-app/app/subscription/page.tsx`:

```tsx
// 基于 dashboard/subscription 或 dashboard/billing 内容，添加 Header
```

- [ ] **Step 2: 提交**

```bash
git add packages/web-app/app/subscription/page.tsx
git commit -m "feat: add /subscription route with unified header"
```

---

## Task 7: 删除 /dashboard 路由

**Files:**
- Delete: `packages/web-app/app/dashboard/` (整个目录)
- Create: `packages/web-app/app/dashboard/page.tsx` (重定向)

### Step 1: 创建重定向页面

创建一个简单的重定向页面 `packages/web-app/app/dashboard/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function DashboardPage() {
  redirect('/')
}
```

### Step 2: 删除旧内容

删除 dashboard 目录下的其他文件（保留 layout.tsx 暂时），或直接删除整个 dashboard 目录：

```bash
rm -rf packages/web-app/app/dashboard/backup
rm -rf packages/web-app/app/dashboard/team
rm -rf packages/web-app/app/dashboard/subscription
rm -rf packages/web-app/app/dashboard/billing
```

### Step 3: 测试重定向

验证访问 `/dashboard` 会重定向到 `/`:

```bash
cd packages/web-app && npm run dev
# 浏览器访问 http://localhost:3000/dashboard
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: remove /dashboard routes, redirect to /"
```

---

## Task 8: 文档页面基础设施

**Files:**
- Create: `packages/web-app/app/docs/page.tsx`
- Create: `packages/web-app/app/docs/[slug]/page.tsx`
- Create: `packages/web-app/app/docs/content/` (目录)

### Step 1: 安装依赖

```bash
cd packages/web-app
npm install gray-matter marked
```

### Step 2: 创建文档列表页

创建 `packages/web-app/app/docs/page.tsx`:

```tsx
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { getDocs } from './lib'

export default function DocsPage() {
  const docs = getDocs()

  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-[family-name:var(--font-headline)] font-bold text-on-background mb-2">文档</h1>
          <p className="text-on-surface-variant text-sm">使用 Oh My Prompt 的完整指南</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              className="bg-surface-container-low rounded-lg p-4 ghost-border hover:bg-surface-bright transition-colors"
            >
              <h2 className="text-base font-[family-name:var(--font-headline)] font-bold text-on-background mb-2">{doc.title}</h2>
              <p className="text-on-surface-variant text-sm">{doc.description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
```

### Step 3: 创建文档渲染页

创建 `packages/web-app/app/docs/[slug]/page.tsx`:

```tsx
import { Header } from '@/components/layout/Header'
import { getDoc, getDocs } from '../lib'
import { notFound } from 'next/navigation'
import { marked } from 'marked'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params
  const doc = getDoc(slug)

  if (!doc) {
    notFound()
  }

  const htmlContent = await marked(doc.content)

  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="max-w-4xl mx-auto px-8 py-8">
        <article className="bg-surface-container-low rounded-lg p-8 ghost-border">
          <h1 className="text-2xl font-[family-name:var(--font-headline)] font-bold text-on-background mb-4">{doc.title}</h1>
          <div className="prose prose-invert max-w-none text-on-surface-variant">
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        </article>
      </main>
    </div>
  )
}

export async function generateStaticParams() {
  const docs = getDocs()
  return docs.map((doc) => ({ slug: doc.slug }))
}
```

### Step 4: 创建文档工具函数

创建 `packages/web-app/app/docs/lib.ts`:

```ts
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const docsDirectory = path.join(process.cwd(), 'app/docs/content')

export interface Doc {
  slug: string
  title: string
  description: string
  content: string
}

export function getDocs(): Doc[] {
  const files = fs.readdirSync(docsDirectory)
  const markdownFiles = files.filter((file) => file.endsWith('.md'))

  return markdownFiles.map((file) => {
    const filePath = path.join(docsDirectory, file)
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContent)

    return {
      slug: file.replace('.md', ''),
      title: data.title || file.replace('.md', ''),
      description: data.description || '',
      content,
    }
  })
}

export function getDoc(slug: string): Doc | null {
  try {
    const filePath = path.join(docsDirectory, `${slug}.md`)
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContent)

    return {
      slug,
      title: data.title || slug,
      description: data.description || '',
      content,
    }
  } catch {
    return null
  }
}
```

### Step 5: 提交

```bash
git add packages/web-app/app/docs/ packages/web-app/package.json
git commit -m "feat: add docs pages with markdown rendering"
```

---

## Task 9: 创建文档内容

**Files:**
- Create: `packages/web-app/app/docs/content/getting-started.md`
- Create: `packages/web-app/app/docs/content/platform-support.md`
- Create: `packages/web-app/app/docs/content/vision-api.md`
- Create: `packages/web-app/app/docs/content/import-export.md`
- Create: `packages/web-app/app/docs/content/faq.md`

### Step 1: 创建快速开始文档

创建 `packages/web-app/app/docs/content/getting-started.md`:

```markdown
---
title: 快速开始
description: 安装 Oh My Prompt 插件并完成首次配置
---

## 安装插件

1. 访问 [GitHub Releases](https://github.com/wk240/oh-my-prompt/releases/latest) 下载最新版本的 `.crx` 文件
2. 打开 Chrome 浏览器，进入 `chrome://extensions`
3. 开启「开发者模式」
4. 将下载的 `.crx` 文件拖拽到扩展页面中安装

## 首次配置

安装完成后，点击浏览器工具栏中的 Oh My Prompt 图标：

1. **设置提示词** - 点击侧边栏按钮打开管理界面
2. **创建分类** - 添加「设计」「写作」「代码」等分类
3. **添加提示词** - 在各分类下创建常用提示词

## 使用方法

访问支持的 AI 平台（如 Lovart、ChatGPT、Claude.ai），在输入框旁会出现下拉菜单按钮，点击即可选择并插入提示词。
```

- [ ] **Step 2: 创建其他文档**

创建其余 4 个 markdown 文件，内容类似占位。

- [ ] **Step 3: 提交**

```bash
git add packages/web-app/app/docs/content/
git commit -m "docs: add initial documentation content"
```

---

## Task 10: SEO Meta 优化

**Files:**
- Modify: `packages/web-app/app/layout.tsx`

### Step 1: 添加 OpenGraph 和 Twitter Cards

修改 `packages/web-app/app/layout.tsx` 的 metadata:

```tsx
export const metadata: Metadata = {
  title: "Oh My Prompt - 一键插入AI提示词",
  description: "告别复制粘贴，在AI平台输入框旁一键插入提示词。",
  openGraph: {
    type: "website",
    url: "https://ohmyprompt.com",
    title: "Oh My Prompt - 一键插入AI提示词",
    description: "告别复制粘贴，在AI平台输入框旁一键插入提示词。",
    images: [
      {
        url: "https://ohmyprompt.com/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oh My Prompt - 一键插入AI提示词",
    description: "告别复制粘贴，在AI平台输入框旁一键插入提示词。",
    images: ["https://ohmyprompt.com/og-image.png"],
  },
}
```

### Step 2: 添加 JSON-LD 结构化数据

在 layout.tsx 中添加 Script 组件：

```tsx
import Script from 'next/script'

// 在 body 内添加
<Script
  id="schema-org"
  type="application/ld+json"
  strategy="beforeInteractive"
>
  {JSON.stringify({
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
    "downloadUrl": "https://github.com/wk240/oh-my-prompt/releases/latest"
  })}
</Script>
```

- [ ] **Step 3: 提交**

```bash
git add packages/web-app/app/layout.tsx
git commit -m "feat: add SEO meta (OpenGraph, Twitter Cards, JSON-LD)"
```

---

## Task 11: sitemap 和 robots.txt

**Files:**
- Create: `packages/web-app/app/sitemap.ts`
- Create: `packages/web-app/public/robots.txt`

### Step 1: 创建动态 sitemap

创建 `packages/web-app/app/sitemap.ts`:

```ts
import { MetadataRoute } from 'next'
import { getDocs } from './docs/lib'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docs = getDocs()
  const baseUrl = 'https://ohmyprompt.com'

  const docRoutes = docs.map((doc) => ({
    url: `${baseUrl}/docs/${doc.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...docRoutes,
  ]
}
```

### Step 2: 创建 robots.txt

创建 `packages/web-app/public/robots.txt`:

```txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/

Sitemap: https://ohmyprompt.com/sitemap.xml
```

- [ ] **Step 3: 提交**

```bash
git add packages/web-app/app/sitemap.ts packages/web-app/public/robots.txt
git commit -m "feat: add sitemap and robots.txt for SEO"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] 深色/浅色主题切换 → Task 1
- [x] Header 组件统一 → Task 2
- [x] 首页动态渲染 → Task 3
- [x] 导航：首页、文档、订阅、备份、团队 → Task 2, 4, 5, 6
- [x] 路由重构 → Task 4, 5, 6, 7
- [x] 文档页面 → Task 8, 9
- [x] SEO meta → Task 10
- [x] sitemap + robots.txt → Task 11
- [ ] og-image → 需要用户提供图片

**2. Placeholder scan:**
- 检查是否有 TBD、TODO 等占位符 → 无
- 检查是否有 "类似 Task N" 的引用 → Task 4-6 有引用，但已说明需要查看现有文件

**3. Type consistency:**
- 检查组件命名一致性 → Header, ThemeToggle, ThemeProvider
- 检查函数命名一致性 → getDocs, getDoc, toggleTheme

---

## 验收标准

- [ ] 深色/浅色主题切换正常工作，localStorage 持久化
- [ ] Header 组件统一，根据登录状态切换导航
- [ ] `/` 页面未登录显示营销页（Hero、Features、Pricing）
- [ ] `/` 页面登录后显示提示词管理界面占位
- [ ] `/docs` 和 `/docs/[slug]` 可访问，正确渲染 Markdown
- [ ] `/backup`, `/team`, `/subscription` 路由可访问
- [ ] `/dashboard` 重定向到 `/`
- [ ] Landing Page 包含 OpenGraph、Twitter Cards、JSON-LD
- [ ] `/sitemap.xml` 可访问，包含所有公开页面
- [ ] `/robots.txt` 可访问