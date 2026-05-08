/**
 * EmptyState - Guidance when no prompts available
 * Centered message with actionable subtext
 */

interface EmptyStateProps {
  message: string
  subtext: string
}

export function EmptyState({ message, subtext }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-message">{message}</div>
      <div className="empty-subtext">{subtext}</div>
    </div>
  )
}