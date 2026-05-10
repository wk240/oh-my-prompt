// packages/extension/src/sidepanel/components/CloudSync/AuthModal.tsx
import { useState, useEffect, useRef } from 'react'
import { signInWithOAuth } from '@/lib/cloud-sync/auth-service'
import { Button } from '@/popup/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/popup/components/ui/dialog'

// GitHub SVG Icon (same as web-app)
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

const providers = [
  // Google login temporarily disabled - requires Supabase Dashboard configuration
  // { name: 'google', label: 'Google 登录', icon: GoogleIcon },
  { name: 'github', label: 'GitHub 登录', icon: GitHubIcon }
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
  const waitingRef = useRef(false)

  // Listen for auth callback updates from service worker
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: { success: boolean; error?: string } }) => {
      if (message.type === 'AUTH_STATUS_UPDATE' && waitingRef.current) {
        console.log('[Oh My Prompt] AuthModal received auth update:', message.payload)
        waitingRef.current = false
        setWaiting(false)

        if (message.payload?.success) {
          onSuccess()
          onClose()
        } else {
          setError(message.payload?.error || '登录失败')
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [onSuccess, onClose])

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true)
    setError(null)

    const result = await signInWithOAuth(provider)

    if (!result.success) {
      setError(result.error || '登录失败')
      setLoading(false)
      return
    }

    // OAuth initiated successfully, now waiting for callback
    setWaiting(true)
    setLoading(false)
    waitingRef.current = true

    // Timeout after 60 seconds
    setTimeout(() => {
      if (waitingRef.current) {
        waitingRef.current = false
        setWaiting(false)
        setError('登录超时，请重试')
      }
    }, 60000)
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
            等待登录完成...（请在新打开的页面完成登录）
          </div>
        )}

        <div className="space-y-3 py-4">
          {providers.map(p => (
            <Button
              key={p.name}
              variant="default"
              className="w-full justify-center gap-3 h-11"
              onClick={() => handleOAuth(p.name as 'google' | 'github')}
              disabled={loading || waiting}
            >
              <p.icon />
              <span>{p.label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}