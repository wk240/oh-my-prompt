/**
 * Platform Registry - 平台注册表
 * 根据 URL 匹配激活对应平台
 */

import type { UrlPattern, PlatformConfig } from './base/types'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * 已注册的平台列表
 * 新增平台只需在此数组添加配置
 */
const PLATFORMS: PlatformConfig[] = [
  // 平台配置将在后续 Task 中导入
]

/**
 * 根据 URL 匹配平台
 */
export function matchPlatform(url: string): PlatformConfig | null {
  for (const platform of PLATFORMS) {
    if (matchesUrlPatterns(url, platform.urlPatterns)) {
      console.log(LOG_PREFIX, `Platform matched: ${platform.name}`)
      return platform
    }
  }
  console.log(LOG_PREFIX, 'No matching platform')
  return null
}

/**
 * 检查 URL 是否匹配任一 pattern
 */
function matchesUrlPatterns(url: string, patterns: UrlPattern[]): boolean {
  return patterns.some(pattern => {
    switch (pattern.type) {
      case 'domain':
        const domain = extractDomain(url)
        return domain === pattern.value || domain.endsWith('.' + pattern.value)
      case 'pathname':
        try {
          return new URL(url).pathname.includes(pattern.value)
        } catch {
          return false
        }
      case 'full':
        return url === pattern.value
      case 'regex':
        try {
          return new RegExp(pattern.value).test(url)
        } catch {
          return false
        }
      default:
        return false
    }
  })
}

/**
 * 提取 URL 的域名
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 获取所有已注册平台（用于调试）
 */
export function getAllPlatforms(): PlatformConfig[] {
  return PLATFORMS
}

/**
 * 注册平台配置（用于动态添加）
 */
export function registerPlatform(config: PlatformConfig): void {
  PLATFORMS.push(config)
}