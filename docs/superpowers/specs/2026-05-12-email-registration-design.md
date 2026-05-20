# 邮箱注册功能设计文档

> 创建日期：2026-05-12
> 状态：待实现

## 背景

当前 Oh My Prompt 仅支持 GitHub OAuth 登录，存在以下问题：
- 部分用户没有 GitHub 账号
- 国内用户访问 GitHub 不稳定
- 无法通过邮箱找回密码

## 目标

添加邮箱注册/登录功能，支持：
- 邮箱 + 密码注册/登录
- Magic Link / OTP 无密码登录
- 邮箱验证（注册必须验证）
- 忘记密码/重置密码
- 可选昵称设置

## 页面结构

### 新增页面

| 页面 | 路径 | 功能 |
|------|------|------|
| 注册页 | `/auth/register` | 邮箱+密码+昵称注册，发送验证邮件 |
| 验证等待页 | `/auth/verify` | 提示查收邮件，显示邮箱地址，重新发送按钮 |
| 忘记密码页 | `/auth/forgot-password` | 输入邮箱，发送重置链接 |
| 重置密码页 | `/auth/reset-password` | 设置新密码 |

### 修改页面

| 页面 | 改动 |
|------|------|
| `/auth/login` | 添加邮箱登录表单 + "忘记密码"链接 + "注册"链接 |
| `LoginModal.tsx` | 添加邮箱登录表单（简化版） + "注册"跳转链接 |

## 认证流程

### 注册流程

1. 用户填写邮箱、密码、昵称（可选）
2. 点击注册 → Supabase 发送验证邮件
3. 跳转到 `/auth/verify`，显示"验证邮件已发送至 {email}"
4. 用户点击邮件链接 → Supabase 验证 → 跳转到 `/dashboard`

### 登录流程（邮箱+密码）

1. 用户填写邮箱、密码
2. 点击登录 → Supabase 验证
3. 若邮箱未验证 → 提示"请先验证邮箱" + 跳转 `/auth/verify`
4. 若验证通过 → 跳转到目标页面（Dashboard 或来源页）

### 登录流程（Magic Link/OTP）

1. 用户填写邮箱，选择"验证码登录"
2. 点击发送 → Supabase 发送 6 位 OTP
3. 输入 OTP → 验证 → 跳转目标页面

### 忘记密码流程

1. 用户填写邮箱
2. 点击发送 → Supabase 发送重置链接
3. 用户点击邮件链接 → 跳转 `/auth/reset-password`
4. 设置新密码 → 跳转 `/auth/login`

## UI 设计要点

### 登录页（`/auth/login`）

- 标题："登录"
- 两种登录方式：
  - Tab 切换："邮箱登录" | "验证码登录"
  - 邮箱登录表单：邮箱输入框 + 密码输入框 + 登录按钮
  - 验证码登录表单：邮箱输入框 + 发送按钮 + OTP 输入框
- GitHub OAuth 按钮（保留现有）
- 底部链接："忘记密码？" | "没有账号？注册"

### 注册页（`/auth/register`）

- 标题："创建账号"
- 表单字段（垂直排列）：
  - 邮箱输入框（必填，placeholder: "your@email.com"）
  - 密码输入框（必填，placeholder: "至少8个字符，包含字母和数字"，右侧眼睛图标切换显示）
  - 确认密码输入框（必填，placeholder: "请再次输入密码"，右侧匹配状态图标）
  - 昵称输入框（可选，placeholder: "您的昵称"）
- 密码显示/隐藏切换：单个眼睛图标同时控制密码和确认密码字段
- 密码匹配验证：实时显示图标反馈，提交时阻止不匹配的提交
- "注册"按钮
- 底部："已有账号？登录"

#### 密码匹配验证规则

**实时反馈：**
- 确认密码输入时，右侧显示匹配状态图标：
  - ✓ 绿色勾号：密码匹配（`password === confirmPassword && confirmPassword.length > 0`）
  - ✗ 红色叉号：密码不匹配（`password !== confirmPassword && confirmPassword.length > 0`）
  - 无图标：确认密码为空

**提交时验证：**
- 点击注册按钮时，先验证密码强度，再验证密码匹配
- 不匹配时显示错误提示："两次输入的密码不一致"
- 阻止提交，用户必须修正

#### 密码显示/隐藏切换

