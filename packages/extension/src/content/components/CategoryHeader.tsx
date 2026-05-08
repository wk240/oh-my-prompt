/**
 * CategoryHeader - Category label with item count
 * Styled as muted uppercase label per UI-SPEC
 */

import type { Category } from '../../shared/types'

interface CategoryHeaderProps {
  category: Category
  itemCount: number
}

export function CategoryHeader({ category, itemCount }: CategoryHeaderProps) {
  return (
    <div className="category-header">
      {category.name} ({itemCount})
    </div>
  )
}