// packages/extension/src/sidepanel/components/CloudSync/AuthModal.tsx
import { useState } from 'react'
import { signInWithOAuth, waitForAuthCallback } from '@/lib/cloud-sync/auth-service'
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/popup/components/ui/dialog'

const providers = [
  { name: 'google', label: 'Google 登录', icon: '🔵' },
  { name: 'github', label: 'GitHub 登录', icon: '⚫' }
]

interface AuthModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [loading, setLoading] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true)
    setError(null)

    const result = await signInWithOAuth(provider)

    if (!result.success) {
      setError(result.error || '登录失败')
      setLoading(false)
      return
    }

    setWaiting(true)
    setLoading(false)

    const success = await waitForAuthCallback(60000)

    setWaiting(false)

    if (success) {
      onSuccess()
      onClose()
    } else {
      setError('登录超时，请重试')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>云端同步登录</DialogTitle>
          <DialogDescription>
            登录后可云端备份提示词，多设备同步
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 rounded text-sm text-red-600">
            {error}
          </div>
        )}

        {waiting && (
          <div className="p-3 bg-blue-50 rounded text-sm text-blue-600">
            等待登录完成...
          </div>
        )}

        <div className="space-y-3 py-4">
          {providers.map(p => (
            <Button
              key={p.name}
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => handleOAuth(p.name as 'google' | 'github')}
              disabled={loading || waiting}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}