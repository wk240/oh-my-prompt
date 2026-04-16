import { usePromptStore } from '../../lib/store'
import { ScrollArea } from './ui/scroll-area'
import PromptCard from './PromptCard'
import EmptyState from './EmptyState'
import type { Prompt } from '../../shared/types'

interface PromptListProps {
  onEditPrompt: (prompt: Prompt) => void
  onDeletePrompt: (id: string) => void
}

function PromptList({ onEditPrompt, onDeletePrompt }: PromptListProps) {
  const prompts = usePromptStore(state => state.getFilteredPrompts())

  if (prompts.length === 0) {
    return <EmptyState />
  }

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="flex flex-col gap-2">
        {prompts.map(prompt => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            onEdit={onEditPrompt}
            onDelete={onDeletePrompt}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

export default PromptList