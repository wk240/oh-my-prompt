# 首页落地页改造设计

> 日期: 2026-05-12
> 状态: 待实现

## 背景

当前 Web App 首页 (`packages/web-app/app/page.tsx`) 根据登录状态显示不同内容：
- **已登录用户:** 显示"提示词管理"占位界面
- **未登录用户:** 显示营销落地页 (Hero + 核心特性 + 定价方案)

用户希望移除首页的"提示词管理"功能，让所有用户（无论登录状态）都看到落地页。登录状态只影响导航栏显示的链接。

## 需求

1. 首页所有人看到相同落地页
2. 导航栏保持现有逻辑：
   - 未登录: 首页/文档/订阅 + 登录按钮
   - 已登录: 首页/文档/订阅/备份/团队 + 退出按钮
3. 落地页内容保持不变 (Hero + 核心特性 + 定价方案)

## 设计方案

### 修改范围

仅修改 `packages/web-app/app/page.tsx`，Header 不变。

### 代码变更

删除 lines 31-57 的已登录分支逻辑：

```tsx
// 已登录：显示提示词管理界面
if (user) {
  return (
    <div className="flex flex-col min-h-screen relative z-10">
      <Header />
      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* 提示词管理界面占位 */}
        ...
      </main>
    </div>
  )
}
```

改为统一渲染落地页：

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

### 保持不变

- `Header.tsx` 导航逻辑
- `LandingContent` 组件内容 (Hero + Features + Pricing)
- `Footer` 组件
- `LoginModal` 组件

## 实现步骤

1. 编辑 `packages/web-app/app/page.tsx`
2. 删除已登录分支 (lines 30-57)
3. 移除相关的 `user` 条件判断
4. 保持 loading 状态处理
5. 测试验证：
   - 未登录用户看到落地页 + 登录按钮导航
   - 已登录用户看到落地页 + 备份/团队链接导航

## 影响范围

- 首页用户体验：已登录用户不再看到空白"提示词管理"占位
- 导航体验：已登录用户可通过导航栏访问 `/backup` 和 `/team` 功能
- 无向后兼容性问题：新行为符合用户预期