# Phase 4: Commercial Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stripe billing, subscription management, and AI prompt optimization for Pro/Team plans.

**Architecture:** Stripe Checkout for subscription payments, webhooks for subscription status updates, Supabase for subscription data, API routes for billing operations, AI optimization via Claude API.

**Tech Stack:** Stripe SDK, Supabase RLS policies, Next.js API routes, Claude API for AI optimization

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `packages/web-app/lib/stripe/client.ts` | Stripe SDK initialization |
| `packages/web-app/lib/stripe/checkout.ts` | Checkout session creation |
| `packages/web-app/lib/stripe/webhooks.ts` | Webhook handlers for subscription events |
| `packages/web-app/app/api/billing/subscribe/route.ts` | POST endpoint to create subscription |
| `packages/web-app/app/api/billing/cancel/route.ts` | POST endpoint to cancel subscription |
| `packages/web-app/app/api/billing/status/route.ts` | GET endpoint for subscription status |
| `packages/web-app/app/api/prompts/[id]/optimize/route.ts` | POST endpoint for AI optimization |
| `packages/web-app/app/dashboard/billing/page.tsx` | Billing management UI |
| `packages/web-app/components/billing/PlanCard.tsx` | Plan selection card |
| `packages/web-app/components/billing/SubscriptionStatus.tsx` | Active subscription display |
| `packages/web-app/supabase/migrations/002_stripe_integration.sql` | Stripe customer ID, optimization quota tracking |
| `packages/extension/src/lib/cloud-sync/subscription-service.ts` | Extension subscription check |

### Modified Files

| File | Purpose |
|------|---------|
| `packages/web-app/app/page.tsx` | Update pricing buttons to link to billing flow |
| `packages/web-app/app/dashboard/layout.tsx` | Add billing menu item |
| `packages/shared/types/auth.ts` | Add subscription details to CloudAuthState |

---

## Task 1: Database Schema for Stripe Integration

**Files:**
- Create: `packages/web-app/supabase/migrations/002_stripe_integration.sql`
- Test: Query via Supabase MCP tools after migration

- [ ] **Step 1: Write migration SQL for Stripe customer and optimization tracking**

```sql
-- Add Stripe customer ID to user_subscriptions
ALTER TABLE user_subscriptions 
ADD COLUMN stripe_customer_id TEXT UNIQUE;

-- Add optimization quota tracking
ALTER TABLE user_subscriptions
ADD COLUMN optimization_quota_used INTEGER DEFAULT 0,
ADD COLUMN optimization_quota_reset_at TIMESTAMP WITH TIME ZONE;

-- Create optimization_logs table for tracking AI usage
CREATE TABLE optimization_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  prompt_id UUID REFERENCES prompts ON DELETE SET NULL,
  original_content TEXT NOT NULL,
  optimized_content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on optimization_logs
ALTER TABLE optimization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own optimization logs"
  ON optimization_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own optimization logs"
  ON optimization_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index for optimization logs
CREATE INDEX idx_optimization_logs_user_id ON optimization_logs(user_id);
CREATE INDEX idx_optimization_logs_created_at ON optimization_logs(created_at);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with project_id from existing Supabase project.

- [ ] **Step 3: Verify migration applied**

Use `mcp__plugin_supabase_supabase__list_tables` to confirm new columns and table exist.

---

## Task 2: Stripe Client Setup

**Files:**
- Create: `packages/web-app/lib/stripe/client.ts`
- Create: `packages/web-app/lib/stripe/index.ts`

- [ ] **Step 1: Create Stripe client initialization**

```typescript
// packages/web-app/lib/stripe/client.ts
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not configured')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
})

