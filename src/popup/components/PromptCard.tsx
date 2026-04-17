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
  const previewContent = prompt.content.length > 40
    ? prompt.content.slice(0, 40) + '...'
    : prompt.content

  // Determine icon based on category
  const IconComponent = ICON_MAP[prompt.categoryId === 'design' ? 'design' : prompt.categoryId === 'style' ? 'style' : 'default']

  const iconColor = isActive ? '#A16207' : '#171717'
  const borderColor = isActive ? '#A16207' : '#171717'

  return (
    <div
      className="flex items-center gap-4 p-4 bg-white border border-[#E5E5E5] rounded-sm hover:bg-gray-50 transition-colors"
    >
      {/* Icon Frame */}
      <div
        className="w-[32px] h-[32px] flex items-center justify-center border"
        style={{ borderColor }}
      >
        <IconComponent
          className="w-4 h-4"
          style={{ color: iconColor }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <span
          className="text-[13px] font-medium text-[#171717] truncate"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {prompt.name}
        </span>
        <span
          className="text-[11px] text-[#64748B] truncate"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {previewContent}
        </span>
      </div>

      {/* Action Menu or Arrow */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 p-0 hover:bg-gray-100">
            <MoreVertical className="h-3.5 w-3.5 text-[#171717]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={() => onEdit(prompt)} className="text-[12px]">
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(prompt.id)}
            className="text-[12px] text-red-500 focus:text-red-500"
          >
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default PromptCard