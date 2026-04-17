import { Sparkles, Palette, Shapes, MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Button } from './ui/button'
import type { Prompt } from '../../shared/types'

interface PromptCardProps {
  prompt: Prompt
  isActive?: boolean
  onEdit: (prompt: Prompt) => void
  onDelete: (id: string) => void
}

// Icon mapping for prompt categories/types
const ICON_MAP = {
  design: Sparkles,
  style: Palette,
  default: Shapes,
}

function PromptCard({ prompt, isActive = false, onEdit, onDelete }: PromptCardProps) {
  // Determine icon based on category
  const IconComponent = ICON_MAP[prompt.categoryId === 'design' ? 'design' : prompt.categoryId === 'style' ? 'style' : 'default']

  const iconColor = isActive ? '#A16207' : '#171717'
  const borderColor = isActive ? '#A16207' : '#171717'

  return (
    <div
      className="group relative flex flex-col items-center justify-center p-3 bg-white border border-[#E5E5E5] rounded-sm hover:bg-gray-50 transition-colors cursor-pointer min-h-[80px]"
      onClick={() => onEdit(prompt)}
    >
      {/* Icon */}
      <div
        className="w-[32px] h-[32px] flex items-center justify-center border shrink-0 mb-2"
        style={{ borderColor }}
      >
        <IconComponent
          className="w-4 h-4"
          style={{ color: iconColor }}
        />
      </div>

      {/* Name */}
      <span
        className="text-[13px] font-medium text-[#171717] text-center truncate w-full"
        style={{ fontFamily: 'Inter, sans-serif' }}
        title={prompt.name}
      >
        {prompt.name}
      </span>

      {/* Description */}
      {prompt.description && (
        <span
          className="text-[11px] text-[#64748B] text-center truncate w-full mt-1"
          style={{ fontFamily: 'Inter, sans-serif' }}
          title={prompt.description}
        >
          {prompt.description}
        </span>
      )}

      {/* Action Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-gray-100 absolute top-1 right-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-3 w-3 text-[#171717]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(prompt); }} className="text-[13px] py-2">
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(prompt.id); }}
            className="text-[13px] text-red-500 focus:text-red-500 py-2"
          >
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default PromptCard