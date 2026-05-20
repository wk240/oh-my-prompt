# Email Verification OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email verification links with 6-digit OTP codes for registration and password reset flows.

**Architecture:** Use Supabase's built-in `signInWithOtp()` and `verifyOtp()` APIs. Registration sends OTP first, then user sets password after verification. Password reset sends OTP, then user verifies OTP and sets new password on same page.

**Tech Stack:** Next.js 16, React 19, Supabase Auth, Tailwind CSS

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `components/auth/OTPInput.tsx` | Create | Reusable 6-digit OTP input component |
| `app/auth/verify-otp/page.tsx` | Create | Registration OTP verification page |
| `app/auth/set-password/page.tsx` | Create | Set password after OTP verification |
| `app/auth/register/page.tsx` | Modify | Remove password fields, send OTP |
| `app/auth/forgot-password/page.tsx` | Modify | Send OTP instead of reset link |
| `app/auth/reset-password/page.tsx` | Replace | Complete rewrite for OTP + new password |
| `app/auth/verify/page.tsx` | Delete | No longer needed |

---

### Task 1: Create OTPInput Component

**Files:**
- Create: `packages/web-app/components/auth/OTPInput.tsx`

**Purpose:** Reusable 6-digit input component with auto-focus, paste support, and number-only validation.

- [ ] **Step 1: Write OTPInput component**

Create file `packages/web-app/components/auth/OTPInput.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface OTPInputProps {
  length: number
  onComplete: (code: string) => void
  disabled?: boolean
  autoFocus?: boolean
}

export default function OTPInput({
  length,
  onComplete,
  disabled = false,
  autoFocus = true,
}: OTPInputProps) {
  const [code, setCode] = useState<string[]>(Array(length).fill(''))
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Initialize refs
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length)
  }, [length])

  // Auto focus first input
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [autoFocus])

  // Check if code is complete and trigger callback
  const checkComplete = useCallback((newCode: string[]) => {
    const fullCode = newCode.join('')
    if (fullCode.length === length && !newCode.includes('')) {
      onComplete(fullCode)
    }
  }, [length, onComplete])

  // Handle input change
  const handleChange = (index: number, value: string) => {
    // Only allow numbers
    if (!/^\d*$/.test(value)) return

    // Take only the last character (handle paste of multiple digits)
    const digit = value.slice(-1)

    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)

    // Auto focus next input
    if (digit && index < length - 1 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus()
    }

    checkComplete(newCode)
  }

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text')
    
    // Filter only digits
    const digits = pastedData.replace(/\D/g, '').slice(0, length)
    
    if (digits.length === 0) return

    const newCode = [...code]
    digits.split('').forEach((digit, i) => {
      if (i < length) {
        newCode[i] = digit
      }
    })
    setCode(newCode)

    // Focus the input after the pasted digits or the last input
    const focusIndex = Math.min(digits.length, length - 1)
    inputRefs.current[focusIndex]?.focus()

    checkComplete(newCode)
  }

  // Handle key down for backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        // If current input is empty, focus previous and clear it
        const newCode = [...code]
        newCode[index - 1] = ''
        setCode(newCode)
        inputRefs.current[index - 1]?.focus()
      } else {
        // Clear current input
        const newCode = [...code]
        newCode[index] = ''
        setCode(newCode)
      }
    }
  }

  // Handle focus (select the input content)
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select()
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {code.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={handleFocus}
          disabled={disabled}
          className="w-12 h-14 text-center text-xl font-semibold bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50"
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit OTPInput component**

```bash
git add packages/web-app/components/auth/OTPInput.tsx
git commit -m "$(cat <<'EOF'
feat(auth): add OTPInput component for 6-digit verification code

Reusable component with:
- Auto-focus on next input
- Paste support for full code
- Number-only validation
- Backspace navigation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create verify-otp Page (Registration)

**Files:**
- Create: `packages/web-app/app/auth/verify-otp/page.tsx`

**Purpose:** Registration OTP verification page where user enters the 6-digit code sent via email.

- [ ] **Step 1: Write verify-otp page**

