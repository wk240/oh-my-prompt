/**
 * Toast - Simple toast notification for queue warnings
 * Shows briefly at bottom of screen
 */

import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  duration?: number  // ms, default 3000
  onClose: () => void
}

function Toast({ message, duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | null = null

    const timer = setTimeout(() => {
      setIsVisible(false)
      closeTimer = setTimeout(onClose, 300)  // Wait for fade-out animation
    }, duration)

    return () => {
      clearTimeout(timer)
      if (closeTimer) clearTimeout(closeTimer)
    }
  }, [duration, onClose])

  return (
    <div
      className={`toast-container ${isVisible ? 'visible' : 'fading'}`}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(23, 23, 23, 0.9)',
        color: '#fff',
        padding: '10px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '500',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        zIndex: 2147483647,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none'
      }}
    >
      {message}
    </div>
  )
}

export default Toast