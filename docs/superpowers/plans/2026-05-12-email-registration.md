# 邮箱注册功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加邮箱注册/登录功能，支持邮箱+密码、OTP无密码登录、忘记密码/重置密码流程

**Architecture:** 使用 Supabase 内置 Auth API，新增 4 个页面（注册、验证等待、忘记密码、重置密码），修改登录页和 Modal 支持邮箱登录，修改回调路由支持 signup/recovery 类型

**Tech Stack:** Next.js 16 App Router, Supabase Auth, React 19, Tailwind CSS 4

---

## File Structure

### New Files
```
packages/web-app/app/auth/register/page.tsx      # 注册页
packages/web-app/app/auth/verify/page.tsx        # 验证等待页
packages/web-app/app/auth/forgot-password/page.tsx # 忘记密码页
packages/web-app/app/auth/reset-password/page.tsx  # 重置密码页
```

### Modified Files
```
packages/web-app/app/auth/login/page.tsx         # 添加邮箱登录 + Tab切换
packages/web-app/components/auth/LoginModal.tsx  # 添加邮箱登录（简化版）
packages/web-app/supabase/config.toml            # 更新密码配置
packages/web-app/app/auth/callback/route.ts      # 支持 signup/recovery 类型
```

---

## Task 1: 更新 Supabase 配置

**Files:**
- Modify: `packages/web-app/supabase/config.toml:177-180`

- [ ] **Step 1: 修改密码长度配置**

修改 `minimum_password_length` 从 6 改为 8：

```toml
# Passwords shorter than this value will be rejected as weak. Minimum 6, recommended 8 or more.
minimum_password_length = 8
```

- [ ] **Step 2: 提交配置改动**

```bash
git add packages/web-app/supabase/config.toml
git commit -m "config: set minimum password length to 8 for email auth

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 创建注册页面

**Files:**
- Create: `packages/web-app/app/auth/register/page.tsx`

- [ ] **Step 1: 创建注册页面组件**

```tsx
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient()

  const validatePassword = (pwd: string): boolean => {
    if (pwd.length < 8) return false
    const hasLetter = /[a-zA-Z]/.test(pwd)
    const hasDigit = /[0-9]/.test(pwd)
    return hasLetter && hasDigit
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validatePassword(password)) {
      setError('密码至少8位，需包含字母和数字')
      return
    }

    setLoading(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || null,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        setError('该邮箱已被注册，请直接登录')
      } else {
        setError(signUpError.message)
      }
      return
    }

    // Redirect to verify page with email
    router.push(`/auth/verify?email=${encodeURIComponent(email)}`)
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <Link href="/" className="text-base font-semibold text-on-background">
          Oh My Prompt
        </Link>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
            <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
              创建账号
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
              注册以使用云端同步和团队协作功能
            </p>

            {/* Register form */}
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-1">
                  邮箱
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-1">
                  密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="至少8位，含字母和数字"
                  className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {/* Display Name (optional) */}
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-on-surface-variant mb-1">
                  昵称 <span className="text-on-surface-variant/50">(可选)</span>
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：小明"
                  className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-error font-medium">{error}</p>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-[10px] bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
              >
                {loading ? '注册中...' : '注册'}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-xs text-on-surface-variant text-center font-medium">
              已有账号？{' '}
              <Link href="/auth/login" className="text-on-background hover:underline">
                登录
              </Link>
            </p>
          </div>

          {/* Back to home */}
          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
              ← 返回首页
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 提交注册页面**

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "feat: add email registration page with password validation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 创建验证等待页面

**Files:**
- Create: `packages/web-app/app/auth/verify/page.tsx`

- [ ] **Step 1: 创建验证等待页面组件**

```tsx
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function VerifyPage() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createBrowserClient()

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleResend = async () => {
    if (countdown > 0 || !email) return

    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      setMessage('发送失败，请稍后重试')
    } else {
      setMessage('验证邮件已重新发送')
      setCountdown(60)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <Link href="/" className="text-base font-semibold text-on-background">
          Oh My Prompt
        </Link>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8 text-center">
            {/* Icon */}
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-surface-container-high rounded-full">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>

            <h1 className="text-lg font-semibold text-on-background mb-2">
              验证您的邮箱
            </h1>
            <p className="text-on-surface-variant text-sm font-medium mb-4">
              验证邮件已发送至
            </p>
            <p className="text-on-background text-sm font-semibold mb-6">
              {email || 'your@email.com'}
            </p>

            {/* Resend button */}
            <button
              onClick={handleResend}
              disabled={countdown > 0 || loading || !email}
              className="w-full px-4 py-[10px] bg-surface-container-high text-on-background rounded-md hover:bg-surface-container-highest transition-colors duration-150 disabled:opacity-50 font-medium text-[13px] mb-4"
            >
              {loading ? '发送中...' : countdown > 0 ? `重新发送 (${countdown}s)` : '重新发送验证邮件'}
            </button>

            {/* Message */}
            {message && (
              <p className="text-sm text-primary font-medium mb-4">{message}</p>
            )}

            {/* Back to login */}
            <Link href="/auth/login" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
              ← 返回登录
            </Link>
          </div>

          {/* Tip */}
          <div className="mt-4 text-center">
            <p className="text-xs text-on-surface-variant/70 font-medium">
              没收到邮件？请检查垃圾邮件文件夹
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 提交验证等待页面**

```bash
git add packages/web-app/app/auth/verify/page.tsx
git commit -m "feat: add email verification waiting page with resend button

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: 创建忘记密码页面

