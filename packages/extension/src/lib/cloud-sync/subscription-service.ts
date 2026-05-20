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