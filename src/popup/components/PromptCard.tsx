import { MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Button } from './ui/button'
import type { Prompt } from '../../shared/types'

interface PromptCardProps {
  prompt: Prompt
  onEdit: (prompt: Prompt) => void
  onDelete: (id: string) => void
}

function PromptCard({ prompt, onEdit, onDelete }: PromptCardProps) {
  const previewContent = prompt.content.length > 50
    ? prompt.content.slice(0, 50) + '...'
    : prompt.content

  return (
    <div className="rounded-md border border-border p-3 hover:bg-muted/50 transition-colors flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium truncate">{prompt.name}</h3>
        <p className="text-xs text-muted-foreground truncate">{previewContent}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(prompt)}>
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(prompt.id)} className="text-destructive">
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default PromptCard