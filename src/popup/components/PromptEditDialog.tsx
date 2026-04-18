import { useState, useEffect } from 'react'
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
  const { categories, prompts, addPrompt, updatePrompt, selectedCategoryId } =
    usePromptStore()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(selectedCategoryId || categories[0]?.id || '')

  // Reset form when dialog opens or prompt changes
  useEffect(() => {
    if (open) {
      if (prompt) {
        setName(prompt.name)
        setDescription(prompt.description || '')
        setContent(prompt.content)
        setCategoryId(prompt.categoryId)
      } else {
        setName('')
        setDescription('')
        setContent('')
        setCategoryId(selectedCategoryId || categories[0]?.id || '')
      }
    }
  }, [prompt, open, selectedCategoryId])

  const handleSave = () => {
    if (!name.trim() || !content.trim() || !categoryId) return

    if (prompt) {
      // Edit mode - update existing prompt
      updatePrompt(prompt.id, {
        name: name.trim(),
        description: description.trim(),
        content: content.trim(),
        categoryId
      })
      toast({ title: '提示词已更新' })
    } else {
      // Add mode - create new prompt
      // Calculate next order value for the category
      const promptsInCategory = prompts.filter(p => p.categoryId === categoryId)
      const maxOrder = promptsInCategory.length > 0
        ? Math.max(...promptsInCategory.map(p => p.order))
        : -1

      addPrompt({
        name: name.trim(),
        description: description.trim(),
        content: content.trim(),
        categoryId,
        order: maxOrder + 1
      })
      toast({ title: '提示词已添加' })
    }
    onClose()
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[900px] max-w-[90vw] max-h-[85vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{prompt ? '编辑提示词' : '添加提示词'}</DialogTitle>
          <DialogDescription>
            {prompt ? '修改提示词的名称、内容和分类' : '添加新的提示词到您的收藏'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-4 px-1 overflow-y-auto flex-1 min-h-0 -mx-1">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              名称
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="提示词名称"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              描述（选填）
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短描述，用于列表展示"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              内容
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="提示词内容"
              rows={10}
              className="min-h-[200px]"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              所属分类
            </label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="选择分类" />
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
        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim() || !categoryId}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PromptEditDialog