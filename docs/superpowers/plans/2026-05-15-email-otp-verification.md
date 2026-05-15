# Email OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure email OTP verification using self-hosted SMTP server (noreply@omg.mengapp.cn) and integrate OTP login option in login page.

**Architecture:** Supabase Auth handles OTP generation/validation. We configure Supabase Dashboard SMTP to use our Postfix mail server. Frontend calls `signInWithOtp()` directly, existing verify-otp page handles code input.

**Tech Stack:** Postfix + OpenDKIM (mail server), Supabase Auth (OTP), Next.js 16 (frontend)

---

## File Structure

**Created/Modified Files:**
- Modify: `packages/web-app/app/auth/login/page.tsx` (add OTP login option)
- Create: `docs/superpowers/specs/2026-05-15-email-otp-verification-design.md` (already done)
- Create: Migration: `packages/web-app/supabase/migrations/009_otp_send_logs.sql` (optional rate limiting table)

**Infrastructure Operations (not code):**
- DNS Configuration (MX, SPF, DKIM, DMARC records)
- Postfix + OpenDKIM installation on user's server
- Supabase Dashboard SMTP configuration

---

## Task 1: DNS Configuration (Infrastructure)

**Note:** This is a server infrastructure task, not code. User must execute these commands on their server.

### Task 1.1: Add DNS Records

**Provider:** User's DNS provider (e.g., Aliyun DNS, Tencent DNS)

- [ ] **Step 1: Add MX Record**

Record details:
```
Type: MX
Host: omg.mengapp.cn
Value: 10 mail.omg.mengapp.cn
TTL: 600
```

- [ ] **Step 2: Add A Record for Mail Server**

Record details:
```
Type: A
Host: mail.omg.mengapp.cn
Value: YOUR_SERVER_IP (e.g., 123.45.67.89)
TTL: 600
```

- [ ] **Step 3: Add SPF Record**

Record details:
```
Type: TXT
Host: omg.mengapp.cn
Value: v=spf1 mx ~all
TTL: 600
```

- [ ] **Step 4: Add DMARC Record**

Record details:
```
Type: TXT
Host: _dmarc.omg.mengapp.cn
Value: v=DMARC1; p=none; rua=mailto:admin@omg.mengapp.cn
TTL: 600
```

- [ ] **Step 5: Verify DNS Configuration**

Run on local machine:
```bash
dig MX omg.mengapp.cn
dig A mail.omg.mengapp.cn
dig TXT omg.mengapp.cn
dig TXT _dmarc.omg.mengapp.cn
```

Expected: All records should return correct values.

---

## Task 2: Install Postfix (Infrastructure)

**Note:** Execute on user's server (Ubuntu/Debian).

- [ ] **Step 1: Install Postfix Package**

```bash
sudo apt update
sudo apt install postfix
```

During installation:
- Select "Internet Site"
- System mail name: `omg.mengapp.cn`

- [ ] **Step 2: Configure Postfix main.cf**

Edit `/etc/postfix/main.cf`:
```bash
sudo nano /etc/postfix/main.cf
```

Add/modify these lines:
```bash
myhostname = mail.omg.mengapp.cn
mydomain = omg.mengapp.cn
myorigin = $mydomain
inet_interfaces = loopback-only
inet_protocols = all
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain
smtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination
mynetworks = 127.0.0.0/8
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous
smtpd_sasl_local_domain = $myhostname
```

- [ ] **Step 3: Create noreply User Account**

```bash
sudo useradd -m -s /bin/bash noreply
sudo passwd noreply
```

Enter a secure password (this will be used for SMTP auth).

- [ ] **Step 4: Restart Postfix**

```bash
sudo systemctl restart postfix
sudo systemctl enable postfix
```

---

## Task 3: Install OpenDKIM (Infrastructure)

- [ ] **Step 1: Install OpenDKIM Packages**

```bash
sudo apt install opendkim opendkim-tools
```

- [ ] **Step 2: Create Keys Directory**

```bash
sudo mkdir -p /etc/opendkim/keys
sudo chown opendkim:opendkim /etc/opendkim/keys
```

- [ ] **Step 3: Generate DKIM Keys**

```bash
sudo opendkim-genkey -s default -d omg.mengapp.cn -D /etc/opendkim/keys
sudo chown opendkim:opendkim /etc/opendkim/keys/default.private
```

- [ ] **Step 4: Display DKIM Public Key for DNS**

```bash
sudo cat /etc/opendkim/keys/default.txt
```

Copy the public key content (starts with `v=DKIM1; k=rsa; p=...`).

