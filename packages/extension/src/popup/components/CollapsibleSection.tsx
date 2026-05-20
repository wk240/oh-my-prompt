// packages/extension/src/popup/components/CollapsibleSection.tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  defaultExpanded?: boolean
  hint?: string
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  hint,
  children
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header - clickable to toggle */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          <h3 className={`font-medium ${expanded ? 'text-gray-900' : 'text-gray-700'}`}>
            {title}
          </h3>
        </div>
        {hint && !expanded && (
          <span className="text-xs text-gray-500">{hint}</span>
        )}
      </div>

      {/* Content - only show when expanded */}
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}