// Stripe product IDs (configured in Stripe Dashboard)
export const STRIPE_PLANS = {
  pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
  pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID!,
  team_monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!,
  team_yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID!,
}
```

- [ ] **Step 2: Create index export**

```typescript
// packages/web-app/lib/stripe/index.ts
export { stripe, STRIPE_PLANS } from './client'
export { createCheckoutSession } from './checkout'
export { handleWebhook } from './webhooks'
```

- [ ] **Step 3: Add Stripe dependency**

```bash
npm install stripe --workspace=@oh-my-prompt/web-app
```

- [ ] **Step 4: Commit Stripe client setup**

```bash
git add packages/web-app/lib/stripe/
git add packages/web-app/package.json
git commit -m "feat(billing): add Stripe SDK client initialization"
```

---

## Task 3: Checkout Session Creation

**Files:**
- Create: `packages/web-app/lib/stripe/checkout.ts`

- [ ] **Step 1: Create checkout session helper**

```typescript
// packages/web-app/lib/stripe/checkout.ts
import { stripe, STRIPE_PLANS } from './client'
import { createServerClient } from '@/lib/supabase'

export type PlanType = 'pro' | 'team'
export type BillingInterval = 'monthly' | 'yearly'

interface CheckoutParams {
  plan: PlanType
  interval: BillingInterval
  userId: string
  email: string
}

export async function createCheckoutSession(params: CheckoutParams): Promise<{ 
  sessionId: string 
  url: string 
} | { error: string }> {
  const { plan, interval, userId, email } = params
  
  // Get price ID based on plan and interval
  const priceKey = `${plan}_${interval}` as keyof typeof STRIPE_PLANS
  const priceId = STRIPE_PLANS[priceKey]
  
  if (!priceId) {
    return { error: 'Invalid plan or interval' }
  }
  
  // Create or retrieve Stripe customer
  const existingCustomers = await stripe.customers.list({ email, limit: 1 })
  let customer = existingCustomers.data[0]
  
  if (!customer) {
    customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId }
    })
  }
  
  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price: priceId,
      quantity: 1
    }],
    success_url: `${process.env.NEXT_PUBLIC_WEB_APP_URL}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_WEB_APP_URL}/dashboard/billing?canceled=true`,
    metadata: {
      user_id: userId,
      plan_type: plan
    },
    subscription_data: {
      metadata: {
        user_id: userId,
        plan_type: plan
      }
    }
  })
  
  return {
    sessionId: session.id,
    url: session.url!
  }
}
```

- [ ] **Step 2: Commit checkout helper**

```bash
git add packages/web-app/lib/stripe/checkout.ts packages/web-app/lib/stripe/index.ts
git commit -m "feat(billing): add Stripe checkout session creation"
```

---

## Task 4: Webhook Handlers

**Files:**
- Create: `packages/web-app/lib/stripe/webhooks.ts`
- Create: `packages/web-app/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Create webhook handlers**

```typescript
// packages/web-app/lib/stripe/webhooks.ts
import type Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = await createServerClient()
  const userId = session.metadata?.user_id
  const planType = session.metadata?.plan_type
  
  if (!userId || !planType) {
    console.error('Missing metadata in checkout session')
    return
  }
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
  
  // Update user_subscriptions
  await supabase.from('user_subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer as string,
    plan_type: planType,
    status: 'active',
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
  })
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const supabase = await createServerClient()
  const userId = subscription.metadata?.user_id
  
  if (!userId) return
  
  const status = subscription.status === 'active' ? 'active' : 
                 subscription.status === 'canceled' ? 'canceled' : 'inactive'
  
  await supabase.from('user_subscriptions')
    .update({
      status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
    })
    .eq('stripe_subscription_id', subscription.id)
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = await createServerClient()
  
  await supabase.from('user_subscriptions')
    .update({
      status: 'canceled',
      plan_type: 'free'
    })
    .eq('stripe_subscription_id', subscription.id)
}

// Import stripe at the top
import { stripe } from './client'
```

- [ ] **Step 2: Create webhook API route**

