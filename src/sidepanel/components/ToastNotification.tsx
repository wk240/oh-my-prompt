/**
 * ToastNotification - Simple toast for SidePanel (React-based)
 * Note: Content script uses pure DOM version to avoid duplicate React bundle
 */

import { useEffect } from 'react'

interface ToastNotificationProps {
  message: string
  onClose: () => void
}

export function ToastNotification({ message, onClose }: ToastNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: '#171717',
        color: '#ffffff',
        padding: '12px 16px',
        borderRadius: 8,
        fontSize: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 999999,
      }}
    >
      {message}
    </div>
  )
}