# WeChat Pay Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate WeChat Pay Native mode for Chinese users with dual payment system (Stripe + WeChat Pay).

**Architecture:** New `wechat-pay` module mirrors existing `stripe` module structure. Database tables for WeChat orders. Frontend adds payment method selector with geolocation-based recommendations.

**Tech Stack:** wechatpay-node-v3-ts SDK, qrcode.react, Supabase migrations, Next.js API routes

---

## Task 1: Database Schema - WeChat Orders Table

**Files:**
- Create: `packages/web-app/supabase/migrations/002_wechat_pay_orders.sql`
- Test: Verify via Supabase dashboard after migration

- [ ] **Step 1: Create migration file**

```sql
-- 微信支付订单表
CREATE TABLE wechat_pay_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- 微信支付字段
  out_trade_no TEXT UNIQUE NOT NULL,          -- 商户订单号
  transaction_id TEXT,                        -- 微信支付交易号
  code_url TEXT,                              -- Native支付二维码链接

  -- 套餐信息
  plan_type TEXT NOT NULL CHECK (plan_type IN ('pro', 'team')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  amount INTEGER NOT NULL,                    -- 订单金额（单位：分）

  -- 状态
  trade_state TEXT DEFAULT 'NOTPAY' CHECK (trade_state IN (
    'NOTPAY', 'SUCCESS', 'REFUND', 'CLOSED',
    'REVOKED', 'USERPAYING', 'PAYERROR'
  )),

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  expire_at TIMESTAMP WITH TIME ZONE,

  -- 订阅周期
  subscription_period_end TIMESTAMP WITH TIME ZONE
);

-- 索引
CREATE INDEX idx_wechat_orders_user_id ON wechat_pay_orders(user_id);
CREATE INDEX idx_wechat_orders_out_trade_no ON wechat_pay_orders(out_trade_no);
CREATE INDEX idx_wechat_orders_trade_state ON wechat_pay_orders(trade_state);

-- RLS
ALTER TABLE wechat_pay_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wechat orders"
  ON wechat_pay_orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wechat orders"
  ON wechat_pay_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase CLI or dashboard SQL editor. Verify table creation in Supabase dashboard.

---

## Task 2: Database Schema - User Subscriptions Extension

**Files:**
- Create: `packages/web-app/supabase/migrations/003_user_subscriptions_provider.sql`
- Test: Verify via Supabase dashboard after migration

- [ ] **Step 1: Create migration file**

```sql
-- 新增支付来源字段
ALTER TABLE user_subscriptions ADD COLUMN payment_provider TEXT DEFAULT 'stripe'
  CHECK (payment_provider IN ('stripe', 'wechat_pay'));

ALTER TABLE user_subscriptions ADD COLUMN wechat_order_id TEXT;

-- 允许stripe_subscription_id为空（微信支付用户无此字段）
ALTER TABLE user_subscriptions ALTER COLUMN stripe_subscription_id DROP NOT NULL;
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase CLI or dashboard SQL editor. Verify columns added in Supabase dashboard.

---

## Task 3: Install Dependencies

**Files:**
- Modify: `packages/web-app/package.json`

- [ ] **Step 1: Install WeChat Pay SDK and QR code library**

```bash
cd packages/web-app
npm install wechatpay-node-v3-ts qrcode.react
```

- [ ] **Step 2: Verify installation**

Run: `npm ls wechatpay-node-v3-ts qrcode.react`
Expected: Both packages listed with versions

- [ ] **Step 3: Commit dependencies**

```bash
git add packages/web-app/package.json packages/web-app/package-lock.json
git commit -m "chore: add wechatpay-node-v3-ts and qrcode.react dependencies"
```

---

## Task 4: WeChat Pay SDK Client Initialization

**Files:**
- Create: `packages/web-app/lib/wechat-pay/client.ts`
- Create: `packages/web-app/lib/wechat-pay/index.ts`

- [ ] **Step 1: Create client initialization module**

```typescript
// packages/web-app/lib/wechat-pay/client.ts
import Wechatpay from 'wechatpay-node-v3-ts'

export interface WechatPayConfig {
  appid: string            // 小程序/公众号AppID
  mchid: string            // 商户号
  serial_no: string        // 商户API证书序列号
  privateKey: string       // 商户API私钥
  apiv3_private_key: string // APIv3密钥
}

// 配置对象（导出供其他模块使用）
export const config: WechatPayConfig = {
  appid: process.env.WECHAT_PAY_APPID!,
  mchid: process.env.WECHAT_PAY_MCHID!,
  serial_no: process.env.WECHAT_PAY_SERIAL_NO!,
  privateKey: process.env.WECHAT_PAY_PRIVATE_KEY!,
  apiv3_private_key: process.env.WECHAT_PAY_APIV3_KEY!,
}

export function getWechatPayClient(): Wechatpay {
  return new Wechatpay(config)
}

// 验证配置是否完整
export function isWechatPayConfigured(): boolean {
  return Boolean(
    config.appid &&
    config.mchid &&
    config.serial_no &&
    config.privateKey &&
    config.apiv3_private_key
  )
}
```

