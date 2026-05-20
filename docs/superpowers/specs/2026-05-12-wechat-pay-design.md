# 微信支付接入设计文档

> 创建日期：2026-05-12

## 1. 概述

为Oh My Prompt Web App接入微信支付Native模式，与现有Stripe支付系统并行运行，为国内用户提供人民币计价的扫码支付方案。

### 1.1 核心需求

| 需求项 | 决策 |
|--------|------|
| 支付系统定位 | 双支付系统（保留Stripe + 新增微信支付） |
| 支付方式选择 | 自动推荐（基于地理位置） + 用户手动选择 |
| 套餐范围 | 微信支付支持全部4个套餐（Pro/Team，月付/年付） |
| 价格策略 | 独立定价（人民币计价，不依赖汇率） |

### 1.2 微信支付Native模式流程

1. 商户下单获取二维码链接`code_url`
2. 前端将`code_url`转换为二维码展示给用户
3. 用户使用微信"扫一扫"扫码支付
4. 微信支付成功后回调商户服务器
5. 商户服务器更新订单状态和订阅信息

---

## 2. 整体架构

```
packages/web-app/
├── lib/
│   ├── stripe/              # 现有Stripe模块（保持不变）
│   │   ├── client.ts
│   │   ├── checkout.ts
│   │   └── webhooks.ts
│   │   └── index.ts
│   │
│   └── wechat-pay/          # 新增微信支付模块
│       ├── client.ts        # 微信支付SDK初始化
│       ├── native.ts        # Native支付下单
│       ├── orders.ts        # 订单查询与关闭
│       ├── webhooks.ts      # 微信支付回调处理
│       ├── plans.ts         # 套餐价格配置（人民币）
│       └── index.ts         # 模块导出
│
├── app/api/
│   ├── billing/
│   │   ├── subscribe/route.ts     # Stripe订阅（不变）
│   │   ├── wechat-pay/route.ts    # 微信支付下单
│   │   ├── wechat-query/route.ts  # 微信订单状态查询
│   │   ├── status/route.ts        # 订阅状态查询（不变）
│   │   └── geolocation/route.ts   # 地理位置检测
│   │
│   └── webhooks/
│       ├── stripe/route.ts        # Stripe回调（不变）
│       └── wechat/route.ts        # 微信支付回调
│
├── components/billing/
│   ├── PlanCard.tsx               # 套餐卡片（修改）
│   ├── PaymentMethodSelector.tsx  # 支付方式选择
│   ├── WechatPayQRCode.tsx        # 微信支付二维码
│   └── PlanComparison.tsx         # 订阅页面主组件
│
└── supabase/migrations/
    └── 002_wechat_pay_orders.sql  # 微信订单表
    └── 003_user_subscriptions_provider.sql  # 支付来源字段
```

---

## 3. 数据库Schema

### 3.1 微信订单表

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

### 3.2 用户订阅表扩展

```sql
-- 新增支付来源字段
ALTER TABLE user_subscriptions ADD COLUMN payment_provider TEXT DEFAULT 'stripe'
  CHECK (payment_provider IN ('stripe', 'wechat_pay'));

ALTER TABLE user_subscriptions ADD COLUMN wechat_order_id TEXT;

-- 允许stripe_subscription_id为空（微信支付用户无此字段）
ALTER TABLE user_subscriptions ALTER COLUMN stripe_subscription_id DROP NOT NULL;
```

---

## 4. 微信支付模块

### 4.1 SDK初始化（client.ts）

```typescript
import Wechatpay from 'wechatpay-node-v3-ts'

interface WechatPayConfig {
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
```

### 4.2 套餐价格配置（plans.ts）

```typescript
// 微信支付套餐价格（人民币，单位：分）
export const WECHAT_PAY_PLANS = {
  pro_monthly: {
    price: 9900,       // ¥99/月
    description: 'Oh My Prompt Pro 月付套餐',
  },
  pro_yearly: {
    price: 99900,      // ¥999/年
    description: 'Oh My Prompt Pro 年付套餐',
  },
  team_monthly: {
    price: 29900,      // ¥299/月
    description: 'Oh My Prompt Team 月付套餐',
  },
  team_yearly: {
    price: 299900,     // ¥2999/年
    description: 'Oh My Prompt Team 年付套餐',
  },
}

// 订单号生成
export function generateOutTradeNo(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomUUID().slice(0, 8)
  return `OMP-${timestamp}-${random}`
}
```

### 4.3 Native支付下单（native.ts）

```typescript
import { getWechatPayClient, config } from './client'

export async function createNativeOrder(params: {
  userId: string
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
}): Promise<{
  outTradeNo: string
  codeUrl: string
  expireAt: Date
} | { error: string }> {

  const { userId, plan, interval } = params
  const planKey = `${plan}_${interval}` as keyof typeof WECHAT_PAY_PLANS
  const planConfig = WECHAT_PAY_PLANS[planKey]

  const outTradeNo = generateOutTradeNo()
  const client = getWechatPayClient()

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
  })

  // 保存订单到数据库
  const expireAt = new Date(Date.now() + 2 * 60 * 60 * 1000)

  await supabase.from('wechat_pay_orders').insert({
    user_id: userId,
    out_trade_no: outTradeNo,
    code_url: result.code_url,
    plan_type: plan,
    billing_interval: interval,
    amount: planConfig.price,
    trade_state: 'NOTPAY',
    expire_at: expireAt.toISOString(),
  })

  return { outTradeNo, codeUrl: result.code_url, expireAt }
}
```

