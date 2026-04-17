import { useEffect, useState } from 'react'
import { usePromptStore } from '../lib/store'
import { exportData, readImportFile } from '../lib/import-export'
import type { Prompt, StorageSchema } from '../shared/types'
import { useToast } from '../hooks/use-toast'
import Header from './components/Header'
import CategorySidebar from './components/CategorySidebar'
import PromptList from './components/PromptList'
import PromptEditDialog from './components/PromptEditDialog'
import AddCategoryDialog from './components/AddCategoryDialog'
import DeleteConfirmDialog from './components/DeleteConfirmDialog'
import { Plus } from 'lucide-react'
import { Toaster } from './components/ui/toaster'

function App() {
  const { loadFromStorage, isLoading, deletePrompt, deleteCategory, prompts, categories, setSelectedCategory } = usePromptStore()
  const { toast } = useToast()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [addCategoryDialogOpen, setAddCategoryDialogOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [promptToDelete, setPromptToDelete] = useState<{
    id: string
    name: string
  } | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string
    name: string
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      const result = await loadFromStorage()
      if (!result.success) {
        toast({
          title: '加载失败',
          description: result.error || '数据加载失败',
          variant: 'destructive'
        })
      }
    }
    load()
  }, [loadFromStorage, toast])

  const handleImport = async () => {
    // Create file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const result = await readImportFile(file)

      if (result.valid && result.data) {
        // Save imported data to storage
        const { prompts, categories } = result.data
        usePromptStore.setState({
          prompts,
          categories,
          selectedCategoryId: 'default'
        })
        // Persist to chrome.storage
        await usePromptStore.getState().saveToStorage()
        toast({ title: '导入成功', description: '提示词数据已恢复' })
      } else {
        toast({
          title: '导入失败',
          description: result.error || 'JSON格式不正确',
          variant: 'destructive'
        })
      }
    }

    input.click()
  }

  const handleExport = async () => {
    const data: StorageSchema = {
      prompts,
      categories,
      version: '1.0.0'
    }
    try {
      await exportData(data)
      toast({
        title: '导出成功',
        description: `文件已保存为 lovart-prompts-${new Date().toISOString().slice(0, 10)}.json`
      })
    } catch (error) {
      toast({
        title: '导出失败',
        description: '请检查下载权限',
        variant: 'destructive'
      })
    }
  }

  const handleEditPrompt = (prompt: Prompt) => {
    setEditingPrompt(prompt)
    setEditDialogOpen(true)
  }

  const handleDeletePrompt = (id: string) => {
    const prompt = prompts.find((p) => p.id === id)
    if (prompt) {
      setPromptToDelete({ id, name: prompt.name })
      setDeleteDialogOpen(true)
    }
  }

  const confirmDelete = () => {
    if (categoryToDelete) {
      deleteCategory(categoryToDelete.id)
      // Auto-select default category after deletion
      setSelectedCategory('default')
      toast({ title: '分类已删除', description: '提示词已移至默认分类' })
      setCategoryToDelete(null)
      setDeleteDialogOpen(false)
    } else if (promptToDelete) {
      deletePrompt(promptToDelete.id)
      toast({ title: '提示词已删除' })
      setPromptToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  const handleDeleteCategory = (id: string, name: string) => {
    // Prevent deleting default category
    if (id === 'default') {
      toast({
        title: '无法删除',
        description: '默认分类不可删除',
        variant: 'destructive'
      })
      return
    }
    setCategoryToDelete({ id, name })
    setPromptToDelete(null)
    setDeleteDialogOpen(true)
  }

  const handleAddCategory = () => {
    setAddCategoryDialogOpen(true)
  }

  const handleAddPrompt = () => {
    setEditingPrompt(null)
    setEditDialogOpen(true)
  }

  const handleEditDialogClose = () => {
    setEditDialogOpen(false)
    setEditingPrompt(null)
  }

  const handleDeleteDialogClose = () => {
    setDeleteDialogOpen(false)
    setPromptToDelete(null)
    setCategoryToDelete(null)
  }

  if (isLoading) {
    return (
      <div className="w-[300px] min-h-[400px] flex flex-col bg-background">
        <Header onImport={handleImport} onExport={handleExport} />
        <div className="flex flex-1 items-center justify-center">
          <span className="text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[300px] h-[500px] flex flex-col bg-white overflow-hidden">
      <Header onImport={handleImport} onExport={handleExport} />
      <div className="flex flex-1 overflow-hidden">
        <CategorySidebar
          onDeleteCategory={handleDeleteCategory}
          onAddCategory={handleAddCategory}
        />
        <PromptList
          onEditPrompt={handleEditPrompt}
          onDeletePrompt={handleDeletePrompt}
        />
      </div>
      {/* CTA Section */}
      <div className="flex flex-col justify-center px-5 pt-4 pb-5 border-t border-[#E5E5E5] bg-white">
        <button
          onClick={handleAddPrompt}
          className="flex items-center justify-center gap-2 h-[44px] w-full bg-[#171717] hover:bg-[#171717]/90 transition-colors"
        >
          <Plus className="w-4 h-4 text-white" strokeWidth={2} />
          <span
            className="text-[12px] font-medium tracking-[0.5px] text-white"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Add Prompt
          </span>
        </button>
      </div>

      {/* Dialogs */}
      <PromptEditDialog
        prompt={editingPrompt}
        open={editDialogOpen}
        onClose={handleEditDialogClose}
      />
      <AddCategoryDialog
        open={addCategoryDialogOpen}
        onClose={() => setAddCategoryDialogOpen(false)}
      />
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={handleDeleteDialogClose}
        onConfirm={confirmDelete}
        itemName={promptToDelete?.name || categoryToDelete?.name || ''}
        description={categoryToDelete ? '提示词将移至默认分类。' : undefined}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  )
}

export default App