```typescript
// packages/web-app/app/api/webhooks/stripe/route.ts
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { handleCheckoutComplete, handleSubscriptionUpdated, handleSubscriptionDeleted } from '@/lib/stripe/webhooks'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: Request) {
  const body = await request.text()
  const signature = headers().get('stripe-signature')!
  
  let event: Stripe.Event
  
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
    
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit webhook implementation**

```bash
git add packages/web-app/lib/stripe/webhooks.ts packages/web-app/app/api/webhooks/
git commit -m "feat(billing): add Stripe webhook handlers for subscription events"
```

---

## Task 5: Billing API Routes

**Files:**
- Create: `packages/web-app/app/api/billing/subscribe/route.ts`
- Create: `packages/web-app/app/api/billing/cancel/route.ts`
- Create: `packages/web-app/app/api/billing/status/route.ts`

- [ ] **Step 1: Create subscribe endpoint**

```typescript
// packages/web-app/app/api/billing/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createCheckoutSession, PlanType, BillingInterval } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'NOT_LOGGED_IN' }, { status: 401 })
  }
  
  const body = await request.json()
  const { plan, interval } = body as { plan: PlanType, interval: BillingInterval }
  
  if (!plan || !interval) {
    return NextResponse.json({ error: 'Missing plan or interval' }, { status: 400 })
  }
  
  const result = await createCheckoutSession({
    plan,
    interval,
    userId: user.id,
    email: user.email!
  })
  
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  
  return NextResponse.json({ 
    sessionId: result.sessionId,
    url: result.url
  })
}
```

- [ ] **Step 2: Create cancel endpoint**

```typescript
// packages/web-app/app/api/billing/cancel/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function POST() {
  const supabase = await createServerClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'NOT_LOGGED_IN' }, { status: 401 })
  }
  
  // Get subscription
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', user.id)
    .single()
  
  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }
  
  // Cancel at period end (not immediate)
  await stripe.subscriptions.update(subscription.stripe_subscription_id, {
    cancel_at_period_end: true
  })
  
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create status endpoint**

```typescript
// packages/web-app/app/api/billing/status/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createServerClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'NOT_LOGGED_IN' }, { status: 401 })
  }
  
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('plan_type, status, current_period_end, optimization_quota_used')
    .eq('user_id', user.id)
    .single()
  
  // Calculate remaining quota
  const planLimits = { free: 0, pro: 50, team: 200 }
  const planType = subscription?.plan_type || 'free'
  const quotaUsed = subscription?.optimization_quota_used || 0
  const quotaRemaining = planLimits[planType] - quotaUsed
  
  return NextResponse.json({
    plan: planType,
    status: subscription?.status || 'inactive',
    currentPeriodEnd: subscription?.current_period_end,
    optimizationQuota: {
      used: quotaUsed,
      remaining: quotaRemaining,
      limit: planLimits[planType]
    }
  })
}
```

- [ ] **Step 4: Commit billing API routes**

```bash
git add packages/web-app/app/api/billing/
git commit -m "feat(billing): add subscription API routes (subscribe, cancel, status)"
```

---

## Task 6: AI Prompt Optimization API

**Files:**
- Create: `packages/web-app/app/api/prompts/[id]/optimize/route.ts`

- [ ] **Step 1: Create optimization endpoint**

```typescript
// packages/web-app/app/api/prompts/[id]/optimize/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'NOT_LOGGED_IN' }, { status: 401 })
  }
  
  // Check subscription and quota
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('plan_type, status, optimization_quota_used')
    .eq('user_id', user.id)
    .single()
  
  const planType = subscription?.plan_type || 'free'
  const planLimits = { free: 0, pro: 50, team: 200 }
  
  if (planType === 'free') {
    return NextResponse.json({ error: 'QUOTA_EXCEEDED', message: 'AI optimization requires Pro or Team plan' }, { status: 403 })
  }
  
  if ((subscription?.optimization_quota_used || 0) >= planLimits[planType]) {
    return NextResponse.json({ error: 'QUOTA_EXCEEDED', message: 'Monthly optimization quota exceeded' }, { status: 403 })
  }
  
  // Get prompt
  const { data: prompt, error: promptError } = await supabase
    .from('prompts')
    .select('content, title')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  
  if (promptError || !prompt) {
    return NextResponse.json({ error: 'PROMPT_NOT_FOUND' }, { status: 404 })
  }
  
  // Call Claude API for optimization
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `优化以下提示词，使其更清晰、结构化、更易于AI理解。保持原始意图不变，但改进表达方式。

原始提示词：
${prompt.content}

请提供优化后的提示词，用中文回答。只输出优化后的提示词内容，不要解释。`
    }]
  })
  
  const optimizedContent = message.content[0].type === 'text' 
    ? message.content[0].text 
    : ''
  
  // Log optimization
  await supabase.from('optimization_logs').insert({
    user_id: user.id,
    prompt_id: params.id,
    original_content: prompt.content,
    optimized_content: optimizedContent
  })
  
  // Update quota
  await supabase.from('user_subscriptions')
    .update({ optimization_quota_used: (subscription?.optimization_quota_used || 0) + 1 })
    .eq('user_id', user.id)
  
  return NextResponse.json({
    success: true,
    original: prompt.content,
    optimized: optimizedContent
  })
}
```

- [ ] **Step 2: Add Anthropic SDK dependency**

```bash
npm install @anthropic-ai/sdk --workspace=@oh-my-prompt/web-app
```

- [ ] **Step 3: Commit optimization API**

```bash
git add packages/web-app/app/api/prompts/ packages/web-app/package.json
git commit -m "feat(ai): add prompt optimization API with Claude"
```

---

## Task 7: Billing Dashboard UI

**Files:**
- Create: `packages/web-app/app/dashboard/billing/page.tsx`
- Create: `packages/web-app/components/billing/PlanCard.tsx`
- Create: `packages/web-app/components/billing/SubscriptionStatus.tsx`

- [ ] **Step 1: Create PlanCard component**

