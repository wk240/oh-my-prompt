# 确认密码字段实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在注册页添加确认密码输入框，实现密码匹配验证和显示/隐藏切换功能

**Architecture:** 在现有注册表单中添加确认密码字段，使用 React state 管理密码匹配验证和显示状态，通过实时图标反馈和提交时阻止来确保用户体验

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Supabase Auth

---

## File Structure

**Modified Files:**
- `packages/web-app/app/auth/register/page.tsx` — 添加确认密码字段、密码匹配验证、显示/隐藏切换

---

## Task 1: Add State Management for Confirm Password and Show Password Toggle

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx:8-13`

- [ ] **Step 1: Add new state variables**

Add two new state variables after the existing state declarations:

```tsx
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
const [confirmPassword, setConfirmPassword] = useState('')
const [displayName, setDisplayName] = useState('')
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [emailSent, setEmailSent] = useState(false)
const [showPassword, setShowPassword] = useState(false)
```

- [ ] **Step 2: Verify the changes are correct**

The state variables should now include:
- `confirmPassword` — stores the confirm password value
- `showPassword` — toggles password visibility for both fields

---

## Task 2: Add Confirm Password Input Field

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx:170-184`

- [ ] **Step 1: Modify password input to add toggle button**

Replace the password input section (lines 170-184) with:

```tsx
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
```

- [ ] **Step 2: Verify the UI structure**

The form should now have:
- Password field with eye icon toggle button (right side)
- Confirm password field with match indicator (right side)
- Both fields use the same `showPassword` state for visibility

---

## Task 3: Add Password Match Validation to Submit Handler

**Files:**
- Modify: `packages/web-app/app/auth/register/page.tsx:31-40`

- [ ] **Step 1: Add password match validation**

Modify the `handleRegister` function to add password match validation after password strength validation:

```tsx
const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)

  // Validate password strength
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

  // Validate email
  if (!email || !email.includes('@')) {
    setError('请输入有效的邮箱地址')
    return
  }

  setLoading(true)

  // ... rest of the function remains unchanged
```

- [ ] **Step 2: Verify validation order**

The validation should happen in this order:
1. Password strength (length, letters, numbers)
2. Password match
3. Email format
4. Supabase signup

---

## Task 4: Build and Manual Test

**Files:**
- None (testing phase)

- [ ] **Step 1: Build the web app**

Run: `npm run web:build`
Expected: Build succeeds without TypeScript errors

- [ ] **Step 2: Start dev server**

Run: `npm run web:dev`
Expected: Dev server starts on port 3000

- [ ] **Step 3: Manual test - password visibility toggle**

1. Navigate to `http://localhost:3000/auth/register`
2. Enter password "test1234"
3. Click eye icon → password should show as plain text
4. Click eye icon again → password should hide
5. Enter confirm password — both fields should toggle together

- [ ] **Step 4: Manual test - password match indicator**

1. Enter password "test1234"
2. Enter confirm password "test" → red X icon appears
3. Change confirm password to "test1234" → green checkmark appears
4. Clear confirm password → icon disappears

- [ ] **Step 5: Manual test - submit validation**

1. Enter valid email, password "test1234", confirm password "different"
2. Click "创建账户" → error message "两次输入的密码不一致" appears
3. Fix confirm password to match
4. Click "创建账户" → validation passes, loading state begins

- [ ] **Step 6: Commit the changes**

```bash
git add packages/web-app/app/auth/register/page.tsx
git commit -m "feat: add confirm password field with validation

- Add confirm password input field to registration form
- Implement password visibility toggle for both fields
- Add real-time password match indicator (checkmark/cross icons)
- Add submit validation for password match
- Update error handling to show password mismatch message

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```