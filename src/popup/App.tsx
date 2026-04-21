import { useEffect, useState } from 'react'
import { usePromptStore } from '../lib/store'
import { exportData, readImportFile, mergeImportData } from '../lib/import-export'
import type { Prompt, StorageSchema } from '../shared/types'
import type { UpdateStatus } from '../lib/version-checker'
import { useToast } from '../hooks/use-toast'
import { MessageType } from '../shared/messages'
import Header from './components/Header'
import CategorySidebar from './components/CategorySidebar'
import PromptList from './components/PromptList'
import PromptEditDialog from './components/PromptEditDialog'
import AddCategoryDialog from './components/AddCategoryDialog'
import EditCategoryDialog from './components/EditCategoryDialog'
import DeleteConfirmDialog from './components/DeleteConfirmDialog'
import UpdateGuideDialog from './components/UpdateGuideDialog'
import { Toaster } from './components/ui/toaster'

const ALL_CATEGORY_ID = 'all'

function App() {
  const { loadFromStorage, isLoading, deletePrompt, deleteCategory, prompts, categories, setSelectedCategory } = usePromptStore()
  const { toast } = useToast()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [addCategoryDialogOpen, setAddCategoryDialogOpen] = useState(false)
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [categoryToEdit, setCategoryToEdit] = useState<{
    id: string
    name: string
  } | null>(null)
  const [promptToDelete, setPromptToDelete] = useState<{
    id: string
    name: string
  } | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string
    name: string
  } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateGuideOpen, setUpdateGuideOpen] = useState(false)

  useEffect(() => {
    loadFromStorage()
    // Fetch update status on popup open
    chrome.runtime.sendMessage({ type: MessageType.GET_UPDATE_STATUS }, (response) => {
      if (response?.success && response.data) {
        setUpdateStatus(response.data)
      }
    })
  }, [loadFromStorage])

  const dismissUpdate = () => {
    chrome.runtime.sendMessage({ type: MessageType.CLEAR_UPDATE_STATUS }, () => {
      setUpdateStatus(null)
      setUpdateGuideOpen(false)
    })
  }

  const openUpdateGuide = () => {
    setUpdateGuideOpen(true)
  }

  const handleRefresh = async () => {
    // Always open backup page for user to choose action
    chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })
  }

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
        // Merge imported data with existing data
        const { prompts: existingPrompts, categories: existingCategories } = usePromptStore.getState()
        const merged = mergeImportData(
          { prompts: existingPrompts, categories: existingCategories },
          result.data.userData
        )

        usePromptStore.setState({
          prompts: merged.prompts,
          categories: merged.categories,
          selectedCategoryId: 'all'
        })
        // Persist to chrome.storage
        await usePromptStore.getState().saveToStorage()

        toast({
          title: '导入成功',
          description: `新增 ${merged.addedCount} 条提示词，跳过 ${merged.skippedCount} 条重复项`
        })
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
    const version = chrome.runtime.getManifest().version
    const data: StorageSchema = {
      version,
      userData: { prompts, categories },
      settings: { showBuiltin: true, syncEnabled: false }
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

  const handleEditCategory = (id: string, name: string) => {
    setCategoryToEdit({ id, name })
    setEditCategoryDialogOpen(true)
  }

  const handleEditCategoryDialogClose = () => {
    setEditCategoryDialogOpen(false)
    setCategoryToEdit(null)
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
      <div className="w-full h-full flex items-center justify-center p-6">
        <span className="text-muted-foreground text-base">加载中...</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden">
      {/* Update notification banner */}
      {updateStatus?.hasUpdate && (
        <div className="bg-orange-50 border-b border-orange-200 px-3 py-2 flex items-center gap-2 text-sm">
          <span className="text-orange-700 font-medium">新版本 {updateStatus.latestVersion} 可用</span>
          <button
            onClick={openUpdateGuide}
            className="text-orange-600 hover:text-orange-800 underline font-medium cursor-pointer"
          >
            查看更新引导
          </button>
          <button
            onClick={dismissUpdate}
            className="text-gray-400 hover:text-gray-600 ml-auto text-lg leading-none"
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}
      <Header onImport={handleImport} onExport={handleExport} onRefresh={handleRefresh} onUpdateAvailable={setUpdateStatus} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <CategorySidebar
          onDeleteCategory={handleDeleteCategory}
          onEditCategory={handleEditCategory}
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
      {categoryToEdit && (
        <EditCategoryDialog
          open={editCategoryDialogOpen}
          onClose={handleEditCategoryDialogClose}
          categoryId={categoryToEdit.id}
          currentName={categoryToEdit.name}
        />
      )}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={handleDeleteDialogClose}
        onConfirm={confirmDelete}
        itemName={promptToDelete?.name || categoryToDelete?.name || ''}
        description={categoryToDelete ? '该分类下的所有提示词将被删除。' : undefined}
      />
      <UpdateGuideDialog
        status={updateStatus}
        open={updateGuideOpen}
        onClose={() => setUpdateGuideOpen(false)}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  )
}

export default App