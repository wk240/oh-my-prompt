// src/popup/components/ModelSelect.tsx
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Eye } from 'lucide-react'
import type { ModelInfo } from '@oh-my-prompt/shared/types'

interface ModelSelectProps {
  models: ModelInfo[]
  value: string
  onChange: (model: string) => void
  disabled?: boolean
}

export function ModelSelect({ models, value, onChange, disabled }: ModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const handleSelect = (modelId: string) => {
    onChange(modelId)
    setIsOpen(false)
  }

  const handleTriggerClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium text-gray-700 block mb-1">
        模型
      </label>

      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 rounded flex items-center justify-between bg-white hover:border-gray-300 focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || '选择模型...'}
        </span>
        <ChevronDown style={{ width: 16, height: 16 }} className="text-gray-400" />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto pointer-events-auto"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width
          }}
        >
          {models.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              没有可用模型
            </div>
          ) : (
            models.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelect(model.id)
                }}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="text-sm text-gray-900 flex items-center gap-1.5">
                  {model.id}
                  {model.visionCapable && (
                    <span title="支持视觉理解">
                      <Eye style={{ width: 12, height: 12 }} className="text-blue-500" />
                    </span>
                  )}
                </span>
                {value === model.id && (
                  <Check style={{ width: 14, height: 14 }} className="text-green-600" />
                )}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}