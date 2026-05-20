# Email Verification OTP Design

将邮箱注册和密码重置从"验证链接"改为"验证码"方式，解决QQ邮箱过滤链接邮件的问题。

## Background

**Problem:** QQ邮箱会自动过滤/删除包含验证链接的邮件，导致用户无法完成邮箱验证。

**Solution:** 改用6位数字验证码，用户手动输入，避免链接触发邮箱过滤规则。

**Scope:** 注册流程 + 密码重置流程

## Requirements

| Requirement | Value |
|-------------|-------|
| 验证码格式 | 6位数字 |
| 有效期 | 10分钟（Supabase 默认） |
| 发送频率 | 60秒冷却期，每天最多10次 |
| 适用场景 | 注册、密码重置 |

## Architecture

### Flow Changes

**Registration Flow (Before → After):**

```
Before:
/register → signUp() → 验证链接邮件 → 用户点击链接 → /auth/callback → /dashboard

After:
/register → signInWithOtp({ shouldCreateUser: true }) → 验证码邮件 → 
/verify-otp → verifyOtp({ type: 'signup' }) → /set-password → updateUser({ password }) → /dashboard
```

**Password Reset Flow (Before → After):**

```
Before:
/forgot-password → resetPasswordForEmail() → 验证链接邮件 → 用户点击链接 → /auth/callback → /reset-password

After:
/forgot-password → signInWithOtp({ shouldCreateUser: false }) → 验证码邮件 →
/reset-password → verifyOtp({ type: 'recovery' }) + updateUser({ password }) → /auth/login
```

### API Changes

| Scenario | Before | After |
|----------|--------|-------|
| 发送注册验证 | `signUp({ email, password })` | `signInWithOtp({ email, shouldCreateUser: true })` |
| 发送重置验证 | `resetPasswordForEmail(email)` | `signInWithOtp({ email, shouldCreateUser: false })` |
| 验证注册 | 自动（点击链接） | `verifyOtp({ email, token, type: 'signup' })` |
| 验证重置 | 自动（点击链接） | `verifyOtp({ email, token, type: 'recovery' })` |
| 设置密码 | 注册时已设置 | `updateUser({ password })` 验证后单独设置 |

## Pages

### New Pages

| Page | Path | Function |
|------|------|----------|
| VerifyOTP | `/auth/verify-otp` | 注册验证码输入页（6位数字输入框） |
| SetPassword | `/auth/set-password` | 注册后设置密码页 |
| ResetPasswordOTP | `/auth/reset-password` | 密码重置页（验证码 + 新密码输入，替换原有） |

### Modified Pages

| Page | Path | Changes |
|------|------|---------|
| Register | `/auth/register` | 移除密码输入，改为发送 OTP 后跳转 verify-otp |
| ForgotPassword | `/auth/forgot-password` | 发送 OTP 后跳转 reset-password |

### Deleted Pages

| Page | Path | Reason |
|------|------|--------|
| Verify | `/auth/verify` | 不再需要等待链接点击 |

## Components

### OTPInput (Reusable)

6位数字输入组件，功能：
- 6个独立输入框，自动聚焦下一个
- 支持粘贴整串验证码
- 输入完成后自动触发验证
- 限制只能输入数字

```tsx
// Usage
<OTPInput
  length={6}
  onComplete={(code) => handleVerify(code)}
  disabled={loading}
/>
```

### CountdownButton (Existing Pattern)

重发按钮，带60秒倒计时：
- 显示 "重新发送 (60)" → "重新发送"
- 禁用期间不可点击
- 已有实现在 `/auth/verify/page.tsx`，复用逻辑

## Data Flow

### Registration Flow

```
用户输入邮箱
    ↓
调用 signInWithOtp({ email, shouldCreateUser: true })
    ↓
Supabase 发送 6位验证码邮件
    ↓
跳转 /verify-otp?email=xxx
    ↓
用户输入验证码（自动或手动触发）
    ↓
调用 verifyOtp({ email, token, type: 'signup' })
    ↓
验证成功 → 获得临时 session
    ↓
跳转 /set-password（设置密码）
    ↓
调用 updateUser({ password })
    ↓
密码设置成功 → 跳转 /dashboard
```

### Password Reset Flow

