/**
 * Format backup time to readable string
 */
export function formatBackupTime(isoTime: string | undefined): string {
  if (!isoTime) return '未知时间'
  const date = new Date(isoTime)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}