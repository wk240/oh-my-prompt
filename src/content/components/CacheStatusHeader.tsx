/**
 * CacheStatusHeader - Header bar showing cache timestamp and status
 * Phase 7: Displays fetchTimestamp, expiry warning, offline indicator (D-16, D-17, D-18)
 */

import { AlertCircle, WifiOff, Search, X } from 'lucide-react'

interface CacheStatusHeaderProps {
  fetchTimestamp?: string
  isExpired?: boolean
  isFromCache?: boolean
  // Phase 8: Search UI props (D-01, D-04)
  isSearchExpanded?: boolean
  searchQuery?: string
  onSearchExpand?: () => void
  onSearchChange?: (query: string) => void
  onSearchClose?: () => void
}

export function CacheStatusHeader({
  fetchTimestamp,
  isExpired,
  isFromCache,
  isSearchExpanded = false,
  searchQuery = '',
  onSearchExpand,
  onSearchChange,
  onSearchClose
}: CacheStatusHeaderProps) {
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
        justifyContent: 'space-between',
        gap: '8px',
        borderBottom: '1px solid #E5E5E5',
      }}
    >
      {/* Left section: Timestamp and status indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

      {/* Right section: Search UI (D-01, D-03) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Search icon toggle (D-02: 14x14px) */}
        <button
          onClick={onSearchExpand}
          aria-label="搜索提示词"
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#64748B',
          }}
        >
          <Search style={{ width: 14, height: 14 }} />
        </button>

        {/* Expandable input (D-03: 200px, 0.2s ease-out) */}
        <div style={{
          width: isSearchExpanded ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'width 0.2s ease-out',
          transformOrigin: 'right',
        }}>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="搜索提示词..."
            autoFocus={isSearchExpanded}
            aria-label="搜索提示词"
            style={{
              width: '200px',
              padding: '6px 10px',
              border: '1px solid #E5E5E5',
              borderRadius: '4px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>

        {/* Close button (D-04: X icon, 14x14px) */}
        {isSearchExpanded && (
          <button
            onClick={onSearchClose}
            aria-label="关闭搜索"
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#171717',
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </div>
  )
}