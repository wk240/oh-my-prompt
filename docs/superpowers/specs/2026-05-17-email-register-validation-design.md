# 邮箱注册验证设计

**日期:** 2026-05-17

## 概述

在用户提交注册表单时，如果邮箱已被注册，显示错误提示并提供"去登录"链接引导用户登录。

## 背景

当前注册页面已处理 Supabase signUp 返回的 "already registered" 错误（`packages/web-app/app/auth/register/page.tsx:62-63`），但只显示静态文字"该邮箱已被注册"，未引导用户去登录。

## 设计

### 错误状态结构

将 `error` 从 `string | null` 改为结构化对象，支持可选链接：

```typescript
interface AuthError {
  message: string
  link?: { text: string; href: string }
}

const [error, setError] = useState<AuthError | null>(null)
```

### 错误提示区渲染

错误显示区支持渲染可选链接，链接文字紧接错误消息：

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

### signUp 错误处理

"already registered" 错误设置带链接的错误对象：

```typescript
if (signUpError.message.includes('already registered')) {
  setError({
    message: '该邮箱已被注册，',
    link: { text: '请直接登录', href: '/auth/login' }
  })
}
```

## 实现范围

仅修改 `packages/web-app/app/auth/register/page.tsx`：
- 错误状态类型定义
- 错误提示区 JSX
- signUp 错误处理逻辑

## 安全考虑

利用 Supabase signUp 现有错误响应，不暴露邮箱探测接口，避免被滥用探测用户是否存在。