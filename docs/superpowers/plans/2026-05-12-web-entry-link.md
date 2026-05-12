# Web端入口链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在云端同步模块添加"进入Web端"链接，跳转到备份管理页面。

**Architecture:** 纯UI变更，导入环境配置URL，在已登录状态下的标题行添加链接。

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite alias配置

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx` | Modify | 添加导入和链接元素 |
| `packages/extension/src/lib/config.dev.ts` | Read | 开发环境URL配置 |
| `packages/extension/src/lib/config.prod.ts` | Read | 生产环境URL配置 |

---

### Task 1: 添加Web端入口链接

**Files:**
- Modify: `packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx:1,340-384`

- [ ] **Step 1: 添加导入语句**

在第18行（lucide-react导入之后）添加配置导入：

```typescript
import { WEB_APP_URL } from '@/lib/config'
```

- [ ] **Step 2: 在已登录状态区块添加链接**

定位到第365-384行的已登录状态区块，在"退出"按钮之前添加链接。

找到以下代码块（约第366-384行）：
```typescript
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600">状态</span>
    <div className="flex items-center gap-2">
      <span className="text-sm flex items-center gap-1.5 text-green-600">
        <Check className="w-4 h-4" />
        已登录
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        disabled={loading}
        className="h-7 px-2 text-gray-500 hover:text-gray-700"
      >
        <LogOut className="w-3.5 h-3.5" />
        退出
      </Button>
    </div>
  </div>
```

修改为：
```typescript
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600">状态</span>
    <div className="flex items-center gap-2">
      <span className="text-sm flex items-center gap-1.5 text-green-600">
        <Check className="w-4 h-4" />
        已登录
      </span>
      <a
        href={`${WEB_APP_URL}/backup`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        进入Web端
      </a>
      <span className="text-sm text-gray-300">|</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        disabled={loading}
        className="h-7 px-2 text-gray-500 hover:text-gray-700"
      >
        <LogOut className="w-3.5 h-3.5" />
        退出
      </Button>
    </div>
  </div>
```

- [ ] **Step 3: TypeScript类型检查**

运行: `cd packages/extension && npx tsc --noEmit`
预期: 无类型错误

- [ ] **Step 4: 提交变更**

```bash
git add packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx
git commit -m "$(cat <<'EOF'
feat(sidepanel): add web entry link to cloud sync section

Add "进入Web端" link in cloud sync section header when logged in.
Link opens /backup page in new tab using WEB_APP_URL config.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Verification

### Manual Testing Checklist

运行 `npm run dev` 后在浏览器中验证：

1. 打开侧边栏，进入设置页面的"云端同步"区块
2. 未登录状态：确认不显示"进入Web端"链接
3. 点击"登录"完成OAuth登录
4. 已登录状态：确认显示"进入Web端 | 退出"
5. 点击"进入Web端"，新标签页打开 `http://localhost:3000/backup`（开发环境）
6. 确认链接样式与"退出"按钮一致

### Build Verification

```bash
cd packages/extension && npm run build
```

确认生产构建成功，`WEB_APP_URL` 自动切换为 `https://oh-my-prompt.com/backup`

---

## Notes

- 无新增依赖
- 无测试文件变更（纯UI静态链接）
- 配置已通过vite alias自动切换环境