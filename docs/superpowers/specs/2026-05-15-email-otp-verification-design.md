# Email OTP Verification System Design

## Overview

Implement email OTP (One-Time Password) verification for user registration and login, using self-hosted email service with sender address `noreply@omg.mengapp.cn`.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Web App UI    │────────▶│  Supabase Auth   │────────▶│  Mail Server    │
│  (Login/Register│         │  (OTP Generate   │         │  (Postfix)      │
│                  │         │   & Auto-Send)   │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                           │                            │
        │                           │                            │
        ▼                           ▼                            ▼
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Supabase Auth  │◀────────│  User verifies   │         │  User Inbox     │
│  (OTP Verify)   │         │  OTP code        │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

**Core Flow:**
1. User enters email on login/register page
2. Frontend calls Supabase Auth `signInWithOtp({ email })` directly
3. Supabase generates OTP token and sends email via configured SMTP (`mail.omg.mengapp.cn`)
4. User receives email with verification code
5. User enters verification code on verify-otp page
6. Frontend calls Supabase Auth `verifyOtp({ email, token })` to complete verification

**Key Simplification:** Supabase handles both OTP generation AND email sending. We only configure SMTP in Supabase Dashboard and customize email template.

## DNS Configuration Guide

### Required DNS Records

| Record Type | Hostname | Value | Description |
|-------------|----------|-------|-------------|
| **MX** | `omg.mengapp.cn` | `10 mail.omg.mengapp.cn` | Mail exchange record pointing to mail server |
| **A** | `mail.omg.mengapp.cn` | `YOUR_SERVER_IP` | Mail server address resolution |
| **SPF** | `omg.mengapp.cn` | `v=spf1 mx ~all` | Mark legitimate sender servers |
| **DKIM** | `default._domainkey.omg.mengapp.cn` | `DKIM_PUBLIC_KEY` | Prevent email forgery |
| **DMARC** | `_dmarc.omg.mengapp.cn` | `v=DMARC1; p=none; rua=mailto:admin@omg.mengapp.cn` | Reporting policy |

### Postfix + DKIM Installation Steps

#### Step 1: Install Postfix

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postfix

# Configure during installation:
# - Type: Internet Site
# - System mail name: omg.mengapp.cn
```

#### Step 2: Configure Postfix

Edit `/etc/postfix/main.cf`:

```bash
myhostname = mail.omg.mengapp.cn
mydomain = omg.mengapp.cn
myorigin = $mydomain
inet_interfaces = loopback-only  # Only allow local connections
inet_protocols = all
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain
smtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination
mynetworks = 127.0.0.0/8
```

Create noreply mailbox:

```bash
sudo useradd -m -s /bin/bash noreply
sudo passwd noreply  # Set password for SMTP auth
```

#### Step 3: Install and Configure DKIM (OpenDKIM)

```bash
sudo apt install opendkim opendkim-tools
```

Generate DKIM keys:

```bash
sudo opendkim-genkey -s default -d omg.mengapp.cn
sudo mv default.private /etc/opendkim/keys/default.private
sudo mv default.txt /etc/opendkim/keys/default.txt
sudo chown opendkim:opendkim /etc/opendkim/keys/default.private
```

Configure `/etc/opendkim.conf`:

```bash
Domain omg.mengapp.cn
KeyFile /etc/opendkim/keys/default.private
Selector default
Socket inet:8891@localhost
```

Add DKIM public key to DNS (from `default.txt`):

```bash
# Content format:
default._domainkey.omg.mengapp.cn TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"
```

Configure Postfix to use DKIM (`/etc/postfix/main.cf`):

```bash
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

#### Step 4: Restart Services

```bash
sudo systemctl restart opendkim
sudo systemctl restart postfix
```

#### Step 5: Test Email Delivery

```bash
# Test sending
echo "Test email body" | mail -s "Test Subject" -r noreply@omg.mengapp.cn your@email.com

# Use Mail-Tester.com to check delivery score
```

## API Design

### `/api/auth/send-otp` - Send Verification Code

**Location:** `packages/web-app/app/api/auth/send-otp/route.ts`

**Important Note:** Supabase Auth's `signInWithOtp()` automatically sends an email. To use custom SMTP and templates, we have two options:

**Option A (Recommended): Configure Supabase SMTP + Custom Template**
- Configure Supabase Dashboard → Settings → Authentication → SMTP to use `mail.omg.mengapp.cn`
- Customize email template in Supabase Dashboard → Settings → Authentication → Email Templates
- This allows Supabase to handle OTP generation/validation while using our mail server

**Option B: Self-managed OTP**
- Generate OTP ourselves (6-digit random code)
- Store in database with expiration
- Send via NodeMailer
- Verify against database

This design uses **Option A** (Supabase SMTP configuration) as it's simpler and more secure.

**Request:**
```typescript
POST /api/auth/send-otp
{
  "email": "user@example.com"
}
```

**Response:**
```typescript
{
  "success": true
}
// Or error:
{
  "success": false,
  "error": "INVALID_EMAIL" | "RATE_LIMITED" | "SEND_FAILED"
}
```

**Implementation (Option A - Supabase SMTP):**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { email } = await request.json()
  
  // 1. Validate email format
  if (!isValidEmail(email)) {
    return NextResponse.json({ success: false, error: 'INVALID_EMAIL' }, { status: 400 })
  }
  
  // 2. Check rate limit (optional - Supabase has built-in rate limiting)
  if (await isRateLimited(email)) {
    return NextResponse.json({ success: false, error: 'RATE_LIMITED' }, { status: 429 })
  }
  
  // 3. Call Supabase signInWithOtp - email will be sent via our configured SMTP
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/verify-otp`
    }
  })
  
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}
```

**Supabase SMTP Configuration (Dashboard):**

Navigate to Supabase Dashboard → Settings → Authentication → SMTP Settings:
- Host: `mail.omg.mengapp.cn`
- Port: `587`
- User: `noreply`
- Password: `<your-postfix-password>`
- Sender email: `noreply@omg.mengapp.cn`
- Sender name: `Oh My Prompt`

**Custom Email Template (Dashboard):**

Navigate to Supabase Dashboard → Settings → Authentication → Email Templates → Magic Link:
```html
<h2>验证您的邮箱</h2>
<p>您的验证码是: <strong>{{ .Token }}</strong></p>
<p>验证码有效期 10 分钟。</p>
<p>如果这不是您请求的验证码，请忽略此邮件。</p>
```
```

### Helper Functions

```typescript
// packages/web-app/lib/email/utils.ts

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export async function isRateLimited(email: string): Promise<boolean> {
  // Check database for recent sends
  const supabase = await createClient()
  const { data } = await supabase
    .from('otp_send_logs')
    .select('created_at')
    .eq('email', email)
    .gte('created_at', new Date(Date.now() - 60000).toISOString())
    .limit(1)
  
  return data && data.length > 0
}

export async function logOtpSend(email: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('otp_send_logs').insert({
    email,
    created_at: new Date().toISOString()
  })
}
```

### Verification Flow

Frontend uses Supabase Client SDK directly:

```typescript
// packages/web-app/app/auth/login/page.tsx

const handleVerify = async () => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: otpCode,
    type: 'email'
  })
  
  if (error) {
    // Handle error
  } else {
    // Success - redirect to dashboard
    router.push('/dashboard')
  }
}
```

## Database Schema

### `otp_send_logs` Table

```sql
CREATE TABLE otp_send_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  INDEX idx_email_created_at (email, created_at)
);

