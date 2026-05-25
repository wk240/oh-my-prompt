export function formatRichTextInsertionHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>')
}

export function hasLineBreak(text: string): boolean {
  return /\r\n|\r|\n/.test(text)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
