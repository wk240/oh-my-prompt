import { usePromptStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { Trash2 } from 'lucide-react'

interface CategorySidebarProps {
  onDeleteCategory: (categoryId: string, categoryName: string) => void
  onAddCategory: () => void
}

function CategorySidebar({ onDeleteCategory, onAddCategory }: CategorySidebarProps) {
  const { categories, selectedCategoryId, setSelectedCategory } = usePromptStore()

  return (
    <div className="w-[72px] h-full flex flex-col bg-white border-r border-[#E5E5E5]">
      {/* Category Header */}
      <div className="pt-3 pb-2 text-center">
        <span
          className="text-[10px] font-medium text-[#64748B] tracking-[1px]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          CAT
        </span>
      </div>

      {/* Category Items */}
      <div className="flex-1 overflow-y-auto px-[12px]">
        {categories.map((category) => (
          <div
            key={category.id}
            className="group relative"
          >
            <button
              onClick={() => setSelectedCategory(category.id)}
              className={cn(
                "w-full py-2 flex flex-col items-center transition-colors",
                selectedCategoryId === category.id
                  ? "border-b-2 border-[#A16207]"
                  : "border-b border-[#E5E5E5]"
              )}
            >
              <span
                className={cn(
                  "text-[12px] truncate max-w-full",
                  selectedCategoryId === category.id
                    ? "text-[#171717] font-semibold"
                    : "text-[#64748B]"
                )}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {category.name}
              </span>
            </button>

            {/* Delete button for non-default categories */}
            {category.id !== 'default' && (
              <button
                onClick={() => onDeleteCategory(category.id, category.name)}
                className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-opacity"
              >
                <Trash2 className="w-3 h-3 text-[#64748B] hover:text-red-500" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Category Button */}
      <div className="p-[12px] border-t border-[#E5E5E5]">
        <button
          onClick={onAddCategory}
          className="w-full py-1 text-[12px] text-[#64748B] hover:text-[#171717] hover:bg-gray-50 rounded transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  )
}

export default CategorySidebar