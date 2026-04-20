import { useMemo } from 'react'
import { usePromptStore } from '../../lib/store'
import { Plus } from 'lucide-react'
import PromptCard from './PromptCard'
import EmptyState from './EmptyState'
import type { Prompt } from '../../shared/types'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { sortPromptsByOrder } from '../../shared/utils'

const ALL_CATEGORY_ID = 'all'

interface PromptListProps {
  onEditPrompt: (prompt: Prompt) => void
  onDeletePrompt: (id: string) => void
  onAddPrompt: () => void
}

function PromptList({ onEditPrompt, onDeletePrompt, onAddPrompt }: PromptListProps) {
  const prompts = usePromptStore(state => state.prompts)
  const selectedCategoryId = usePromptStore(state => state.selectedCategoryId)
  const reorderPrompts = usePromptStore(state => state.reorderPrompts)
  const reorderAllPrompts = usePromptStore(state => state.reorderAllPrompts)

  const filteredPrompts = useMemo(() => {
    let categoryPrompts: Prompt[]
    if (selectedCategoryId === ALL_CATEGORY_ID) {
      categoryPrompts = prompts
    } else {
      categoryPrompts = prompts.filter(p => p.categoryId === selectedCategoryId)
    }
    return sortPromptsByOrder(categoryPrompts)
  }, [prompts, selectedCategoryId])

  const hasPromptsElsewhere = prompts.length > 0
  const showDragHandles = filteredPrompts.length >= 2

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = filteredPrompts.findIndex(p => p.id === active.id)
      const newIndex = filteredPrompts.findIndex(p => p.id === over.id)
      const newOrder = [...filteredPrompts]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, filteredPrompts[oldIndex])

      if (selectedCategoryId === 'all') {
        // Global sorting: update order for all prompts
        reorderAllPrompts(newOrder.map(p => p.id))
      } else if (selectedCategoryId !== null) {
        // Category-specific sorting
        reorderPrompts(selectedCategoryId, newOrder.map(p => p.id))
      }
    }
  }

  if (filteredPrompts.length === 0) {
    return (
      <div className="flex-1 flex flex-col p-5 overflow-hidden bg-white">
        <div className="flex-1 flex flex-col items-center justify-center">
          <EmptyState hasPromptsElsewhere={hasPromptsElsewhere} selectedCategoryId={selectedCategoryId} />
        </div>
        {/* Add Prompt Button */}
        <div className="pt-4 mt-2 border-t border-[#E5E5E5]">
          <button
            onClick={onAddPrompt}
            className="flex items-center justify-center gap-2.5 h-[48px] w-full bg-[#171717] hover:bg-[#171717]/90 transition-colors rounded-sm"
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2} />
            <span
              className="text-[14px] font-medium tracking-[0.5px] text-white"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Add Prompt
            </span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-5 overflow-hidden bg-white">
      {/* List Header */}
      <div className="flex justify-between items-center pb-4">
        <span
          className="text-[13px] text-[#64748B] font-medium"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {filteredPrompts.length} prompts
        </span>
      </div>

      {/* Prompt Cards with Drag Sorting */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={filteredPrompts.map(p => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-4 gap-3">
              {filteredPrompts.map((prompt, index) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={index === 0}
                  onEdit={onEditPrompt}
                  onDelete={onDeletePrompt}
                  showDragHandle={showDragHandles}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Add Prompt Button */}
      <div className="pt-4 mt-2 border-t border-[#E5E5E5]">
        <button
          onClick={onAddPrompt}
          className="flex items-center justify-center gap-2.5 h-[48px] w-full bg-[#171717] hover:bg-[#171717]/90 transition-colors rounded-sm"
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2} />
          <span
            className="text-[14px] font-medium tracking-[0.5px] text-white"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Add Prompt
          </span>
        </button>
      </div>
    </div>
  )
}

export default PromptList