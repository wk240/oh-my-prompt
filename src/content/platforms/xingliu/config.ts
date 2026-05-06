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
    // Support both layouts: old layout has upload-button, new layout has attachment-button
    // querySelector returns first matching element, enabling fallback behavior
    anchorSelector: '[data-testid="agent-upload-button"], [data-testid="agent-attachment-button"]',
    position: 'before',
    customButton: LovartButton,
  },

  strategies: {
    // Reuse Lovart's Lexical editor inserter
    inserter: new LovartInserter(),
  },
}