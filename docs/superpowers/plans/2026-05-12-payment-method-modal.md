# Payment Method Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor subscription page to use modal-based payment method selection, with top-level interval tabs.

**Architecture:** Create IntervalSelector tabs component, modify PaymentMethodSelector to remove recommendation, add PaymentMethodModal for payment confirmation, refactor PlanComparison to use modal flow.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Zustand (state management)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `components/billing/IntervalSelector.tsx` | Top-level monthly/yearly tab selector |
| Create | `components/billing/PaymentMethodModal.tsx` | Modal with order details + payment method selection |
| Modify | `components/billing/PaymentMethodSelector.tsx` | Remove recommendation label |
| Modify | `components/billing/PlanCard.tsx` | Remove internal interval selector, accept interval prop |
| Modify | `components/billing/PlanComparison.tsx` | Integrate IntervalSelector, use modal flow |
| Modify | `components/dashboard/subscription/PlanComparison.tsx` | Sync with billing version |

---

### Task 1: Create IntervalSelector Component

**Files:**
- Create: `packages/web-app/components/billing/IntervalSelector.tsx`

- [ ] **Step 1: Create IntervalSelector component**

```tsx
'use client'

interface IntervalSelectorProps {
  interval: 'monthly' | 'yearly'
  onChange: (interval: 'monthly' | 'yearly') => void
}

export function IntervalSelector({ interval, onChange }: IntervalSelectorProps) {
  return (
    <div className="flex gap-2 mb-6">
      <button
        onClick={() => onChange('monthly')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
          interval === 'monthly'
            ? 'bg-white text-black shadow'
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        月付
      </button>
      <button
        onClick={() => onChange('yearly')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
          interval === 'yearly'
            ? 'bg-white text-black shadow'
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        年付（省¥20）
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify component compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/IntervalSelector.tsx
git commit -m "feat(billing): add IntervalSelector component for top-level tab"
```

---

### Task 2: Modify PaymentMethodSelector - Remove Recommendation

**Files:**
- Modify: `packages/web-app/components/billing/PaymentMethodSelector.tsx`

- [ ] **Step 1: Remove recommendedMethod prop and label**

Update the file to:

```tsx
'use client'

import { cn } from '@/lib/utils'

export type PaymentMethod = 'stripe' | 'wechat_pay'

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod
  onSelect: (method: PaymentMethod) => void
}

export function PaymentMethodSelector({
  onSelect,
  selectedMethod,
}: PaymentMethodSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {/* WeChat Pay */}
      <button
        onClick={() => onSelect('wechat_pay')}
        className={cn(
          'p-4 rounded-lg border-2 transition-all',
          selectedMethod === 'wechat_pay'
            ? 'border-green-500 bg-green-50 dark:bg-green-950'
            : 'border-gray-200 hover:border-gray-300'
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <WechatIcon className="w-6 h-6 text-white" />
          </div>
          <span className="font-medium">微信支付</span>
          <span className="text-xs text-gray-500">人民币 · 扫码支付</span>
        </div>
      </button>

      {/* Stripe */}
      <button
        onClick={() => onSelect('stripe')}
        className={cn(
          'p-4 rounded-lg border-2 transition-all',
          selectedMethod === 'stripe'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-gray-200 hover:border-gray-300'
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
            <CreditCardIcon className="w-6 h-6 text-white" />
          </div>
          <span className="font-medium">国际信用卡</span>
          <span className="text-xs text-gray-500">美元 · Stripe</span>
        </div>
      </button>
    </div>
  )
}

function WechatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      <path d="M12 2C6.5 2 2 5.8 2 10c0 2.5 1.5 4.8 3.8 6.2l-.8 2.8 3-1.5c1 .3 2 .5 3 .5 5.5 0 10-3.8 10-8S17.5 2 12 2z" />
    </svg>
  )
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" stroke="white" strokeWidth="2" fill="none" />
    </svg>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors related to PaymentMethodSelector

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/PaymentMethodSelector.tsx
git commit -m "refactor(billing): remove recommendation label from PaymentMethodSelector"
```

---

### Task 3: Create PaymentMethodModal Component

**Files:**
- Create: `packages/web-app/components/billing/PaymentMethodModal.tsx`

- [ ] **Step 1: Create PaymentMethodModal component**

