// Phase 2: Prompt types
export interface Prompt {
  id: string
  name: string
  nameEn?: string // English name for bilingual support
  content: string
  contentEn?: string // English content for bilingual support
  categoryId: string
  description?: string // Optional description for display in selection UI
  descriptionEn?: string // English description for bilingual support
  order: number // 分类内排序顺序
  updatedAt?: number // Timestamp for last modification (used for bidirectional sync)
  // Image support fields (optional)
  localImage?: string // Local image relative path, e.g. "images/{id}.jpg"
  remoteImageUrl?: string // Original network URL (record source, optional)
}

// Phase 3: Category types
export interface Category {
  id: string
  name: string
  nameEn?: string // English name for bilingual support
  order: number
  updatedAt?: number // Timestamp for last modification (used for bidirectional sync)
}

// User data container - all prompts and categories owned by user
export interface UserData {
  prompts: Prompt[]
  categories: Category[]
}