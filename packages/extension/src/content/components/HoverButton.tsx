/**
 * HoverButton - Floating button that appears on image hover
 * Triggers Vision Modal when clicked
 */

import { Sparkles } from 'lucide-react'

interface HoverButtonProps {
  imageUrl: string
  onClick: () => void
}

/**
 * HoverButton component - shows on image hover
 */
function HoverButton({ onClick }: HoverButtonProps) {
  return (
    <button
      className="hover-button"
      onClick={onClick}
      aria-label="将图片转为提示词"
    >
      <Sparkles />
      <span className="tooltip">转提示词</span>
    </button>
  )
}

export default HoverButton