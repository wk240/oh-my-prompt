import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { usePromptStore } from '../../lib/store'
import { useToast } from '../../hooks/use-toast'

interface EditCategoryDialogProps {
  open: boolean
  onClose: () => void
  categoryId: string
  currentName: string
}

function EditCategoryDialog({ open, onClose, categoryId, currentName }: EditCategoryDialogProps) {
  const { updateCategory } = usePromptStore()
  const { toast } = useToast()
  const [name, setName] = useState(currentName)

  // Reset name when dialog opens with new currentName
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(currentName)
    } else {
      onClose()
    }
  }

  const handleSave = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: '分类名称不能为空', variant: 'destructive' })
      return
    }
    if (trimmedName === currentName) {
      onClose()
      return
    }
    updateCategory(categoryId, trimmedName)
    toast({ title: '分类已更新' })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[640px] max-w-[90vw] max-h-[85vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>编辑分类</DialogTitle>
          <DialogDescription>修改分类名称</DialogDescription>
        </DialogHeader>
        <div className="py-4 px-1 overflow-y-auto flex-1 min-h-0 -mx-1">
          <label className="text-sm text-muted-foreground mb-2 block">分类名称</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="分类名称"
          />
        </div>
        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditCategoryDialog