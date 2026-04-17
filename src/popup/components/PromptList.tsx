import { useMemo } from 'react'
import { usePromptStore } from '../../lib/store'
import PromptCard from './PromptCard'
import EmptyState from './EmptyState'
import type { Prompt } from '../../shared/types'

interface PromptListProps {
  onEditPrompt: (prompt: Prompt) => void
  onDeletePrompt: (id: string) => void
}

function PromptList({ onEditPrompt, onDeletePrompt }: PromptListProps) {
  const prompts = usePromptStore(state => state.prompts)
  const selectedCategoryId = usePromptStore(state => state.selectedCategoryId)

  const filteredPrompts = useMemo(() => {
    if (selectedCategoryId === null) {
      return prompts
    }
    return prompts.filter(p => p.categoryId === selectedCategoryId)
  }, [prompts, selectedCategoryId])

  if (filteredPrompts.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden bg-white">
      {/* List Header */}
      <div className="flex justify-between items-center pb-3">
        <span
          className="text-[11px] text-[#64748B]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {filteredPrompts.length} prompts
        </span>
      </div>

      {/* Prompt Cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3">
          {filteredPrompts.map((prompt, index) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              isActive={index === 0}
              onEdit={onEditPrompt}
              onDelete={onDeletePrompt}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default PromptList