Create file `packages/web-app/app/auth/verify-otp/page.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import OTPInput from '@/components/auth/OTPInput'

function VerifyOTPContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const type = searchParams.get('type') || 'signup' // 'signup' or 'recovery'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(60)
  const [resending, setResending] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // Validate email format
  useEffect(() => {
    if (!email || !email.includes('@')) {
      router.push('/auth/register')
    }
  }, [email, router])

  // Handle OTP verification
  const handleVerify = useCallback(async (code: string) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: type as 'signup' | 'recovery',
      })

      if (verifyError) {
        // Handle specific errors
        if (verifyError.message.includes('Invalid OTP')) {
          setError('验证码错误，请重新输入')
        } else if (verifyError.message.includes('expired')) {
          setError('验证码已过期，请重新获取')
        } else if (verifyError.message.includes('already used')) {
          setError('验证码已失效，请重新获取')
        } else {
          setError(verifyError.message)
        }
        return
      }

      // Success - redirect based on type
      if (data.session) {
        if (type === 'signup') {
          // Registration: redirect to set-password
          router.push('/auth/set-password')
        } else {
          // Recovery: redirect to reset-password (which now handles OTP flow)
          router.push('/auth/reset-password?verified=true')
        }
      }
    } catch {
      setError('验证失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [email, type, supabase.auth, router])

  // Handle resend OTP
  const handleResend = useCallback(async () => {
    if (countdown > 0 || resending) return

    setResending(true)
    setError(null)

    try {
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: type === 'signup',
        },
      })

      if (resendError) {
        if (resendError.message.includes('rate limit')) {
          setError('发送频率过高，请稍后再试')
        } else {
          setError(resendError.message)
        }
        return
      }

      setCountdown(60)
    } catch {
      setError('发送失败，请稍后重试')
    } finally {
      setResending(false)
    }
  }, [email, type, countdown, resending, supabase.auth])

  // Format countdown as MM:SS
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary-container/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
              输入验证码
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-2">
              我们已向您的邮箱发送了6位数字验证码
            </p>

            {/* Email display */}
            <p className="text-primary text-sm font-semibold text-center mb-6">
              {email}
            </p>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-error-container/50 rounded-md border border-error/30">
                <p className="text-error text-sm font-medium">{error}</p>
              </div>
            )}

            {/* OTP Input */}
            <div className="mb-6">
              <OTPInput
                length={6}
                onComplete={handleVerify}
                disabled={loading}
                autoFocus={true}
              />
            </div>

            {/* Loading indicator */}
            {loading && (
              <div className="flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-on-surface-variant text-sm">验证中...</span>
              </div>
            )}

            {/* Resend button */}
            <button
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              className="w-full flex items-center justify-center gap-2 px-4 py-[10px] bg-surface-container-high text-on-surface-variant rounded-md hover:bg-surface-container-high/80 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-[13px]"
            >
              {resending ? (
                <span>发送中...</span>
              ) : countdown > 0 ? (
                <span>重新发送 ({formatCountdown(countdown)})</span>
              ) : (
                <span>重新发送验证码</span>
              )}
            </button>

            {/* Tip */}
            <div className="mt-4 p-3 bg-surface-container-high rounded-md">
              <p className="text-on-surface-variant text-xs font-medium text-center">
                没收到验证码？请检查垃圾邮件文件夹，或稍后重试
              </p>
            </div>
          </div>

          {/* Back to login */}
          <div className="mt-4 text-center">
            <Link 
              href={type === 'signup' ? '/auth/register' : '/auth/forgot-password'} 
              className="text-sm text-on-surface-variant hover:text-on-background font-medium"
            >
              ← 返回上一页
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
              <p className="text-on-surface-variant text-sm font-medium text-center">
                加载中...
              </p>
            </div>
          </div>
        </main>
      </div>
    }>
      <VerifyOTPContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Commit verify-otp page**

```bash
git add packages/web-app/app/auth/verify-otp/page.tsx
git commit -m "$(cat <<'EOF'
feat(auth): add verify-otp page for registration OTP verification

Page features:
- 6-digit OTP input with auto-verify
- 60-second resend countdown
- Error handling for invalid/expired OTP
- Redirect to set-password on success

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create set-password Page

