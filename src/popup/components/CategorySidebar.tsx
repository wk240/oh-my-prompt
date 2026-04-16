import { usePromptStore } from '../../lib/store'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { cn } from '../../lib/utils'
import { Trash2, Plus } from 'lucide-react'

interface CategorySidebarProps {
  onDeleteCategory: (categoryId: string, categoryName: string) => void
  onAddCategory: () => void
}

function CategorySidebar({ onDeleteCategory, onAddCategory }: CategorySidebarProps) {
  const { categories, selectedCategoryId, setSelectedCategory } = usePromptStore()

  return (
    <div className="w-[80px] h-full border-r border-border flex flex-col">
      <ScrollArea className="flex-1">
        {categories.map((category) => (
          <div
            key={category.id}
            className={cn(
              "group flex items-center justify-between px-2 py-3 hover:bg-muted transition-colors",
              selectedCategoryId === category.id && "bg-primary/10"
            )}
          >
            <button
              onClick={() => setSelectedCategory(category.id)}
              className={cn(
                "flex-1 text-sm text-left truncate",
                selectedCategoryId === category.id && "text-primary font-medium"
              )}
            >
              {category.name}
            </button>
            {category.id !== 'default' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onDeleteCategory(category.id, category.name)}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </ScrollArea>
      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={onAddCategory}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default CategorySidebar