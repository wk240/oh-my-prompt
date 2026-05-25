import type { Prompt } from './prompt'

// 团队提示词 - 字段与Prompt一致，额外添加team元数据
export interface TeamPrompt extends Prompt {
  teamId: string        // 团队ID
  userId: string        // 共享者ID
  sharedAt: number      // 共享时间戳
  originalPromptId?: string  // 原始提示词ID（可选）
  teamName?: string     // 团队名称（用于UI展示）
}

// 团队同步状态
export interface TeamSyncStatus {
  lastSyncTime: number
  teamIds: string[]
}

// 团队信息（简化版，用于展示）
export interface TeamInfo {
  id: string
  name: string
}