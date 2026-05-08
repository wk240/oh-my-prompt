/**
 * Resource Library Loader
 * Loads built-in prompt library from split category JSON files
 */

import type { ResourcePrompt, ResourceCategory } from '../shared/types'

// Import index metadata
import indexData from '../data/resource-library/index.json'

// Import all category files (Vite will bundle these)
import gptImage from '../data/resource-library/categories/gpt-image.json'
import nanoBanana from '../data/resource-library/categories/nano-banana.json'
import promptsChatImage from '../data/resource-library/categories/prompts-chat-image.json'
import miniatures3d from '../data/resource-library/categories/3d-miniatures-dioramas.json'
import productPhotography from '../data/resource-library/categories/product-photography.json'
import characterDesign from '../data/resource-library/categories/character-design.json'
import foodCulinary from '../data/resource-library/categories/food-culinary.json'
import fantasyScifi from '../data/resource-library/categories/fantasy-scifi.json'
import sportsAction from '../data/resource-library/categories/sports-action.json'
import urbanCityscapes from '../data/resource-library/categories/urban-cityscapes.json'
import architectureInteriors from '../data/resource-library/categories/architecture-interiors.json'
import natureLandscapes from '../data/resource-library/categories/nature-landscapes.json'
import logoBranding from '../data/resource-library/categories/logo-branding.json'
import vintageRetro from '../data/resource-library/categories/vintage-retro.json'
import cinematicPosters from '../data/resource-library/categories/cinematic-posters.json'
import animeManga from '../data/resource-library/categories/anime-manga.json'
import minimalistIcons from '../data/resource-library/categories/minimalist-icons.json'
import misc from '../data/resource-library/categories/misc.json'
import portraitPhotography from '../data/resource-library/categories/portrait-photography.json'
import fashionPhotography from '../data/resource-library/categories/fashion-photography.json'

// Map of category file imports (using type assertion to handle null description fields)
const categoryFiles: Record<string, { categoryId: string; prompts: ResourcePrompt[] }> = {
  'gpt-image': gptImage as any,
  'nano-banana': nanoBanana as any,
  'prompts-chat-image': promptsChatImage as any,
  '3d-miniatures-dioramas': miniatures3d as any,
  'product-photography': productPhotography as any,
  'character-design': characterDesign as any,
  'food-culinary': foodCulinary as any,
  'fantasy-scifi': fantasyScifi as any,
  'sports-action': sportsAction as any,
  'urban-cityscapes': urbanCityscapes as any,
  'architecture-interiors': architectureInteriors as any,
  'nature-landscapes': natureLandscapes as any,
  'logo-branding': logoBranding as any,
  'vintage-retro': vintageRetro as any,
  'cinematic-posters': cinematicPosters as any,
  'anime-manga': animeManga as any,
  'minimalist-icons': minimalistIcons as any,
  'misc': misc as any,
  'portrait-photography': portraitPhotography as any,
  'fashion-photography': fashionPhotography as any,
}

export interface ResourceLibraryData {
  version: string
  fetchedAt: string
  prompts: ResourcePrompt[]
  categories: ResourceCategory[]
}

// Merge all prompts from category files
const allPrompts: ResourcePrompt[] = Object.values(categoryFiles).flatMap(file => file.prompts)

/**
 * Get all resource prompts
 */
export function getResourcePrompts(): ResourcePrompt[] {
  return allPrompts
}

/**
 * Get all resource categories
 */
export function getResourceCategories(): ResourceCategory[] {
  return (indexData as any).categories as ResourceCategory[]
}

/**
 * Get full resource library data
 */
export function getResourceLibraryData(): ResourceLibraryData {
  return {
    version: (indexData as any).version,
    fetchedAt: (indexData as any).fetchedAt,
    prompts: allPrompts,
    categories: getResourceCategories(),
  }
}

/**
 * Filter prompts by category
 */
export function filterPromptsByCategory(categoryId: string): ResourcePrompt[] {
  const prompts = getResourcePrompts()
  if (categoryId === 'all') {
    return prompts
  }
  return prompts.filter(p => p.categoryId === categoryId || p.sourceCategory === categoryId)
}

/**
 * Search prompts by query (name + content)
 * Supports both Chinese and English content based on language preference
 */
export function searchResourcePrompts(query: string, lang?: 'zh' | 'en'): ResourcePrompt[] {
  const prompts = getResourcePrompts()
  const lowerQuery = query.toLowerCase()
  return prompts.filter(p => {
    const nameToSearch = lang === 'en' && p.nameEn ? p.nameEn : p.name
    const contentToSearch = lang === 'en' && p.contentEn ? p.contentEn : p.content
    return nameToSearch.toLowerCase().includes(lowerQuery) ||
           contentToSearch.toLowerCase().includes(lowerQuery)
  })
}

/**
 * Get prompts filtered by language preference
 * Replaces name/content with English version if available and language is 'en'
 * Falls back to Chinese if English version is missing
 */
export function getResourcePromptsByLanguage(lang: 'zh' | 'en'): ResourcePrompt[] {
  const prompts = getResourcePrompts()
  return prompts.map(p => ({
    ...p,
    name: lang === 'en' && p.nameEn ? p.nameEn : p.name,
    content: lang === 'en' && p.contentEn ? p.contentEn : p.content,
  }))
}