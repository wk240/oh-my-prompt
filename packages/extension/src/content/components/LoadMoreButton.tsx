/**
 * LoadMoreButton - Pagination button for network prompts
 * Phase 7: "加载更多" UX with 50-item pages (D-10, D-11, D-12)
 */

interface LoadMoreButtonProps {
  loadedCount: number
  totalCount: number
  onLoadMore: () => void
  isLoading?: boolean
}

export function LoadMoreButton({ loadedCount, totalCount, onLoadMore, isLoading = false }: LoadMoreButtonProps) {
  const isAllLoaded = loadedCount >= totalCount

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E5E5' }}>
      {/* D-12: Count indicator */}
      <div style={{ fontSize: '10px', color: '#64748B', textAlign: 'center', marginBottom: '8px' }}>
        已加载 {loadedCount}/{totalCount} 条
      </div>
      {/* D-10: Load more button */}
      <button
        onClick={onLoadMore}
        disabled={isLoading || isAllLoaded}
        style={{
          width: '100%',
          height: '40px',
          background: isAllLoaded ? '#f0f0f0' : '#f8f8f8',
          border: '1px solid #E5E5E5',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          color: '#171717',
          cursor: isAllLoaded ? 'not-allowed' : 'pointer',
          opacity: isAllLoaded ? 0.5 : 1,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {isLoading ? '加载中...' : isAllLoaded ? '已全部加载' : '加载更多'}
      </button>
    </div>
  )
}