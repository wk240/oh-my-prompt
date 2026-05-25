export function hasLineBreak(text: string): boolean {
  return /\r\n|\r|\n/.test(text)
}

export function dispatchMultilinePasteEvent(element: HTMLElement, text: string): boolean {
  if (typeof ClipboardEvent === 'undefined' || typeof DataTransfer === 'undefined') {
    return false
  }

  const beforeText = element.textContent
  const clipboardData = new DataTransfer()
  clipboardData.setData('text/plain', text)

  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData,
  })

  const wasCancelled = !element.dispatchEvent(pasteEvent)
  return wasCancelled || pasteEvent.defaultPrevented || element.textContent !== beforeText
}