**Files:**
- Create: `packages/web-app/app/auth/set-password/page.tsx`

**Purpose:** Page for setting password after OTP verification during registration.

- [ ] **Step 1: Write set-password page**

Create file `packages/web-app/app/auth/set-password/page.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function SetPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const router = useRouter()
  const supabase = createClient()

  // Check if user has valid session (OTP verified)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // No session - redirect to register
        router.push('/auth/register')
      } else {
        setCheckingSession(false)
      }
    }
    checkSession()
  }, [supabase.auth, router])

  // Password validation
  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return '密码至少需要8个字符'
    }
    if (!/[a-zA-Z]/.test(pwd)) {
      return '密码需要包含字母'
    }
    if (!/[0-9]/.test(pwd)) {
      return '密码需要包含数字'
    }
    return null
  }

  // Handle password set
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate password
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        if (updateError.message.includes('same as the old password')) {
          setError('新密码不能与旧密码相同')
        } else if (updateError.message.includes('password')) {
          setError('密码不符合要求')
        } else {
          setError(updateError.message)
        }
        return
      }

      // Success - redirect to dashboard
      router.push('/dashboard')
    } catch {
      setError('设置密码失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  // Loading state - checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
              <p className="mt-4 text-on-surface-variant text-sm font-medium text-center">
                正在验证...
              </p>
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
              设置密码
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
              请为您的账户设置密码
            </p>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-error-container/50 rounded-md border border-error/30">
                <p className="text-error text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Password form */}
            <form onSubmit={handleSetPassword} className="space-y-4">
              {/* Password input */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                  密码
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少8个字符，包含字母和数字"
                    required
                    className="w-full px-3 py-2 pr-10 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.267-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm password input */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                  确认密码
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入密码"
                    required
                    className="w-full px-3 py-2 pr-10 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                  />
                  {/* Password match indicator */}
                  {confirmPassword.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {password === confirmPassword ? (
                        <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 disabled:opacity-50 font-medium text-[13px]"
              >
                {loading ? (
                  <span>设置中...</span>
                ) : (
                  <span>完成注册</span>
                )}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-xs text-on-surface-variant text-center font-medium">
              注册即表示您同意我们的{' '}
              <Link href="/terms" target="_blank" className="text-on-background hover:underline">
                服务条款
              </Link>
              {' '}和{' '}
              <Link href="/privacy" target="_blank" className="text-on-background hover:underline">
                隐私政策
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
              <p className="text-on-surface-variant text-sm font-medium text-center">
                加载中...
              </p>
            </div>
          </div>
        </main>
      </div>
    }>
      <SetPasswordContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Commit set-password page**

```bash
git add packages/web-app/app/auth/set-password/page.tsx
git commit -m "$(cat <<'EOF'
feat(auth): add set-password page for registration flow