- 切换按钮（眼睛图标）位于密码输入框右侧
- 单个按钮同时控制密码和确认密码字段的 `type` 属性
- 点击切换：`type="password"` ↔ `type="text"`
- 两个字段同步显示/隐藏，方便用户对比确认

#### 状态管理

新增 state：
```tsx
const [confirmPassword, setConfirmPassword] = useState('')
const [showPassword, setShowPassword] = useState(false)
```

### 验证等待页（`/auth/verify`）

- 标题："验证您的邮箱"
- 提示："验证邮件已发送至 {email}"
- "重新发送"按钮（带倒计时，60秒内不可重复）
- "返回登录"链接

### 忘记密码页（`/auth/forgot-password`）

- 标题："重置密码"
- 邮箱输入框
- "发送重置链接"按钮
- 提示："如果该邮箱已注册，您将收到重置密码的链接"

### 重置密码页（`/auth/reset-password`）

- 标题："设置新密码"
- 新密码输入框 + 确认密码输入框
- 密码强度提示（至少8位，含字母+数字）
- "确认"按钮

## Supabase 配置

### config.toml 更新

```toml
[auth]
enable_signup = true
minimum_password_length = 8

[auth.email]
enable_signup = true
enable_confirmations = true
otp_length = 6
otp_expiry = 3600
```

### 数据存储

- 昵称存储在 `auth.users.raw_user_meta_data` JSON 字段中，格式：`{ display_name: "小明" }`
- 无需数据库迁移，现有业务表通过 `user_id` 关联，无需改动

## API 与回调路由

### 现有路由（无需改动）

- `/auth/callback` —— OAuth 回调处理（GitHub）
- `/auth/signout` —— 登出

### 回调类型

| URL 参数 | 处理 |
|----------|------|
| `type=signup` | 邮箱验证成功回调 → 跳转 Dashboard |
| `type=recovery` | 密码重置回调 → 跳转 `/auth/reset-password` |

### Supabase Dashboard 配置

需要在 Authentication → URL Configuration 添加：
- Site URL: `https://oh-my-prompt.com`（生产）/ `http://localhost:3000`（开发）
- Redirect URLs: `https://oh-my-prompt.com/auth/callback`, `http://localhost:3000/auth/callback`

## 错误处理

| 场景 | 错误提示 |
|------|----------|
| 邮箱已注册 | "该邮箱已被注册，请直接登录" |
| 邮箱未注册（登录时） | "该邮箱未注册，请先注册" |
| 邮箱未验证 | "请先验证邮箱，验证邮件已发送至 {email}" |
| 密码错误 | "密码错误，请重试" |
| 密码强度不足 | "密码至少8位，需包含字母和数字" |
| 验证链接过期 | "验证链接已过期，请重新发送" |
| OTP 错误/过期 | "验证码错误或已过期，请重新获取" |
| 网络错误 | "网络异常，请稍后重试" |

## 安全措施

- 所有表单输入前端验证 + 后端 Supabase 验证
- 重新发送按钮 60 秒倒计时防滥用
- 密码不显示明文，使用 `type="password"`
- 重置密码链接有效期 1 小时（Supabase 默认）
- 密码强度：最少 8 位，需包含字母和数字

## 文件改动清单

### 新增文件

```
packages/web-app/app/auth/register/page.tsx
packages/web-app/app/auth/verify/page.tsx
packages/web-app/app/auth/forgot-password/page.tsx
packages/web-app/app/auth/reset-password/page.tsx
packages/web-app/components/auth/RegisterForm.tsx
packages/web-app/components/auth/VerifyForm.tsx
packages/web-app/components/auth/ForgotPasswordForm.tsx
packages/web-app/components/auth/ResetPasswordForm.tsx
packages/web-app/components/auth/EmailLoginForm.tsx
packages/web-app/components/auth/OtpLoginForm.tsx
```

### 修改文件

```
packages/web-app/app/auth/login/page.tsx
packages/web-app/components/auth/LoginModal.tsx
packages/web-app/supabase/config.toml
packages/web-app/app/auth/callback/route.ts (支持 signup/recovery 类型)
```

## 测试要点

1. 注册流程：邮箱验证邮件发送、验证成功跳转
2. 登录流程：邮箱+密码登录、OTP 登录、未验证邮箱拦截
3. 密码重置：发送重置邮件、设置新密码
4. 错误处理：各种错误提示正确显示
5. 安全：密码强度验证、倒计时防滥用