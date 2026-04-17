import { usePromptStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { Trash2 } from 'lucide-react'

const ALL_CATEGORY_ID = 'all'

interface CategorySidebarProps {
  onDeleteCategory: (categoryId: string, categoryName: string) => void
  onAddCategory: () => void
}

function CategorySidebar({ onDeleteCategory, onAddCategory }: CategorySidebarProps) {
  const { categories, selectedCategoryId, setSelectedCategory, prompts } = usePromptStore()

  return (
    <div className="w-[160px] h-full flex flex-col bg-white border-r border-[#E5E5E5]">
      {/* Category Header */}
      <div className="pt-4 pb-3 text-center">
        <span
          className="text-[12px] font-medium text-[#64748B] tracking-[1px]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          CAT
        </span>
      </div>

      {/* Category Items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-[14px] scrollbar-thin">
        {/* All Category - Virtual */}
        <div className="group relative">
          <button
            onClick={() => setSelectedCategory(ALL_CATEGORY_ID)}
            className={cn(
              "w-full py-3 flex flex-col items-center transition-colors",
              selectedCategoryId === ALL_CATEGORY_ID
                ? "border-b-2 border-[#A16207]"
                : "border-b border-[#E5E5E5]"
            )}
          >
            <span
              className={cn(
                "text-[13px] leading-tight",
                selectedCategoryId === ALL_CATEGORY_ID
                  ? "text-[#171717] font-semibold"
                  : "text-[#64748B]"
              )}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              全部
            </span>
            <span className="text-[10px] text-[#94A3B8] mt-0.5">
              {prompts.length} 个
            </span>
          </button>
        </div>

        {categories.map((category) => (
          <div
            key={category.id}
            className="group relative"
          >
            <button
              onClick={() => setSelectedCategory(category.id)}
              className={cn(
                "w-full py-3 flex flex-col items-center transition-colors",
                selectedCategoryId === category.id
                  ? "border-b-2 border-[#A16207]"
                  : "border-b border-[#E5E5E5]"
              )}
            >
              <span
                className={cn(
                  "text-[13px] leading-tight",
                  selectedCategoryId === category.id
                    ? "text-[#171717] font-semibold"
                    : "text-[#64748B]"
                )}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {category.name}
              </span>
              <span className="text-[10px] text-[#94A3B8] mt-0.5">
                {prompts.filter(p => p.categoryId === category.id).length} 个
              </span>
            </button>

            {/* Delete button for categories */}
            <button
              onClick={() => onDeleteCategory(category.id, category.name)}
              className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-100 rounded transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#64748B] hover:text-red-500" />
            </button>
          </div>
        ))}
      </div>

      {/* Add Category Button */}
      <div className="p-[14px] border-t border-[#E5E5E5]">
        <button
          onClick={onAddCategory}
          className="w-full py-2 text-[13px] text-[#64748B] hover:text-[#171717] hover:bg-gray-50 rounded transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  )
}

export default CategorySidebar