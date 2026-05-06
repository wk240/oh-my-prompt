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
      // Agent image generator input (new)
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

  // Secondary injection for agent image generator
  secondaryInjections: [
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