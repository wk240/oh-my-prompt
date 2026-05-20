# 移除登录页面 OTP 登录功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从登录页面移除邮箱验证码(OTP)登录入口，简化为 GitHub OAuth + 邮箱密码两种方式

**Architecture:** 直接删除相关代码，不引入新依赖

**Tech Stack:** Next.js 16, React 19, Supabase Auth

---

### Task 1: 修改登录页面移除 OTP 功能

**Files:**
- Modify: `packages/web-app/app/auth/login/page.tsx`

- [ ] **Step 1: 移除 OTP 相关 state**

删除第 17-20 行的 state 定义：
```typescript
// 删除这些行
const [otpEmail, setOtpEmail] = useState('')
const [sendingOtp, setSendingOtp] = useState(false)
const [otpSent, setOtpSent] = useState(false)
const [showOtpForm, setShowOtpForm] = useState(false)
```

- [ ] **Step 2: 移除 handleSendOtp 函数**

删除第 95-132 行的 `handleSendOtp` 函数及其内部代码。

- [ ] **Step 3: 移除 OTP 登录 UI 区域**

删除第 194-264 行的整个 OTP Section（包括按钮、表单、分隔线）：
```typescript
// 删除从这行开始
{/* OTP Login Section */}
...一直到...
{/* Divider between password and OTP */}
...结束
```

- [ ] **Step 4: 验证页面渲染正常**

运行开发服务器检查页面：
```bash
cd packages/web-app && npm run dev
```
访问 `http://localhost:3000/auth/login`，确认只显示 GitHub OAuth 和邮箱密码登录。

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/app/auth/login/page.tsx
git commit -m "$(cat <<'EOF'
refactor: remove OTP login from login page

Simplify login to GitHub OAuth + email/password only.
OTP verification remains for registration and password reset.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 删除 OTP 登录测试文件

**Files:**
- Delete: `packages/web-app/tests/auth/otp-login.spec.ts`

- [ ] **Step 1: 删除测试文件**

```bash
rm packages/web-app/tests/auth/otp-login.spec.ts
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/tests/auth/otp-login.spec.ts
git commit -m "$(cat <<'EOF'
chore: remove OTP login test file

Test no longer needed after removing OTP login feature.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```