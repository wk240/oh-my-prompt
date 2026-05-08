/**
 * Claude.ai Platform Config
 */

import type { PlatformConfig } from '../base/types'

export const claudeAiConfig: PlatformConfig = {
  id: 'claude-ai',
  name: 'Claude.ai',

  urlPatterns: [
    { type: 'domain', value: 'claude.ai' },
  ],

  inputDetection: {
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      '.ProseMirror[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.composer-footer',
    position: 'prepend',
  },
}