/**
 * Sample prompt data for testing dropdown UI
 * Phase 3 will replace with storage-backed data
 */

import type { Prompt, Category } from '../shared/types'

/**
 * Sample categories for grouping prompts
 */
export const SAMPLE_CATEGORIES: Category[] = [
  { id: 'c1', name: '质量参数', order: 1 },
  { id: 'c2', name: '风格', order: 2 },
  { id: 'c3', name: '技术参数', order: 3 },
  { id: 'c4', name: '主题设定', order: 4 },
]

/**
 * Sample prompts organized by category
 */
export const SAMPLE_PROMPTS: Prompt[] = [
  // Quality parameters (c1)
  {
    id: 'p1',
    name: '高质量渲染',
    content: 'high quality, detailed, 4k, masterpiece',
    categoryId: 'c1',
  },
  {
    id: 'p2',
    name: '超精细细节',
    content: 'ultra detailed, intricate details, sharp focus',
    categoryId: 'c1',
  },
  {
    id: 'p3',
    name: '专业摄影',
    content: 'professional photography, studio lighting, HDR',
    categoryId: 'c1',
  },

  // Styles (c2)
  {
    id: 'p4',
    name: '赛博朋克风格',
    content: 'cyberpunk style, neon lights, futuristic city, tech aesthetic',
    categoryId: 'c2',
  },
  {
    id: 'p5',
    name: '动漫风格',
    content: 'anime style, vibrant colors, Japanese animation',
    categoryId: 'c2',
  },
  {
    id: 'p6',
    name: '油画风格',
    content: 'oil painting, classical art, brush strokes, museum quality',
    categoryId: 'c2',
  },

  // Technical parameters (c3)
  {
    id: 'p7',
    name: '正面光照',
    content: 'front lighting, soft shadows, even illumination',
    categoryId: 'c3',
  },
  {
    id: 'p8',
    name: '侧面光照',
    content: 'side lighting, dramatic shadows, depth',
    categoryId: 'c3',
  },
  {
    id: 'p9',
    name: '远景构图',
    content: 'wide angle, distant view, landscape composition',
    categoryId: 'c3',
  },

  // Theme settings (c4)
  {
    id: 'p10',
    name: '自然风景',
    content: 'natural landscape, mountains, rivers, forests',
    categoryId: 'c4',
  },
  {
    id: 'p11',
    name: '城市夜景',
    content: 'city night, urban streets, city lights, metropolitan',
    categoryId: 'c4',
  },
]

/**
 * Get prompts for a specific category
 */
export function getPromptsByCategory(categoryId: string): Prompt[] {
  return SAMPLE_PROMPTS.filter((p) => p.categoryId === categoryId)
}

/**
 * Get all prompts organized by category
 */
export function getPromptsGroupedByCategory(): Map<string, Prompt[]> {
  const grouped = new Map<string, Prompt[]>()
  for (const category of SAMPLE_CATEGORIES) {
    grouped.set(category.id, getPromptsByCategory(category.id))
  }
  return grouped
}