-- RLS Policy
ALTER TABLE otp_send_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage logs" ON otp_send_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
```

## Frontend Integration

### Login Page Modifications

Add "Email OTP Login" tab to existing login page:

```typescript
// packages/web-app/app/auth/login/page.tsx

// Add state for OTP flow
const [otpSent, setOtpSent] = useState(false)
const [otpCode, setOtpCode] = useState('')
const [email, setEmail] = useState('')

// Add send OTP handler
const handleSendOtp = async () => {
  const res = await fetch('/api/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
  if (res.ok) {
    setOtpSent(true)
  }
}

// Add OTP input and verify button when otpSent is true
```

### Register Page Modifications

Similar integration for registration flow with email verification requirement.

## Supabase Configuration (Dashboard)

**SMTP Settings (Settings → Authentication → SMTP):**
```bash
Host: mail.omg.mengapp.cn
Port: 587
User: noreply
Password: <your-postfix-password>
Sender email: noreply@omg.mengapp.cn
Sender name: Oh My Prompt
```

**Email Template Customization (Settings → Authentication → Email Templates → Magic Link):**
```html
<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>邮箱验证</h2>
  <p>您的验证码是:</p>
  <p style="font-size: 24px; font-weight: bold; color: #81ecff;">{{ .Token }}</p>
  <p>验证码有效期10分钟。</p>
  <p>如果这不是您请求的验证码，请忽略此邮件。</p>
</div>
```

**OTP Settings (Settings → Authentication → URL Configuration):**
- Adjust OTP expiration time (default: 24 hours, recommended: 10 minutes for better security)

## Environment Variables

No additional environment variables needed for SMTP when using Supabase Dashboard configuration.

If implementing rate limiting in API route, add:
```bash
# Optional - if using custom rate limiting logic
# SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

## Security Design

### 1. Send Rate Limiting

- **Per Email:** Max 1 send per minute
- **Per IP:** Max 5 sends per 10 minutes
- Storage: `otp_send_logs` table in Supabase Database
- Clean up logs older than 24 hours periodically

### 2. OTP Security

- **Validity:** 10 minutes (configurable in Supabase Dashboard)
- **Format:** 6-digit numeric code (Supabase default)
- **Brute Force Protection:** Lock after 5 failed attempts for 15 minutes
- **One-time Use:** OTP invalidated after successful verification

### 3. SMTP Security

- **TLS Encryption:** SMTP uses STARTTLS on port 587
- **Password Protection:** Stored in environment variables, not in code
- **Local-only Access:** Postfix configured with `inet_interfaces = loopback-only`
- **Authentication:** SMTP AUTH required for sending

### 4. API Security

- **CSRF Protection:** Next.js built-in protection for API routes
- **Input Validation:** Email format validation prevents injection
- **Service Role Key:** Only used server-side, never exposed to client
- **Error Handling:** Generic error messages, no sensitive information leaked

### 5. Anti-Spam Measures

- **SPF + DKIM + DMARC:** Proper DNS configuration ensures delivery
- **Daily Limit:** Monitor sending volume, cap at 1000 emails/day
- **Reputation Monitoring:** Use Mail-Tester.com to check delivery score
- **bounce Handling:** Configure Postfix to handle bounces gracefully

## Testing Strategy

### 1. DNS Configuration Testing

```bash
# Test SPF
dig TXT omg.mengapp.cn

# Test DKIM
dig TXT default._domainkey.omg.mengapp.cn

# Test DMARC
dig TXT _dmarc.omg.mengapp.cn

# Test MX
dig MX omg.mengapp.cn
```

### 2. SMTP Testing

```bash
# Test local SMTP connection
telnet localhost 587

# Test authentication
openssl s_client -connect localhost:587 -starttls smtp
```

### 3. API Testing

```bash
# Test send OTP endpoint
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Test rate limiting (second request should fail)
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### 4. E2E Testing (Playwright)

```typescript
// packages/web-app/tests/auth/otp-login.spec.ts

test('email OTP login flow', async ({ page }) => {
  await page.goto('/auth/login')
  
  // Switch to OTP tab
  await page.click('[data-testid="otp-tab"]')
  
  // Enter email
  await page.fill('[data-testid="email-input"]', 'test@example.com')
  await page.click('[data-testid="send-otp-button"]')
  
  // Verify "OTP sent" message
  await expect(page.locator('[data-testid="otp-sent-message"]')).toBeVisible()
  
  // Enter OTP (mock or use test email account)
  await page.fill('[data-testid="otp-input"]', '123456')
  await page.click('[data-testid="verify-button"]')
  
  // Should redirect to dashboard
  await expect(page).toHaveURL('/dashboard')
})
```

## Implementation Checklist

1. ✅ DNS Configuration
   - Add MX, A, SPF, DKIM, DMARC records
   - Install and configure Postfix
   - Install and configure OpenDKIM
   - Test email delivery with Mail-Tester.com

2. ✅ Supabase Configuration
   - Configure SMTP settings in Supabase Dashboard
   - Customize email template in Email Templates section
   - Adjust OTP expiration time (10 minutes recommended)

3. ✅ Frontend Integration
   - Modify login page to add OTP login option
   - Create/modify verify-otp page for code input
   - Handle verification success/failure

4. ✅ Testing
   - Test DNS configuration
   - Test SMTP connection from Supabase
   - Test full OTP flow end-to-end
   - Add E2E tests

5. ✅ Monitoring
   - Set up email delivery monitoring
   - Monitor Supabase auth logs
   - Set up alerts for delivery failures

## Notes

- **Supabase SMTP Integration:** We configure Supabase to use our mail server (`mail.omg.mengapp.cn`) for sending OTP emails. This allows Supabase to handle OTP generation, validation, expiration while using our domain's SMTP infrastructure.
- **Custom Email Template:** Supabase Dashboard allows customizing email templates using `{{ .Token }}` variable for OTP code insertion.
- **Rate Limiting:** Supabase has built-in rate limiting. Additional database-based rate limiting can be added for extra protection.
- **Email Delivery:** SPF + DKIM + DMARC configuration ensures emails are not marked as spam.
- **No Code Changes Required for SMTP:** All SMTP configuration is done in Supabase Dashboard, not in application code.

## References

- [Supabase Auth OTP Documentation](https://supabase.com/docs/guides/auth/auth-email-password)
- [Postfix Configuration Guide](https://www.postfix.org/BASIC_CONFIGURATION_README.html)
- [OpenDKIM Setup](https://github.com/trusteddomainproject/OpenDKIM)
- [Mail-Tester.com](https://www.mail-tester.com/) - Email delivery score checker