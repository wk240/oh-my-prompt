/**
 * SortableItem - Wrapper component for dnd-kit sortable items
 * Provides drag handle and sortable context integration
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'

interface SortableItemProps {
  id: string
  children: ReactNode
  showHandle?: boolean
}

export function SortableItem({ id, children, showHandle = true }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showHandle && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 text-[#64748B]" />
        </div>
      )}
      <div className={showHandle ? 'pl-6' : ''}>
        {children}
      </div>
    </div>
  )
}