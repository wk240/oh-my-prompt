/**
 * Default Strategies - 适用于大多数平台的默认插入策略
 */

import type { InsertStrategy } from './strategy-interface'

const LOG_PREFIX = '[Oh My Prompt]'

/**
 * 默认插入策略
 * 支持 textarea/input 和 contenteditable
 */
export class DefaultInserter implements InsertStrategy {
  insert(element: HTMLElement, text: string): boolean {
    try {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        this.insertIntoFormControl(element, text)
      } else {
        this.insertIntoRichText(element, text)
      }

      this.dispatchInputEvents(element)
      return true
    } catch (error) {
      console.error(LOG_PREFIX, 'Insert failed:', error)
      return false
    }
  }

  clear(element: HTMLElement): boolean {
    element.focus()
    document.execCommand('selectAll', false)
    document.execCommand('delete', false)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  private insertIntoFormControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): void {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start

    element.value = element.value.substring(0, start) + text + element.value.substring(end)

    const newPosition = start + text.length
    element.selectionStart = newPosition
    element.selectionEnd = newPosition
  }

  private insertIntoRichText(element: HTMLElement, text: string): void {
    if (document.activeElement !== element) {
      element.focus()
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    const success = document.execCommand('insertText', false, text)

    if (!success) {
      console.warn(LOG_PREFIX, 'execCommand failed, using fallback')
      this.insertFallback(element, text)
    }
  }

  private insertFallback(element: HTMLElement, text: string): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      element.textContent += text
      return
    }

    const range = selection.getRangeAt(0)
    if (!element.contains(range.commonAncestorContainer)) {
      const newRange = document.createRange()
      newRange.selectNodeContents(element)
      newRange.collapse(false)
      selection.removeAllRanges()
      selection.addRange(newRange)
    }

    const currentRange = selection.getRangeAt(0)
    currentRange.deleteContents()
    const textNode = document.createTextNode(text)
    currentRange.insertNode(textNode)
    currentRange.setStartAfter(textNode)
    currentRange.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(currentRange)
  }

  private dispatchInputEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))

    if (element instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } else if (element instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    if (element.isContentEditable) {
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          inputType: 'insertText',
          data: null,
        })
      )
    }
  }
}

/**
 * 创建默认插入策略实例
 */
export function createDefaultInserter(): InsertStrategy {
  return new DefaultInserter()
}