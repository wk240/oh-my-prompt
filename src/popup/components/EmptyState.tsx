function EmptyState() {
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