### 4.4 订单查询（orders.ts）

```typescript
import { getWechatPayClient, config } from './client'

export async function queryOrderStatus(outTradeNo: string): Promise<{
  tradeState: string
  transactionId?: string
  paidAt?: Date
} | { error: string }> {

  const client = getWechatPayClient()

  const result = await client.query({
    out_trade_no: outTradeNo,
    mchid: config.mchid,
  })

  return {
    tradeState: result.trade_state,
    transactionId: result.transaction_id,
    paidAt: result.success_time ? new Date(result.success_time) : undefined,
  }
}
```

---

## 5. 回调处理

### 5.1 Webhook路由

```typescript
// app/api/webhooks/wechat/route.ts

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('wechatpay-signature')
  const timestamp = request.headers.get('wechatpay-timestamp')
  const nonce = request.headers.get('wechatpay-nonce')
  const serial = request.headers.get('wechatpay-serial')

  const result = await handleWechatPayWebhook({
    body, signature, timestamp, nonce, serial
  })

  if (result.success) {
    return NextResponse.json({ code: 'SUCCESS', message: '成功' })
  } else {
    return NextResponse.json({ code: 'FAIL', message: result.error }, { status: 500 })
  }
}
```

### 5.2 回调处理逻辑（webhooks.ts）

```typescript
export async function handleWechatPayWebhook(params: WebhookParams) {
  // 1. 验证签名
  const client = getWechatPayClient()
  const isValid = client.verifySign(params)

  if (!isValid) {
    return { success: false, error: '签名验证失败' }
  }

  // 2. 解密回调数据
  const notification = JSON.parse(params.body)
  const decryptedData = decryptResource({
    ciphertext: notification.resource.ciphertext,
    associated_data: notification.resource.associated_data,
    nonce: notification.resource.nonce,
    key: process.env.WECHAT_PAY_APIV3_KEY!,
  })

  const paymentResult = JSON.parse(decryptedData)

  // 3. 更新订单状态
  await supabase.from('wechat_pay_orders')
    .update({
      trade_state: paymentResult.trade_state,
      transaction_id: paymentResult.transaction_id,
      paid_at: paymentResult.trade_state === 'SUCCESS' ? new Date().toISOString() : null,
    })
    .eq('out_trade_no', paymentResult.out_trade_no)

  // 4. 支付成功时更新订阅
  if (paymentResult.trade_state === 'SUCCESS') {
    await handlePaymentSuccess(supabase, paymentResult.out_trade_no, paymentResult)
  }

  return { success: true }
}
```

---

## 6. API路由

### 6.1 微信支付下单

- **路径**: `POST /api/billing/wechat-pay`
- **请求**: `{ plan: 'pro' | 'team', interval: 'monthly' | 'yearly' }`
- **响应**: `{ success: true, data: { outTradeNo, codeUrl, expireAt } }`

### 6.2 订单状态查询

- **路径**: `GET /api/billing/wechat-query?out_trade_no={订单号}`
- **响应**: `{ success: true, data: { tradeState, transactionId?, paidAt? } }`

### 6.3 地理位置检测

- **路径**: `GET /api/geolocation`
- **响应**: `{ success: true, data: { country, recommendedMethod } }`

---

## 7. 前端组件

### 7.1 支付方式选择器（PaymentMethodSelector）

显示两个选项卡片：
- 微信支付：人民币计价 · 扫码支付
- Stripe：美元计价 · 国际信用卡

### 7.2 微信支付二维码（WechatPayQRCode）

功能：
- QRCode组件渲染`code_url`
- 显示二维码剩余有效期
- 每3秒轮询订单状态
- 支付成功/过期状态展示
- 取消支付按钮

### 7.3 套餐卡片（PlanCard）修改

- 支持双价格显示（`{ stripe: number, wechat: number }`）
- 集成支付方式选择器
- 根据选中支付方式显示对应价格和单位
- 微信支付时展示二维码组件

### 7.4 订阅页面主组件（PlanComparison）

- 获取地理位置推荐
- 传递`recommendedMethod`到PlanCard
- 处理Stripe/微信支付调用

---

## 8. 环境变量配置

```env
# 微信支付配置（新增）
WECHAT_PAY_APPID=wx1234567890abcdef
WECHAT_PAY_MCHID=1234567890
WECHAT_PAY_SERIAL_NO=1234567890ABCDEF1234567890ABCDEF12345678
WECHAT_PAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
WECHAT_PAY_APIV3_KEY=your_apiv3_key_32_chars
```

---

## 9. 依赖安装

```bash
npm install wechatpay-node-v3-ts qrcode.react
```

---

## 10. 测试要点

### 10.1 功能测试

1. 微信支付下单成功生成二维码
2. 二维码轮询正确检测支付状态
3. 支付成功后订阅状态正确更新
4. 二维码过期处理正确
5. 支付方式切换价格正确显示

### 10.2 安全测试

1. Webhook签名验证拒绝伪造请求
2. 订单归属验证防止跨用户查询
3. 价格配置不可被前端篡改

### 10.3 边界测试

1. 重复下单处理（订单号唯一约束）
2. 并发支付处理（订单状态锁）
3. 网络异常重试机制