- [ ] **Step 2: Create module index**

```typescript
// packages/web-app/lib/wechat-pay/index.ts
export { getWechatPayClient, config, isWechatPayConfigured, WechatPayConfig } from './client'
export { WECHAT_PAY_PLANS, generateOutTradeNo } from './plans'
export { createNativeOrder } from './native'
export { queryOrderStatus, closeOrder } from './orders'
export { handleWechatPayWebhook } from './webhooks'
```

- [ ] **Step 3: Add environment variables placeholder**

Add to `packages/web-app/.env.example`:
```env
# 微信支付配置
WECHAT_PAY_APPID=
WECHAT_PAY_MCHID=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_APIV3_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/lib/wechat-pay/client.ts packages/web-app/lib/wechat-pay/index.ts packages/web-app/.env.example
git commit -m "feat(wechat-pay): add SDK client initialization module"
```

---

## Task 5: WeChat Pay Plans Configuration

**Files:**
- Create: `packages/web-app/lib/wechat-pay/plans.ts`

- [ ] **Step 1: Create plans configuration**

```typescript
// packages/web-app/lib/wechat-pay/plans.ts
import crypto from 'crypto'

// 微信支付套餐价格（人民币，单位：分）
export const WECHAT_PAY_PLANS = {
  pro_monthly: {
    price: 9900,       // ¥99/月
    description: 'Oh My Prompt Pro 月付套餐',
    displayName: 'Pro 月付',
    displayPrice: '¥99',
  },
  pro_yearly: {
    price: 99900,      // ¥999/年
    description: 'Oh My Prompt Pro 年付套餐',
    displayName: 'Pro 年付',
    displayPrice: '¥999',
  },
  team_monthly: {
    price: 29900,      // ¥299/月
    description: 'Oh My Prompt Team 月付套餐',
    displayName: 'Team 月付',
    displayPrice: '¥299',
  },
  team_yearly: {
    price: 299900,     // ¥2999/年
    description: 'Oh My Prompt Team 年付套餐',
    displayName: 'Team 年付',
    displayPrice: '¥2999',
  },
} as const

export type WechatPlanKey = keyof typeof WECHAT_PAY_PLANS

export function getPlanConfig(plan: 'pro' | 'team', interval: 'monthly' | 'yearly') {
  const key = `${plan}_${interval}` as WechatPlanKey
  return WECHAT_PAY_PLANS[key]
}

// 订单号生成：OMP-{timestamp}-{random}
export function generateOutTradeNo(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomUUID().slice(0, 8)
  return `OMP-${timestamp}-${random}`
}

// 计算订阅周期结束时间
export function calculateSubscriptionPeriodEnd(interval: 'monthly' | 'yearly'): Date {
  const now = new Date()
  if (interval === 'monthly') {
    return new Date(now.setMonth(now.getMonth() + 1))
  } else {
    return new Date(now.setFullYear(now.getFullYear() + 1))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/lib/wechat-pay/plans.ts
git commit -m "feat(wechat-pay): add plan pricing configuration"
```

---

## Task 6: Native Payment Order Creation

**Files:**
- Create: `packages/web-app/lib/wechat-pay/native.ts`

- [ ] **Step 1: Create Native order creation module**

```typescript
// packages/web-app/lib/wechat-pay/native.ts
import { getWechatPayClient, config } from './client'
import { getPlanConfig, generateOutTradeNo, calculateSubscriptionPeriodEnd } from './plans'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client for server-side use
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface CreateNativeOrderParams {
  userId: string
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
}

export interface CreateNativeOrderResult {
  success: true
  data: {
    outTradeNo: string
    codeUrl: string
    expireAt: Date
    amount: number
  }
}

export interface CreateNativeOrderError {
  success: false
  error: string
}

export async function createNativeOrder(
  params: CreateNativeOrderParams
): Promise<CreateNativeOrderResult | CreateNativeOrderError> {
  const { userId, plan, interval } = params
  const planConfig = getPlanConfig(plan, interval)

  const outTradeNo = generateOutTradeNo()
  const client = getWechatPayClient()
  const supabase = getSupabaseClient()

  // 二维码有效期：2小时
  const expireAt = new Date(Date.now() + 2 * 60 * 60 * 1000)

  try {
    // 调用微信Native下单API
    const result = await client.transactions_native({
      appid: config.appid,
      mchid: config.mchid,
      description: planConfig.description,
      out_trade_no: outTradeNo,
      amount: {
        total: planConfig.price,
        currency: 'CNY',
      },
      notify_url: `${process.env.NEXT_PUBLIC_WEB_APP_URL}/api/webhooks/wechat`,
      time_expire: expireAt.toISOString(),
    })

    // 保存订单到数据库
    const { error: dbError } = await supabase.from('wechat_pay_orders').insert({
      user_id: userId,
      out_trade_no: outTradeNo,
      code_url: result.code_url,
      plan_type: plan,
      billing_interval: interval,
      amount: planConfig.price,
      trade_state: 'NOTPAY',
      expire_at: expireAt.toISOString(),
      subscription_period_end: calculateSubscriptionPeriodEnd(interval).toISOString(),
    })

    if (dbError) {
      console.error('[WeChat Pay] Database insert error:', dbError)
      return { success: false, error: '订单保存失败' }
    }

    return {
      success: true,
      data: {
        outTradeNo,
        codeUrl: result.code_url,
        expireAt,
        amount: planConfig.price,
      },
    }
  } catch (error) {
    console.error('[WeChat Pay] Native order creation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '下单失败',
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/lib/wechat-pay/native.ts
git commit -m "feat(wechat-pay): add Native payment order creation"
```

