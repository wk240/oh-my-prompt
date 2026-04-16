interface EmptyStateProps {
  hasPromptsElsewhere: boolean
  selectedCategoryId: string | null
}

function EmptyState({ hasPromptsElsewhere, selectedCategoryId }: EmptyStateProps) {
  // If viewing a specific category that has no prompts, but other categories do
  if (hasPromptsElsewhere && selectedCategoryId !== null) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-center">
        <p className="text-sm font-medium">当前分类暂无提示词</p>
        <p className="text-xs text-muted-foreground mt-1">
          请选择其他分类或添加新提示词
        </p>
      </div>
    )
  }

  // No prompts anywhere
  return (
    <div className="flex flex-col items-center justify-center p-4 text-center">
      <p className="text-sm font-medium">暂无提示词</p>
      <p className="text-xs text-muted-foreground mt-1">
        点击下方「添加提示词」创建第一个模板
      </p>
    </div>
  )
}

export default EmptyState