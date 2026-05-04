/**
 * Kimi Platform Config
 * https://kimi.com/
 */

import type { PlatformConfig } from '../base/types'
import { LovartInserter } from '../lovart/strategies'
import { LovartButton } from '../lovart/LovartButton'

export const kimiConfig: PlatformConfig = {
  id: 'kimi',
  name: 'Kimi',

  urlPatterns: [
    { type: 'domain', value: 'kimi.com' },
  ],

  inputDetection: {
    selectors: [
      '.chat-input-editor',
      '[data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    debounceMs: 100,
  },

  uiInjection: {
    // Inject as first child of left-area
    anchorSelector: '.chat-editor-action .left-area',
    position: 'prepend',
    customButton: LovartButton,
  },

  strategies: {
    // Reuse Lovart's Lexical editor inserter
    inserter: new LovartInserter(),
  },
}