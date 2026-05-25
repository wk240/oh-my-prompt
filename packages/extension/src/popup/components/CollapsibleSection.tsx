import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  defaultExpanded?: boolean
  hint?: string
  children: React.ReactNode
}

export function CollapsibleSection({ title, defaultExpanded = false, hint, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div>
      <button
        className="flex items-center gap-1.5 w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown style={{ width: 14, height: 14 }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14 }} />
        )}
        <span>{title}</span>
        {hint && !expanded && (
          <span className="text-[10px] text-gray-400 ml-1">{hint}</span>
        )}
      </button>
      {expanded && (
        <div className="space-y-2">
          {hint && (
            <p className="text-[11px] text-gray-400 leading-relaxed px-1">{hint}</p>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