- [ ] **Step 5: Add DKIM DNS Record**

Using DNS provider:
```
Type: TXT
Host: default._domainkey.omg.mengapp.cn
Value: [Copy from Step 4 output - the content inside quotes]
TTL: 600
```

- [ ] **Step 6: Configure OpenDKIM**

Edit `/etc/opendkim.conf`:
```bash
sudo nano /etc/opendkim.conf
```

Add these lines:
```bash
Domain omg.mengapp.cn
KeyFile /etc/opendkim/keys/default.private
Selector default
Socket inet:8891@localhost
```

- [ ] **Step 7: Configure Postfix to Use DKIM**

Edit `/etc/postfix/main.cf`:
```bash
sudo nano /etc/postfix/main.cf
```

Add these lines:
```bash
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

- [ ] **Step 8: Restart Services**

```bash
sudo systemctl restart opendkim
sudo systemctl restart postfix
```

---

## Task 4: Test Email Delivery (Infrastructure)

- [ ] **Step 1: Test Local SMTP Connection**

```bash
telnet localhost 587
```

Expected: Connection established, server responds with `220 mail.omg.mengapp.cn ESMTP Postfix`

- [ ] **Step 2: Send Test Email**

```bash
echo "Test email body" | mail -s "Test Subject" -r noreply@omg.mengapp.cn YOUR_PERSONAL_EMAIL@example.com
```

Expected: Email received in inbox (check spam folder if not in inbox).

- [ ] **Step 3: Check Delivery Score with Mail-Tester.com**

1. Visit https://www.mail-tester.com/
2. Send test email to the provided address
3. Check score (should be 7+ for good delivery)

---

## Task 5: Configure Supabase Dashboard SMTP (Infrastructure)

**Note:** This is a Supabase Dashboard configuration task.

- [ ] **Step 1: Navigate to SMTP Settings**

In Supabase Dashboard:
- Go to Settings → Authentication → SMTP Settings
- Toggle "Enable custom SMTP" to ON

- [ ] **Step 2: Configure SMTP Settings**

Fill in:
```
Host: mail.omg.mengapp.cn
Port: 587
User: noreply
Password: [password from Task 2 Step 3]
Sender email: noreply@omg.mengapp.cn
Sender name: Oh My Prompt
```

- [ ] **Step 3: Test SMTP Connection**

Click "Send test email" button in Dashboard.
Expected: Test email received.

- [ ] **Step 4: Customize Email Template**

Navigate to Settings → Authentication → Email Templates → Magic Link

Replace template with:
```html
<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
  <h2 style="color: #333;">邮箱验证</h2>
  <p style="color: #666;">您的验证码是:</p>
  <p style="font-size: 32px; font-weight: bold; color: #81ecff; letter-spacing: 8px;">{{ .Token }}</p>
  <p style="color: #999; font-size: 14px;">验证码有效期10分钟。</p>
  <p style="color: #999; font-size: 14px;">如果这不是您请求的验证码，请忽略此邮件。</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Oh My Prompt - 提升创作效率</p>
