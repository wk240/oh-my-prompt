/**
 * LovartStyleExtractor - Extract Lovart visual styles for UI coordination
 * Captures Lovart button/card styles to replicate in Shadow DOM
 */

const LOG_PREFIX = '[Oh My Prompt Script]'

/**
 * Lovart CSS property configuration
 */
export interface LovartStyleConfig {
  backgroundColor: string
  borderRadius: string
  boxShadow: string
  color: string
}

/**
 * Default Lovart-native style approximation
 * Used when runtime extraction fails
 */
export const DEFAULT_STYLE: LovartStyleConfig = {
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  boxShadow: 'none',
  color: '#666',
}

/**
 * Selector patterns for Lovart button elements
 * Will be refined after actual Lovart page analysis
 */
const BUTTON_SELECTORS = [
  '.lovart-button',
  'button[class*="primary"]',
  'button[class*="btn"]',
  '[role="button"]',
  'button:not([disabled])',
]

/**
 * Extract Lovart button styles at runtime
 * Returns DEFAULT_STYLE if Lovart button not found
 */
export function extractLovartButtonStyle(): LovartStyleConfig {
  // Try each selector pattern
  for (const selector of BUTTON_SELECTORS) {
    const button = document.querySelector<HTMLElement>(selector)
    if (button) {
      return extractStyleFromElement(button)
    }
  }

  console.log(LOG_PREFIX, 'Lovart button not found, using default style')
  return DEFAULT_STYLE
}

/**
 * Extract style properties from a specific element
 */
function extractStyleFromElement(element: HTMLElement): LovartStyleConfig {
  const computed = window.getComputedStyle(element)

  return {
    backgroundColor: computed.backgroundColor || DEFAULT_STYLE.backgroundColor,
    borderRadius: computed.borderRadius || DEFAULT_STYLE.borderRadius,
    boxShadow: computed.boxShadow || DEFAULT_STYLE.boxShadow,
    color: computed.color || DEFAULT_STYLE.color,
  }
}

/**
 * Get icon color from Lovart UI
 * Attempts to extract from Lovart icons/buttons
 */
export function getLovartIconColor(): string {
  // Try to find Lovart icon elements
  const iconSelectors = [
    'svg[class*="icon"]',
    '.icon svg',
    'button svg',
    '[class*="icon"] svg',
  ]

  for (const selector of iconSelectors) {
    const icon = document.querySelector<SVGSVGElement>(selector)
    if (icon) {
      const computed = window.getComputedStyle(icon)
      if (computed.color) {
        return computed.color
      }
    }
  }

  // Fallback to Lovart button text color
  const buttonStyle = extractLovartButtonStyle()
  return buttonStyle.color
}