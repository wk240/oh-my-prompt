import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { usePromptStore } from '../../lib/store'
import { useToast } from '../../hooks/use-toast'
import type { Prompt } from '../../shared/types'

interface PromptEditDialogProps {
  prompt: Prompt | null // null = add mode
  open: boolean
  onClose: () => void
}

function PromptEditDialog({
  prompt,
  open,
  onClose,
}: PromptEditDialogProps) {
  const { categories, addPrompt, updatePrompt, selectedCategoryId } =
    usePromptStore()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(selectedCategoryId || 'default')

  // Reset form when dialog opens or prompt changes
  useEffect(() => {
    if (open) {
      if (prompt) {
        setName(prompt.name)
        setContent(prompt.content)
        setCategoryId(prompt.categoryId)
      } else {
        setName('')
        setContent('')
        setCategoryId(selectedCategoryId || 'default')
      }
    }
  }, [prompt, open, selectedCategoryId])

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return

    if (prompt) {
      // Edit mode - update existing prompt
      updatePrompt(prompt.id, { name: name.trim(), content: content.trim(), categoryId })
      toast({ title: '提示词已更新' })
    } else {
      // Add mode - create new prompt
      addPrompt({ name: name.trim(), content: content.trim(), categoryId })
      toast({ title: '提示词已添加' })
    }
    onClose()
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[280px]">
        <DialogHeader>
          <DialogTitle>{prompt ? '编辑提示词' : '添加提示词'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              名称
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="提示词名称"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              内容
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="提示词内容"
              rows={4}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              所属分类
            </label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PromptEditDialog