</div>
```

- [ ] **Step 5: Adjust OTP Expiration Time**

Navigate to Settings → Authentication → URL Configuration

Find "OTP Expiration" and set to `600` seconds (10 minutes).

---

## Task 6: Modify Login Page to Add OTP Login Option

**Files:**
- Modify: `packages/web-app/app/auth/login/page.tsx`

### Task 6.1: Add OTP Login UI

- [ ] **Step 1: Add OTP Login State Variables**

Modify `packages/web-app/app/auth/login/page.tsx`:

Add state variables after line 16 (`const [success, setSuccess] = useState<string | null>(null)`):

```typescript
const [otpEmail, setOtpEmail] = useState('')
const [sendingOtp, setSendingOtp] = useState(false)
const [otpSent, setOtpSent] = useState(false)
const [showOtpForm, setShowOtpForm] = useState(false)
```

- [ ] **Step 2: Add OTP Send Handler**

Add after `handleOAuthLogin` function (around line 88):

```typescript
// OTP login - send verification code
const handleSendOtp = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)
  setSuccess(null)

  if (!otpEmail || !otpEmail.includes('@')) {
    setError('请输入有效的邮箱地址')
    return
  }

  setSendingOtp(true)

  try {
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: otpEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined, // Use OTP, not magic link
      },
    })

    if (otpError) {
      if (otpError.message.includes('rate limit')) {
        setError('发送频率过高，请稍后再试')
      } else {
        setError(otpError.message)
      }
      return
    }

    setOtpSent(true)
    router.push(`/auth/verify-otp?email=${encodeURIComponent(otpEmail)}&type=signup`)
  } catch {
    setError('发送失败，请稍后重试')
  } finally {
    setSendingOtp(false)
  }
}
```

- [ ] **Step 3: Add OTP Login Button and Form**

Insert after the divider section (after line 148 `</div>` for the divider):

```tsx
{/* OTP Login Section */}
<div className="mt-4">
  {!showOtpForm ? (
    <button
      onClick={() => setShowOtpForm(true)}
      disabled={loading !== null}
      className="w-full flex items-center justify-center gap-2 px-4 py-[10px] bg-surface-container-high text-on-surface-variant rounded-md hover:bg-surface-container-high/80 transition-colors duration-150 disabled:opacity-50 font-medium text-[13px]"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <span>使用邮箱验证码登录</span>
    </button>
  ) : (
    <form onSubmit={handleSendOtp} className="space-y-4">
      {/* Email input for OTP */}
      <div>
        <label htmlFor="otp-email" className="block text-sm font-medium text-on-surface-variant mb-1.5">
          邮箱地址
        </label>
        <input
          id="otp-email"
          type="email"
          value={otpEmail}
          onChange={(e) => setOtpEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="w-full px-3 py-2 bg-surface-container-high rounded-md border border-outline-variant/30 text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={sendingOtp}
        className="w-full flex items-center justify-center gap-2 px-4 py-[10px] btn-primary-gradient text-on-primary-fixed rounded-md hover:opacity-90 transition-opacity duration-150 disabled:opacity-50 font-medium text-[13px]"
      >
        {sendingOtp ? (
          <span>发送中...</span>
        ) : otpSent ? (
          <span>验证码已发送，重新发送</span>
        ) : (
          <span>发送验证码</span>
        )}
      </button>

      {/* Cancel button */}
      <button
        type="button"
        onClick={() => {
          setShowOtpForm(false)
          setOtpEmail('')
          setOtpSent(false)
          setError(null)
        }}
        className="w-full text-sm text-on-surface-variant hover:text-on-background font-medium"
      >
        ← 使用其他方式登录
      </button>
    </form>
  )}
</div>

{/* Divider between password and OTP */}
{!showOtpForm && (
  <div className="mt-4 flex items-center gap-3">
    <div className="flex-1 h-px bg-outline-variant/20" />
    <span className="text-xs text-on-surface-variant font-medium">或</span>
    <div className="flex-1 h-px bg-outline-variant/20" />
  </div>
)}
```

- [ ] **Step 4: Hide Password Form When OTP Form is Shown**

Wrap the existing password login form with conditional rendering:

Find the existing `<form onSubmit={handlePasswordLogin}` section (around line 151) and wrap it:

```tsx
{/* Password Login Form - hidden when OTP form is shown */}
{!showOtpForm && (
  <form onSubmit={handlePasswordLogin} className="space-y-4 mt-4">
    {/* ... existing form content ... */}
  </form>
)}
```

- [ ] **Step 5: Commit Login Page Changes**

```bash
git add packages/web-app/app/auth/login/page.tsx
git commit -m "feat: add email OTP login option to login page

- Add 'Use Email OTP Login' button
- Show email input form when clicked
- Call signInWithOtp() to send verification code
- Redirect to verify-otp page after sending

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Add E2E Test for OTP Login Flow (Optional)

**Files:**
- Create: `packages/web-app/tests/auth/otp-login.spec.ts`

- [ ] **Step 1: Create OTP Login E2E Test**

Create `packages/web-app/tests/auth/otp-login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Email OTP Login', () => {
  test('should show OTP login form when button clicked', async ({ page }) => {
    await page.goto('/auth/login')

    // Click OTP login button
    await page.click('button:has-text("使用邮箱验证码登录")')

    // Should show email input
    const emailInput = page.locator('#otp-email')
    await expect(emailInput).toBeVisible()

    // Should show send button
    await expect(page.locator('button:has-text("发送验证码")')).toBeVisible()

    // Should show cancel button
    await expect(page.locator('button:has-text("使用其他方式登录")')).toBeVisible()
  })

  test('should hide password form when OTP form shown', async ({ page }) => {
    await page.goto('/auth/login')

    // Password form should be visible initially
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()

    // Click OTP login button
    await page.click('button:has-text("使用邮箱验证码登录")')

    // Password form should be hidden
    await expect(page.locator('#email')).not.toBeVisible()
    await expect(page.locator('#password')).not.toBeVisible()
  })

  test('should return to password form when cancel clicked', async ({ page }) => {
    await page.goto('/auth/login')

    // Click OTP login button
    await page.click('button:has-text("使用邮箱验证码登录")')
    await expect(page.locator('#otp-email')).toBeVisible()

    // Click cancel button
    await page.click('button:has-text("使用其他方式登录")')

    // Should return to password form
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#otp-email')).not.toBeVisible()
  })

  test('should validate email format', async ({ page }) => {
    await page.goto('/auth/login')

    // Click OTP login button
    await page.click('button:has-text("使用邮箱验证码登录")')

    // Enter invalid email
    await page.fill('#otp-email', 'invalid-email')
    await page.click('button:has-text("发送验证码")')

    // Should show error message
    await expect(page.locator('text=请输入有效的邮箱地址')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run E2E Tests**

```bash
npm run test:headed
```

Expected: All tests pass.

- [ ] **Step 3: Commit E2E Tests**

```bash
git add packages/web-app/tests/auth/otp-login.spec.ts
git commit -m "test: add E2E tests for OTP login UI interactions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Create Rate Limiting Migration (Optional)

**Note:** Supabase has built-in rate limiting. This migration is optional for additional protection.

**Files:**
- Create: `packages/web-app/supabase/migrations/009_otp_send_logs.sql`

- [ ] **Step 1: Create Migration File**

Create `packages/web-app/supabase/migrations/009_otp_send_logs.sql`:

```sql
-- OTP Send Logs Table for Rate Limiting
CREATE TABLE IF NOT EXISTS otp_send_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT
);

-- Index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_otp_send_logs_email_created_at
  ON otp_send_logs(email, created_at DESC);

-- Enable RLS
ALTER TABLE otp_send_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage logs (API route uses service role)
CREATE POLICY "Service role can manage otp_send_logs" ON otp_send_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to clean up old logs (run daily)
CREATE OR REPLACE FUNCTION cleanup_old_otp_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_send_logs
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Schedule cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup_otp_logs', '0 0 * * *', 'SELECT cleanup_old_otp_logs()');
```

- [ ] **Step 2: Apply Migration to Supabase**

If using Supabase CLI:
```bash
cd packages/web-app
supabase db push
```

Or manually apply in Supabase Dashboard → SQL Editor.

- [ ] **Step 3: Commit Migration**

```bash
git add packages/web-app/supabase/migrations/009_otp_send_logs.sql
git commit -m "feat: add otp_send_logs table for rate limiting

- Track OTP send requests per email
- Index for efficient queries
- Cleanup function for old logs
- RLS policy for service role only

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Update Documentation

- [ ] **Step 1: Add SMTP Configuration Note to CLAUDE.md**

Edit `packages/web-app/CLAUDE.md`, add section after "Environment Variables":

```markdown
## Email OTP Configuration

SMTP server configuration is done in Supabase Dashboard, not in environment variables:

**Supabase Dashboard Settings:**
- Settings → Authentication → SMTP Settings
- Host: mail.omg.mengapp.cn
- Port: 587
- Sender: noreply@omg.mengapp.cn

**Email Template:**
- Settings → Authentication → Email Templates → Magic Link
- Uses {{ .Token }} for 6-digit OTP code

**OTP Expiration:**
- Settings → Authentication → URL Configuration
- Recommended: 600 seconds (10 minutes)
```

- [ ] **Step 2: Commit Documentation**

```bash
git add packages/web-app/CLAUDE.md
git commit -m "docs: add SMTP configuration notes to CLAUDE.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Summary

**Implementation breakdown:**

| Task | Type | Effort |
|------|------|--------|
| 1-4 | DNS/Postfix/DKIM infrastructure | Server admin work |
| 5 | Supabase Dashboard config | Dashboard operations |
| 6 | Login page modification | Code (30 min) |
| 7 | E2E tests | Code (15 min) |
| 8 | Rate limiting migration | Optional SQL |
| 9 | Documentation update | Quick edit |

**Total code changes:**
- 1 file modified (login page)
- 1 test file created (optional)
- 1 migration file created (optional)

**Infrastructure required:**
- DNS records (5 records)
- Postfix + OpenDKIM on user's server
- Supabase Dashboard SMTP configuration

**Testing:**
- DNS verification with `dig`
- SMTP test with `telnet` and Mail-Tester.com
- E2E test for login UI

**Security:**
- SPF + DKIM + DMARC for email delivery
- Supabase built-in rate limiting
- Optional database-based rate limiting
- OTP expiration: 10 minutes