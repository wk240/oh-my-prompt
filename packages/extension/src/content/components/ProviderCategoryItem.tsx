/**
 * ProviderCategoryItem - Sidebar item for ResourceCategory navigation
 * Displays category name + count
 */

import type { ResourceCategory } from '../../shared/types'
import { Database } from 'lucide-react'
import { Tooltip } from './Tooltip'

interface ProviderCategoryItemProps {
  category: ResourceCategory
  isSelected: boolean
  onSelect: (categoryId: string) => void
}

export function ProviderCategoryItem({ category, isSelected, onSelect }: ProviderCategoryItemProps) {
  return (
    <div
      className={`sidebar-category-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(category.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(category.id)
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        background: isSelected ? '#ffffff' : 'transparent',
        borderLeft: isSelected ? '2px solid #A16207' : 'none',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Database icon for resource categories */}
      <Database style={{ width: 14, height: 14, color: isSelected ? '#A16207' : '#64748B' }} />
      {/* Name with tooltip */}
      <Tooltip content={category.name}>
        <span style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#171717', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {category.name}
        </span>
      </Tooltip>
    </div>
  )
}