```
用户输入邮箱
    ↓
调用 signInWithOtp({ email, shouldCreateUser: false })
    ↓
Supabase 发送 6位验证码邮件
    ↓
跳转 /reset-password?email=xxx
    ↓
用户输入验证码 + 新密码
    ↓
调用 verifyOtp({ email, token, type: 'recovery' })
    ↓
验证成功 → 获得 recovery session
    ↓
调用 updateUser({ password })
    ↓
密码更新成功 → 跳转 /auth/login
```

### State Passing

- Email address via URL query string (`?email=xxx`)
- Session managed by Supabase (cookies)
- No additional state storage needed

## Error Handling

### OTP Errors

| Error | Supabase Response | Handling |
|-------|-------------------|----------|
| Invalid code | `Invalid OTP` | Show "验证码错误"，clear input |
| Expired code | `OTP expired` | Show "验证码已过期"，guide to resend |
| Already used | `OTP already used` | Show "验证码已失效"，guide to resend |
| Rate limited | `Rate limit exceeded` | Show "发送频率过高"，disable resend |

### User State Errors

| Error | Handling |
|-------|----------|
| Email already registered (signup) | Show "该邮箱已注册"，redirect to login |
| Email not registered (recovery) | Security: Don't expose existence, show "如果邮箱存在，验证码已发送" |

### Password Errors (Existing Logic)

| Error | Handling |
|-------|----------|
| Weak password | Show rules: "至少8字符，包含字母和数字" |
| Password update failed | Show error message, allow retry |

### Page State Management

Each verification page needs:
- `loading` — 正在验证/发送
- `countdown` — 重发倒计时（60秒）
- `error` — 错误信息
- `success` — 成功提示（可选）

## Security

- Validate email format on page entry (don't trust URL param)
- OTP input limited to numbers only
- Verify session.user exists after successful verification
- Don't expose whether email exists for password reset (security best practice)

## Supabase Configuration

### Email Template Customization

需要在 Supabase Dashboard 配置自定义邮件模板：

**注册验证邮件模板：**
```
您的验证码是：{{ .Token }}

验证码10分钟内有效，请勿告诉他人。
```

**密码重置邮件模板：**
```
您的密码重置验证码是：{{ .Token }}

验证码10分钟内有效，请勿告诉他人。
```

### Rate Limit Configuration

**应用层实现每日发送次数限制：**

在发送 OTP 前，检查 `user_metadata.otp_sent_today` 计数：
- 如果计数 >= 10，显示"今日发送次数已达上限"
- 每次发送成功后，计数 +1
- 每日 00:00 重置计数（通过检测日期变化）

Supabase 内置的 rate limit 保留为兜底保护（60秒冷却）。

## Testing

### E2E Test Scenarios

| Scenario | Test | Verification |
|----------|------|--------------|
| Register send OTP | Playwright | Navigate to verify-otp after email input |
| Register correct OTP | Playwright | Navigate to set-password after correct code |
| Register wrong OTP | Playwright | Show error, clear input |
| OTP expired | Manual | Wait 10min, show expired message |
| Resend OTP | Playwright | Countdown works, resend enabled after 60s |
| Password reset flow | Playwright | Full flow: OTP → new password → login success |
| Password strength | Playwright | Weak password shows error |
| Email already registered | Playwright | Show message, redirect to login |

### Manual Test Checklist

- [ ] QQ邮箱能正常收到验证码邮件（核心目标）
- [ ] 验证码邮件样式正确（无链接，仅显示数字）
- [ ] 验证码输入体验流畅（自动聚焦、粘贴支持）
- [ ] 60秒倒计时正确显示
- [ ] 错误提示清晰易懂

## Implementation Notes

1. **Supabase Magic Link OTP** is used (no custom implementation)
2. **Password is set after OTP verification** (registration flow change)
3. **Existing password validation logic** reused in set-password page
4. **No database changes required** — all state managed by Supabase

## Risks

| Risk | Mitigation |
|------|------------|
| Supabase OTP format might differ from 6-digit | Verify in Supabase docs, adjust UI if needed |
| Daily limit needs application layer | Simple counter in user metadata or skip for MVP |
| Users might confuse OTP with password | Clear UI messaging: "验证码" vs "密码" |