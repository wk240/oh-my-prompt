/**
 * Lovart Platform Config
 */

import type { PlatformConfig } from '../base/types'
import { LovartInserter } from './strategies'
import { LovartButton } from './LovartButton'

export const lovartConfig: PlatformConfig = {
  id: 'lovart',
  name: 'Lovart',

  urlPatterns: [
    { type: 'domain', value: 'lovart.ai' },
  ],

  inputDetection: {
    selectors: [
      // Video agent input (contenteditable)
      '[data-testid="video-prompt-input"]',
      // Image agent input (textarea)
      '#agent-image-generator-prompt',
      // Main chat input (existing)
      '[data-testid="agent-message-input"]',
      '[data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    debounceMs: 100,
  },

  uiInjection: {
    anchorSelector: '[data-testid="agent-input-bottom-more-button"]',
    position: 'before',
    customButton: LovartButton,
  },

  // Secondary injections for agent areas (video and image)
  secondaryInjections: [
    {
      inputSelector: '[data-testid="video-prompt-input"]',
      anchorSelector: '[data-testid="agent-mode-switch-trigger"]',
      position: 'before',
      customButton: LovartButton,
    },
    {
      inputSelector: '#agent-image-generator-prompt',
      anchorSelector: '[data-testid="agent-mode-switch-trigger"]',
      position: 'before',
      customButton: LovartButton,
    },
  ],

  strategies: {
    inserter: new LovartInserter(),
  },
}