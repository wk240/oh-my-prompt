# 邮箱注册验证实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 注册时邮箱已存在，显示错误提示并提供"去登录"链接引导用户登录。

**Architecture:** 修改注册页面的错误状态为结构化对象，支持可选链接，在 signUp "already registered" 错误时设置带链接的错误。

**Tech Stack:** React, TypeScript, Next.js, Supabase Auth

---

## 文件结构

仅修改一个文件：
- `packages/web-app/app/auth/register/page.tsx` — 注册页面组件

---

### Task 1: 修改错误状态类型和接口定义

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx:1-15`

- [ ] **Step 1: 定义 AuthError 接口并修改 error 状态类型**

在 `RegisterPage` 组件顶部，`useState` 定义之前添加接口定义：

```typescript
interface AuthError {
  message: string
  link?: { text: string; href: string }
}
```

修改第 13 行的 error 状态：

```typescript
const [error, setError] = useState<AuthError | null>(null)
```

- [ ] **Step 2: 验证 TypeScript 类型检查**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: 无类型错误（可能有其他位置的 setError 调用报错，下一步修复）

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "feat(register): define AuthError interface for structured error messages"
```

---

### Task 2: 更新所有 setError 调用使用新格式

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx:29-85`

- [ ] **Step 1: 更新表单验证错误（第 34-42 行）**

将第 34-37 行的 setError 调用改为：

```typescript
setError({ message: '请输入有效的邮箱地址' })
```

将第 40-42 行的 setError 调用改为：

```typescript
setError({ message: '密码至少需要6个字符' })
```

- [ ] **Step 2: 更新 signUp 错误处理（第 60-75 行）**

将所有 signUp 错误的 setError 调用改为新格式：

```typescript
if (signUpError.message.includes('already registered')) {
  setError({
    message: '该邮箱已被注册，',
    link: { text: '请直接登录', href: '/auth/login' }
  })
} else if (signUpError.message.includes('rate limit')) {
  setError({ message: '发送频率过高，请稍后再试' })
} else if (signUpError.message.includes('invalid email')) {
  setError({ message: '邮箱地址无效' })
} else if (signUpError.message.includes('Password')) {
  setError({ message: '密码格式不正确' })
} else {
  console.error('Sign Up Error:', signUpError)
  setError({ message: `发送失败: ${signUpError.message || '服务器错误'}` })
}
```

- [ ] **Step 3: 更新 catch 块错误（第 79-81 行）**

将第 80-81 行改为：

```typescript
setError({ message: '注册失败，请稍后重试' })
```

- [ ] **Step 4: 验证 TypeScript 类型检查**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "feat(register): update all setError calls to use AuthError format"
```

---

### Task 3: 更新错误提示区 JSX 渲染链接

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx:174-179`

- [ ] **Step 1: 修改错误显示区支持渲染链接**

将第 174-179 行的错误显示区改为：

```tsx
{error && (
  <div className="mb-4 p-3 bg-error-container/50 rounded-md border border-error/30">
    <p className="text-error text-sm font-medium">
      {error.message}
      {error.link && (
        <Link href={error.link.href} className="text-on-background hover:underline ml-1">
          {error.link.text}
        </Link>
      )}
    </p>
  </div>
)}
```

- [ ] **Step 2: 验证 TypeScript 类型检查**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "feat(register): render login link in error message when email already registered"
```

---

### Task 4: 手动测试验证功能

**Files:**
- Test: Manual browser testing

- [ ] **Step 1: 启动开发服务器**

Run: `cd packages/web-app && npm run dev`
Expected: 服务器启动在 port 3000

- [ ] **Step 2: 测试邮箱已注册场景**

1. 打开浏览器访问 `http://localhost:3000/auth/register`
2. 输入一个已注册的邮箱地址
3. 输入密码（至少6字符）
4. 点击"注册账号"
5. 验证：显示错误"该邮箱已被注册，请直接登录"，"请直接登录"为可点击链接
6. 点击链接跳转到 `/auth/login` 页面

- [ ] **Step 3: 测试其他错误场景**

1. 输入无效邮箱（无@符号），验证显示"请输入有效的邮箱地址"
2. 输入短密码（<6字符），验证显示"密码至少需要6个字符"
3. 验证这些错误无链接显示

- [ ] **Step 4: 运行生产构建验证**

Run: `cd packages/web-app && npm run build`
Expected: 构建成功无错误

- [ ] **Step 5: Commit（如有修复）**

如果测试中发现问题并修复：

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "fix(register): resolve testing issues"
```

---

### Task 5: 最终构建验证

**Files:**
- Build: `packages/web-app`

- [ ] **Step 1: 运行完整构建**

Run: `cd packages/web-app && npm run build`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 2: 运行 lint 检查**

Run: `cd packages/web-app && npm run lint`
Expected: 无 lint 错误

- [ ] **Step 3: Push changes**

```bash
git push origin v2.0.0
```

---

## 自检清单

- **Spec coverage:** 所有设计要求已覆盖
  - AuthError 接口定义 ✓ (Task 1)
  - error 状态类型修改 ✓ (Task 1)
  - 错误提示区 JSX ✓ (Task 3)
  - signUp already registered 处理 ✓ (Task 2)
  - 其他 setError 调用更新 ✓ (Task 2)

- **Placeholder scan:** 无 TBD/TODO，所有代码完整

- **Type consistency:** AuthError 接口在各任务中一致使用