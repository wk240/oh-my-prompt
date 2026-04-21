---
name: edit-category-name
description: Add edit category name functionality
type: quick
status: in-progress
created: 2026-04-21
---

# Plan: Add Edit Category Name Feature

## Summary
Add functionality to edit existing category names via a dialog, similar to AddCategoryDialog.

## Implementation Steps

### 1. Store Layer (store.ts)
- Add `updateCategory(id: string, name: string)` method to PromptStore interface
- Implement updateCategory: update category name by id, then saveToStorage

### 2. UI Component (CategorySidebar.tsx)
- Import Pencil icon from lucide-react
- Add edit button next to delete button in category item
- Position: absolute right-8 (before delete button at right-0)
- Both buttons visible on hover

### 3. Edit Dialog (EditCategoryDialog.tsx)
- Create new component similar to AddCategoryDialog
- Props: open, onClose, categoryId, currentName
- Use updateCategory from store
- Validate: disallow empty names, show toast error

### 4. App.tsx Integration
- Add state: editCategoryDialogOpen, editingCategory (id + name)
- Add handler: onEditCategory(categoryId, categoryName)
- Pass handler to CategorySidebar
- Render EditCategoryDialog