/**
 * Xingliu (星流) Platform Config
 * https://www.xingliu.art/
 */

import type { PlatformConfig } from '../base/types'
import { LovartInserter } from '../lovart/strategies'
import { LovartButton } from '../lovart/LovartButton'

export const xingliuConfig: PlatformConfig = {
  id: 'xingliu',
  name: '星流',

  urlPatterns: [
    { type: 'domain', value: 'xingliu.art' },
  ],

  inputDetection: {
    selectors: [
      '[data-testid="agent-message-input"]',
      '[data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    debounceMs: 100,
  },

  uiInjection: {
    // Inject before the upload button in the bottom toolbar
    anchorSelector: '[data-testid="agent-upload-button"]',
    position: 'before',
    customButton: LovartButton,
  },

  strategies: {
    // Reuse Lovart's Lexical editor inserter
    inserter: new LovartInserter(),
  },
}