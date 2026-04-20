/**
 * InsertHandler - Insert prompt text at cursor position
 * Dispatches events for Lovart recognition
 */

const LOG_PREFIX = '[Oh My Prompt Script]'

/**
 * InsertHandler handles prompt insertion into Lovart input elements
 * Supports both form controls (input/textarea) and rich text elements
 * Special handling for React-based editors like Lexical
 */
export class InsertHandler {
  /**
   * Insert prompt content at cursor position (D-10)
   * Dispatches events for Lovart recognition (CORE-04)
   */
  insertPrompt(inputElement: HTMLElement, content: string): boolean {
    try {
      // Use execCommand for rich text editors (Lexical compatibility)
      // Note: We assume cursor position is intact because dropdown uses
      // mousedown.preventDefault() to prevent focus transfer
      if (
        inputElement instanceof HTMLInputElement ||
        inputElement instanceof HTMLTextAreaElement
      ) {
        this.insertIntoFormControl(inputElement, content)
      } else {
        this.insertIntoRichText(inputElement, content)
      }

      // Dispatch events for Lovart recognition
      this.dispatchInputEvents(inputElement)

      console.log(LOG_PREFIX, 'Prompt inserted:', content)
      return true
    } catch (error) {
      console.error(LOG_PREFIX, 'Insert failed:', error)
      return false
    }
  }

  /**
   * Insert into form control (input/textarea) at cursor position
   */
  private insertIntoFormControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): void {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start

    // Insert at cursor (D-10)
    element.value = element.value.substring(0, start) + text + element.value.substring(end)

    // Move cursor after inserted text
    const newPosition = start + text.length
    element.selectionStart = newPosition
    element.selectionEnd = newPosition
  }

  /**
   * Insert into rich text element (contenteditable)
   * Uses execCommand for Lexical/React compatibility
   */
  private insertIntoRichText(element: HTMLElement, text: string): void {
    // Ensure element is focused before execCommand
    // Portal dropdown clicks may disrupt focus even with preventDefault
    if (document.activeElement !== element) {
      element.focus()
    }

    // Ensure there's a valid selection in this element
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      // Create selection at end of element
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false) // Collapse to end
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    // Try execCommand first - most reliable for React editors
    // execCommand triggers beforeinput/input events properly
    const success = document.execCommand('insertText', false, text)

    if (!success) {
      // Fallback: direct DOM manipulation (less reliable for React editors)
      console.warn(LOG_PREFIX, 'execCommand failed, using fallback method')
      this.insertIntoRichTextFallback(element, text)
    }
  }

  /**
   * Fallback for rich text insertion when execCommand fails
   */
  private insertIntoRichTextFallback(element: HTMLElement, text: string): void {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      // No cursor position, append to end
      element.textContent += text
      return
    }

    const range = selection.getRangeAt(0)

    // Check if cursor is in this element (it should be after focus())
    if (!element.contains(range.commonAncestorContainer)) {
      // Create new range at end of element
      const newRange = document.createRange()
      newRange.selectNodeContents(element)
      newRange.collapse(false) // Collapse to end
      selection.removeAllRanges()
      selection.addRange(newRange)
    }

    // Get the current range (either original or newly created)
    const currentRange = selection.getRangeAt(0)

    // Insert at cursor position
    currentRange.deleteContents()
    const textNode = document.createTextNode(text)
    currentRange.insertNode(textNode)

    // Move cursor after text
    currentRange.setStartAfter(textNode)
    currentRange.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(currentRange)
  }

  /**
   * Dispatch input/change events for Lovart recognition (CORE-04, Pitfall 6)
   */
  private dispatchInputEvents(element: HTMLElement): void {
    // Standard DOM events
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))

    // For React-based apps, need to call native setter
    // React tracks value through the native property setter
    if (element instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } else if (element instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(element, element.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    // For contenteditable, dispatch additional events
    // Some editors listen to beforeinput for tracking changes
    if (element.isContentEditable) {
      // Dispatch InputEvent with insertText type
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