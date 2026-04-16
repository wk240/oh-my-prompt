import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
      <DialogContent className="w-[280px]">
        <DialogHeader>
          <DialogTitle>添加分类</DialogTitle>
        </DialogHeader>
        <div>
          <label className="text-xs text-muted-foreground mb-1">分类名称</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新分类名称"
          />
        </div>
        <DialogFooter>
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