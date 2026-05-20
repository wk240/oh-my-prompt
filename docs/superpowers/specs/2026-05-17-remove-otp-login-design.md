# 移除登录页面 OTP 登录功能

## 背景

登录页面目前提供三种登录方式：GitHub OAuth、邮箱密码、邮箱验证码(OTP)。需求是移除 OTP 登录入口，简化登录流程。

## 范围

**仅移除登录页面的 OTP 登录**，保留注册和密码重置流程中的 OTP 验证功能。

## 修改内容

### 1. 登录页面 (`packages/web-app/app/auth/login/page.tsx`)

移除内容：
- OTP 登录按钮："使用邮箱验证码登录"
- OTP 表单（邮箱输入 + 发送按钮）
- 相关 state: `otpEmail`, `sendingOtp`, `otpSent`, `showOtpForm`
- `handleSendOtp` 函数
- OTP 区域与密码登录区域之间的分隔线

最终布局：
```
GitHub OAuth
────────── 或 ──────────
邮箱 + 密码登录
忘记密码？ | 登录按钮
```

### 2. 删除测试文件 (`packages/web-app/tests/auth/otp-login.spec.ts`)

该文件专门测试登录页 OTP 功能，移除后不再需要。

## 不修改

- `verify-otp/page.tsx` — 注册/密码重置验证页
- `register/page.tsx` — 注册流程 OTP
- `forgot-password/page.tsx` — 密码重置 OTP
- `reset-password/page.tsx` — 密码重置 OTP 输入
- `components/auth/OTPInput.tsx` — OTP 输入组件

## 测试

运行现有测试确保登录流程正常：
```bash
npm run test -- --grep "login"
```