**Files:**
- Create: `packages/web-app/app/auth/forgot-password/page.tsx`

- [ ] **Step 1: 创建忘记密码页面组件**

```tsx
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const supabase = createBrowserClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-surface-container-high rounded-full">
                <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-on-background mb-2">
                邮件已发送
              </h1>
              <p className="text-on-surface-variant text-sm font-medium mb-6">
                如果该邮箱已注册，您将收到重置密码的链接
              </p>
              <Link href="/auth/login" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
                ← 返回登录
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <Link href="/" className="text-base font-semibold text-on-background">
          Oh My Prompt
        </Link>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
            <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
              重置密码
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
              输入您的邮箱，我们将发送重置链接
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-1">
                  邮箱
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-[10px] bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
              >
                {loading ? '发送中...' : '发送重置链接'}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-xs text-on-surface-variant text-center font-medium">
              <Link href="/auth/login" className="text-on-background hover:underline">
                ← 返回登录
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 提交忘记密码页面**

```bash
git add packages/web-app/app/auth/forgot-password/page.tsx
git commit -m "feat: add forgot password page with email input

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: 创建重置密码页面

**Files:**
- Create: `packages/web-app/app/auth/reset-password/page.tsx`

- [ ] **Step 1: 创建重置密码页面组件**

```tsx
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validSession, setValidSession] = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient()

  // Check if user has valid recovery session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true)
      }
    })
  }, [])

  const validatePassword = (pwd: string): boolean => {
    if (pwd.length < 8) return false
    const hasLetter = /[a-zA-Z]/.test(pwd)
    const hasDigit = /[0-9]/.test(pwd)
    return hasLetter && hasDigit
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validatePassword(password)) {
      setError('密码至少8位，需包含字母和数字')
      return
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/auth/login?message=password_reset_success')
  }

  if (!validSession) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8 text-center">
              <h1 className="text-lg font-semibold text-on-background mb-2">
                链接已失效
              </h1>
              <p className="text-on-surface-variant text-sm font-medium mb-6">
                该重置链接已过期或无效，请重新申请
              </p>
              <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline font-medium">
                重新申请重置密码
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <Link href="/" className="text-base font-semibold text-on-background">
          Oh My Prompt
        </Link>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
            <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
              设置新密码
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
              请输入您的新密码
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-1">
                  新密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="至少8位，含字母和数字"
                  className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-on-surface-variant mb-1">
                  确认密码
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="再次输入新密码"
                  className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-error font-medium">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-[10px] bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
              >
                {loading ? '设置中...' : '确认'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 提交重置密码页面**

```bash
git add packages/web-app/app/auth/reset-password/page.tsx
git commit -m "feat: add reset password page with validation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 修改登录页面支持邮箱登录

**Files:**
- Modify: `packages/web-app/app/auth/login/page.tsx`

- [ ] **Step 1: 重写登录页面，添加邮箱登录和 OTP 登录**

