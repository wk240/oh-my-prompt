# 会员版本标签样式设计规格

日期：2026-05-23

## 背景

"我的"页面 (MineView.tsx) 在登录后显示会员类型标签，现有样式过于简单（仅文字+琥珀色），需要更醒目、更有辨识度的设计。

## 设计目标

- 在账号状态区用户名旁显示会员版本标签
- 三种会员类型：FREE、PRO、TEAM
- 采用黑白极简高级风格，与系统整体设计语言一致
- 胶囊形状标签，英文标签文字

## 最终设计方案

### 样式风格：胶囊黑灰

**PRO 标签（会员）**
- 背景：#C9A962（金色）
- 文字：#111（黑）
- 字体：font-weight: 700, letter-spacing: 0.5px
- 高级感、醒目

**TEAM 标签（团队）**
- 背景：#1a1a1a（纯黑）
- 文字：#fff（白）
- 字体：font-weight: 700, letter-spacing: 0.5px
- 系统级、专业

**FREE 标签（免费）**
- 背景：#f5f5f5（浅灰）
- 文字：#888（灰）
- 字体：font-weight: 600, letter-spacing: 0.5px
- 简洁、低调

### 样式参数

| 属性 | 值 |
|------|------|
| padding | 3px 12px |
| border-radius | 12px (胶囊形) |
| font-size | 10px |
| font-weight | 700 (PRO/TEAM) / 600 (FREE) |
| letter-spacing | 0.5px |
| 位置 | 用户名右侧，margin-left: 8px |

### 实现位置

文件：`packages/extension/src/sidepanel/views/MineView.tsx`
行号：384-387（现有会员标签代码）

现有代码：
```tsx
{authState.subscription?.planType && (
  <span className="ml-1.5 text-[11px] text-amber-600 font-medium">
    {authState.subscription.planType === 'pro' ? '会员' : authState.subscription.planType}
  </span>
)}
```

需修改为：
```tsx
{authState.subscription?.planType && (
  <span className={getMembershipBadgeClass(authState.subscription.planType)}>
    {authState.subscription.planType.toUpperCase()}
  </span>
)}
```

## 实现要点

1. 创建 `getMembershipBadgeClass()` 函数，根据 planType 返回对应样式类名
2. 标签文字改为英文大写：FREE / PRO / TEAM
3. 保持现有的条件判断逻辑，仅更新样式

## 验收标准

- 三种会员类型在用户名旁正确显示对应样式的胶囊标签
- 黑白极简高级风格一致
- 不影响现有布局结构
- 标签文字清晰可读