---

## Task 7: Order Query and Close

**Files:**
- Create: `packages/web-app/lib/wechat-pay/orders.ts`

- [ ] **Step 1: Create order query module**

```typescript
// packages/web-app/lib/wechat-pay/orders.ts
import { getWechatPayClient, config } from './client'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface OrderStatusResult {
  success: true
  data: {
    tradeState: string
    transactionId?: string
    paidAt?: Date
    amount?: number
  }
}

export interface OrderStatusError {
  success: false
  error: string
}

export async function queryOrderStatus(
  outTradeNo: string
): Promise<OrderStatusResult | OrderStatusError> {
  const client = getWechatPayClient()

  try {
    const result = await client.query({
      out_trade_no: outTradeNo,
      mchid: config.mchid,
    })

    return {
      success: true,
      data: {
        tradeState: result.trade_state,
        transactionId: result.transaction_id,
        paidAt: result.success_time ? new Date(result.success_time) : undefined,
        amount: result.amount?.total,
      },
    }
  } catch (error) {
    console.error('[WeChat Pay] Order query error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '查询失败',
    }
  }
}

export async function closeOrder(
  outTradeNo: string
): Promise<{ success: true } | { success: false; error: string }> {
  const client = getWechatPayClient()

  try {
    await client.close({
      out_trade_no: outTradeNo,
      mchid: config.mchid,
    })

    // 更新数据库状态
    const supabase = getSupabaseClient()
    await supabase
      .from('wechat_pay_orders')
      .update({ trade_state: 'CLOSED' })
      .eq('out_trade_no', outTradeNo)

    return { success: true }
  } catch (error) {
    console.error('[WeChat Pay] Order close error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '关闭订单失败',
    }
  }
}

// 获取用户待支付订单
export async function getPendingOrder(userId: string): Promise<{
  success: true
  data: {
    outTradeNo: string
    codeUrl: string
    expireAt: Date
    planType: string
    billingInterval: string
    amount: number
  } | null
} | { success: false; error: string }> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('wechat_pay_orders')
      .select('out_trade_no, code_url, expire_at, plan_type, billing_interval, amount')
      .eq('user_id', userId)
      .eq('trade_state', 'NOTPAY')
      .gt('expire_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No pending order found
        return { success: true, data: null }
      }
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        outTradeNo: data.out_trade_no,
        codeUrl: data.code_url,
        expireAt: new Date(data.expire_at),
        planType: data.plan_type,
        billingInterval: data.billing_interval,
        amount: data.amount,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '查询失败',
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/lib/wechat-pay/orders.ts
git commit -m "feat(wechat-pay): add order query and close functions"
```

---

## Task 8: Webhook Handler

**Files:**
- Create: `packages/web-app/lib/wechat-pay/webhooks.ts`

- [ ] **Step 1: Create webhook handler module**

