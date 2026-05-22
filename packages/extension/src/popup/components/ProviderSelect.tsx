// src/popup/components/ProviderSelect.tsx
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'
import type { Provider, ProviderGroup } from '@oh-my-prompt/shared/types'

interface ProviderSelectProps {
  providers: Provider[]
  groups: ProviderGroup[]
  value: Provider | null
  onChange: (provider: Provider | null) => void
  disabled?: boolean
}

export function ProviderSelect({ providers: _providers, groups, value, onChange, disabled }: ProviderSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter providers by search query (support both name and nameCn)
  const filteredGroups = groups.map(group => ({
    ...group,
    providers: group.providers.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.nameCn && p.nameCn.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(g => g.providers.length > 0)

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      })
    }
  }, [isOpen])

  // Close dropdown on outside click (use click event, not mousedown)
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      // Check if click is outside both trigger and dropdown
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to ensure dropdown is rendered before adding listener
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (provider: Provider) => {
    onChange(provider)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleTriggerClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium text-gray-700 block mb-1">
        服务商
      </label>

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 rounded flex items-center justify-between bg-white hover:border-gray-300 focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value ? (value.nameCn || value.name) : '选择服务商...'}
        </span>
        <ChevronDown style={{ width: 16, height: 16 }} className="text-gray-400" />
      </button>

      {/* Dropdown via Portal */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white border border-gray-200 rounded shadow-lg max-h-96 overflow-y-auto"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width
          }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded">
              <Search style={{ width: 14, height: 14 }} className="text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索服务商..."
                className="flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Provider groups */}
          {filteredGroups.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              没有匹配的服务商
            </div>
          ) : (
            filteredGroups.map(group => (
              <div key={group.type}>
                <div className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
                  {group.label}
                </div>
                {group.providers.map(provider => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelect(provider)
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-900">
                      {provider.nameCn || provider.name}
                      {provider.nameCn && <span className="text-xs text-gray-500 ml-1">({provider.name})</span>}
                    </span>
                    {value?.id === provider.id && (
                      <Check style={{ width: 14, height: 14 }} className="text-green-600" />
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}