```tsx
'use client'

import { useState } from 'react'
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector'

interface PaymentMethodModalProps {
  isOpen: boolean
  onClose: () => void
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
  price: number  // cents
  features: string[]
  onConfirm: (method: PaymentMethod) => void
}

export function PaymentMethodModal({
  isOpen,
  onClose,
  plan,
  interval,
  price,
  features,
  onConfirm,
}: PaymentMethodModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('wechat_pay')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const formatPrice = (cents: number, method: PaymentMethod) => {
    if (method === 'wechat_pay') {
      return `¥${(cents / 100).toFixed(0)}`
    }
    return `$${(cents / 100).toFixed(2)}`
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm(selectedMethod)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          确认订阅
        </h2>

        {/* Plan info */}
        <div className="mb-4">
          <div className="text-lg font-semibold text-gray-700 dark:text-gray-300 capitalize">
            {plan} 套餐
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatPrice(price, selectedMethod)}
            <span className="text-sm text-gray-500">
              /{interval === 'monthly' ? '月' : '年'}
            </span>
          </div>
        </div>

        {/* Features */}
        <div className="mb-6">
          <div className="text-sm text-gray-500 mb-2">包含功能：</div>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {features.map((feature, i) => (
              <li key={i}>• {feature}</li>
            ))}
          </ul>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

        {/* Payment method selector */}
        <div className="text-sm text-gray-500 mb-2">选择支付方式：</div>
        <PaymentMethodSelector
          selectedMethod={selectedMethod}
          onSelect={setSelectedMethod}
        />

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full mt-4 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '处理中...' : '确认支付'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/PaymentMethodModal.tsx
git commit -m "feat(billing): add PaymentMethodModal for payment confirmation"
```

---

### Task 4: Modify PlanCard - Remove Internal Interval Selector

**Files:**
- Modify: `packages/web-app/components/billing/PlanCard.tsx`

- [ ] **Step 1: Update PlanCard to accept interval prop**

Update the file to:

