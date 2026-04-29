/**
 * ChatGPT Platform Config
 */

import type { PlatformConfig } from '../base/types'

export const chatgptConfig: PlatformConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',

  urlPatterns: [
    { type: 'domain', value: 'chatgpt.com' },
    { type: 'domain', value: 'chat.openai.com' },
  ],

  inputDetection: {
    selectors: [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
  },

  uiInjection: {
    anchorSelector: '[data-testid="composer-footer-actions"]',
    position: 'prepend',
  },
}