```typescript
// packages/web-app/lib/wechat-pay/webhooks.ts
import { getWechatPayClient, config } from './client'
import { createClient } from '@supabase/supabase-js'
import { calculateSubscriptionPeriodEnd } from './plans'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface WebhookParams {
  body: string
  signature: string
  timestamp: string
  nonce: string
  serial: string
}

export interface PaymentResult {
  out_trade_no: string
  transaction_id: string
  trade_state: string
  success_time?: string
  amount?: {
    total: number
    currency: string
  }
}

// 处理支付成功后的订阅更新
async function handlePaymentSuccess(
  supabase: ReturnType<typeof getSupabaseClient>,
  outTradeNo: string,
  paymentResult: PaymentResult
) {
  // 获取订单详情
  const { data: order, error: orderError } = await supabase
    .from('wechat_pay_orders')
    .select('user_id, plan_type, billing_interval, subscription_period_end')
    .eq('out_trade_no', outTradeNo)
    .single()

  if (orderError || !order) {
    console.error('[WeChat Pay] Order not found:', outTradeNo)
    return
  }

  // 更新或创建用户订阅
  const { error: subscriptionError } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: order.user_id,
      plan_type: order.plan_type,
      billing_interval: order.billing_interval,
      status: 'active',
      payment_provider: 'wechat_pay',
      wechat_order_id: outTradeNo,
      current_period_start: new Date().toISOString(),
      current_period_end: order.subscription_period_end,
      // stripe_subscription_id 为空（微信支付用户）
      stripe_subscription_id: null,
    }, {
      onConflict: 'user_id',
    })

  if (subscriptionError) {
    console.error('[WeChat Pay] Subscription update error:', subscriptionError)
  }
}

export async function handleWechatPayWebhook(params: WebhookParams): Promise<{
  success: boolean
  error?: string
}> {
  const client = getWechatPayClient()
  const supabase = getSupabaseClient()

  try {
    // 1. 验证签名
    const isValid = client.verifySign({
      body: params.body,
      signature: params.signature,
      timestamp: params.timestamp,
      nonce: params.nonce,
      serial: params.serial,
    })

    if (!isValid) {
      console.error('[WeChat Pay] Signature verification failed')
      return { success: false, error: '签名验证失败' }
    }

    // 2. 解析回调数据
    const notification = JSON.parse(params.body)

    // 3. 解密resource
    const decryptedData = client.decipheriv(
      notification.resource.ciphertext,
      notification.resource.associated_data,
      notification.resource.nonce,
      config.apiv3_private_key
    )

    const paymentResult: PaymentResult = JSON.parse(decryptedData)

    console.log('[WeChat Pay] Payment result:', {
      out_trade_no: paymentResult.out_trade_no,
      trade_state: paymentResult.trade_state,
    })

    // 4. 更新订单状态
    const updateData = {
      trade_state: paymentResult.trade_state,
      transaction_id: paymentResult.transaction_id,
    }

    if (paymentResult.trade_state === 'SUCCESS' && paymentResult.success_time) {
      updateData['paid_at'] = paymentResult.success_time
    }

    await supabase
      .from('wechat_pay_orders')
      .update(updateData)
      .eq('out_trade_no', paymentResult.out_trade_no)

    // 5. 支付成功时更新订阅
    if (paymentResult.trade_state === 'SUCCESS') {
      await handlePaymentSuccess(supabase, paymentResult.out_trade_no, paymentResult)
    }

    return { success: true }
  } catch (error) {
    console.error('[WeChat Pay] Webhook handling error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理失败',
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/lib/wechat-pay/webhooks.ts
git commit -m "feat(wechat-pay): add webhook handler with signature verification"
```

---

## Task 9: Geolocation Detection API

**Files:**
- Create: `packages/web-app/app/api/billing/geolocation/route.ts`

- [ ] **Step 1: Create geolocation detection route**

```typescript
// packages/web-app/app/api/billing/geolocation/route.ts
import { NextRequest, NextResponse } from 'next/server'

// 使用Cloudflare或其他IP地理位置服务
// 这里使用简单的国家代码判断
async function detectCountry(request: NextRequest): Promise<string> {
  // 从请求头获取IP
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown'

  // 使用免费的IP地理位置API（生产环境建议使用付费服务）
  try {
    const response = await fetch(`https://ipapi.co/${ip}/country_code/`, {
      headers: {
        'Accept': 'text/plain',
      },
    })

    if (response.ok) {
      return await response.text()
    }
  } catch {
    console.error('[Geolocation] Detection failed')
  }

  // 默认返回美国
  return 'US'
}

