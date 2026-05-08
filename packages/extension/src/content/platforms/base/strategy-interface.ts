/**
 * Strategy Interfaces - 插入和检测策略接口
 */

/**
 * 插入策略接口
 */
export interface InsertStrategy {
  /**
   * 将文本插入到目标输入元素
   */
  insert(element: HTMLElement, text: string): boolean

  /**
   * 清空输入元素内容（可选）
   */
  clear?(element: HTMLElement): boolean
}

/**
 * 检测策略接口（极少数平台需要覆盖）
 */
export interface DetectStrategy {
  /**
   * 自定义检测逻辑
   */
  detect(): HTMLElement | null

  /**
   * 判断元素是否有效（可选）
   */
  isValid?(element: HTMLElement): boolean
}