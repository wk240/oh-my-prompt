import type { InsertStrategy, DetectStrategy } from './strategy-interface'

/**
 * Platform Types - 核心类型定义
 */

/**
 * URL 匹配模式
 */
export interface UrlPattern {
  type: 'domain' | 'pathname' | 'full' | 'regex'
  value: string
}

/**
 * 输入检测配置
 */
export interface InputDetectionConfig {
  selectors: string[]
  validate?: (element: HTMLElement) => boolean
  debounceMs?: number
}

/**
 * UI 注入位置
 */
export type InjectionPosition = 'before' | 'after' | 'prepend' | 'append'

/**
 * 按钮图标类型
 */
export type ButtonIconType = 'lightning' | 'sparkle' | 'wand' | 'custom'

/**
 * 按钮样式配置
 */
export interface ButtonStyleConfig {
  icon?: ButtonIconType
  customIcon?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

/**
 * UI 注入配置
 */
export interface UIInjectionConfig {
  anchorSelector: string
  position: InjectionPosition
  buttonStyle?: ButtonStyleConfig
  customButton?: React.ComponentType<{ inputElement: HTMLElement }>
}

/**
 * 平台配置
 */
export interface PlatformConfig {
  id: string
  name: string
  urlPatterns: UrlPattern[]
  inputDetection: InputDetectionConfig
  uiInjection: UIInjectionConfig
  strategies?: StrategyOverrides
}

/**
 * 策略覆盖（可选）
 */
export interface StrategyOverrides {
  inserter?: InsertStrategy
  detector?: DetectStrategy
}