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

interface AddCategoryDialogProps {
  open: boolean
  onClose: () => void
}

function AddCategoryDialog({ open, onClose }: AddCategoryDialogProps) {
  const { addCategory } = usePromptStore()
  const { toast } = useToast()
  const [name, setName] = useState('')

  const handleSave = () => {
    if (!name.trim()) return
    addCategory(name.trim())
    toast({ title: '分类已添加' })
    setName('')
    onClose()
  }

  const handleClose = () => {
    setName('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[640px] max-w-[90vw] max-h-[85vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>添加分类</DialogTitle>
          <DialogDescription>创建新的提示词分类</DialogDescription>
        </DialogHeader>
        <div className="py-4 px-1 overflow-y-auto flex-1 min-h-0 -mx-1">
          <label className="text-sm text-muted-foreground mb-2 block">分类名称</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新分类名称"
          />
        </div>
        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AddCategoryDialog