```tsx
'use client'

interface PlanCardProps {
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
  price: number  // cents, based on payment method (passed from parent)
  features: string[]
  currentPlan?: 'free' | 'pro' | 'team'
  onSelect: (plan: 'pro' | 'team') => void
}

export function PlanCard({
  plan,
  interval,
  price,
  features,
  currentPlan,
  onSelect
}: PlanCardProps) {
  const [loading, setLoading] = useState(false)

  const isCurrent = currentPlan === plan

  // Format price display - parent handles payment method-specific formatting
  const formattedPrice = `¥${(price / 100).toFixed(0)}`

  const handleSelect = async () => {
    setLoading(true)
    try {
      await onSelect(plan)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`p-6 rounded-xl border border-outline-variant/20 ${
      plan === 'pro' ? 'bg-primary/5' : 'bg-secondary/5'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold capitalize text-on-background">{plan}</h3>
        {isCurrent && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
            当前计划
          </span>
        )}
      </div>

      {/* Price display */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-on-background">
          {formattedPrice}
          <span className="text-lg text-on-surface-variant">
            /{interval === 'monthly' ? '月' : '年'}
          </span>
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-2 text-sm text-on-surface-variant mb-6">
        {features.map((f, i) => <li key={i}>✓ {f}</li>)}
      </ul>

      {/* Select button */}
      <button
        onClick={handleSelect}
        disabled={loading || isCurrent}
        className={`w-full py-2 rounded-lg font-medium transition ${
          isCurrent
            ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
            : 'bg-white text-black hover:bg-gray-100'
        }`}
      >
        {loading ? '处理中...' : isCurrent ? '当前计划' : '选择此计划'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add useState import**

The file already has useState from the original version, verify it's imported:

```tsx
import { useState } from 'react'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/components/billing/PlanCard.tsx
git commit -m "refactor(billing): remove internal interval selector from PlanCard"
```

---

### Task 5: Refactor PlanComparison (billing) - Modal Flow

**Files:**
- Modify: `packages/web-app/components/billing/PlanComparison.tsx`

- [ ] **Step 1: Refactor PlanComparison with IntervalSelector and modal**

Replace the entire file with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { PaymentMethod } from './PaymentMethodSelector'
import { IntervalSelector } from './IntervalSelector'
import { PaymentMethodModal } from './PaymentMethodModal'
import { PlanCard } from './PlanCard'
import { WechatPayQRCode } from './WechatPayQRCode'
import { WECHAT_PAY_PLANS, WechatPlanKey } from '@/lib/wechat-pay/plans'

interface WechatOrder {
  outTradeNo: string
  codeUrl: string
  expireAt: Date
  amount: number
}

interface PendingPlan {
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
}

const planFeatures = {
  pro: ['Free全部功能', '云端备份', '多设备同步', 'AI识图（50次/月）'],
  team: ['Pro全部功能', '团队共享库', '5人团队', 'AI识图（200次/月）'],
}

export function PlanComparison() {
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [wechatOrder, setWechatOrder] = useState<WechatOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get price for plan + interval (WeChat Pay pricing)
  const getPrice = (plan: 'pro' | 'team', interval: 'monthly' | 'yearly'): number => {
    const key = `${plan}_${interval}` as WechatPlanKey
    return WECHAT_PAY_PLANS[key].price
  }

  // Handle plan card click - open modal
  const handlePlanClick = (plan: 'pro' | 'team') => {
    setPendingPlan({ plan, interval: selectedInterval })
    setShowModal(true)
  }

  // Handle modal confirm
  const handleModalConfirm = async (method: PaymentMethod) => {
    if (!pendingPlan) return

    setShowModal(false)
    setLoading(true)
    setError(null)

    try {
      if (method === 'wechat_pay') {
        // WeChat Pay order
        const response = await fetch('/api/billing/wechat-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: pendingPlan.plan,
            interval: pendingPlan.interval,
          }),
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
          setError(result.error || '下单失败')
          setShowModal(true) // Reopen modal for retry
        }
      } else {
        // Stripe checkout
        const priceId = getStripePriceId(pendingPlan.plan, pendingPlan.interval)
        const response = await fetch('/api/billing/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId }),
        })

        const result = await response.json()
        if (result.success && result.data.url) {
          window.location.href = result.data.url
        } else {
          setError(result.error || '创建支付链接失败')
          setShowModal(true) // Reopen modal for retry
        }
      }
    } catch (err) {
      console.error('[PlanComparison] Payment error:', err)
      setError('支付处理失败，请重试')
      setShowModal(true) // Reopen modal for retry
    } finally {
      setLoading(false)
    }
  }

  // Get Stripe price ID
  const getStripePriceId = (plan: 'pro' | 'team', interval: 'monthly' | 'yearly'): string => {
    const priceIds = {
      pro_monthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '',
      pro_yearly: process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID || '',
      team_monthly: process.env.NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID || '',
      team_yearly: process.env.NEXT_PUBLIC_STRIPE_TEAM_YEARLY_PRICE_ID || '',
    }
    return priceIds[`${plan}_${interval}`]
  }

  // Handle payment success
  const handlePaymentSuccess = () => {
    setWechatOrder(null)
    setPendingPlan(null)
    window.location.reload()
  }

  // Cancel WeChat Pay
  const handleCancelWechat = () => {
    setWechatOrder(null)
    setPendingPlan(null)
    setError(null)
  }

  // Close modal
  const handleCloseModal = () => {
    setShowModal(false)
    setPendingPlan(null)
  }

  // If WeChat order is active, show QR code
  if (wechatOrder) {
    return (
      <div className="max-w-md mx-auto">
        <WechatPayQRCode
          codeUrl={wechatOrder.codeUrl}
          outTradeNo={wechatOrder.outTradeNo}
          expireAt={wechatOrder.expireAt}
          amount={wechatOrder.amount}
          onPaymentSuccess={handlePaymentSuccess}
          onCancel={handleCancelWechat}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6 text-center">选择订阅套餐</h2>

      {/* Interval selector */}
      <IntervalSelector
        interval={selectedInterval}
        onChange={setSelectedInterval}
      />

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-center">
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlanCard
          plan="pro"
          interval={selectedInterval}
          price={getPrice('pro', selectedInterval)}
          features={planFeatures.pro}
          onSelect={handlePlanClick}
        />
        <PlanCard
          plan="team"
          interval={selectedInterval}
          price={getPrice('team', selectedInterval)}
          features={planFeatures.team}
          onSelect={handlePlanClick}
        />
      </div>

      {/* Payment method modal */}
      {pendingPlan && (
        <PaymentMethodModal
          isOpen={showModal}
          onClose={handleCloseModal}
          plan={pendingPlan.plan}
          interval={pendingPlan.interval}
          price={getPrice(pendingPlan.plan, pendingPlan.interval)}
          features={planFeatures[pendingPlan.plan]}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/billing/PlanComparison.tsx
git commit -m "refactor(billing): use modal-based payment flow in PlanComparison"
```

---

### Task 6: Sync dashboard/subscription/PlanComparison

**Files:**
- Modify: `packages/web-app/components/dashboard/subscription/PlanComparison.tsx`

- [ ] **Step 1: Update dashboard PlanComparison to match billing version**

Replace the entire file with the same content as Task 5, but keep the original interface compatibility for the subscription page:

```tsx
'use client'

import { useState } from 'react'
import { PlanOption, PlanType } from '@/types/dashboard'
import { PaymentMethod } from '@/components/billing/PaymentMethodSelector'
import { IntervalSelector } from '@/components/billing/IntervalSelector'
import { PaymentMethodModal } from '@/components/billing/PaymentMethodModal'
import { WechatPayQRCode } from '@/components/billing/WechatPayQRCode'
import { WECHAT_PAY_PLANS, WechatPlanKey } from '@/lib/wechat-pay/plans'

interface PlanComparisonProps {
  plans: PlanOption[]
  onSelect: (plan: string) => void
}

interface WechatOrder {
  outTradeNo: string
  codeUrl: string
  expireAt: Date
  amount: number
}

interface PendingPlan {
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
}

const planFeatures: Record<PlanType, string[]> = {
  free: ['Chrome插件完整功能', '本地管理提示词', '导入导出数据'],
  pro: ['Free全部功能', '云端备份', '多设备同步', 'AI识图（50次/月）'],
  team: ['Pro全部功能', '团队共享库', '5人团队', 'AI识图（200次/月）'],
}

export default function PlanComparison({ plans, onSelect }: PlanComparisonProps) {
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [wechatOrder, setWechatOrder] = useState<WechatOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get price for plan + interval (WeChat Pay pricing)
  const getPrice = (plan: 'pro' | 'team', interval: 'monthly' | 'yearly'): number => {
    const key = `${plan}_${interval}` as WechatPlanKey
    return WECHAT_PAY_PLANS[key].price
  }

  // Handle plan card click - open modal
  const handlePlanClick = (plan: 'pro' | 'team') => {
    setPendingPlan({ plan, interval: selectedInterval })
    setShowModal(true)
  }

  // Handle modal confirm
  const handleModalConfirm = async (method: PaymentMethod) => {
    if (!pendingPlan) return

    setShowModal(false)
    setLoading(true)
    setError(null)

    try {
      if (method === 'wechat_pay') {
        // WeChat Pay order
        const response = await fetch('/api/billing/wechat-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: pendingPlan.plan,
            interval: pendingPlan.interval,
          }),
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
          setError(result.error || '下单失败')
          setShowModal(true)
        }
      } else {
        // Stripe checkout - use parent's onSelect handler
        onSelect(pendingPlan.plan)
      }
    } catch (err) {
      console.error('[PlanComparison] Payment error:', err)
      setError('支付处理失败，请重试')
      setShowModal(true)
    } finally {
      setLoading(false)
    }
  }

  // Handle payment success
  const handlePaymentSuccess = () => {
    setWechatOrder(null)
    setPendingPlan(null)
    window.location.reload()
  }

  // Cancel WeChat Pay
  const handleCancelWechat = () => {
    setWechatOrder(null)
    setPendingPlan(null)
    setError(null)
  }

  // Close modal
  const handleCloseModal = () => {
    setShowModal(false)
    setPendingPlan(null)
  }

  // Filter to paid plans
  const paidPlans = plans.filter(p => p.type !== 'free')

  // If WeChat order is active, show QR code
  if (wechatOrder) {
    return (
      <div className="max-w-md mx-auto">
        <WechatPayQRCode
          codeUrl={wechatOrder.codeUrl}
          outTradeNo={wechatOrder.outTradeNo}
          expireAt={wechatOrder.expireAt}
          amount={wechatOrder.amount}
          onPaymentSuccess={handlePaymentSuccess}
          onCancel={handleCancelWechat}
        />
      </div>
    )
  }

  return (
    <div className="bg-surface-container border border-outline-variant/20 rounded-lg p-6">
      <h3 className="font-medium text-on-background mb-4">选择订阅套餐</h3>

      {/* Interval selector */}
      <IntervalSelector
        interval={selectedInterval}
        onChange={setSelectedInterval}
      />

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-center">
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paidPlans.map((p) => (
          <PlanCardInternal
            key={p.type}
            plan={p.type as 'pro' | 'team'}
            interval={selectedInterval}
            price={getPrice(p.type as 'pro' | 'team', selectedInterval)}
            features={planFeatures[p.type]}
            current={p.current}
            onClick={handlePlanClick}
          />
        ))}
      </div>

      {/* Payment method modal */}
      {pendingPlan && (
        <PaymentMethodModal
          isOpen={showModal}
          onClose={handleCloseModal}
          plan={pendingPlan.plan}
          interval={pendingPlan.interval}
          price={getPrice(pendingPlan.plan, pendingPlan.interval)}
          features={planFeatures[pendingPlan.plan]}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}

// Internal plan card for dashboard
interface PlanCardInternalProps {
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
  price: number
  features: string[]
  current: boolean
  onClick: (plan: 'pro' | 'team') => void
}

function PlanCardInternal({
  plan,
  interval,
  price,
  features,
  current,
  onClick,
}: PlanCardInternalProps) {
  const formattedPrice = `¥${(price / 100).toFixed(0)}`

  return (
    <div className={`p-4 rounded-lg border ${
      plan === 'pro'
        ? 'border-primary/50 bg-surface-container-highest'
        : 'border-secondary/50 bg-surface-container-high'
    }`}>
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-on-background capitalize">{plan}</div>
        {current && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
            当前计划
          </span>
        )}
      </div>

      <div className="text-lg font-bold text-on-background">
        {formattedPrice}
        <span className="text-sm font-normal text-on-surface-variant">
          /{interval === 'monthly' ? '月' : '年'}
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-on-surface-variant">
        {features.map((f, i) => <li key={i}>• {f}</li>)}
      </ul>

      {current ? (
        <div className="mt-3 text-sm text-primary font-medium">✓ 当前计划</div>
      ) : (
        <button
          onClick={() => onClick(plan)}
          className="mt-3 w-full py-2 rounded text-sm font-medium bg-white text-black hover:bg-gray-100 transition"
        >
          选择此计划
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/web-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-app/components/dashboard/subscription/PlanComparison.tsx
git commit -m "refactor(dashboard): sync PlanComparison with modal flow"
```

---

### Task 7: Integration Test

**Files:**
- None (manual verification)

- [ ] **Step 1: Start dev server**

Run: `cd packages/web-app && npm run dev`
Expected: Server starts on port 3000

- [ ] **Step 2: Open subscription page in browser**

Navigate to: `http://localhost:3000/subscription`

- [ ] **Step 3: Verify UI**

Expected behavior:
1. Interval tabs (月付/年付) display at top
2. Plan cards show price based on selected interval
3. Clicking plan card opens PaymentMethodModal
4. Modal shows plan name, price, features, payment method selection
5. No recommendation labels on payment methods
6. Confirm button triggers payment flow

- [ ] **Step 4: Verify modal flow**

Expected behavior:
1. Click "选择此计划" on Pro card
2. Modal opens with Pro plan details
3. Select payment method (微信支付 or 国际信用卡)
4. Click "确认支付"
5. Modal closes
6. Stripe → redirects to checkout (or shows error if no price ID)
7. WeChat Pay → shows QR code page

---

### Task 8: Final Commit

- [ ] **Step 1: Verify all changes are committed**

Run: `git status`
Expected: No uncommitted changes

- [ ] **Step 2: Create summary commit if needed**

If there are any remaining uncommitted files:

```bash
git add -A
git commit -m "feat(billing): complete payment method modal implementation"
```

---

## Self-Review Checklist

| Spec Section | Covered By Task |
|--------------|-----------------|
| IntervalSelector component | Task 1 |
| PaymentMethodSelector remove recommendation | Task 2 |
| PaymentMethodModal component | Task 3 |
| PlanComparison refactor | Task 5, Task 6 |
| Error handling (modal stays open) | Task 3, Task 5 |
| Login check (handled by page) | N/A - existing logic |

---

Plan complete and saved to `docs/superpowers/plans/2026-05-12-payment-method-modal.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?