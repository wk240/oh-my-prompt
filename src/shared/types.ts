// Phase 2: Prompt types
export interface Prompt {
  id: string
  name: string
  content: string
  categoryId: string
}

// Phase 3: Category types
export interface Category {
  id: string
  name: string
  order: number
}

// Phase 3: Storage schema
export interface StorageSchema {
  prompts: Prompt[]
  categories: Category[]
  version: string
}