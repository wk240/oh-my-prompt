/**
 * CacheStatusHeader - Header bar showing cache timestamp and status
 * Phase 7: Displays fetchTimestamp, expiry warning, offline indicator (D-16, D-17, D-18)
 */

import { AlertCircle, WifiOff } from 'lucide-react'

interface CacheStatusHeaderProps {
  fetchTimestamp?: string
  isExpired?: boolean
  isFromCache?: boolean
}

export function CacheStatusHeader({ fetchTimestamp, isExpired, isFromCache }: CacheStatusHeaderProps) {
  if (!fetchTimestamp) return null

  // D-16: Format timestamp as localized string
  const formattedTime = new Date(fetchTimestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return (
    <div
      style={{
        padding: '4px 16px',
        fontSize: '10px',
        fontWeight: 400,
        color: isExpired ? '#A16207' : '#64748B',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid #E5E5E5',
      }}
    >
      {/* D-16: Timestamp */}
      <span>上次更新: {formattedTime}</span>

      {/* D-17: Expired warning */}
      {isExpired && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#A16207' }}>
          <AlertCircle style={{ width: 12, height: 12 }} />
          数据已过期，建议稍后刷新
        </span>
      )}

      {/* D-18: Offline indicator (optional) */}
      {isFromCache && !isExpired && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <WifiOff style={{ width: 12, height: 12 }} />
          离线模式
        </span>
      )}
    </div>
  )
}