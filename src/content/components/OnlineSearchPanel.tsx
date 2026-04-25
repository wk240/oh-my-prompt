/**
 * OnlineSearchPanel - Search panel for prompts.chat integration
 * Features: search input with debouncing, category filter, infinite scroll, loading/error states
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, Search } from 'lucide-react'
import type { OnlinePrompt, OnlineCategory } from '../../shared/types'
import { searchOnlinePrompts, getOnlinePromptsByCategory, PREDEFINED_ONLINE_CATEGORIES } from '../../lib/prompts-chat-api'
import { OnlinePromptCard } from './OnlinePromptCard'

// Debounce delay for search input (ms)
const DEBOUNCE_DELAY = 300

// Infinite scroll threshold (px from bottom)
const SCROLL_THRESHOLD = 100

// Items per page for pagination
const PER_PAGE = 20

interface OnlineSearchPanelProps {
  onPromptClick: (prompt: OnlinePrompt) => void
  onInject: (prompt: OnlinePrompt) => void
  onCollect: (prompt: OnlinePrompt) => void
  isCollected: (prompt: OnlinePrompt) => boolean
  scrollContainerRef: React.RefObject<HTMLDivElement>
}

export function OnlineSearchPanel({
  onPromptClick,
  onInject,
  onCollect,
  isCollected,
  scrollContainerRef,
}: OnlineSearchPanelProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Category filter state - null means "all categories"
  const [selectedCategory, setSelectedCategory] = useState<OnlineCategory | null>(null)

  // Results state
  const [prompts, setPrompts] = useState<OnlinePrompt[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setPage(1) // Reset to first page on new search
    }, DEBOUNCE_DELAY)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch prompts when debouncedQuery or selectedCategory changes
  useEffect(() => {
    const fetchPrompts = async () => {
      setIsLoading(true)
      setError(null)

      try {
        let response
        if (debouncedQuery) {
          // Search by keyword
          response = await searchOnlinePrompts(debouncedQuery, 1, PER_PAGE)
        } else if (selectedCategory) {
          // Get by category
          response = await getOnlinePromptsByCategory(selectedCategory.id, 1, PER_PAGE)
        } else {
          // Default: show image generation category
          response = await getOnlinePromptsByCategory(PREDEFINED_ONLINE_CATEGORIES[0].id, 1, PER_PAGE)
        }

        setPrompts(response.prompts)
        setTotal(response.total)
        setHasMore(response.page < response.totalPages)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败，请重试')
        setPrompts([])
        setTotal(0)
        setHasMore(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPrompts()
  }, [debouncedQuery, selectedCategory])

  // Load more prompts for infinite scroll
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    setError(null)

    try {
      const nextPage = page + 1
      let response

      if (debouncedQuery) {
        response = await searchOnlinePrompts(debouncedQuery, nextPage, PER_PAGE)
      } else if (selectedCategory) {
        response = await getOnlinePromptsByCategory(selectedCategory.id, nextPage, PER_PAGE)
      } else {
        response = await getOnlinePromptsByCategory(PREDEFINED_ONLINE_CATEGORIES[0].id, nextPage, PER_PAGE)
      }

      setPrompts(prev => [...prev, ...response.prompts])
      setPage(nextPage)
      setHasMore(response.page < response.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载更多失败')
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, hasMore, page, debouncedQuery, selectedCategory])

  // Infinite scroll handler
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container

      // Check if near bottom
      if (scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD) {
        loadMore()
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [scrollContainerRef, loadMore])

  // Handle category selection
  const handleCategoryChange = (category: OnlineCategory | null) => {
    setSelectedCategory(category)
    setPage(1)
    setSearchQuery('')
    setDebouncedQuery('')
  }

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('')
    setDebouncedQuery('')
    setPage(1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E5E5' }}>
        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Search
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#737373',
            }}
          />
          <input
            type="text"
            placeholder="搜索提示词..."
            value={searchQuery}
            onChange={handleSearchChange}
            style={{
              width: '100%',
              padding: '10px 32px 10px 36px',
              fontSize: '13px',
              border: '1px solid #E5E5E5',
              borderRadius: '8px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="清除搜索"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Category selector */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* "All" button - shows default category */}
          <button
            onClick={() => handleCategoryChange(null)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              border: selectedCategory === null ? '1px solid #171717' : '1px solid #E5E5E5',
              borderRadius: '16px',
              background: selectedCategory === null ? '#171717' : '#ffffff',
              color: selectedCategory === null ? '#ffffff' : '#171717',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            推荐
          </button>

          {/* Category buttons */}
          {PREDEFINED_ONLINE_CATEGORIES.map(category => (
            <button
              key={category.id}
              onClick={() => handleCategoryChange(category)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                border: selectedCategory?.id === category.id ? '1px solid #171717' : '1px solid #E5E5E5',
                borderRadius: '16px',
                background: selectedCategory?.id === category.id ? '#171717' : '#ffffff',
                color: selectedCategory?.id === category.id ? '#ffffff' : '#171717',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Loading state (initial load) */}
        {isLoading && prompts.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' }}>
            <Loader2 style={{ width: '24px', height: '24px', color: '#171717', animation: 'spin 1s linear infinite' }} />
            <span style={{ marginLeft: '8px', fontSize: '13px', color: '#737373' }}>加载中...</span>
          </div>
        )}

        {/* Error state */}
        {error && prompts.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' }}>
            <AlertCircle style={{ width: '32px', height: '32px', color: '#EF4444' }} />
            <span style={{ marginTop: '8px', fontSize: '13px', color: '#737373', textAlign: 'center' }}>{error}</span>
            <button
              onClick={() => {
                setError(null)
                setPage(1)
              }}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 500,
                border: '1px solid #E5E5E5',
                borderRadius: '6px',
                background: '#ffffff',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && prompts.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' }}>
            <span style={{ fontSize: '13px', color: '#737373' }}>暂无相关提示词</span>
          </div>
        )}

        {/* Results grid */}
        {prompts.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px',
              justifyContent: 'space-between',
            }}
          >
            {prompts.map(prompt => (
              <OnlinePromptCard
                key={prompt.id}
                prompt={prompt}
                onClick={() => onPromptClick(prompt)}
                onInject={() => onInject(prompt)}
                onCollect={() => onCollect(prompt)}
                isCollected={isCollected(prompt)}
              />
            ))}
          </div>
        )}

        {/* Load more indicator */}
        {isLoading && prompts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <Loader2 style={{ width: '16px', height: '16px', color: '#737373', animation: 'spin 1s linear infinite' }} />
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#737373' }}>加载更多...</span>
          </div>
        )}

        {/* End of results indicator */}
        {!isLoading && !hasMore && prompts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <span style={{ fontSize: '12px', color: '#A3A3A3' }}>已加载全部 ({total} 条)</span>
          </div>
        )}
      </div>

      {/* CSS for spin animation */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}