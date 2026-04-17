function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <p className="text-[15px] font-medium">暂无提示词</p>
      <p className="text-[13px] text-muted-foreground mt-2">
        点击下方「添加提示词」创建第一个模板
      </p>
    </div>
  )
}

export default EmptyState