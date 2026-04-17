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
  const previewContent = prompt.content.length > 80
    ? prompt.content.slice(0, 80) + '...'
    : prompt.content

  // Determine icon based on category
  const IconComponent = ICON_MAP[prompt.categoryId === 'design' ? 'design' : prompt.categoryId === 'style' ? 'style' : 'default']

  const iconColor = isActive ? '#A16207' : '#171717'
  const borderColor = isActive ? '#A16207' : '#171717'

  return (
    <div
      className="flex items-start gap-5 p-5 bg-white border border-[#E5E5E5] rounded-sm hover:bg-gray-50 transition-colors"
    >
      {/* Icon Frame */}
      <div
        className="w-[40px] h-[40px] flex items-center justify-center border shrink-0"
        style={{ borderColor }}
      >
        <IconComponent
          className="w-5 h-5"
          style={{ color: iconColor }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <span
          className="text-[15px] font-medium text-[#171717]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {prompt.name}
        </span>
        <span
          className="text-[13px] text-[#64748B] leading-relaxed"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {previewContent}
        </span>
      </div>

      {/* Action Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 p-0 hover:bg-gray-100 shrink-0">
            <MoreVertical className="h-4 w-4 text-[#171717]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => onEdit(prompt)} className="text-[13px] py-2">
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(prompt.id)}
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