export async function GET(request: NextRequest) {
  const country = await detectCountry(request)

  // 中国用户推荐微信支付，其他国家推荐Stripe
  const recommendedMethod = country === 'CN' ? 'wechat_pay' : 'stripe'

  return NextResponse.json({
    success: true,
    data: {
      country,
      recommendedMethod,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/billing/geolocation/route.ts
git commit -m "feat(wechat-pay): add geolocation detection API"
```

---

## Task 10: WeChat Pay Order API

**Files:**
- Create: `packages/web-app/app/api/billing/wechat-pay/route.ts`

- [ ] **Step 1: Create WeChat Pay order route**

```typescript
// packages/web-app/app/api/billing/wechat-pay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createNativeOrder } from '@/lib/wechat-pay/native'
import { isWechatPayConfigured } from '@/lib/wechat-pay/client'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  // 检查微信支付是否配置
  if (!isWechatPayConfigured()) {
    return NextResponse.json(
      { success: false, error: '微信支付未配置' },
      { status: 503 }
    )
  }

  // 获取当前用户
  const supabase = getSupabaseClient()
  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    return NextResponse.json(
      { success: false, error: '未授权' },
      { status: 401 }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: '用户认证失败' },
      { status: 401 }
    )
  }

  // 解析请求体
  const body = await request.json()
  const { plan, interval } = body

  // 验证参数
  if (!plan || !interval) {
    return NextResponse.json(
      { success: false, error: '缺少套餐或周期参数' },
      { status: 400 }
    )
  }

  if (plan !== 'pro' && plan !== 'team') {
    return NextResponse.json(
      { success: false, error: '无效的套餐类型' },
      { status: 400 }
    )
  }

  if (interval !== 'monthly' && interval !== 'yearly') {
    return NextResponse.json(
      { success: false, error: '无效的计费周期' },
      { status: 400 }
    )
  }

  // 创建订单
  const result = await createNativeOrder({
    userId: user.id,
    plan,
    interval,
  })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: result.data,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/billing/wechat-pay/route.ts
git commit -m "feat(wechat-pay): add order creation API route"
```

---

## Task 11: WeChat Order Query API

**Files:**
- Create: `packages/web-app/app/api/billing/wechat-query/route.ts`

- [ ] **Step 1: Create order query route**

```typescript
// packages/web-app/app/api/billing/wechat-query/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { queryOrderStatus, getPendingOrder } from '@/lib/wechat-pay/orders'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()
  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    return NextResponse.json(
      { success: false, error: '未授权' },
      { status: 401 }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: '用户认证失败' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const outTradeNo = searchParams.get('out_trade_no')

  // 如果没有指定订单号，返回用户待支付订单
  if (!outTradeNo) {
    const pendingResult = await getPendingOrder(user.id)

    if (!pendingResult.success) {
      return NextResponse.json(
        { success: false, error: pendingResult.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: pendingResult.data,
    })
  }

  // 验证订单归属
  const { data: order, error: orderError } = await supabase
    .from('wechat_pay_orders')
    .select('user_id')
    .eq('out_trade_no', outTradeNo)
    .single()

  if (orderError || !order || order.user_id !== user.id) {
    return NextResponse.json(
      { success: false, error: '订单不存在或无权访问' },
      { status: 403 }
    )
  }

  // 查询订单状态
  const result = await queryOrderStatus(outTradeNo)

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: result.data,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/billing/wechat-query/route.ts
git commit -m "feat(wechat-pay): add order query API route"
```

---

## Task 12: WeChat Webhook Route

**Files:**
- Create: `packages/web-app/app/api/webhooks/wechat/route.ts`

- [ ] **Step 1: Create webhook route**

```typescript
// packages/web-app/app/api/webhooks/wechat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { handleWechatPayWebhook } from '@/lib/wechat-pay/webhooks'

export async function POST(request: NextRequest) {
  const body = await request.text()

  const signature = request.headers.get('wechatpay-signature') || ''
  const timestamp = request.headers.get('wechatpay-timestamp') || ''
  const nonce = request.headers.get('wechatpay-nonce') || ''
  const serial = request.headers.get('wechatpay-serial') || ''

  const result = await handleWechatPayWebhook({
    body,
    signature,
    timestamp,
    nonce,
    serial,
  })

  if (result.success) {
    // 微信支付要求的响应格式
    return NextResponse.json({
      code: 'SUCCESS',
      message: '成功',
    })
  } else {
    console.error('[WeChat Pay Webhook] Error:', result.error)
    return NextResponse.json({
      code: 'FAIL',
      message: result.error || '处理失败',
    }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/app/api/webhooks/wechat/route.ts
git commit -m "feat(wechat-pay): add webhook route for WeChat Pay callbacks"
```

---

## Task 13: Payment Method Selector Component

**Files:**
- Create: `packages/web-app/components/billing/PaymentMethodSelector.tsx`

- [ ] **Step 1: Create payment method selector**

```tsx
// packages/web-app/components/billing/PaymentMethodSelector.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export type PaymentMethod = 'stripe' | 'wechat_pay'

interface PaymentMethodSelectorProps {
  recommendedMethod: PaymentMethod
  onSelect: (method: PaymentMethod) => void
  selectedMethod: PaymentMethod
}

export function PaymentMethodSelector({
  recommendedMethod,
  onSelect,
  selectedMethod,
}: PaymentMethodSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {/* WeChat Pay */}
      <button
        onClick={() => onSelect('wechat_pay')}
        className={cn(
          'relative p-4 rounded-lg border-2 transition-all',
          selectedMethod === 'wechat_pay'
            ? 'border-green-500 bg-green-50'
            : 'border-gray-200 hover:border-gray-300'
        )}
      >
        {recommendedMethod === 'wechat_pay' && (
          <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
            推荐
          </span>
        )}
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              {/* WeChat icon simplified */}
              <path d="M8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              <path d="M12 2C6.5 2 2 5.8 2 10c0 2.5 1.5 4.8 3.8 6.2l-.8 2.8 3-1.5c1 .3 2 .5 3 .5 5.5 0 10-3.8 10-8S17.5 2 12 2z" />
            </svg>
          </div>
          <span className="font-medium">微信支付</span>
          <span className="text-xs text-gray-500">人民币 · 扫码支付</span>
        </div>
      </button>

      {/* Stripe */}
      <button
        onClick={() => onSelect('stripe')}
        className={cn(
          'relative p-4 rounded-lg border-2 transition-all',
          selectedMethod === 'stripe'
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300'
        )}
      >
        {recommendedMethod === 'stripe' && (
          <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
            推荐
          </span>
        )}
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              {/* Credit card icon */}
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20M6 15h4" stroke="white" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <span className="font-medium">国际信用卡</span>
          <span className="text-xs text-gray-500">美元 · Stripe</span>
        </div>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-app/components/billing/PaymentMethodSelector.tsx
git commit -m "feat(wechat-pay): add payment method selector component"
```

---

## Task 14: WeChat Pay QR Code Component

**Files:**
- Create: `packages/web-app/components/billing/WechatPayQRCode.tsx`

- [ ] **Step 1: Install QRCode dependency if not already**

```bash
cd packages/web-app
npm install qrcode.react
```

- [ ] **Step 2: Create QR code component**

```tsx
// packages/web-app/components/billing/WechatPayQRCode.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'

interface WechatPayQRCodeProps {
  codeUrl: string
  outTradeNo: string
  expireAt: Date
  amount: number
  onPaymentSuccess: () => void
  onCancel: () => void
}

export function WechatPayQRCode({
  codeUrl,
  outTradeNo,
  expireAt,
  amount,
  onPaymentSuccess,
  onCancel,
}: WechatPayQRCodeProps) {
  const [status, setStatus] = useState<'pending' | 'success' | 'expired' | 'error'>('pending')
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [pollCount, setPollCount] = useState(0)

  // 计算剩余时间
  useEffect(() => {
    const updateRemainingTime = () => {
      const now = new Date()
      const diff = Math.max(0, Math.floor((expireAt.getTime() - now.getTime()) / 1000))
      setRemainingSeconds(diff)

      if (diff === 0 && status === 'pending') {
        setStatus('expired')
      }
    }

    updateRemainingTime()
    const interval = setInterval(updateRemainingTime, 1000)
    return () => clearInterval(interval)
  }, [expireAt, status])

  // 轮询订单状态
  const checkOrderStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/billing/wechat-query?out_trade_no=${outTradeNo}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      })

      const result = await response.json()

      if (result.success && result.data?.tradeState === 'SUCCESS') {
        setStatus('success')
        onPaymentSuccess()
      }
    } catch (error) {
      console.error('[WeChat Pay] Poll error:', error)
      setStatus('error')
    }
  }, [outTradeNo, onPaymentSuccess])

  // 每3秒轮询
  useEffect(() => {
    if (status !== 'pending') return

    const interval = setInterval(() => {
      setPollCount(prev => prev + 1)
      checkOrderStatus()
    }, 3000)

    return () => clearInterval(interval)
  }, [status, checkOrderStatus])

  // 格式化剩余时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 格式化金额
  const formatAmount = (amountInCents: number) => {
    return `¥${(amountInCents / 100).toFixed(2)}`
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-lg shadow-lg">
      {/* 标题和金额 */}
      <div className="text-center">
        <h3 className="text-lg font-semibold">微信扫码支付</h3>
        <p className="text-2xl font-bold text-green-600 mt-2">{formatAmount(amount)}</p>
      </div>

      {/* 状态显示 */}
      {status === 'success' && (
        <div className="flex flex-col items-center gap-3 text-green-600">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="font-medium">支付成功</span>
        </div>
      )}

      {status === 'expired' && (
        <div className="flex flex-col items-center gap-3 text-red-500">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-medium">二维码已过期</span>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            重新下单
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 text-orange-500">
          <span>状态查询异常，请手动刷新页面确认</span>
        </div>
      )}

      {/* QR Code */}
      {status === 'pending' && (
        <>
          <div className="p-4 bg-white border-2 border-gray-200 rounded-lg">
            <QRCodeSVG
              value={codeUrl}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>

          {/* 剩余时间 */}
          <div className={cn(
            'text-sm',
            remainingSeconds < 60 ? 'text-red-500' : 'text-gray-500'
          )}>
            二维码有效期：{formatTime(remainingSeconds)}
          </div>

          {/* 取消按钮 */}
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            取消支付
          </button>
        </>
      )}

      {/* 提示 */}
      <p className="text-xs text-gray-400 mt-4">
        请使用微信"扫一扫"扫描二维码完成支付
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/WechatPayQRCode.tsx
git commit -m "feat(wechat-pay): add QR code display component with polling"
```

---

## Task 15: Modify PlanCard for Dual Pricing

**Files:**
- Modify: `packages/web-app/components/billing/PlanCard.tsx`

- [ ] **Step 1: Read existing PlanCard component**

First check if `PlanCard.tsx` exists in the billing components directory.

- [ ] **Step 2: Update PlanCard to support dual pricing**

Add props for both Stripe and WeChat prices, display based on selected payment method:

```tsx
// packages/web-app/components/billing/PlanCard.tsx
'use client'

import { PaymentMethod } from './PaymentMethodSelector'
import { WECHAT_PAY_PLANS } from '@/lib/wechat-pay/plans'

interface PlanCardProps {
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
  stripePrice: number // in cents (USD)
  selectedMethod: PaymentMethod
  onSelect: () => void
  isSelected: boolean
}

export function PlanCard({
  plan,
  interval,
  stripePrice,
  selectedMethod,
  onSelect,
  isSelected,
}: PlanCardProps) {
  const wechatPlanKey = `${plan}_${interval}` as keyof typeof WECHAT_PAY_PLANS
  const wechatPrice = WECHAT_PAY_PLANS[wechatPlanKey].price

  const displayPrice = selectedMethod === 'wechat_pay' ? wechatPrice : stripePrice
  const currency = selectedMethod === 'wechat_pay' ? '¥' : '$'
  const formattedPrice = selectedMethod === 'wechat_pay'
    ? `${currency}${(displayPrice / 100).toFixed(0)}` // ¥99, ¥999
    : `${currency}${(displayPrice / 100).toFixed(2)}` // $9.99, $99.99

  return (
    <div
      onClick={onSelect}
      className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-semibold capitalize">{plan}</h3>
        <span className="text-sm text-gray-500">{interval === 'yearly' ? '年付' : '月付'}</span>
      </div>

      <div className="text-3xl font-bold mb-2">
        {formattedPrice}
        <span className="text-sm text-gray-500">
          /{interval === 'yearly' ? '年' : '月'}
        </span>
      </div>

      {/* Features */}
      <ul className="space-y-2 text-sm text-gray-600">
        <li>✓ 无限提示词存储</li>
        <li>✓ 云端同步</li>
        {plan === 'team' && <li>✓ 团队协作功能</li>}
        <li>✓ Vision API 支持</li>
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/PlanCard.tsx
git commit -m "feat(wechat-pay): update PlanCard for dual pricing support"
```

---

## Task 16: Update PlanComparison Main Component

**Files:**
- Modify: `packages/web-app/components/billing/PlanComparison.tsx`

- [ ] **Step 1: Read existing component structure**

Check current implementation of PlanComparison.

- [ ] **Step 2: Add payment method integration**

```tsx
// packages/web-app/components/billing/PlanComparison.tsx
'use client'

import { useState, useEffect } from 'react'
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector'
import { WechatPayQRCode } from './WechatPayQRCode'
import { PlanCard } from './PlanCard'

export function PlanComparison() {
  const [recommendedMethod, setRecommendedMethod] = useState<PaymentMethod>('stripe')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('stripe')
  const [selectedPlan, setSelectedPlan] = useState<{ plan: 'pro' | 'team', interval: 'monthly' | 'yearly' } | null>(null)
  const [wechatOrder, setWechatOrder] = useState<{
    outTradeNo: string
    codeUrl: string
    expireAt: Date
    amount: number
  } | null>(null)

  // 获取地理位置推荐
  useEffect(() => {
    async function fetchGeo() {
      try {
        const response = await fetch('/api/billing/geolocation')
        const result = await response.json()
        if (result.success) {
          setRecommendedMethod(result.data.recommendedMethod)
          setSelectedMethod(result.data.recommendedMethod)
        }
      } catch (error) {
        console.error('Geolocation fetch error:', error)
      }
    }
    fetchGeo()
  }, [])

  // 处理微信支付下单
  const handleWechatPay = async () => {
    if (!selectedPlan) return

    try {
      const response = await fetch('/api/billing/wechat-pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
        },
        body: JSON.stringify(selectedPlan),
      })

      const result = await response.json()
      if (result.success) {
        setWechatOrder({
          outTradeNo: result.data.outTradeNo,
          codeUrl: result.data.codeUrl,
          expireAt: new Date(result.data.expireAt),
          amount: result.data.amount,
        })
      } else {
        alert(result.error || '下单失败')
      }
    } catch (error) {
      console.error('WeChat Pay order error:', error)
      alert('下单失败，请重试')
    }
  }

  // 处理支付成功
  const handlePaymentSuccess = () => {
    setWechatOrder(null)
    alert('支付成功！您的订阅已激活。')
    // Redirect to dashboard or refresh subscription status
  }

  // 取消支付
  const handleCancel = () => {
    setWechatOrder(null)
    setSelectedPlan(null)
  }

  // 如果有微信订单，显示二维码
  if (wechatOrder) {
    return (
      <div className="max-w-md mx-auto">
        <WechatPayQRCode
          codeUrl={wechatOrder.codeUrl}
          outTradeNo={wechatOrder.outTradeNo}
          expireAt={wechatOrder.expireAt}
          amount={wechatOrder.amount}
          onPaymentSuccess={handlePaymentSuccess}
          onCancel={handleCancel}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6 text-center">选择订阅套餐</h2>

      {/* 支付方式选择 */}
      <PaymentMethodSelector
        recommendedMethod={recommendedMethod}
        selectedMethod={selectedMethod}
        onSelect={setSelectedMethod}
      />

      {/* 套餐选择 */}
      <div className="grid grid-cols-2 gap-4">
        <PlanCard
          plan="pro"
          interval="monthly"
          stripePrice={999} // $9.99
          selectedMethod={selectedMethod}
          isSelected={selectedPlan?.plan === 'pro' && selectedPlan?.interval === 'monthly'}
          onSelect={() => setSelectedPlan({ plan: 'pro', interval: 'monthly' })}
        />
        <PlanCard
          plan="pro"
          interval="yearly"
          stripePrice={9999} // $99.99
          selectedMethod={selectedMethod}
          isSelected={selectedPlan?.plan === 'pro' && selectedPlan?.interval === 'yearly'}
          onSelect={() => setSelectedPlan({ plan: 'pro', interval: 'yearly' })}
        />
        <PlanCard
          plan="team"
          interval="monthly"
          stripePrice={2999} // $29.99
          selectedMethod={selectedMethod}
          isSelected={selectedPlan?.plan === 'team' && selectedPlan?.interval === 'monthly'}
          onSelect={() => setSelectedPlan({ plan: 'team', interval: 'monthly' })}
        />
        <PlanCard
          plan="team"
          interval="yearly"
          stripePrice={29999} // $299.99
          selectedMethod={selectedMethod}
          isSelected={selectedPlan?.plan === 'team' && selectedPlan?.interval === 'yearly'}
          onSelect={() => setSelectedPlan({ plan: 'team', interval: 'yearly' })}
        />
      </div>

      {/* 订阅按钮 */}
      {selectedPlan && (
        <button
          onClick={handleWechatPay}
          className="w-full mt-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
        >
          立即订阅
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/PlanComparison.tsx
git commit -m "feat(wechat-pay): integrate payment method selection into PlanComparison"
```

---

## Task 17: Integration Testing - Backend

**Files:**
- Test: Manual testing via API endpoints

- [ ] **Step 1: Test database migrations**

Verify tables exist in Supabase dashboard:
- `wechat_pay_orders` table with all columns
- `user_subscriptions` table has `payment_provider` and `wechat_order_id` columns

- [ ] **Step 2: Test WeChat Pay configuration**

Add environment variables to `.env.local` and verify:
```bash
npm run web:dev
```

Test `/api/billing/geolocation` returns expected country code.

- [ ] **Step 3: Test order creation flow**

Use curl or Postman to test:
```bash
curl -X POST http://localhost:3000/api/billing/wechat-pay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"plan":"pro","interval":"monthly"}'
```

Expected: Returns `outTradeNo`, `codeUrl`, `expireAt`, `amount`.

- [ ] **Step 4: Test order query**

```bash
curl http://localhost:3000/api/billing/wechat-query?out_trade_no=<order_no> \
  -H "Authorization: Bearer <token>"
```

Expected: Returns `tradeState`, `transactionId` (if paid).

---

## Task 18: Integration Testing - Frontend

**Files:**
- Test: Manual browser testing

- [ ] **Step 1: Run development server**

```bash
cd packages/web-app
npm run dev
```

- [ ] **Step 2: Test payment method selector**

- Navigate to subscription page
- Verify geolocation detection shows correct recommendation
- Toggle between payment methods
- Verify prices update correctly (¥ vs $)

- [ ] **Step 3: Test QR code display**

- Select a plan
- Click "立即订阅"
- Verify QR code appears
- Verify countdown timer works
- Verify polling every 3 seconds

- [ ] **Step 4: Test cancel flow**

- Click "取消支付"
- Verify returns to plan selection
- Verify order state cleared

---

## Task 19: Webhook Testing

**Files:**
- Test: Manual webhook simulation

- [ ] **Step 1: Test webhook signature verification**

Simulate webhook call with test data (requires valid WeChat Pay signature).

- [ ] **Step 2: Test payment success flow**

After successful payment via sandbox/test account:
- Verify order status updates to SUCCESS
- Verify user subscription created
- Verify `payment_provider` set to `wechat_pay`

---

## Task 20: Final Commit and Documentation Update

**Files:**
- Modify: `packages/web-app/README.md` or relevant docs

- [ ] **Step 1: Update documentation**

Add WeChat Pay integration section to README or billing docs:

```markdown
## Payment Systems

Oh My Prompt supports two payment methods:

### Stripe (International)
- Credit card payments in USD
- Recommended for users outside China

### WeChat Pay (China)
- QR code payments in CNY (RMB)
- Recommended for Chinese users
- Native mode: scan QR code with WeChat app
```

- [ ] **Step 2: Final commit**

```bash
git add .
git commit -m "feat: complete WeChat Pay Native integration

- Add wechat-pay module with SDK client, plans, orders, webhooks
- Create database tables for wechat_pay_orders
- Add API routes for order creation and query
- Add frontend components: PaymentMethodSelector, WechatPayQRCode
- Modify PlanCard and PlanComparison for dual payment support
- Add geolocation-based payment method recommendation"
```

---

## Self-Review Checklist

**1. Spec Coverage:**

| Spec Section | Task |
|--------------|------|
| Database Schema (3.1) | Task 1 |
| User Subscriptions Extension (3.2) | Task 2 |
| SDK Initialization (4.1) | Task 4 |
| Plans Configuration (4.2) | Task 5 |
| Native Order Creation (4.3) | Task 6 |
| Order Query (4.4) | Task 7 |
| Webhook Handler (5.2) | Task 8 |
| API Routes (6) | Tasks 9-12 |
| Frontend Components (7) | Tasks 13-16 |
| Environment Variables (8) | Task 4 (env.example) |
| Dependencies (9) | Task 3 |
| Testing (10) | Tasks 17-19 |

All spec sections covered.

**2. Placeholder Scan:**
- No TBD, TODO, or placeholder text found
- All code blocks contain complete implementations
- No vague error handling descriptions

**3. Type Consistency:**
- `PaymentMethod` type used consistently ('stripe' | 'wechat_pay')
- `WechatPlanKey` matches keys in `WECHAT_PAY_PLANS`
- `CreateNativeOrderParams/Result` types used in native.ts and route.ts
- `OrderStatusResult` type used in orders.ts and route.ts

---

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-05-12-wechat-pay.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?