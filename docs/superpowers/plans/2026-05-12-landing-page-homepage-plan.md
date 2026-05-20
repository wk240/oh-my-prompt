# 首页落地页改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除首页"提示词管理"分支，让所有用户（无论登录状态）都看到落地页

**Architecture:** 删除 `page.tsx` 中已登录用户的条件分支，统一渲染 LandingContent 组件。Header 导航逻辑保持不变。

**Tech Stack:** Next.js 16, React 19, TypeScript

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/web-app/app/page.tsx` | Modify | 删除已登录分支，统一渲染落地页 |
| `packages/web-app/components/layout/Header.tsx` | No change | 导航逻辑已正确区分登录状态 |

---

### Task 1: 移除已登录分支逻辑

**Files:**
- Modify: `packages/web-app/app/page.tsx:30-57`

- [ ] **Step 1: 删除已登录用户的条件分支**

将 lines 30-57 的已登录分支代码删除：

```tsx
// 删除这段代码:
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
            <button className="bg-black text-white border border-white/20 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-900 transition flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">sync</span>
              同步状态
            </button>
            <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-bold hover:bg-gray-100 transition flex items-center gap-2">
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
```

- [ ] **Step 2: 修改未登录分支为统一渲染**

将 lines 59-68 的未登录分支改为所有人的统一渲染：

```tsx
// 所有人显示落地页
return (
  <div className="flex flex-col min-h-screen relative z-10">
    <Header />
    <LandingContent setShowLoginModal={setShowLoginModal} />
    <Footer />
    <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
  </div>
)
```

- [ ] **Step 3: 移除不再需要的 user 变量引用**

由于不再需要 `user` 变量判断，可以移除相关引用（但保留 `loading` 状态处理）：

```tsx
export default function Home() {
  const { loading } = useUser()  // 移除 user
  const [showLoginModal, setShowLoginModal] = useState(false)

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

  // 所有人显示落地页
  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <LandingContent setShowLoginModal={setShowLoginModal} />
      <Footer />
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  )
}
```

- [ ] **Step 4: 本地验证改动**

```bash
cd packages/web-app
npm run dev
```

访问 http://localhost:3000/ 验证：
- 未登录用户看到落地页（Hero + 核心特性 + 定价）+ 登录按钮导航
- 已登录用户看到落地页 + 备份/团队链接导航

- [ ] **Step 5: TypeScript 类型检查**

```bash
cd packages/web-app
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 6: 提交改动**

```bash
cd /d/workspace/projects/oh-my-prompt
git add packages/web-app/app/page.tsx
git commit -m "$(cat <<'EOF'
refactor(web-app): remove prompt management placeholder from homepage

All users now see the landing page regardless of login state.
Login state only affects navbar (backup/team links for logged-in users).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 首页所有人看到相同落地页 — Task 1 覆盖
- ✅ 导航栏保持现有逻辑 — Header 不修改，Task 1 Step 4 验证
- ✅ 落地页内容保持不变 — LandingContent/Footer/LoginModal 组件不改

**2. Placeholder scan:**
- ✅ 无 TBD/TODO
- ✅ 所有代码步骤包含实际代码
- ✅ 所有命令步骤包含实际命令

**3. Type consistency:**
- ✅ `useUser()` 返回 `{ user, loading }`，移除 `user` 后只取 `loading`
- ✅ 其他组件类型签名不变