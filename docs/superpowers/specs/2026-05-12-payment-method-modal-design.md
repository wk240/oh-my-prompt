# 支付方式选择弹窗设计

## 概述

将订阅页面的支付方式选择从嵌入式改为弹窗模式。用户选择套餐后弹出弹窗，在弹窗内确认订单详情并选择支付方式（微信支付或Stripe），然后进入支付流程。

同时将周期选择（月付/年付）从卡片内部移到页面顶部作为全局Tab。

## 需求澄清

| 问题 | 决策 |
|------|------|
| 弹窗内容范围 | 订单详情（套餐名、价格、功能摘要）+ 支付方式选择 + 确认按钮 |
| 确认后行为 | 关闭弹窗后处理：Stripe跳转Checkout，微信支付显示二维码页面 |
| 登录检查 | 必要，未登录跳转登录页 |
| 支付方式推荐 | 移除，两种方式平等展示 |

## 页面布局

```
┌─────────────────────────────────────────────────────┐
│  订阅方案                                             │
│                                                      │
│  ┌──────────┐ ┌──────────┐                           │
│  │  月付    │ │  年付 ✓  │   ← 顶部周期切换 Tab       │
│  └──────────┘ └──────────┘   （全局，影响下方所有卡片） │
│                                                      │
│  ┌─────────────────┐ ┌─────────────────┐            │
│  │ Pro 套餐        │ │ Team 套餐       │            │
│  │ ¥99.99/年      │ │ ¥299.99/年     │            │
│  │ • 功能列表     │ │ • 功能列表     │            │
│  │ [选择]         │ │ [选择]         │            │
│  └─────────────────┘ └─────────────────┘            │
└─────────────────────────────────────────────────────┘
```

点击"选择"按钮后弹出弹窗：

```
┌─────────────────────────────────────┐
│  确认订阅                    [×]     │
│─────────────────────────────────────│
│  Pro 套餐                            │
│  ¥99.99 / 年                         │
│                                      │
│  包含功能：                          │
│  • Free全部功能                      │
│  • 云端备份                          │
│  • 多设备同步                        │
│                                      │
│  ─────────────────────────────────  │
│                                      │
│  ┌───────────┐ ┌───────────┐        │
│  │ 微信支付  │ │ 国际信用卡 │        │
│  │ ○        │ │ ○        │        │
│  └───────────┘ └───────────┘        │
│                                      │
│  ─────────────────────────────────  │
│                                      │
│        [ 确认支付 ]                  │
└─────────────────────────────────────┘
```

## 数据流

```
用户点击套餐按钮
    ↓
检查登录状态 (subscription/page.tsx handleUpgrade)
    ↓ (未登录) → 跳转登录页
    ↓ (已登录)
打开 PaymentMethodModal，传入：
  - plan: { type: 'pro'|'team', interval: 'monthly'|'yearly' }
  - price: number (cents)
  - features: string[]
    ↓
用户在弹窗选择支付方式
    ↓
点击确认按钮
    ↓
关闭弹窗
    ↓
┌─────────────────────────────────────┐
│  Stripe: 调用 subscribe API → 跳转 Checkout │
│  微信支付: 调用 wechat-pay API → 显示 QRCode │
└─────────────────────────────────────┘
```

## 组件架构

### 新增文件

```
packages/web-app/components/billing/
├── PaymentMethodModal.tsx    # 新增 - 支付方式选择弹窗
├── IntervalSelector.tsx      # 新增 - 顶部周期切换 Tab
```

### 修改文件

```
packages/web-app/components/billing/
├── PaymentMethodSelector.tsx # 修改 - 移除推荐标签
├── PlanComparison.tsx        # 重构 - 弹窗触发模式 + 集成 IntervalSelector

packages/web-app/components/dashboard/subscription/
├── PlanComparison.tsx        # 同步修改（dashboard版本）
```

### 保持不变

```
packages/web-app/components/billing/
├── WechatPayQRCode.tsx       # 保持不变
├── PlanCard.tsx              # 保持不变（billing版本已简化）
```

## 组件设计

### IntervalSelector

顶部周期切换组件。

```tsx
interface IntervalSelectorProps {
  interval: 'monthly' | 'yearly'
  onChange: (interval: 'monthly' | 'yearly') => void
}

// 显示：
// [月付] [年付（省¥XX）]
// 年付Tab显示节省金额（基于当前支付方式定价）
```

### PaymentMethodModal

支付方式选择弹窗。

```tsx
interface PaymentMethodModalProps {
  isOpen: boolean
  onClose: () => void
  plan: 'pro' | 'team'
  interval: 'monthly' | 'yearly'
  price: number  // cents
  features: string[]
  onConfirm: (method: PaymentMethod) => void
}

// 内容结构：
// 1. 头部：套餐名 + 关闭按钮
// 2. 价格显示：¥XX.XX / 月 或 ¥XX.XX / 年
// 3. 功能摘要列表（3-4项）
// 4. 分隔线
// 5. PaymentMethodSelector（无推荐标签版本）
// 6. 确认按钮
```

### PaymentMethodSelector 修改

移除推荐逻辑：
- 删除 `recommendedMethod` prop
- 删除"推荐"标签显示
- 保持两种支付方式平等展示

```tsx
interface PaymentMethodSelectorProps {
  // 移除: recommendedMethod: PaymentMethod
  selectedMethod: PaymentMethod
  onSelect: (method: PaymentMethod) => void
}
```

### PlanComparison 重构

状态管理：
```tsx
const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly')
const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
const [showModal, setShowModal] = useState(false)
const [wechatOrder, setWechatOrder] = useState<WechatOrder | null>(null)
```

渲染逻辑：
```tsx
// 如果有微信订单，显示二维码
if (wechatOrder) {
  return <WechatPayQRCode ... />
}

// 正常显示
return (
  <>
    <IntervalSelector interval={selectedInterval} onChange={setSelectedInterval} />
    {/* 套餐卡片，价格基于 selectedInterval */}
    <PaymentMethodModal ... />
  </>
)
```

### PlanCard 简化

billing/PlanCard.tsx 已是简化版本，无需修改。dashboard版本需同步移除内部周期选择（如有）。

## 价格计算

```tsx
const planPrices = {
  pro: { monthly: 999, yearly: 9999 },
  team: { monthly: 2999, yearly: 29999 },
}

// 年付节省计算
const yearlySavings = {
  pro: Math.round((999 * 12 - 9999) / 100),  // ¥20
  team: Math.round((2999 * 12 - 29999) / 100), // ¥59
}
```

## 错误处理

- 弹窗内支付方式选择必选，未选择时确认按钮禁用或提示
- API调用失败时显示错误信息，弹窗保持打开让用户重试
- 微信订单创建失败时，显示错误提示，用户可关闭弹窗重新选择

## 实现优先级

1. IntervalSelector 组件
2. PaymentMethodSelector 修改（移除推荐）
3. PaymentMethodModal 组件
4. PlanComparison 重构
5. dashboard/subscription/PlanComparison 同步修改