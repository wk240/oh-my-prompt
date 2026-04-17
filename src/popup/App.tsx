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
import { Toaster } from './components/ui/toaster'

const ALL_CATEGORY_ID = 'all'

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
    loadFromStorage()
  }, [loadFromStorage])

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
          selectedCategoryId: 'all'
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
      // Auto-select 'all' category after deletion
      setSelectedCategory(ALL_CATEGORY_ID)
      setCategoryToDelete(null)
      setDeleteDialogOpen(false)
    } else if (promptToDelete) {
      deletePrompt(promptToDelete.id)
      setPromptToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  const handleDeleteCategory = (id: string, name: string) => {
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
      <div className="w-[680px] h-[520px] flex items-center justify-center p-6">
        <span className="text-muted-foreground text-base">加载中...</span>
      </div>
    )
  }

  return (
    <div className="w-[680px] h-[520px] flex flex-col bg-white overflow-hidden">
      <Header onImport={handleImport} onExport={handleExport} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <CategorySidebar
          onDeleteCategory={handleDeleteCategory}
          onAddCategory={handleAddCategory}
        />
        <PromptList
          onEditPrompt={handleEditPrompt}
          onDeletePrompt={handleDeletePrompt}
          onAddPrompt={handleAddPrompt}
        />
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
        description={categoryToDelete ? '该分类下的所有提示词将被删除。' : undefined}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  )
}

export default App