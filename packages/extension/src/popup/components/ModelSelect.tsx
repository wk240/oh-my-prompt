// src/popup/components/ModelSelect.tsx
import { useState, useRef, useEffect } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (modelId: string) => {
    onChange(modelId)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium text-gray-700 block mb-1">
        模型
      </label>

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 rounded flex items-center justify-between bg-white hover:border-gray-300 focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || '选择模型...'}
        </span>
        <ChevronDown style={{ width: 16, height: 16 }} className="text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto">
          {models.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              没有可用模型
            </div>
          ) : (
            models.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => handleSelect(model.id)}
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
        </div>
      )}
    </div>
  )
}