```tsx
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

type LoginMode = 'password' | 'otp'

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient()

  // Check for success message from password reset
  useEffect(() => {
    const msg = searchParams.get('message')
    if (msg === 'password_reset_success') {
      setMessage('密码已重置，请使用新密码登录')
    }
  }, [searchParams])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading('password')

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(null)

    if (loginError) {
      if (loginError.message.includes('Invalid login credentials')) {
        setError('邮箱或密码错误')
      } else if (loginError.message.includes('Email not confirmed')) {
        setError('请先验证邮箱')
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`)
      } else {
        setError(loginError.message)
      }
      return
    }

    if (data.user) {
      const redirectTo = searchParams.get('redirect') || '/dashboard'
      router.push(redirectTo)
    }
  }

  const handleSendOtp = async () => {
    setError(null)
    setLoading('otp-send')

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(null)

    if (otpError) {
      setError(otpError.message)
      return
    }

    setOtpSent(true)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading('otp-verify')

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    setLoading(null)

    if (verifyError) {
      if (verifyError.message.includes('Invalid OTP')) {
        setError('验证码错误或已过期')
      } else {
        setError(verifyError.message)
      }
      return
    }

    if (data.user) {
      const redirectTo = searchParams.get('redirect') || '/dashboard'
      router.push(redirectTo)
    }
  }

  const handleOAuthLogin = async (provider: 'github') => {
    setLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
        <Link href="/" className="text-base font-semibold text-on-background">
          Oh My Prompt
        </Link>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
            <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
              登录
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
              登录以访问 Dashboard 和云端同步功能
            </p>

            {/* Success message */}
            {message && (
              <p className="text-sm text-primary font-medium text-center mb-4">{message}</p>
            )}

            {/* Tab switcher */}
            <div className="flex mb-6 bg-surface-container-high rounded-md p-1">
              <button
                onClick={() => { setMode('password'); setOtpSent(false); setError(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === 'password'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-background'
                }`}
              >
                邮箱登录
              </button>
              <button
                onClick={() => { setMode('otp'); setOtpSent(false); setError(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === 'otp'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-background'
                }`}
              >
                验证码登录
              </button>
            </div>

            {/* Password login form */}
            {mode === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-1">
                    邮箱
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-1">
                    密码
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="输入密码"
                    className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                  />
                </div>

                {/* Error message */}
                {error && (
                  <p className="text-sm text-error font-medium">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading === 'password'}
                  className="w-full px-4 py-[10px] bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
                >
                  {loading === 'password' ? '登录中...' : '登录'}
                </button>

                {/* Forgot password link */}
                <div className="text-center">
                  <Link href="/auth/forgot-password" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
                    忘记密码？
                  </Link>
                </div>
              </form>
            )}

            {/* OTP login form */}
            {mode === 'otp' && (
              <div className="space-y-4">
                {!otpSent ? (
                  <>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-1">
                        邮箱
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="your@email.com"
                        className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-error font-medium">{error}</p>
                    )}

                    <button
                      onClick={handleSendOtp}
                      disabled={loading === 'otp-send'}
                      className="w-full px-4 py-[10px] bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
                    >
                      {loading === 'otp-send' ? '发送中...' : '发送验证码'}
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <p className="text-sm text-on-surface-variant font-medium text-center">
                      验证码已发送至 {email}
                    </p>

                    <div>
                      <label htmlFor="otp" className="block text-sm font-medium text-on-surface-variant mb-1">
                        验证码
                      </label>
                      <input
                        id="otp"
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                        maxLength={6}
                        placeholder="输入6位验证码"
                        className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary text-sm text-center tracking-widest"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-error font-medium">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loading === 'otp-verify'}
                      className="w-full px-4 py-[10px] bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
                    >
                      {loading === 'otp-verify' ? '验证中...' : '验证'}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setOtp(''); setError(null); }}
                      className="w-full text-sm text-on-surface-variant hover:text-on-background font-medium"
                    >
                      重新发送
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="my-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-outline-variant/20" />
              <span className="text-xs text-on-surface-variant font-medium">或</span>
              <div className="flex-1 h-px bg-outline-variant/20" />
            </div>

            {/* GitHub OAuth */}
            <button
              onClick={() => handleOAuthLogin('github')}
              disabled={loading === 'github'}
              className="w-full flex items-center justify-center gap-3 px-4 py-[10px] bg-white text-black rounded-md hover:bg-gray-100 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
            >
              {loading === 'github' ? (
                <span>登录中...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>使用 GitHub 登录</span>
                </>
              )}
            </button>

            {/* Footer */}
            <p className="mt-6 text-xs text-on-surface-variant text-center font-medium">
              没有账号？{' '}
              <Link href="/auth/register" className="text-on-background hover:underline">
                注册
              </Link>
            </p>
          </div>

          {/* Back to home */}
          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
              ← 返回首页
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 提交登录页面改动**

```bash
git add packages/web-app/app/auth/login/page.tsx
git commit -m "feat: add email and OTP login to login page with tab switcher

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: 修改 LoginModal 支持邮箱登录

**Files:**
- Modify: `packages/web-app/components/auth/LoginModal.tsx`

- [ ] **Step 1: 重写 LoginModal，添加邮箱登录**

```tsx
'use client'

import { createBrowserClient } from '@/lib/supabase'
import { useState } from 'react'
import Link from 'next/link'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient()

  if (!isOpen) return null

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading('email')

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(null)

    if (loginError) {
      if (loginError.message.includes('Invalid login credentials')) {
        setError('邮箱或密码错误')
      } else if (loginError.message.includes('Email not confirmed')) {
        setError('请先验证邮箱')
      } else {
        setError(loginError.message)
      }
      return
    }

    onClose()
    // Refresh page to update auth state
    window.location.reload()
  }

  const handleOAuthLogin = async (provider: 'github') => {
    setLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>

        {/* Title */}
        <h2 id="login-modal-title" className="text-xl font-bold text-slate-900 mb-4 text-center">
          登录 Oh My Prompt
        </h2>

        {/* Email login form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="邮箱"
              className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 text-sm"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="密码"
              className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading === 'email'}
            className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50 font-medium text-sm"
          >
            {loading === 'email' ? '登录中...' : '登录'}
          </button>

          {/* Forgot password */}
          <div className="text-center">
            <Link
              href="/auth/forgot-password"
              className="text-sm text-slate-500 hover:text-slate-700"
              onClick={onClose}
            >
              忘记密码？
            </Link>
          </div>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">或</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* GitHub */}
        <button
          onClick={() => handleOAuthLogin('github')}
          disabled={loading === 'github'}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
        >
          {loading === 'github' ? (
            <span>登录中...</span>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>使用 GitHub 登录</span>
            </>
          )}
        </button>

        {/* Footer */}
        <p className="mt-4 text-sm text-slate-500 text-center">
          没有账号？{' '}
          <Link href="/auth/register" className="text-slate-700 hover:underline" onClick={onClose}>
            注册
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交 LoginModal 改动**

```bash
git add packages/web-app/components/auth/LoginModal.tsx
git commit -m "feat: add email login to LoginModal component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: 修改回调路由支持 signup/recovery 类型

**Files:**
- Modify: `packages/web-app/app/auth/callback/route.ts`

- [ ] **Step 1: 在 GET 函数开头添加类型判断逻辑**

在 `export async function GET(request: NextRequest)` 函数中，在现有代码之前添加类型判断：

找到第 4-9 行，在 `const { searchParams } = new URL(request.url)` 之后添加：

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const isExtensionAuth = searchParams.get('extension') === 'true'
  const authType = searchParams.get('type') // 'signup' | 'recovery' | null

  console.log('[OAuth Callback] Request received:', {
    hasCode: !!code,
    hasError: !!error,
    isExtensionAuth,
    authType,
    url: request.url
  })

  // Handle password reset callback - redirect to reset password page
  if (authType === 'recovery' && code) {
    console.log('[OAuth Callback] Recovery flow, redirecting to reset password page')
    
    const response = NextResponse.redirect(new URL('/auth/reset-password', request.url))
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Exchange code for session (recovery session)
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('[OAuth Callback] Recovery exchange failed:', exchangeError)
      return NextResponse.redirect(
        new URL(`/auth/forgot-password?error=recovery_failed`, request.url)
      )
    }

    return response
  }

  // Handle OAuth errors (existing code continues below)
  if (error) {
    ...
```

- [ ] **Step 2: 提交回调路由改动**

```bash
git add packages/web-app/app/auth/callback/route.ts
git commit -m "feat: add recovery type handling for password reset callback

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: 手动测试验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd packages/web-app && npm run dev
```

Expected: Dev server running on port 3000

- [ ] **Step 2: 测试注册流程**

1. 打开 http://localhost:3000/auth/register
2. 输入测试邮箱和密码
3. 点击注册
4. 验证跳转到 /auth/verify 页面
5. 检查邮箱收到验证邮件（Supabase 本地开发使用 Inbucket）
6. 打开 http://localhost:54324 (Inbucket) 查看邮件
7. 点击验证链接，确认跳转到 /dashboard

- [ ] **Step 3: 测试登录流程**

1. 打开 http://localhost:3000/auth/login
2. 测试邮箱+密码登录
3. 测试 OTP 登录
4. 测试 GitHub OAuth 登录
5. 验证登录成功后跳转正确

- [ ] **Step 4: 测试忘记密码流程**

1. 打开 http://localhost:3000/auth/forgot-password
2. 输入邮箱
3. 点击发送
4. 在 Inbucket 查看重置邮件
5. 点击链接跳转到 /auth/reset-password
6. 设置新密码
7. 用新密码登录验证

- [ ] **Step 5: 测试错误场景**

1. 注册：密码少于8位 → 显示错误提示
2. 注册：密码不含数字 → 显示错误提示
3. 登录：错误密码 → 显示"邮箱或密码错误"
4. 登录：未验证邮箱 → 提示并跳转验证页
5. 重置密码：两次密码不一致 → 显示错误

---

## Task 10: 最终提交与合并

- [ ] **Step 1: 确认所有文件已提交**

```bash
git status
```

Expected: No uncommitted changes

- [ ] **Step 2: 推送分支**

```bash
git push origin v2.0.0
```

Expected: Branch pushed successfully