Page features:
- Password + confirm password inputs
- Password strength validation (8+ chars, letters, numbers)
- Session check (requires valid OTP verification)
- Redirect to dashboard on success

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Modify Register Page

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx`

**Purpose:** Remove password fields, send OTP instead of signUp with password.

- [ ] **Step 1: Rewrite register page**

Replace entire file `packages/web-app/app/auth/register/page.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate email
    if (!email || !email.includes('@')) {
      setError('请输入有效的邮箱地址')
      return
    }

    setLoading(true)

    try {
      // Send OTP for registration
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: {
            display_name: displayName || undefined,
          },
        },
      })

      if (otpError) {
        // Handle specific errors
        if (otpError.message.includes('already registered')) {
          setError('该邮箱已被注册')
        } else if (otpError.message.includes('rate limit')) {
          setError('发送频率过高，请稍后再试')
        } else if (otpError.message.includes('invalid email')) {
          setError('邮箱地址无效')
        } else {
          setError(otpError.message)
        }
        return
      }

      // Success - show email sent message
      setEmailSent(true)
    } catch {
      setError('注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  // Navigate to verify-otp page
  const handleGoToVerify = () => {
    router.push(`/auth/verify-otp?email=${encodeURIComponent(email)}&type=signup`)
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
            {emailSent ? (
              <>
                {/* Email sent success */}
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-primary-container/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
                  验证码已发送
                </h1>
                <p className="text-primary text-sm font-semibold text-center mb-4">
                  {email}
                </p>
                <p className="text-on-surface-variant text-sm text-center mb-6">
                  请输入邮件中的6位验证码完成注册。
                </p>

                {/* Spam tip */}
                <div className="p-3 bg-surface-container-high rounded-md mb-4">
                  <p className="text-on-surface-variant text-xs font-medium text-center">
                    没收到邮件？请检查垃圾邮件文件夹。
                  </p>
                </div>

                {/* Go to verify button */}
                <button
                  onClick={handleGoToVerify}
                  className="w-full flex items-center justify-center gap-2 px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 font-medium text-[13px]"
                >
                  输入验证码
                </button>
              </>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
                  注册
                </h1>
                <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
                  创建账户以访问 Dashboard 和云端同步功能
                </p>

                {/* Error message */}
                {error && (
                  <div className="mb-4 p-3 bg-error-container/50 rounded-md border border-error/30">
                    <p className="text-error text-sm font-medium">{error}</p>
                  </div>
                )}

                {/* Registration form */}
                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Email input */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                      邮箱地址
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>

                  {/* Display name input (optional) */}
                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                      显示名称 <span className="text-on-surface-variant/60">(可选)</span>
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="您的昵称"
                      className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 disabled:opacity-50 font-medium text-[13px]"
                  >
                    {loading ? (
                      <span>发送中...</span>
                    ) : (
                      <span>发送验证码</span>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex-1 h-px bg-outline-variant/20" />
                  <span className="text-xs text-on-surface-variant font-medium">或</span>
                  <div className="flex-1 h-px bg-outline-variant/20" />
                </div>

                {/* GitHub OAuth */}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      supabase.auth.signInWithOAuth({
                        provider: 'github',
                        options: {
                          redirectTo: `${window.location.origin}/auth/callback`,
                        },
                      })
                    }}
                    className="w-full flex items-center justify-center gap-3 px-4 py-[10px] bg-white text-black rounded-md hover:bg-gray-100 transition-colors duration-150 font-medium text-[13px]"
                  >
                    {/* GitHub SVG Icon */}
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span>使用 GitHub 注册</span>
                  </button>
                </div>

                {/* Footer */}
                <p className="mt-6 text-xs text-on-surface-variant text-center font-medium">
                  注册即表示您同意我们的{' '}
                  <Link href="/terms" target="_blank" className="text-on-background hover:underline">
                    服务条款
                  </Link>
                  {' '}和{' '}
                  <Link href="/privacy" target="_blank" className="text-on-background hover:underline">
                    隐私政策
                  </Link>
                </p>
              </>
            )}
          </div>

          {/* Back to home */}
          <div className="mt-4 text-center">
            <Link href="/auth/login" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
              已有账户？登录
            </Link>
          </div>
          <div className="mt-2 text-center">
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

- [ ] **Step 2: Commit register page changes**

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "$(cat <<'EOF'
feat(auth): refactor register page to use OTP verification

Changes:
- Remove password fields (moved to set-password page)
- Use signInWithOtp instead of signUp
- Redirect to verify-otp after sending OTP
- Simplified form: email + optional display name only

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Modify Forgot-Password Page

**Files:**
- Modify: `packages/web-app/app/auth/forgot-password/page.tsx`

**Purpose:** Send OTP instead of reset password link.

- [ ] **Step 1: Rewrite forgot-password page**

Replace entire file `packages/web-app/app/auth/forgot-password/page.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate email
    if (!email || !email.includes('@')) {
      setError('请输入有效的邮箱地址')
      return
    }

    setLoading(true)

    try {
      // Send OTP for password reset (shouldCreateUser: false for existing users only)
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false, // Only for existing users
        },
      })

      // Always show success message for security (don't reveal if email exists)
      // This prevents email enumeration attacks
      if (otpError) {
        // Still show success message for security
        // But log rate limit errors for user awareness
        if (otpError.message.includes('rate limit')) {
          setError('发送频率过高，请稍后再试')
          setLoading(false)
          return
        }
      }

      setSubmitted(true)
    } catch {
      // Still show success message for security
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  // Navigate to reset-password page with OTP input
  const handleGoToReset = () => {
    router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`)
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
              输入您的邮箱地址，我们将发送验证码
            </p>

            {/* Success message */}
            {submitted ? (
              <div className="space-y-4">
                <div className="p-4 bg-primary-container/30 rounded-md border border-primary/30">
                  <p className="text-on-background text-sm font-medium text-center">
                    如果该邮箱已注册，您将收到验证码邮件。
                  </p>
                  <p className="text-on-surface-variant text-xs text-center mt-2">
                    请检查您的收件箱（以及垃圾邮件文件夹）
                  </p>
                </div>
                <button
                  onClick={handleGoToReset}
                  className="w-full flex items-center justify-center px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 font-medium text-[13px]"
                >
                  输入验证码并重置密码
                </button>
              </div>
            ) : (
              <>
                {/* Error message */}
                {error && (
                  <div className="mb-4 p-3 bg-error-container/50 rounded-md border border-error/30">
                    <p className="text-error text-sm font-medium">{error}</p>
                  </div>
                )}

                {/* Reset form */}
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {/* Email input */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                      邮箱地址
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 disabled:opacity-50 font-medium text-[13px]"
                  >
                    {loading ? (
                      <span>发送中...</span>
                    ) : (
                      <span>发送验证码</span>
                    )}
                  </button>
                </form>
              </>
            )}

            {/* Footer */}
            <p className="mt-6 text-xs text-on-surface-variant text-center font-medium">
              登录即表示您同意我们的{' '}
              <Link href="/terms" target="_blank" className="text-on-background hover:underline">
                服务条款
              </Link>
              {' '}和{' '}
              <Link href="/privacy" target="_blank" className="text-on-background hover:underline">
                隐私政策
              </Link>
            </p>
          </div>

          {/* Back to login */}
          <div className="mt-4 text-center">
            <Link href="/auth/login" className="text-sm text-on-surface-variant hover:text-on-background font-medium">
              ← 返回登录
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit forgot-password page changes**

```bash
git add packages/web-app/app/auth/forgot-password/page.tsx
git commit -m "$(cat <<'EOF'
feat(auth): refactor forgot-password to use OTP verification

Changes:
- Use signInWithOtp instead of resetPasswordForEmail
- shouldCreateUser: false (only for existing users)
- Redirect to reset-password after sending OTP
- Security: still show success even if email doesn't exist

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite Reset-Password Page

**Files:**
- Replace: `packages/web-app/app/auth/reset-password/page.tsx`

**Purpose:** Combined page for OTP verification + new password input in password reset flow.

- [ ] **Step 1: Rewrite reset-password page for OTP flow**

Replace entire file `packages/web-app/app/auth/reset-password/page.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import OTPInput from '@/components/auth/OTPInput'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const verified = searchParams.get('verified') === 'true'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpVerified, setOtpVerified] = useState(verified)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [resending, setResending] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0 || otpVerified) return
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown, otpVerified])

  // Validate email format
  useEffect(() => {
    if (!email || !email.includes('@')) {
      router.push('/auth/forgot-password')
    }
  }, [email, router])

  // Password validation
  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return '密码至少需要8个字符'
    }
    if (!/[a-zA-Z]/.test(pwd)) {
      return '密码需要包含字母'
    }
    if (!/[0-9]/.test(pwd)) {
      return '密码需要包含数字'
    }
    return null
  }

  // Handle OTP verification
  const handleVerifyOtp = useCallback(async (code: string) => {
    setVerifying(true)
    setError(null)

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      })

      if (verifyError) {
        if (verifyError.message.includes('Invalid OTP')) {
          setError('验证码错误，请重新输入')
        } else if (verifyError.message.includes('expired')) {
          setError('验证码已过期，请重新获取')
        } else if (verifyError.message.includes('already used')) {
          setError('验证码已失效，请重新获取')
        } else {
          setError(verifyError.message)
        }
        return
      }

      if (data.session) {
        setOtpVerified(true)
      }
    } catch {
      setError('验证失败，请稍后重试')
    } finally {
      setVerifying(false)
    }
  }, [email, supabase.auth])

  // Handle resend OTP
  const handleResend = useCallback(async () => {
    if (countdown > 0 || resending) return

    setResending(true)
    setError(null)

    try {
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      })

      if (resendError) {
        if (resendError.message.includes('rate limit')) {
          setError('发送频率过高，请稍后再试')
        } else {
          setError(resendError.message)
        }
        return
      }

      setCountdown(60)
    } catch {
      setError('发送失败，请稍后重试')
    } finally {
      setResending(false)
    }
  }, [email, countdown, resending, supabase.auth])

  // Handle password reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate password
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        if (updateError.message.includes('same as the old password')) {
          setError('新密码不能与旧密码相同')
        } else if (updateError.message.includes('password')) {
          setError('密码不符合要求')
        } else {
          setError(updateError.message)
        }
        return
      }

      // Success
      setSuccess(true)

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/auth/login?reset=success')
      }, 2000)
    } catch {
      setError('重置密码失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  // Format countdown
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
              <h1 className="text-lg font-semibold text-on-background mb-2 text-center">
                密码重置成功
              </h1>
              <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
                您的密码已成功重置，即将跳转到登录页面
              </p>
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
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
              {otpVerified ? '设置新密码' : '验证邮箱'}
            </h1>
            <p className="text-on-surface-variant text-sm font-medium text-center mb-6">
              {otpVerified ? '请输入您的新密码' : '请输入发送到邮箱的验证码'}
            </p>

            {/* Email display */}
            {!otpVerified && (
              <p className="text-primary text-sm font-semibold text-center mb-4">
                {email}
              </p>
            )}

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-error-container/50 rounded-md border border-error/30">
                <p className="text-error text-sm font-medium">{error}</p>
              </div>
            )}

            {/* OTP verification step */}
            {!otpVerified ? (
              <>
                {/* OTP Input */}
                <div className="mb-6">
                  <OTPInput
                    length={6}
                    onComplete={handleVerifyOtp}
                    disabled={verifying}
                    autoFocus={true}
                  />
                </div>

                {/* Loading indicator */}
                {verifying && (
                  <div className="flex items-center justify-center mb-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-2 text-on-surface-variant text-sm">验证中...</span>
                  </div>
                )}

                {/* Resend button */}
                <button
                  onClick={handleResend}
                  disabled={countdown > 0 || resending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-[10px] bg-surface-container-high text-on-surface-variant rounded-md hover:bg-surface-container-high/80 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-[13px]"
                >
                  {resending ? (
                    <span>发送中...</span>
                  ) : countdown > 0 ? (
                    <span>重新发送 ({formatCountdown(countdown)})</span>
                  ) : (
                    <span>重新发送验证码</span>
                  )}
                </button>

                {/* Tip */}
                <div className="mt-4 p-3 bg-surface-container-high rounded-md">
                  <p className="text-on-surface-variant text-xs font-medium text-center">
                    没收到验证码？请检查垃圾邮件文件夹
                  </p>
                </div>
              </>
            ) : (
              /* Password reset form */
              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* Password input */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                    新密码
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="至少8个字符，包含字母和数字"
                      required
                      className="w-full px-3 py-2 pr-10 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.267-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm password input */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-on-surface-variant mb-1.5">
                    确认密码
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入新密码"
                      required
                      className="w-full px-3 py-2 pr-10 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                    {/* Password match indicator */}
                    {confirmPassword.length > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {password === confirmPassword ? (
                          <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 disabled:opacity-50 font-medium text-[13px]"
                >
                  {loading ? (
                    <span>重置中...</span>
                  ) : (
                    <span>确认重置</span>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Back to login */}
          <div className="mt-4 text-center">
            <Link 
              href={otpVerified ? '/auth/login' : '/auth/forgot-password'} 
              className="text-sm text-on-surface-variant hover:text-on-background font-medium"
            >
              ← {otpVerified ? '返回登录' : '返回上一页'}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <Link href="/" className="text-base font-semibold text-on-background">
            Oh My Prompt
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant/20 p-8">
              <p className="text-on-surface-variant text-sm font-medium text-center">
                加载中...
              </p>
            </div>
          </div>
        </main>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Commit reset-password page rewrite**

```bash
git add packages/web-app/app/auth/reset-password/page.tsx
git commit -m "$(cat <<'EOF'
feat(auth): rewrite reset-password page for OTP verification flow

Changes:
- Combined OTP verification + password reset in one page
- Two-step flow: verify OTP → set new password
- Uses verifyOtp({ type: 'recovery' })
- Reuses OTPInput component
- Security: validates session after OTP verification

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update auth/callback for Recovery Flow

**Files:**
- Modify: `packages/web-app/app/auth/callback/route.ts:21-54`

**Purpose:** Remove recovery flow redirect from callback (OTP flow handles it directly in reset-password page). Keep OAuth callback logic.

- [ ] **Step 1: Remove recovery type handling from callback**

The recovery flow now uses OTP directly on reset-password page, so we need to remove the recovery redirect logic from the callback route.

Edit file `packages/web-app/app/auth/callback/route.ts`, remove lines 21-54 (the recovery flow handling):

```diff
-  // Handle password reset callback - redirect to reset password page
-  if (authType === 'recovery' && code) {
-    console.log('[OAuth Callback] Recovery flow, redirecting to reset password page')
-
-    const response = NextResponse.redirect(new URL('/auth/reset-password', request.url))
-    const supabase = createServerClient(
-      process.env.NEXT_PUBLIC_SUPABASE_URL!,
-      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
-      {
-        cookies: {
-          getAll() {
-            return request.cookies.getAll()
-          },
-          setAll(cookiesToSet) {
-            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
-            cookiesToSet.forEach(({ name, value, options }) =>
-              response.cookies.set(name, value, options)
-            )
-          },
-        },
-      }
-    )
-
-    // Exchange code for session (recovery session)
-    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
-
-    if (exchangeError) {
-      console.error('[OAuth Callback] Recovery exchange failed:', exchangeError)
-      return NextResponse.redirect(
-        new URL(`/auth/forgot-password?error=recovery_failed`, request.url)
-      )
-    }
-
-    return response
-  }
```

Also remove the `authType` parameter extraction since recovery is no longer handled here:

```diff
-  const authType = searchParams.get('type') // 'signup' | 'recovery' | null
```

And remove it from the console.log:

```diff
   console.log('[OAuth Callback] Request received:', {
     hasCode: !!code,
     hasError: !!error,
     isExtensionAuth,
-    authType,
     url: request.url
   })
```

- [ ] **Step 2: Commit callback route changes**

```bash
git add packages/web-app/app/auth/callback/route.ts
git commit -m "$(cat <<'EOF'
refactor(auth): remove recovery callback handling

Recovery flow now uses OTP verification directly on reset-password page,
no longer needs callback route handling. Keep OAuth callback for GitHub
login only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Delete Old Verify Page

**Files:**
- Delete: `packages/web-app/app/auth/verify/page.tsx`

**Purpose:** Remove the old link-based verification waiting page.

- [ ] **Step 1: Delete verify page**

```bash
rm packages/web-app/app/auth/verify/page.tsx
```

- [ ] **Step 2: Commit deletion**

```bash
git add -A packages/web-app/app/auth/verify/
git commit -m "$(cat <<'EOF'
refactor(auth): remove old verify page

Replaced by verify-otp page for OTP-based verification flow.
Link-based verification is no longer used.

Co-Auth-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Update Login Page Error Message

**Files:**
- Modify: `packages/web-app/app/auth/login/page.tsx:59-62`

**Purpose:** Update "Email not confirmed" error to redirect to verify-otp instead of verify page.

- [ ] **Step 1: Update login error redirect**

Edit file `packages/web-app/app/auth/login/page.tsx`, find the "Email not confirmed" error handling and update redirect:

```diff
         } else if (loginError.message.includes('Email not confirmed')) {
-          router.push(`/auth/verify?email=${encodeURIComponent(email)}`)
+          router.push(`/auth/verify-otp?email=${encodeURIComponent(email)}&type=signup`)
         }
```

- [ ] **Step 2: Commit login page update**

```bash
git add packages/web-app/app/auth/login/page.tsx
git commit -m "$(cat <<'EOF'
fix(auth): update login redirect to verify-otp page

Changed "Email not confirmed" error redirect from verify to verify-otp
page for OTP-based verification.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Manual Testing

**Purpose:** Verify the complete OTP flow works correctly.

- [ ] **Step 1: Start development servers**

```bash
npm run web:dev
```

- [ ] **Step 2: Test registration flow**

1. Navigate to `http://localhost:3000/auth/register`
2. Enter an email address
3. Click "发送验证码"
4. Check email for 6-digit code
5. Click "输入验证码"
6. Enter the 6-digit code on verify-otp page
7. On success, enter password on set-password page
8. Verify redirect to dashboard

- [ ] **Step 3: Test password reset flow**

1. Navigate to `http://localhost:3000/auth/forgot-password`
2. Enter a registered email
3. Click "发送验证码"
4. Check email for 6-digit code
5. Click "输入验证码并重置密码"
6. Enter the 6-digit code
7. Enter new password
8. Verify redirect to login page

- [ ] **Step 4: Test error scenarios**

1. Enter wrong OTP code → should show error
2. Try resend within 60 seconds → button should be disabled
3. Enter weak password → should show validation error

- [ ] **Step 5: Test QQ email (core goal)**

1. Register with QQ email (e.g., `your@qq.com`)
2. Verify the email is NOT deleted/filtered
3. Verify the OTP code is visible in the email

---

### Task 11: Supabase Email Template Configuration (Manual)

**Purpose:** Configure Supabase Dashboard to use OTP email templates without links.

- [ ] **Step 1: Access Supabase Dashboard**

Navigate to Supabase Dashboard → Authentication → Email Templates

- [ ] **Step 2: Update Magic Link template**

Replace the default Magic Link template with OTP-only content:

```
您的验证码是：{{ .Token }}

验证码10分钟内有效，请勿告诉他人。
```

- [ ] **Step 3: Update Signup template (if separate)**

If there's a separate signup template, update similarly:

```
您的注册验证码是：{{ .Token }}

验证码10分钟内有效，请勿告诉他人。
```

- [ ] **Step 4: Update Reset Password template**

Update password reset template:

```
您的密码重置验证码是：{{ .Token }}

验证码10分钟内有效，请勿告诉他人。
```

---

### Task 12: Final Commit and Summary

- [ ] **Step 1: Run TypeScript check**

```bash
cd packages/web-app
npx tsc --noEmit
```

- [ ] **Step 2: Run build**

```bash
cd packages/web-app
npm run build
```

- [ ] **Step 3: Create summary commit**

```bash
git add docs/superpowers/specs/2026-05-13-email-verification-otp-design.md docs/superpowers/plans/2026-05-13-email-verification-otp-implementation.md
git commit -m "$(cat <<'EOF'
docs: complete OTP verification implementation plan

Plan covers:
- OTPInput component
- verify-otp and set-password pages
- Modified register/forgot-password/reset-password pages
- Removed old verify page and callback recovery handling
- Supabase email template configuration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

After implementing, verify:

1. **Spec coverage:**
   - OTPInput component ✓
   - verify-otp page for registration ✓
   - set-password page ✓
   - register page modified ✓
   - forgot-password page modified ✓
   - reset-password page rewritten ✓
   - old verify page deleted ✓
   - Supabase templates configured ✓

2. **Placeholder scan:** No TBD/TODO placeholders found.

3. **Type consistency:** All `verifyOtp` calls use correct types ('signup' | 'recovery'). OTPInput props match usage.

---

## Notes

- Daily limit (10 sends) is handled by Supabase's built-in rate limiting. Application-layer counting can be added later if needed.
- Supabase `signInWithOtp` with `shouldCreateUser: false` is used for password reset (existing users only).
- The OTP format (6 digits) is Supabase's default — verify in Supabase docs if different.