```typescript
// packages/web-app/components/billing/PlanCard.tsx
'use client'

import { useState } from 'react'

interface PlanCardProps {
  plan: 'pro' | 'team'
  monthlyPrice: number
  yearlyPrice: number
  features: string[]
  currentPlan?: 'free' | 'pro' | 'team'
  onSelect: (plan: 'pro' | 'team', interval: 'monthly' | 'yearly') => void
}

export function PlanCard({ 
  plan, 
  monthlyPrice, 
  yearlyPrice, 
  features, 
  currentPlan,
  onSelect 
}: PlanCardProps) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)
  
  const price = interval === 'monthly' ? monthlyPrice : yearlyPrice
  const isCurrent = currentPlan === plan
  
  const handleSelect = async () => {
    setLoading(true)
    await onSelect(plan, interval)
    setLoading(false)
  }
  
  return (
    <div className={`p-6 rounded-xl border ${plan === 'pro' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'}`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold capitalize">{plan}</h3>
        {isCurrent && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">当前计划</span>}
      </div>
      
      <div className="mb-4">
        <div className="flex gap-2 mb-2">
          <button 
            onClick={() => setInterval('monthly')}
            className={`px-3 py-1 rounded text-sm ${interval === 'monthly' ? 'bg-white shadow' : 'text-gray-500'}`}
          >
            月付
          </button>
          <button 
            onClick={() => setInterval('yearly')}
            className={`px-3 py-1 rounded text-sm ${interval === 'yearly' ? 'bg-white shadow' : 'text-gray-500'}`}
          >
            年付（省{Math.round((monthlyPrice * 12 - yearlyPrice))}元）
          </button>
        </div>
        <div className="text-3xl font-bold">
          ${price}<span className="text-lg text-gray-500">/{interval === 'monthly' ? '月' : '年'}</span>
        </div>
      </div>
      
      <ul className="space-y-2 text-sm text-gray-600 mb-6">
        {features.map((f, i) => <li key={i}>✓ {f}</li>)}
      </ul>
      
      <button
        onClick={handleSelect}
        disabled={loading || isCurrent}
        className={`w-full py-2 rounded-lg font-medium transition ${
          isCurrent 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {loading ? '处理中...' : isCurrent ? '当前计划' : '选择此计划'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create SubscriptionStatus component**

```typescript
// packages/web-app/components/billing/SubscriptionStatus.tsx
'use client'

interface SubscriptionStatusProps {
  plan: 'free' | 'pro' | 'team'
  status: 'active' | 'inactive' | 'canceled'
  currentPeriodEnd?: string
  quota: { used: number; remaining: number; limit: number }
  onCancel: () => void
}

export function SubscriptionStatus({ 
  plan, 
  status, 
  currentPeriodEnd, 
  quota,
  onCancel 
}: SubscriptionStatusProps) {
  const periodEndDate = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString('zh-CN') : null
  
  return (
    <div className="p-6 bg-white rounded-xl border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">当前订阅</h3>
          <p className="text-sm text-gray-500">
            {plan === 'free' ? '免费计划' : `${plan.toUpperCase()} 计划`}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-sm ${
          status === 'active' ? 'bg-green-100 text-green-700' : 
          status === 'canceled' ? 'bg-orange-100 text-orange-700' : 
          'bg-gray-100 text-gray-700'
        }`}>
          {status === 'active' ? '有效' : status === 'canceled' ? '待取消' : '无效'}
        </span>
      </div>
      
      {plan !== 'free' && (
        <div className="space-y-4">
          {periodEndDate && (
            <div className="text-sm text-gray-600">
              {status === 'canceled' 
                ? `将于 ${periodEndDate} 结束` 
                : `下次续费日期：${periodEndDate}`}
            </div>
          )}
          
          <div className="text-sm">
            <span className="text-gray-600">AI优化额度：</span>
            <span className="font-medium">{quota.remaining}/{quota.limit} 次/月</span>
          </div>
          
          {status === 'active' && (
            <button
              onClick={onCancel}
              className="text-sm text-red-600 hover:text-red-700"
            >
              取消订阅
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create billing page**

```typescript
// packages/web-app/app/dashboard/billing/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlanCard } from '@/components/billing/PlanCard'
import { SubscriptionStatus } from '@/components/billing/SubscriptionStatus'

interface BillingStatus {
  plan: 'free' | 'pro' | 'team'
  status: 'active' | 'inactive' | 'canceled'
  currentPeriodEnd?: string
  optimizationQuota: { used: number; remaining: number; limit: number }
}

export default function BillingPage() {
  const router = useRouter()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetchStatus()
  }, [])
  
  const fetchStatus = async () => {
    const res = await fetch('/api/billing/status')
    const data = await res.json()
    setStatus(data)
    setLoading(false)
  }
  
  const handleSubscribe = async (plan: 'pro' | 'team', interval: 'monthly' | 'yearly') => {
    const res = await fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, interval })
    })
    
    const data = await res.json()
    
    if (data.url) {
      window.location.href = data.url
    }
  }
  
  const handleCancel = async () => {
    if (!confirm('确定要取消订阅吗？')) return
    
    await fetch('/api/billing/cancel', { method: 'POST' })
    await fetchStatus()
  }
  
  if (loading) {
    return <div className="p-8">加载中...</div>
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">订阅管理</h1>
      
      {status && status.plan !== 'free' && (
        <SubscriptionStatus 
          {...status} 
          quota={status.optimizationQuota}
          onCancel={handleCancel}
        />
      )}
      
      <div className="grid grid-cols-2 gap-6 mt-6">
        <PlanCard
          plan="pro"
          monthlyPrice={9}
          yearlyPrice={79}
          features={[
            '云端备份',
            '多设备同步',
            'Web Dashboard',
            'AI优化（50次/月）'
          ]}
          currentPlan={status?.plan}
          onSelect={handleSubscribe}
        />
        
        <PlanCard
          plan="team"
          monthlyPrice={29}
          yearlyPrice={249}
          features={[
            'Pro全部功能',
            '团队共享库',
            '5人团队',
            'AI优化（200次/月）',
            '权限管理'
          ]}
          currentPlan={status?.plan}
          onSelect={handleSubscribe}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit billing UI**

```bash
git add packages/web-app/app/dashboard/billing/ packages/web-app/components/billing/
git commit -m "feat(billing): add billing dashboard UI with plan selection"
```

---

## Task 8: Update Dashboard Layout

**Files:**
- Modify: `packages/web-app/app/dashboard/layout.tsx`

- [ ] **Step 1: Add billing menu item to dashboard layout**

Read current layout file and add billing navigation link.

```typescript
// Add to navigation items
const navItems = [
  { href: '/dashboard', label: '概览' },
  { href: '/dashboard/prompts', label: '提示词' },
  { href: '/dashboard/billing', label: '订阅' }, // NEW
]
```

- [ ] **Step 2: Commit dashboard layout update**

```bash
git add packages/web-app/app/dashboard/layout.tsx
git commit -m "feat(dashboard): add billing menu item"
```

---

## Task 9: Update Landing Page Pricing Buttons

**Files:**
- Modify: `packages/web-app/app/page.tsx`

- [ ] **Step 1: Update pricing section buttons**

Change button links to redirect to billing page after login.

```typescript
// Replace static href="#" with conditional logic
// Pro button should link to /dashboard/billing?plan=pro
// Team button should link to /dashboard/billing?plan=team
```

- [ ] **Step 2: Commit landing page update**

```bash
git add packages/web-app/app/page.tsx
git commit -m "feat(landing): update pricing buttons to link to billing flow"
```

---

## Task 10: Extension Subscription Service

**Files:**
- Create: `packages/extension/src/lib/cloud-sync/subscription-service.ts`
- Modify: `packages/shared/types/auth.ts`

- [ ] **Step 1: Update shared auth types**

```typescript
// packages/shared/types/auth.ts - add subscription details
export interface CloudAuthState {
  status: AuthStatus
  user?: {
    id: string
    email?: string
  }
  subscription?: {
    planType: 'free' | 'pro' | 'team'
    status: 'active' | 'inactive' | 'expired' | 'canceled'
    currentPeriodEnd?: number
    optimizationQuota?: {
      used: number
      remaining: number
      limit: number
    }
  }
  lastSyncAt?: number
}
```

- [ ] **Step 2: Create subscription check service**

```typescript
// packages/extension/src/lib/cloud-sync/subscription-service.ts
import { getAuthState } from './auth-service'

export async function checkSubscriptionFeature(feature: 'cloud_sync' | 'ai_optimization'): Promise<boolean> {
  const authState = await getAuthState()
  
  if (authState.status !== 'logged_in') {
    return false
  }
  
  const planType = authState.subscription?.planType || 'free'
  
  if (feature === 'cloud_sync') {
    return planType === 'pro' || planType === 'team'
  }
  
  if (feature === 'ai_optimization') {
    if (planType === 'free') return false
    const quota = authState.subscription?.optimizationQuota
    return quota ? quota.remaining > 0 : false
  }
  
  return false
}
```

- [ ] **Step 3: Commit subscription service**

```bash
git add packages/extension/src/lib/cloud-sync/subscription-service.ts packages/shared/types/auth.ts
git commit -m "feat(extension): add subscription feature check service"
```

---

## Self-Review Checklist

After completing all tasks, verify:

1. **Spec coverage:** All Phase 4 requirements from spec implemented?
   - Stripe integration ✓
   - Subscription management ✓
   - AI optimization ✓
   - Billing dashboard ✓

2. **Placeholder scan:** No TBD, TODO, or incomplete sections?

3. **Type consistency:** CloudAuthState types match across packages/shared and packages/extension?

---

## Environment Variables Required

> **Note:** Stripe integration is currently disabled for testing. The billing UI and API routes are functional but payment processing requires Stripe configuration.

Add to `packages/web-app/.env.local` when ready to enable Stripe:
```
# Stripe (optional - disabled for now)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRO_MONTHLY_PRICE_ID=price_...
# STRIPE_PRO_YEARLY_PRICE_ID=price_...
# STRIPE_TEAM_MONTHLY_PRICE_ID=price_...
# STRIPE_TEAM_YEARLY_PRICE_ID=price_...

NEXT_PUBLIC_WEB_APP_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...
```

## Testing Without Stripe

The billing page (`/dashboard/billing`) and API routes are functional. You can test:
- Billing status API: `GET /api/billing/status`
- Subscription service in extension
- Billing UI components

To simulate a paid subscription for testing, manually update `user_subscriptions` table in Supabase:
```sql
UPDATE user_subscriptions 
SET plan_type = 'pro', status = 'active' 
WHERE user_id = 'your-test-user-id';
```